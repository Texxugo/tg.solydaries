import type { LinhaDaPlanilha, LinhaRecusada } from "@/features/funcionarios/planilha";

import { horasParaCampo, lerHoras, MAXIMO_DE_MINUTOS } from "../rubricas";

/**
 * Leitura do relatorio de horas extras por verba, com as colunas Nome, Horas
 * (`HH:MM`, passando de 24h) e Verba. Dois modelos passam por aqui:
 *
 * - o **resumo**, com uma linha por pessoa e verba (so Nome, Horas e Verba);
 * - o **Relatorio de Eventos Individuais**, com uma linha por **dia** e as
 *   colunas Emp. e Matricula a mais. Ali a mesma pessoa aparece dezenas de
 *   vezes na mesma verba, e as linhas sao somadas.
 *
 * Somar so e seguro quando o arquivo diz que e a mesma pessoa: nome, matricula
 * e empresa iguais (`identidade`). Sem matricula, o mesmo nome repetido na
 * mesma verba continua recusado — pode ser um homonimo, e somar pagaria a um o
 * que o outro fez.
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

/** O total de uma pessoa numa verba — uma linha do arquivo, ou a soma das linhas dela. */
export type LinhaDeHoras = {
  /** Numeros das linhas no Excel que entraram na soma, para as mensagens. */
  linhas: number[];
  /** O nome como veio no arquivo. */
  nome: string;
  /** O nome comparavel (`chaveDoNome()`): e por ele que o cadastro e procurado. */
  chave: string;
  /** Matricula do arquivo; `null` quando a planilha nao tem a coluna ou a celula veio vazia. */
  matricula: string | null;
  /** Codigo da empresa (coluna Emp.), quando o arquivo traz. */
  empresa: string | null;
  /**
   * Quem o arquivo diz que e: nome + empresa + matricula, ou so o nome quando
   * nao ha matricula. As linhas com a mesma identidade e verba sao somadas.
   */
  identidade: string;
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

type Colunas = {
  nome: number;
  horas: number;
  verba: number;
  /** Opcionais: o resumo nao as traz, o relatorio de eventos individuais sim. */
  matricula?: number;
  empresa?: number;
};

const ROTULOS_DA_EMPRESA = new Set(["emp", "emp.", "empresa"]);

/** A linha cujas celulas dizem Nome, Horas e Verba — em qualquer ordem e coluna. */
function acharCabecalho(linhas: readonly LinhaDaPlanilha[]) {
  for (const [indice, linha] of linhas.entries()) {
    const colunas: Partial<Colunas> = {};

    for (const celula of linha.celulas) {
      const rotulo = rotuloDoCabecalho(celula.valor);

      if (rotulo === "nome") colunas.nome = celula.de;
      else if (rotulo === "horas") colunas.horas = celula.de;
      else if (rotulo === "verba") colunas.verba = celula.de;
      else if (rotulo === "matricula") colunas.matricula = celula.de;
      else if (ROTULOS_DA_EMPRESA.has(rotulo)) colunas.empresa = celula.de;
    }

    if (colunas.nome !== undefined && colunas.horas !== undefined && colunas.verba !== undefined) {
      return { indice, colunas: colunas as Colunas };
    }
  }

  return null;
}

function valorNaColuna(linha: LinhaDaPlanilha, coluna: number | undefined) {
  if (coluna === undefined) {
    return undefined;
  }

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

/** `"0467"` e `"467"` sao a mesma matricula, como na carga da folha. */
function codigoDaCelula(valor: string | undefined) {
  const texto = (valor ?? "").trim();

  if (!texto) {
    return null;
  }

  return /^\d+$/.test(texto) ? String(Number(texto)) : texto;
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

    const verba = verbaDaCelula(verbaBruta);
    const verbaLida = verba in RUBRICA_DA_VERBA;

    // Sem nome, so e linha de pessoa se tiver horas numa verba lida. O resto e
    // linha em branco ou o rodape de totais do relatorio de eventos ("Total
    // Geral em Minutos: 446217"), cujo valor cai sob as colunas Horas e Verba.
    if (!nome && (!horas || !verbaLida)) {
      continue;
    }

    if (!verbaLida) {
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

    const chave = chaveDoNome(nome);
    const matricula = codigoDaCelula(valorNaColuna(linha, colunas.matricula));
    const empresa = codigoDaCelula(valorNaColuna(linha, colunas.empresa));

    lidas.push({
      linhas: [linha.numero],
      nome,
      chave,
      matricula,
      empresa,
      identidade: matricula === null ? chave : `${chave}|${empresa ?? ""}|${matricula}`,
      verba: verba as Verba,
      minutos,
    });
  }

  return {
    ok: true,
    linhas: somarPorIdentidade(lidas, recusadas),
    recusadas: recusadas.sort((a, b) => a.linha - b.linha),
    outrasVerbas: [...outras].map(([verba, total]) => ({ verba, linhas: total })),
    zeradas,
  };
}

/**
 * Junta as linhas da mesma pessoa na mesma verba, somando as horas.
 *
 * Com matricula, a identidade e nome + empresa + matricula, e as linhas
 * repetidas sao os dias do relatorio de eventos individuais: somam. Sem
 * matricula, a identidade e so o nome, e a repeticao pode ser um homonimo ou a
 * mesma pessoa lancada duas vezes — somar acertaria um caso e erraria o outro,
 * entao as linhas ficam de fora.
 *
 * A soma tambem passa pelo teto do apontamento: cada dia cabe, e o mes inteiro
 * pode nao caber.
 */
function somarPorIdentidade(lidas: readonly LinhaDeHoras[], recusadas: LinhaRecusada[]) {
  const grupos = Map.groupBy(lidas, (linha) => `${linha.identidade}#${linha.verba}`);
  const somadas: LinhaDeHoras[] = [];

  for (const grupo of grupos.values()) {
    const [primeira] = grupo;
    const linhas = grupo.flatMap((linha) => linha.linhas);

    if (grupo.length > 1 && primeira.matricula === null) {
      for (const linha of linhas) {
        recusadas.push({
          linha,
          identificacao: primeira.nome,
          motivo: `O nome aparece mais de uma vez com a verba ${primeira.verba} e sem matricula: nao da para saber se e a mesma pessoa.`,
        });
      }
      continue;
    }

    const minutos = grupo.reduce((total, linha) => total + linha.minutos, 0);

    if (minutos > MAXIMO_DE_MINUTOS) {
      for (const linha of linhas) {
        recusadas.push({
          linha,
          identificacao: primeira.nome,
          motivo: `A verba ${primeira.verba} soma ${horasParaCampo(minutos)} para esta pessoa, e passa de 744 horas, o teto do apontamento.`,
        });
      }
      continue;
    }

    somadas.push({ ...primeira, linhas, minutos });
  }

  return somadas;
}
