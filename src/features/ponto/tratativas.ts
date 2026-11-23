import type { TratativaStatus } from "@/db/schema";

/**
 * A tratativa: o estado do **trabalho humano** sobre uma ocorrencia de ponto.
 *
 * Modulo puro (so `import type` do schema, apagado na compilacao), como
 * `acessos/areas.ts`: e lido pelo painel, pelos formularios client e pelas
 * actions, e nenhum deles deve arrastar o Drizzle para o outro lado.
 *
 * A distincao que este modulo carrega e a mesma que sustenta o resto da
 * feature: a **ocorrencia** e calculada e nao se grava; a **tratativa** e um
 * fato novo e se grava. Uma falta continua sendo falta depois de justificada —
 * o que muda e que alguem ja cuidou dela.
 */

const CATALOGO: Record<TratativaStatus, { rotulo: string; descricao: string; encerrada: boolean }> =
  {
    aberta: {
      rotulo: "Aberta",
      descricao: "Ninguem cuidou desta ocorrencia ainda.",
      encerrada: false,
    },
    em_tratativa: {
      rotulo: "Em tratativa",
      descricao: "O colaborador foi procurado e a conversa esta em andamento.",
      encerrada: false,
    },
    justificada: {
      rotulo: "Justificada",
      descricao: "O colaborador explicou o dia e a explicacao foi aceita.",
      encerrada: true,
    },
    resolvida: {
      rotulo: "Resolvida",
      descricao:
        "O que faltava foi corrigido — batida incluida, atestado lancado, escala ajustada.",
      encerrada: true,
    },
    descartada: {
      rotulo: "Descartada",
      descricao: "Nao era ocorrencia: a leitura mudou, ou o dia nao era daquela pessoa.",
      encerrada: true,
    },
  };

export type OpcaoDeTratativa = {
  status: TratativaStatus;
  rotulo: string;
  descricao: string;
  encerrada: boolean;
};

/** Todos os status, na ordem em que aparecem nas telas. */
export const STATUS_DE_TRATATIVA: readonly OpcaoDeTratativa[] = (
  Object.keys(CATALOGO) as TratativaStatus[]
).map((status) => ({ status, ...CATALOGO[status] }));

/** Mesma lista, no formato de tupla que o `z.enum` exige. */
export const IDS_STATUS_TRATATIVA = STATUS_DE_TRATATIVA.map((opcao) => opcao.status) as [
  TratativaStatus,
  ...TratativaStatus[],
];

export function rotuloDaTratativa(status: TratativaStatus) {
  return CATALOGO[status].rotulo;
}

export function descricaoDaTratativa(status: TratativaStatus) {
  return CATALOGO[status].descricao;
}

/**
 * `true` quando a ocorrencia ja teve desfecho. E o que o painel usa para separar
 * a fila do que ja foi tratado — e nao a gravidade, que descreve o problema e
 * nao o andamento dele.
 */
export function tratativaEncerrada(status: TratativaStatus) {
  return CATALOGO[status].encerrada;
}
