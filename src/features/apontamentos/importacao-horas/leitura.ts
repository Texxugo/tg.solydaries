import type { LinhaDaPlanilha, LinhaRecusada } from "@/features/funcionarios/planilha";

import { lerHoras, MAXIMO_DE_MINUTOS } from "../rubricas";

/**
 * Leitura do relatorio de horas extras por verba: uma linha por pessoa e
 * verba, com as colunas Nome, Horas (`HH:MM`, passando de 24h) e Verba.
 *
 * Modulo puro: recebe as celulas que `funcionarios/xlsx.ts` ja tirou do
 * arquivo e devolve as linhas que interessam. Nao sabe quem e quem no
 * cadastro — isso e de `plano.ts`.
 */

/**
 * As verbas que o portal le, e a rubrica do apontamento de cada uma. As demais
 * linhas do relatorio ficam de fora (`ignoradas`), sem recusa: o relatorio
 * pode trazer outras verbas, e elas nao sao horas extras.
 */
export const RUBRICA_DA_VERBA = {
  "150": "he50Minutos",
  "200": "he100Minutos",
} as const;

export type Verba = keyof typeof RUBRICA_DA_VERBA;

export type LinhaDeHoras = {
  /** Numero da linha no Excel, para as mensagens. */
  linha: number;
  /** O nome como veio no arquivo. */
  nome: string;
  /** O nome comparavel (`chaveDoNome()`): e por ele que as linhas da mesma pessoa se juntam. */
  chave: string;
  verba: Verba;
  minutos: number;
};

export type LeituraDeHoras =
  | {
      ok: true;
      linhas: LinhaDeHoras[];
      recusadas: LinhaRecusada[];
      /** Linhas de outras verbas, agrupadas pela verba. */
      outrasVerbas: { verba: string; linhas: number }[];
      /** Linhas com horas zeradas: nao apontam nada, e nao apagam o que ja esta gravado. */
      zeradas: number;
    }
  | { ok: false; mensagem: string };

/**
 * Nome comparavel: sem acento, em caixa alta e com um espaco so entre as
 * palavras. O relatorio de horas e o da folha saem de sistemas diferentes: um
 * escreve "GONÇALVES" e o outro "GONCALVES", e um deles deixa espaco duplo
 * ("KEREM ROSA  ANACLETO").
 */
export function chaveDoNome(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function rotuloDoCabecalho(texto: string) {
  return chaveDoNome(texto).toLowerCase();
}

type Colunas = { nome: number; horas: number; verba: number };

/** A linha cujas celulas dizem Nome, Horas e Verba — em qualquer ordem e coluna. */
function acharCabecalho(linhas: readonly LinhaDaPlanilha[]) {
  for (const [indice, linha] of linhas.entries()) {
    const colunas: Partial<Colunas> = {};

    for (const celula of linha.celulas) {
      const rotulo = rotuloDoCabecalho(celula.valor);

      if (rotulo === "nome") colunas.nome = celula.de;
      else if (rotulo === "horas") colunas.horas = celula.de;
      else if (rotulo === "verba") colunas.verba = celula.de;
    }

    if (colunas.nome !== undefined && colunas.horas !== undefined && colunas.verba !== undefined) {
      return { indice, colunas: colunas as Colunas };
    }
  }

  return null;
}

function valorNaColuna(linha: LinhaDaPlanilha, coluna: number) {
  return linha.celulas.find((celula) => celula.de <= coluna && coluna <= celula.ate)?.valor.trim();
}

/**
 * Horas da celula -> minutos. O relatorio manda texto (`50:24`, `108:55`), que
 * e o que `lerHoras()` le. Se a planilha tiver sido salva de novo pelo Excel,
 * a hora pode virar numero — fracao de dia (`0,5` = 12:00) —, e os segundos
 * de um `HH:MM:SS` sao descartados.
 */
function minutosDaCelula(valor: string): number | null {
  if (/^\d*\.\d+$/.test(valor)) {
    return Math.round(Number(valor) * 24 * 60);
  }

  const semSegundos = /^(\d+:[0-5]\d):[0-5]\d$/.exec(valor)?.[1] ?? valor;

  return lerHoras(semSegundos);
}

/** `"150"`, `"150.0"` e `" 150 "` sao a mesma verba. */
function verbaDaCelula(valor: string) {
  const numero = Number(valor.replace(",", "."));

  return Number.isFinite(numero) ? String(numero) : valor;
}

export function lerRelatorioDeHoras(linhas: readonly LinhaDaPlanilha[]): LeituraDeHoras {
  const cabecalho = acharCabecalho(linhas);

  if (!cabecalho) {
    return {
      ok: false,
      mensagem: "A planilha nao tem o cabecalho com as colunas Nome, Horas e Verba.",
    };
  }

  const { colunas } = cabecalho;
  const lidas: LinhaDeHoras[] = [];
  const recusadas: LinhaRecusada[] = [];
  const outras = new Map<string, number>();
  let zeradas = 0;

  for (const linha of linhas.slice(cabecalho.indice + 1)) {
    const nome = valorNaColuna(linha, colunas.nome) ?? "";
    const horas = valorNaColuna(linha, colunas.horas) ?? "";
    const verbaBruta = valorNaColuna(linha, colunas.verba) ?? "";
    const identificacao = nome || "(sem nome)";

    if (!nome && !horas && !verbaBruta) {
      continue;
    }

    const verba = verbaDaCelula(verbaBruta);

    if (!(verba in RUBRICA_DA_VERBA)) {
      outras.set(verba || "(em branco)", (outras.get(verba || "(em branco)") ?? 0) + 1);
      continue;
    }

    if (!nome) {
      recusadas.push({ linha: linha.numero, identificacao, motivo: "Linha sem nome." });
      continue;
    }

    const minutos = minutosDaCelula(horas);

    if (minutos === null || horas === "") {
      recusadas.push({
        linha: linha.numero,
        identificacao,
        motivo: `Horas "${horas}" nao estao no formato HH:MM.`,
      });
      continue;
    }

    if (minutos > MAXIMO_DE_MINUTOS) {
      recusadas.push({
        linha: linha.numero,
        identificacao,
        motivo: `${horas} passa de 744 horas, o teto do apontamento.`,
      });
      continue;
    }

    if (minutos === 0) {
      zeradas += 1;
      continue;
    }

    lidas.push({
      linha: linha.numero,
      nome,
      chave: chaveDoNome(nome),
      verba: verba as Verba,
      minutos,
    });
  }

  // O mesmo nome duas vezes na mesma verba: podem ser duas pessoas homonimas
  // no relatorio, ou a mesma lancada duas vezes. Somar acertaria um caso e
  // erraria o outro, entao as duas linhas ficam de fora.
  const contagem = new Map<string, number>();

  for (const linha of lidas) {
    const par = `${linha.chave}|${linha.verba}`;
    contagem.set(par, (contagem.get(par) ?? 0) + 1);
  }

  const unicas = lidas.filter((linha) => {
    if (contagem.get(`${linha.chave}|${linha.verba}`) === 1) {
      return true;
    }

    recusadas.push({
      linha: linha.linha,
      identificacao: linha.nome,
      motivo: `O nome aparece mais de uma vez com a verba ${linha.verba}: nao da para saber se e a mesma pessoa.`,
    });
    return false;
  });

  return {
    ok: true,
    linhas: unicas,
    recusadas: recusadas.sort((a, b) => a.linha - b.linha),
    outrasVerbas: [...outras].map(([verba, total]) => ({ verba, linhas: total })),
    zeradas,
  };
}
