import type {
  EventoNatureza,
  FuncaoTurma,
  InsalubridadeGrau,
  RegraAcao,
  RegraGatilho,
  RubricaDaRegra,
} from "@/db/schema";

import {
  APONTAMENTO_VAZIO,
  MAXIMO_DE_DIAS,
  MAXIMO_DE_MINUTOS,
  type ApontamentoDaFolha,
} from "../rubricas";
import { RUBRICA_DA_REGRA, unidadeDaRubricaDaRegra } from "./campos";

/**
 * A leitura das regras contra a grade: quanto cada pessoa teria apontado se o
 * que esta na escala fosse lancado pelas regras cadastradas.
 *
 * Modulo puro, como `apuracao.ts` e `previsto.ts`, e pela mesma razao: o
 * resultado **nao e gravado**. Ele e recalculado a cada leitura, entao corrigir
 * um dia da grade corrige o VT do mes na hora — somar `+1` dentro do
 * `salvarDia` gravaria a conclusao e deixaria a versao velha do fato no dia em
 * que alguem arrumasse a celula.
 *
 * O que sai daqui e **sugestao**: quem grava e a pessoa que fecha a folha, com
 * o botao da ficha ou a geracao em lote. Mesma relacao entre a grade e o
 * relogio de ponto, que aparece na tela e nunca se escreve sozinho.
 */

/** Onde a regra nao vale. Casou um destes, ela nao se aplica naquele dia. */
export type AlvoDaExcecao = {
  empresaId: string | null;
  postoId: string | null;
  funcaoId: string | null;
  funcionarioId: string | null;
};

export type EscopoDaRegra = {
  /* Da pessoa. */
  empresaId: string | null;
  cargo: string | null;
  funcionarioId: string | null;
  /* Do dia. */
  postoId: string | null;
  funcaoId: string | null;
  turma: FuncaoTurma | null;
  eventoId: string | null;
  cicloDias: number | null;
  cicloFolgas: number | null;
  jornadaMinutos: number | null;
};

export type RegraParaCalculo = {
  id: string;
  nome: string;
  ordem: number;
  escopo: EscopoDaRegra;
  excecoes: readonly AlvoDaExcecao[];
  gatilho: RegraGatilho;
  rubrica: RubricaDaRegra;
  acao: RegraAcao;
  quantidade: number | null;
  percentual: number | null;
  grau: InsalubridadeGrau | null;
};

/**
 * Um dia de uma pessoa na grade, com o contexto que o escopo pergunta.
 *
 * O contrato (ciclo e jornada) vem por **dia**, e nao por pessoa: a vigencia da
 * funcao troca no meio da competencia, e uma regra de 11 horas precisa parar de
 * valer no dia em que o posto passou a exigir outra coisa.
 */
export type DiaParaRegras = {
  data: string;
  /**
   * Do realizado, com a troca ja resolvida pelo previsto (`naturezaDoRealizado`);
   * `null` no dia em branco — que nao dispara gatilho nenhum.
   */
  natureza: EventoNatureza | null;
  eventoId: string | null;
  intrajornada: boolean;
  postoId: string;
  funcaoId: string;
  turma: FuncaoTurma;
  cicloDias: number | null;
  cicloFolgas: number | null;
  jornadaMinutos: number | null;
};

export type PessoaParaRegras = {
  funcionarioId: string;
  empresaId: string;
  cargo: string | null;
  dias: readonly DiaParaRegras[];
};

/** Quanto a regra rendeu e por que — o que a tela mostra ao lado da sugestao. */
export type ContribuicaoDaRegra = {
  regraId: string;
  nome: string;
  rubrica: RubricaDaRegra;
  /** Quantos dias dispararam; `1` no gatilho fixo. */
  vezes: number;
};

export type SugestaoDeApontamento = {
  apontamento: ApontamentoDaFolha;
  contribuicoes: ContribuicaoDaRegra[];
};

function casaPessoa(escopo: EscopoDaRegra, pessoa: PessoaParaRegras) {
  if (escopo.empresaId && escopo.empresaId !== pessoa.empresaId) {
    return false;
  }

  if (escopo.funcionarioId && escopo.funcionarioId !== pessoa.funcionarioId) {
    return false;
  }

  // Trecho, e nao igualdade: os cargos da folha vem com variacoes ("PORTEIRO",
  // "PORTEIRO DIURNO"), e quem cadastra a regra pensa no termo.
  if (escopo.cargo) {
    const cargo = pessoa.cargo?.toLowerCase() ?? "";

    if (!cargo.includes(escopo.cargo.trim().toLowerCase())) {
      return false;
    }
  }

  return true;
}

function casaDia(escopo: EscopoDaRegra, dia: DiaParaRegras) {
  return (
    (!escopo.postoId || escopo.postoId === dia.postoId) &&
    (!escopo.funcaoId || escopo.funcaoId === dia.funcaoId) &&
    (!escopo.turma || escopo.turma === dia.turma) &&
    (!escopo.eventoId || escopo.eventoId === dia.eventoId) &&
    (escopo.cicloDias === null || escopo.cicloDias === dia.cicloDias) &&
    (escopo.cicloFolgas === null || escopo.cicloFolgas === dia.cicloFolgas) &&
    (escopo.jornadaMinutos === null || escopo.jornadaMinutos === dia.jornadaMinutos)
  );
}

