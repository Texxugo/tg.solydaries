import type { TipoDeDivergencia } from "../apuracao";

/**
 * Os motivos que o colaborador escolhe no menu do WhatsApp.
 *
 * Modulo puro. Cada motivo diz o que mais precisa ser perguntado: horarios
 * (para corrigir marcacao) ou uma descricao (para explicar o dia). E o catalogo
 * que decide o caminho da conversa — o fluxo nao tem `if` por motivo.
 *
 * Os titulos cabem em 24 caracteres e as descricoes em 72: sao os limites da
 * lista de opcoes do WhatsApp, e passar deles corta o texto na tela da pessoa.
 */

/**
 * As ocorrencias que o robo do WhatsApp atende: falta e marcacao incompleta
 * (impar ou com batidas a menos). As outras — hora extra, debito, intrajornada,
 * marcacoes a mais, trabalho em folga — ficam so no painel: nao sao algo que o
 * colaborador corrija informando horarios, e sim decisao de quem confere o ponto.
 */
export const TIPOS_DO_ATENDIMENTO = [
  "sem_marcacao",
  "marcacao_impar",
  "marcacoes_a_menos",
] as const satisfies readonly TipoDeDivergencia[];

export type TipoDoAtendimento = (typeof TIPOS_DO_ATENDIMENTO)[number];

export function ehTipoDoAtendimento(tipo: TipoDeDivergencia): tipo is TipoDoAtendimento {
  return (TIPOS_DO_ATENDIMENTO as readonly TipoDeDivergencia[]).includes(tipo);
}

export type MotivoDeCorrecao =
  "esqueci_marcar" | "relogio_falhou" | "marcou_errado" | "atestado" | "folga_trocada" | "outro";

type Motivo = {
  titulo: string;
  descricao: string;
  /** Pede os horarios corretos de todas as marcacoes do dia. */
  pedeHorarios: boolean;
  /** Pede um texto livre explicando o dia. */
  pedeDescricao: boolean;
  /** Em que ocorrencias o motivo faz sentido. `null` = todas as do atendimento. */
  tipos: readonly TipoDoAtendimento[] | null;
};

const CATALOGO: Record<MotivoDeCorrecao, Motivo> = {
  esqueci_marcar: {
    titulo: "Esqueci de marcar",
    descricao: "Trabalhei, mas nao passei o cartao em alguma batida",
    pedeHorarios: true,
    pedeDescricao: false,
    tipos: ["sem_marcacao", "marcacao_impar", "marcacoes_a_menos"],
  },
  relogio_falhou: {
    titulo: "Relogio nao registrou",
    descricao: "Passei o cartao, mas o relogio falhou ou estava parado",
    pedeHorarios: true,
    pedeDescricao: false,
    tipos: ["sem_marcacao", "marcacao_impar", "marcacoes_a_menos"],
  },
  marcou_errado: {
    titulo: "Marquei errado",
    descricao: "Bati o ponto em horario errado ou mais de uma vez",
    pedeHorarios: true,
    pedeDescricao: false,
    tipos: ["marcacao_impar"],
  },
  atestado: {
    titulo: "Atestado ou afastamento",
    descricao: "Estava de atestado, ferias ou afastado nesse dia",
    pedeHorarios: false,
    pedeDescricao: true,
    tipos: ["sem_marcacao", "marcacao_impar", "marcacoes_a_menos"],
  },
  folga_trocada: {
    titulo: "Troca de folga",
    descricao: "Troquei a folga ou o plantao com autorizacao",
    pedeHorarios: false,
    pedeDescricao: true,
    tipos: ["sem_marcacao"],
  },
  outro: {
    titulo: "Outro motivo",
    descricao: "Nenhuma das opcoes acima: vou explicar por escrito",
    pedeHorarios: false,
    pedeDescricao: true,
    tipos: null,
  },
};

export function motivo(codigo: MotivoDeCorrecao) {
  return CATALOGO[codigo];
}

export function ehMotivo(valor: string | null | undefined): valor is MotivoDeCorrecao {
  return Boolean(valor && Object.hasOwn(CATALOGO, valor));
}

/** Os motivos oferecidos para uma ocorrencia, com "Outro" sempre por ultimo. */
export function motivosPara(tipo: TipoDeDivergencia) {
  return (Object.keys(CATALOGO) as MotivoDeCorrecao[])
    .filter((codigo) => {
      const tipos: readonly TipoDeDivergencia[] | null = CATALOGO[codigo].tipos;
      return tipos === null || tipos.includes(tipo);
    })
    .map((codigo) => ({ codigo, ...CATALOGO[codigo] }));
}
