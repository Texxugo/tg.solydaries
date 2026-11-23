import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { formatarTelefone } from "@/features/funcionarios/telefone";

import type { ConteudoConsolidado } from "./consolidacao";

/**
 * O PDF do comprovante: uma apresentacao do conteudo consolidado, e nada alem.
 *
 * Tudo o que aparece aqui sai de `ConteudoConsolidado` — o mesmo objeto que foi
 * hasheado —, mais o proprio hash. O PDF nao le banco nem calcula nada que o
 * conteudo nao diga, para que "o documento mostra X" e "o hash cobre X" sejam a
 * mesma afirmacao.
 *
 * `pdf-lib` com a Helvetica padrao, sem fonte embutida: o documento fica
 * pequeno e nao depende de arquivo de fonte no servidor. O preco e o conjunto de
 * caracteres (WinAnsi): acentos do portugues passam, emoji nao. O que nao cabe
 * sai como `?` **so no PDF** — o conteudo gravado, e o hash, guardam o texto
 * original, e o documento avisa isso no rodape da transcricao.
 */

const MARGEM = 48;
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;
const PRETO = rgb(0, 0, 0);
const CINZA = rgb(0.4, 0.4, 0.4);

/** O que a WinAnsi tem alem do Latin-1. */
const EXTRAS_WINANSI = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** O texto como a Helvetica padrao consegue desenhar. */
function paraWinAnsi(texto: string) {
  let saida = "";

  for (const caractere of texto.normalize("NFC")) {
    const codigo = caractere.codePointAt(0) ?? 0;

    if (caractere === "\n") {
      // A quebra de linha fica: e ela que `quebrar()` usa para separar paragrafos.
      saida += caractere;
    } else if (caractere === "\t") {
      saida += " ";
    } else if (codigo < 0x20 || (codigo >= 0x7f && codigo < 0xa0)) {
      saida += " ";
    } else if (codigo <= 0xff || EXTRAS_WINANSI.has(caractere)) {
      saida += caractere;
    } else {
      saida += "?";
    }
  }

  return saida;
}

type Cursor = { pagina: PDFPage; y: number };

class Documento {
  private cursor!: Cursor;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonte: PDFFont,
    private readonly negrito: PDFFont,
  ) {
    this.novaPagina();
  }

  private novaPagina() {
    this.cursor = { pagina: this.pdf.addPage([LARGURA_A4, ALTURA_A4]), y: ALTURA_A4 - MARGEM };
  }

  private garantirEspaco(altura: number) {
    if (this.cursor.y - altura < MARGEM) {
      this.novaPagina();
    }
  }

  /** Quebra em palavras; palavra maior que a linha (um hash) e cortada por caractere. */
  private quebrar(texto: string, tamanho: number, fonte: PDFFont, largura: number) {
    const linhas: string[] = [];

    for (const paragrafo of paraWinAnsi(texto).split("\n")) {
      let atual = "";

      for (const palavra of paragrafo.split(" ")) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;

        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
          atual = tentativa;
          continue;
        }

        if (atual) {
          linhas.push(atual);
        }

        atual = palavra;

        while (fonte.widthOfTextAtSize(atual, tamanho) > largura) {
          let corte = atual.length - 1;

          while (corte > 1 && fonte.widthOfTextAtSize(atual.slice(0, corte), tamanho) > largura) {
            corte -= 1;
          }

          linhas.push(atual.slice(0, corte));
          atual = atual.slice(corte);
        }
      }

      linhas.push(atual);
    }

    return linhas;
  }

  texto(
    conteudo: string,
    { tamanho = 9, negrito = false, cor = PRETO, recuo = 0, depois = 2 } = {},
  ) {
    const fonte = negrito ? this.negrito : this.fonte;
    const largura = LARGURA_A4 - MARGEM * 2 - recuo;
    const altura = tamanho * 1.35;

    for (const linha of this.quebrar(conteudo, tamanho, fonte, largura)) {
      this.garantirEspaco(altura);
      this.cursor.y -= altura;
      this.cursor.pagina.drawText(linha, {
        x: MARGEM + recuo,
        y: this.cursor.y,
        size: tamanho,
        font: fonte,
        color: cor,
      });
    }

    this.cursor.y -= depois;
  }

  titulo(conteudo: string) {
    this.garantirEspaco(30);
    this.cursor.y -= 8;
    this.texto(conteudo, { tamanho: 11, negrito: true, depois: 4 });
  }

  campo(rotulo: string, valor: string) {
    this.texto(`${rotulo}: ${valor}`, { depois: 1 });
  }

  numerarPaginas(protocolo: string) {
    const paginas = this.pdf.getPages();

    paginas.forEach((pagina, indice) => {
      pagina.drawText(
        paraWinAnsi(`Protocolo ${protocolo} · pagina ${indice + 1} de ${paginas.length}`),
        { x: MARGEM, y: MARGEM / 2, size: 7, font: this.fonte, color: CINZA },
      );
    });
  }
}

function dataHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export async function gerarPdfDoComprovante(
  conteudo: ConteudoConsolidado,
  hash: string,
  geradoEm: Date,
) {
  const pdf = await PDFDocument.create();
  const documento = new Documento(
    pdf,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
  );

  // Metadados fixos: sem eles o pdf-lib grava a hora da geracao e o "produtor",
  // e o arquivo nao diria nada que o conteudo ja nao diga.
  pdf.setTitle(`Comprovante de tratativa de ponto ${conteudo.protocolo}`);
  pdf.setCreationDate(geradoEm);
  pdf.setModificationDate(geradoEm);
  pdf.setProducer("portal-tg");
  pdf.setCreator("portal-tg");

  const { ocorrencia, correcao, confirmacao } = conteudo;

  documento.texto("Comprovante de tratativa de ponto", { tamanho: 15, negrito: true, depois: 2 });
  documento.texto("Correcao informada pelo colaborador via WhatsApp", { cor: CINZA, depois: 6 });
  documento.campo("Protocolo", conteudo.protocolo);
  documento.campo("Documento gerado em", dataHora(geradoEm.toISOString()));

  documento.titulo("Identificacao da ocorrencia");
  documento.campo("Colaborador", ocorrencia.nome);
  documento.campo("Matricula", ocorrencia.matricula);
  documento.campo("Empresa", ocorrencia.empresa);
  documento.campo("Numero do colaborador", formatarTelefone(conteudo.colaborador.telefone));
  documento.campo(
    "Data da ocorrencia",
    `${formatarData(ocorrencia.data)} (${diaDaSemana(ocorrencia.data)})`,
  );
  documento.campo("Ocorrencia", ocorrencia.rotulo);
  documento.campo("Descricao", ocorrencia.descricao);
  documento.campo(
    "Registro do relogio",
    ocorrencia.batidas.length > 0 ? ocorrencia.batidas.join(" ") : "nenhuma marcacao",
  );

  documento.titulo("Correcao informada");
  documento.campo("Data corrigida", formatarData(correcao.dataCorrigida));
  documento.campo("Motivo", correcao.motivoRotulo);
  documento.campo(
    "Horarios informados",
    correcao.horarios.length > 0 ? correcao.horarios.join(" ") : "nao se aplica",
  );
  documento.campo("Descricao", correcao.descricao ?? "nao se aplica");

  documento.titulo("Confirmacao final");
  documento.campo("Resposta do colaborador", confirmacao.resposta);
  documento.campo("ID da mensagem", confirmacao.mensagemId ?? "—");
  documento.campo("Recebida em", dataHora(confirmacao.momento));
  documento.campo("Atendimento iniciado em", dataHora(conteudo.iniciadoEm));

  documento.titulo(`Transcricao completa (${conteudo.transcricao.length} mensagens)`);

  for (const mensagem of conteudo.transcricao) {
    const autor = mensagem.direcao === "recebida" ? "Colaborador" : "Portal";
    const status = mensagem.status === "falhou" ? " · ENVIO FALHOU" : "";

    documento.texto(`#${mensagem.sequencia} · ${dataHora(mensagem.momento)} · ${autor}${status}`, {
      negrito: true,
      tamanho: 8,
      depois: 0,
    });
    documento.texto(
      `ID: ${mensagem.mensagemId ?? "—"}${mensagem.opcaoId ? ` · opcao: ${mensagem.opcaoId}` : ""}`,
      { tamanho: 7, cor: CINZA, depois: 1 },
    );
    documento.texto(mensagem.texto, { tamanho: 8.5, recuo: 8, depois: 6 });
  }

  documento.texto(
    "Caracteres que a fonte do documento nao desenha (como emojis) aparecem como '?'. " +
      "O texto original esta preservado no registro do portal e coberto pelo hash abaixo.",
    { tamanho: 7, cor: CINZA, depois: 4 },
  );

  documento.titulo("Integridade");
  documento.texto("Hash SHA-256 do conteudo consolidado da tratativa:", { depois: 1 });
  documento.texto(hash, { tamanho: 9, negrito: true, depois: 4 });
  documento.texto(
    "O hash foi calculado sobre o conteudo consolidado (identificacao, correcao, confirmacao e " +
      "transcricao) antes da geracao deste documento, e esta armazenado separadamente no " +
      "portal-tg. Para verificar, abra a ocorrencia no portal: o sistema recalcula o hash a " +
      "partir das mensagens registradas e indica se o conteudo sofreu alteracao.",
    { tamanho: 8, cor: CINZA },
  );

  documento.numerarPaginas(conteudo.protocolo);

  return pdf.save({ useObjectStreams: true });
}