function excetuado(
  excecoes: readonly AlvoDaExcecao[],
  pessoa: PessoaParaRegras,
  dia: DiaParaRegras,
) {
  return excecoes.some(
    (excecao) =>
      (excecao.empresaId !== null && excecao.empresaId === pessoa.empresaId) ||
      (excecao.funcionarioId !== null && excecao.funcionarioId === pessoa.funcionarioId) ||
      (excecao.postoId !== null && excecao.postoId === dia.postoId) ||
      (excecao.funcaoId !== null && excecao.funcaoId === dia.funcaoId),
  );
}

/** Se o dia dispara o gatilho. O dia em branco nao dispara nada. */
function dispara(gatilho: RegraGatilho, dia: DiaParaRegras) {
  switch (gatilho) {
    case "dia_trabalhado":
      return dia.natureza === "trabalho";
    case "dia_de_falta":
      return dia.natureza === "falta";
    case "dia_com_intrajornada":
      return dia.intrajornada;
    case "fixo":
      // O escopo do dia ja foi conferido por quem chama: basta um dia casar
      // para a regra fixa valer uma vez.
      return true;
  }
}

/**
 * Quantas vezes a regra rende nesta pessoa: o numero de dias que disparam, ou
 * `1` na regra fixa (que so precisa de um dia dentro do escopo para valer).
 */
function vezesQueRende(regra: RegraParaCalculo, pessoa: PessoaParaRegras) {
  let vezes = 0;

  for (const dia of pessoa.dias) {
    if (!casaDia(regra.escopo, dia) || excetuado(regra.excecoes, pessoa, dia)) {
      continue;
    }

    if (dispara(regra.gatilho, dia)) {
      if (regra.gatilho === "fixo") {
        return 1;
      }

      vezes += 1;
    }
  }

  return vezes;
}

function limite(rubrica: RubricaDaRegra) {
  switch (unidadeDaRubricaDaRegra(rubrica)) {
    case "dias":
      return MAXIMO_DE_DIAS;
    case "horas":
      return MAXIMO_DE_MINUTOS;
    case "percentual":
      return 100;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Aplica uma regra ao apontamento em construcao.
 *
 * `somar` acumula; `definir` fixa o valor. As duas respeitam o teto da coluna —
 * uma regra mal cadastrada nao pode sugerir 40 dias de VT num mes de 31, que o
 * banco recusaria na hora de gravar.
 */
function aplicar(
  apontamento: ApontamentoDaFolha,
  regra: RegraParaCalculo,
  vezes: number,
): ApontamentoDaFolha {
  const campo = RUBRICA_DA_REGRA[regra.rubrica];
  const unidade = unidadeDaRubricaDaRegra(regra.rubrica);

  if (unidade === "grau") {
    return { ...apontamento, insalubridade: regra.grau };
  }

  if (unidade === "sim_nao") {
    return { ...apontamento, [campo]: (regra.quantidade ?? 0) > 0 };
  }

  const valor = unidade === "percentual" ? (regra.percentual ?? 0) : (regra.quantidade ?? 0);
  const atual = apontamento[campo] as number;
  const total = regra.acao === "somar" ? atual + valor * vezes : valor;

  return { ...apontamento, [campo]: Math.min(total, limite(regra.rubrica)) };
}

/**
 * A sugestao para uma pessoa: as regras ativas aplicadas na ordem cadastrada.
 *
 * A ordem importa porque `definir` sobrescreve — e e por isso que ela e do
 * cadastro, e nao uma heuristica de "a regra mais especifica vence": quem le a
 * lista de cima para baixo ve o que vai acontecer.
 *
 * **A lista chega ordenada** (`ordem`, depois nome), como o `order by` de
 * `regrasAtivas()` a devolve. Reordenar aqui seria copiar e ordenar o catalogo
 * uma vez por pessoa — trezentas vezes para o mesmo resultado.
 */
export function sugerirApontamento(
  pessoa: PessoaParaRegras,
  regras: readonly RegraParaCalculo[],
): SugestaoDeApontamento {
  let apontamento = { ...APONTAMENTO_VAZIO };
  const contribuicoes: ContribuicaoDaRegra[] = [];

  for (const regra of regras) {
    if (!casaPessoa(regra.escopo, pessoa)) {
      continue;
    }

    const vezes = vezesQueRende(regra, pessoa);

    if (vezes === 0) {
      continue;
    }

    apontamento = aplicar(apontamento, regra, vezes);
    contribuicoes.push({
      regraId: regra.id,
      nome: regra.nome,
      rubrica: regra.rubrica,
      vezes,
    });
  }

  return { apontamento, contribuicoes };
}
