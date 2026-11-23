import "server-only";

import { inflateRawSync } from "node:zlib";

import { indiceDaColuna, type CelulaDaPlanilha, type LinhaDaPlanilha } from "./planilha";

/**
 * Leitor minimo de `.xlsx`: o suficiente para transformar a primeira planilha
 * de um arquivo em celulas de texto.
 *
 * Sem dependencia de terceiros de proposito. Um `.xlsx` e um ZIP com XML
 * dentro, e o que este modulo precisa e um recorte pequeno dos dois formatos:
 * ler celulas de uma aba, sem formulas, sem estilos, sem escrita. As
 * bibliotecas do ecossistema trazem o formato inteiro (grafico, tabela
 * dinamica, escrita) e algumas exigem install script, que o npm 12 bloqueia
 * neste projeto — a dependencia nao pagaria por si, mesmo raciocinio da auth
 * propria.
 *
 * `server-only` por causa do `node:zlib`: descompactar e trabalho de servidor,
 * e a Server Action que recebe o upload e a unica chamadora.
 */

/** Cabe o relatorio inteiro com folga; barra o arquivo que so faria o servidor engasgar. */
const LIMITE_DESCOMPACTADO = 64 * 1024 * 1024;

export class PlanilhaInvalidaError extends Error {}

/* -------------------------------------------------------------------------- */
/* ZIP                                                                        */
/* -------------------------------------------------------------------------- */

const ASSINATURA_FIM_CENTRAL = 0x06054b50;
const ASSINATURA_ENTRADA_CENTRAL = 0x02014b50;
const ASSINATURA_CABECALHO_LOCAL = 0x04034b50;

/**
 * O diretorio central fica no fim do arquivo, depois de um comentario de
 * tamanho variavel — por isso a busca e de tras para frente. 22 bytes e o
 * tamanho do registro sem comentario; 64 KB e o maior comentario possivel.
 */
function localizarFimDoCentral(dados: Buffer) {
  const minimo = Math.max(0, dados.length - 22 - 0xffff);

  for (let posicao = dados.length - 22; posicao >= minimo; posicao -= 1) {
    if (dados.readUInt32LE(posicao) === ASSINATURA_FIM_CENTRAL) {
      return posicao;
    }
  }

  return -1;
}

function extrair(
  dados: Buffer,
  inicioLocal: number,
  metodo: number,
  tamanhoComprimido: number,
  tamanhoOriginal: number,
) {
  if (dados.readUInt32LE(inicioLocal) !== ASSINATURA_CABECALHO_LOCAL) {
    throw new PlanilhaInvalidaError("O arquivo .xlsx esta corrompido.");
  }

  if (tamanhoOriginal > LIMITE_DESCOMPACTADO) {
    throw new PlanilhaInvalidaError("A planilha e grande demais para ser lida.");
  }

  // O cabecalho local tem nome e campo extra proprios, de tamanhos que so ele
  // conhece — os do diretorio central costumam diferir.
  const inicio =
    inicioLocal + 30 + dados.readUInt16LE(inicioLocal + 26) + dados.readUInt16LE(inicioLocal + 28);
  const conteudo = dados.subarray(inicio, inicio + tamanhoComprimido);

  if (metodo === 0) {
    return conteudo;
  }

  if (metodo !== 8) {
    throw new PlanilhaInvalidaError("A planilha usa uma compactacao que este leitor nao abre.");
  }

  return inflateRawSync(conteudo, { maxOutputLength: LIMITE_DESCOMPACTADO });
}

/**
 * Os arquivos do ZIP, por nome. Le sempre pelo diretorio central: o cabecalho
 * local pode trazer tamanho zero quando o compactador usa data descriptor, e o
 * diretorio central sempre tem os tamanhos reais.
 */
