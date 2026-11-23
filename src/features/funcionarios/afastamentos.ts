import type { AfastamentoTipo } from "@/db/schema";

/**
 * Periodos em que a pessoa nao devia bater ponto: ferias, atestado, INSS.
 *
 * Modulo puro (so `import type` do schema, apagado na compilacao), como
 * `situacoes.ts` e `cpf.ts`: e lido pela DAL, pelas telas e — o que importa —
 * pela apuracao do ponto, que nao pode arrastar o Drizzle para dentro de um
 * modulo que hoje nao tem banco nenhum.
 *
 * As datas entram e saem como `YYYY-MM-DD`, do jeito que o Postgres devolve um
 * `date`. Nada aqui constroi um `Date`: nesse formato a comparacao de texto tem
 * exatamente a mesma ordem da comparacao de data, entao `>=` e `<=` sobre a
 * string bastam — e nao ha fuso a errar, pelo mesmo motivo de `periodo.ts`.
 */

const CATALOGO: Record<AfastamentoTipo, { rotulo: string; descricao: string }> = {
  ferias: {
    rotulo: "Ferias",
    descricao: "Periodo de ferias concedido. Programado, entao costuma ser lancado antes.",
  },
  atestado: {
    rotulo: "Atestado",
    descricao: "Atestado medico de ate 15 dias, pago pela empresa.",
  },
  inss: {
    rotulo: "INSS",
    descricao: "Afastamento previdenciario, a partir do 16o dia. Costuma atravessar competencias.",
  },
};

export type TipoDeAfastamento = { tipo: AfastamentoTipo; rotulo: string; descricao: string };

/** Todos os tipos, na ordem em que o campo de escolha os lista. */
export const TIPOS_DE_AFASTAMENTO: readonly TipoDeAfastamento[] = (
  Object.keys(CATALOGO) as AfastamentoTipo[]
).map((tipo) => ({ tipo, ...CATALOGO[tipo] }));

export function rotuloDoAfastamento(tipo: AfastamentoTipo) {
  return CATALOGO[tipo].rotulo;
}

/** Mesma lista no formato de tupla que o `z.enum` exige. */
export const IDS_TIPOS_AFASTAMENTO = TIPOS_DE_AFASTAMENTO.map((atual) => atual.tipo) as [
  AfastamentoTipo,
  ...AfastamentoTipo[],
];

/**
 * O recorte minimo que a apuracao precisa. Um tipo proprio, e nao a linha do
 * banco: `apuracao.ts` nao deve conhecer `id`, `observacao` nem `criado_em`
 * para responder "este dia estava coberto?".
 */
export type PeriodoDeAfastamento = {
  tipo: AfastamentoTipo;
  /** Ambas inclusivas. Um afastamento de um dia so tem inicio igual ao fim. */
  dataInicio: string;
  dataFim: string;
};

/** `true` quando a data cai dentro do periodo, contando as duas pontas. */
export function cobreData(afastamento: PeriodoDeAfastamento, data: string) {
  return data >= afastamento.dataInicio && data <= afastamento.dataFim;
}

/**
 * O afastamento que cobre a data, ou `null`.
 *
 * E a funcao que a apuracao chama para cada dia da janela, antes de olhar
 * qualquer batida: sem ela, uma terca de ferias e uma terca de falta sao a
 * mesma coisa aos olhos do relogio — nao ha marcacao em nenhuma das duas.
 *
 * Havendo mais de um cobrindo a mesma data (a action recusa, mas o banco nao
 * impede), vence o primeiro da lista. Um dia coberto duas vezes continua sendo
 * um dia coberto, e escolher por criterio mais elaborado seria fingir que a
 * sobreposicao significa alguma coisa.
 */
export function afastamentoNaData(
  data: string,
  afastamentos: readonly PeriodoDeAfastamento[],
): PeriodoDeAfastamento | null {
  return afastamentos.find((atual) => cobreData(atual, data)) ?? null;
}

/**
 * `true` quando dois periodos compartilham ao menos um dia. Serve a action, que
 * recusa cadastrar um afastamento em cima de outro: sobreposicao quase sempre e
 * data digitada errada, e nao duas ausencias simultaneas.
 */
export function periodosSeSobrepoem(a: PeriodoDeAfastamento, b: PeriodoDeAfastamento) {
  return a.dataInicio <= b.dataFim && b.dataInicio <= a.dataFim;
}

const MS_DO_DIA = 24 * 60 * 60 * 1000;

/**
 * Quantos dias o afastamento cobre, contando as duas pontas — um afastamento de
 * um dia so da 1.
 *
 * A conta e feita inteira em UTC, como `diaSeguinte()` em `periodo.ts`: montar
 * em fuso local faria a diferenca variar com o horario de verao.
 */
export function diasDeAfastamento(afastamento: PeriodoDeAfastamento) {
  const inicio = Date.parse(`${afastamento.dataInicio}T00:00:00Z`);
  const fim = Date.parse(`${afastamento.dataFim}T00:00:00Z`);

  return Math.round((fim - inicio) / MS_DO_DIA) + 1;
}
