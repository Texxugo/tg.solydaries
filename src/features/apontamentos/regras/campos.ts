import type { RegraAcao, RegraGatilho, RubricaDaRegra } from "@/db/schema";

import { RUBRICAS, type Rubrica, type UnidadeDaRubrica } from "../rubricas";

/**
 * O vocabulario da regra: que rubrica ela alimenta, o que a dispara e o que ela
 * faz com o valor.
 *
 * Modulo puro (so `import type` do schema): e lido pelo formulario client, pela
 * lista e pelo calculo — mesma regra de `rubricas.ts`, de quem ele e a ponte
 * para o enum do banco.
 */

/**
 * Cada valor do enum `apontamento_rubrica` e a coluna que ele alimenta em
 * `apontamentos`. O `Record` amarra os dois lados: valor novo no enum sem
 * coluna correspondente (ou rubrica renomeada no catalogo) quebra o typecheck.
 */
export const RUBRICA_DA_REGRA: Record<RubricaDaRegra, Rubrica> = {
  vt_dias: "vtDias",
  vr_dias: "vrDias",
  cesta_basica: "cestaBasica",
  he_50: "he50Minutos",
  he_60: "he60Minutos",
  he_100: "he100Minutos",
  adicional_noturno: "adicionalNoturnoMinutos",
  intrajornada: "intrajornadaMinutos",
  insalubridade: "insalubridade",
  periculosidade: "periculosidade",
  assiduidade: "assiduidade",
  gratificacao: "gratificacaoPercentual",
  faltas_escala: "faltasEscala",
  faltas_folga: "faltasFolga",
  dsr: "dsrDescontados",
};

export const IDS_RUBRICA_DA_REGRA = Object.keys(RUBRICA_DA_REGRA) as [
  RubricaDaRegra,
  ...RubricaDaRegra[],
];

const POR_RUBRICA = new Map(RUBRICAS.map((rubrica) => [rubrica.id, rubrica]));

/** O rotulo da rubrica, o mesmo que a ficha e a lista de apontamentos mostram. */
export function rotuloDaRubricaDaRegra(rubrica: RubricaDaRegra) {
  return POR_RUBRICA.get(RUBRICA_DA_REGRA[rubrica])?.rotulo ?? rubrica;
}

/** A unidade decide que campo de valor a regra preenche e como ele se le. */
export function unidadeDaRubricaDaRegra(rubrica: RubricaDaRegra): UnidadeDaRubrica {
  return POR_RUBRICA.get(RUBRICA_DA_REGRA[rubrica])!.unidade;
}

/**
 * Marcacao e grau nao se somam: "periculosidade duas vezes" nao quer dizer
 * nada, e dois graus de insalubridade no mesmo mes tambem nao. Para elas a
 * unica acao possivel e `definir`.
 */
export function aceitaSoma(rubrica: RubricaDaRegra) {
  const unidade = unidadeDaRubricaDaRegra(rubrica);
  return unidade === "dias" || unidade === "horas" || unidade === "percentual";
}

export const GATILHOS: readonly { id: RegraGatilho; rotulo: string; descricao: string }[] = [
  {
    id: "dia_trabalhado",
    rotulo: "Dia trabalhado",
    descricao: "Cada dia cuja sigla e de natureza trabalho.",
  },
  {
    id: "dia_de_falta",
    rotulo: "Dia de falta",
    descricao: "Cada dia cuja sigla e de natureza falta.",
  },
  {
    id: "dia_com_intrajornada",
    rotulo: "Dia com intrajornada nao usufruida",
    descricao: "Cada dia marcado no modal da grade como intervalo nao usufruido.",
  },
  {
    id: "fixo",
    rotulo: "Fixo na competencia",
    descricao: "Uma vez por pessoa, bastando um dia dela casar com o escopo.",
  },
];

export function rotuloDoGatilho(gatilho: RegraGatilho) {
  return GATILHOS.find((atual) => atual.id === gatilho)?.rotulo ?? gatilho;
}

export const IDS_GATILHO = GATILHOS.map((gatilho) => gatilho.id) as [
  RegraGatilho,
  ...RegraGatilho[],
];

export const ACOES: readonly { id: RegraAcao; rotulo: string; descricao: string }[] = [
  {
    id: "somar",
    rotulo: "Somar",
    descricao: "Acumula a quantidade a cada dia que dispara.",
  },
  {
    id: "definir",
    rotulo: "Definir",
    descricao: "Fixa o valor, sobrescrevendo o que as regras anteriores acumularam.",
  },
];

export const IDS_ACAO = ACOES.map((acao) => acao.id) as [RegraAcao, ...RegraAcao[]];