function abrirZip(dados: Buffer) {
  const fim = localizarFimDoCentral(dados);

  if (fim < 0) {
    throw new PlanilhaInvalidaError("O arquivo nao e uma planilha .xlsx valida.");
  }

  const quantidade = dados.readUInt16LE(fim + 10);
  let posicao = dados.readUInt32LE(fim + 16);

  if (posicao === 0xffffffff) {
    throw new PlanilhaInvalidaError("Planilha em formato ZIP64, que este leitor nao abre.");
  }

  const arquivos = new Map<string, () => Buffer>();

  for (let indice = 0; indice < quantidade; indice += 1) {
    if (posicao + 46 > dados.length || dados.readUInt32LE(posicao) !== ASSINATURA_ENTRADA_CENTRAL) {
      throw new PlanilhaInvalidaError("O arquivo .xlsx esta corrompido.");
    }

    const metodo = dados.readUInt16LE(posicao + 10);
    const tamanhoComprimido = dados.readUInt32LE(posicao + 20);
    const tamanhoOriginal = dados.readUInt32LE(posicao + 24);
    const tamanhoNome = dados.readUInt16LE(posicao + 28);
    const tamanhoExtra = dados.readUInt16LE(posicao + 30);
    const tamanhoComentario = dados.readUInt16LE(posicao + 32);
    const inicioLocal = dados.readUInt32LE(posicao + 42);
    const nome = dados.toString("utf8", posicao + 46, posicao + 46 + tamanhoNome);

    arquivos.set(nome, () =>
      extrair(dados, inicioLocal, metodo, tamanhoComprimido, tamanhoOriginal),
    );

    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return arquivos;
}

/* -------------------------------------------------------------------------- */
/* XML                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * As cinco entidades do XML mais as numericas. O `&amp;` vem por ultimo: fazer
 * antes transformaria a forma escapada de um texto que ja continha uma
 * entidade no proprio caractere que ela representa.
 */
function decodificar(texto: string) {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, codigo: string) =>
      String.fromCodePoint(parseInt(codigo, 16)),
    )
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCodePoint(Number(codigo)))
    .replace(/&amp;/g, "&");
}

/** O texto de um `<si>` ou `<is>`: a concatenacao dos `<t>` que ele contiver. */
function textoDosT(xml: string) {
  return [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
    .map((trecho) => decodificar(trecho[1]))
    .join("");
}

/**
 * A tabela de strings compartilhadas. O Excel guarda todo texto repetido uma
 * vez so aqui, e a celula carrega o indice — e por isso que uma celula `t="s"`
 * traz um numero onde parece haver texto.
 */
function lerStringsCompartilhadas(xml: string | null) {
  if (!xml) {
    return [];
  }

  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((item) => textoDosT(item[1]));
}

/* -------------------------------------------------------------------------- */
/* Planilha                                                                   */
/* -------------------------------------------------------------------------- */

/** O caminho da primeira aba, resolvido pelos relacionamentos do workbook. */
function caminhoDaPrimeiraAba(arquivos: Map<string, () => Buffer>) {
  const workbook = arquivos.get("xl/workbook.xml")?.().toString("utf8");
  const relacionamentos = arquivos.get("xl/_rels/workbook.xml.rels")?.().toString("utf8");

  if (workbook && relacionamentos) {
    const idDaAba = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];

    if (idDaAba) {
      const alvo = new RegExp(`<Relationship[^>]*Id="${idDaAba}"[^>]*Target="([^"]+)"`).exec(
        relacionamentos,
      )?.[1];

      if (alvo) {
        // O alvo vem relativo a `xl/` ("worksheets/sheet1.xml") ou absoluto
        // ("/xl/worksheets/sheet1.xml"), conforme quem gerou o arquivo.
        const caminho = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo}`;

        if (arquivos.has(caminho)) {
          return caminho;
        }
      }
    }
  }

  // Ultimo recurso: a primeira aba na ordem em que o ZIP a guarda.
  return [...arquivos.keys()]
    .filter((nome) => nome.startsWith("xl/worksheets/") && nome.endsWith(".xml"))
    .sort()[0];
}

/**
 * Ate que coluna vai cada celula mesclada, indexado por `"linha:coluna"` da
 * ponta superior esquerda — que e a unica celula da mesclagem que o XML da aba
 * escreve de fato.
 *
 * Sem isso toda celula pareceria ter uma coluna so de largura, e o cabecalho
 * mesclado deixaria de se sobrepor a coluna de dados abaixo dele. E a
 * sobreposicao que `planilha.ts` usa para casar um com o outro.
 */
function lerMesclagens(aba: string) {
  const larguras = new Map<string, number>();

  for (const trecho of aba.matchAll(/<mergeCell[^>]*\sref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
    const [, colunaInicial, linhaInicial, colunaFinal] = trecho;

    larguras.set(`${linhaInicial}:${colunaInicial}`, indiceDaColuna(colunaFinal));
  }

  return larguras;
}

/**
 * As linhas da primeira aba da planilha, cada celula como texto e como
 * intervalo de colunas.
 *
 * Tudo sai como string, inclusive numero e data (que no `.xlsx` e o numero de
 * dias desde 1900). Converter e trabalho de quem sabe o que a coluna significa
 * — aqui nada sabe se a coluna W e uma data de admissao ou um valor qualquer.
 *
 * Celula em branco e linha sem nenhuma celula preenchida nao entram: o
 * relatorio tem dezenas delas separando os blocos, e a leitura seguinte se
 * importa com o conteudo, nao com o espacamento.
 */
export function lerPlanilha(dados: Buffer): LinhaDaPlanilha[] {
  const arquivos = abrirZip(dados);
  const caminho = caminhoDaPrimeiraAba(arquivos);
  const abrirAba = caminho ? arquivos.get(caminho) : undefined;

  if (!abrirAba) {
    throw new PlanilhaInvalidaError("A planilha nao tem nenhuma aba.");
  }

  const compartilhadas = lerStringsCompartilhadas(
    arquivos.get("xl/sharedStrings.xml")?.().toString("utf8") ?? null,
  );
  const aba = abrirAba().toString("utf8");
  const mesclagens = lerMesclagens(aba);
  const linhas: LinhaDaPlanilha[] = [];

  for (const linha of aba.matchAll(/<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const numero = linha[1];
    const celulas: CelulaDaPlanilha[] = [];

    // O `(\/>|>...<\/c>)` trata as duas formas: a celula vazia vem fechada em
    // si mesma (`<c r="B7" s="12"/>`) e sem isso o casamento atravessaria ate o
    // `</c>` de uma celula seguinte, deslocando todas as colunas da linha.
    for (const celula of linha[2].matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, coluna, atributos, fechamento, corpo = ""] = celula;

      if (fechamento === "/>") {
        continue;
      }

      const tipo = /\st="([^"]+)"/.exec(atributos)?.[1];
      let valor: string;

      if (tipo === "inlineStr") {
        valor = textoDosT(corpo);
      } else {
        // `<v>` e o valor; celula de formula tambem tem `<f>`, que e ignorado —
        // o que interessa e o resultado ja calculado pelo Excel.
        const bruto = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];

        if (bruto === undefined) {
          continue;
        }

        valor = tipo === "s" ? (compartilhadas[Number(bruto)] ?? "") : decodificar(bruto);
      }

      if (valor.trim() === "") {
        continue;
      }

      const de = indiceDaColuna(coluna);

      celulas.push({ de, ate: mesclagens.get(`${numero}:${coluna}`) ?? de, valor });
    }

    if (celulas.length > 0) {
      // O XML escreve as celulas em ordem de coluna, mas isso e convencao do
      // Excel e nao exigencia do formato — a busca por sobreposicao pega a
      // primeira que casar, entao a ordem precisa ser garantida aqui.
      celulas.sort((a, b) => a.de - b.de);
      linhas.push({ numero: Number(numero), celulas });
    }
  }

  return linhas;
}
