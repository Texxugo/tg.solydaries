/**
 * Tipos e constantes dos dias sinalizados, compartilhados entre a tela, as
 * queries e as actions.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async.
 */

/** A area do portal a que esta tela pertence. */
export const AREA_SINALIZACOES = "sinalizacoes" as const;

export const ROTA_SINALIZACOES = "/sinalizacoes";

export const SEM_COMPETENCIA =
  "Nenhuma competencia aberta: os dias sinalizados sao lidos da escala do periodo.";

/** O recorte da lista, na URL (`?situacao=`). */
export const SITUACOES = ["pendentes", "resolvidos", "todos"] as const;
export type SituacaoDoFiltro = (typeof SITUACOES)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDoFiltro, string> = {
  pendentes: "Pendentes",
  resolvidos: "Resolvidos",
  todos: "Todos",
};

/** Um dia sinalizado como a tela o mostra: de quem, onde, o que a grade diz e em que pe esta. */
export type DiaSinalizado = {
  id: string;
  linhaId: string;
  data: string;
  postoId: string;
  postoCodigo: string;
  postoNome: string;
  funcaoNome: string;
  pessoaNome: string;
  /** Matricula do funcionario ou codigo do freelancer, quando ha. */
  pessoaCodigo: string | null;
  freelancer: boolean;
  /** O realizado daquele dia na grade, quando a celula existe. */
  eventoCodigo: string | null;
  horario: string | null;
  sinalizadoPor: string | null;
  sinalizadoEm: Date;
  resolvidoPor: string | null;
  /** `null` enquanto pendente. */
  resolvidoEm: Date | null;
  /** O que conferir, escrito por quem sinalizou. */
  observacao: string | null;
  /** O ultimo envio aceito ao responsavel do posto; `null` se nunca foi enviado. */
  ultimoEnvio: EnvioDoDia | null;
};

/** O ultimo envio aceito de um dia ao responsavel do posto. */
export type EnvioDoDia = { responsavel: string | null; em: Date };

/** A tela do envio aos responsaveis. */
export const ROTA_ENVIO_SINALIZADOS = `${ROTA_SINALIZACOES}/responsaveis`;

/** Um responsavel de posto com dias sinalizados pendentes nos postos dele. */
export type ResponsavelDosSinalizados = {
  /** O funcionario responsavel. */
  id: string;
  nome: string;
  /** So digitos, com DDI. `null` sem numero no cadastro. */
  telefone: string | null;
  bloqueio: "responsavel_sem_telefone" | "responsavel_inativo" | null;
  postos: { id: string; codigo: string; nome: string }[];
  /** Dias pendentes (nao resolvidos) nos postos dele. */
  pendentes: number;
  /** Os que ainda nao foram enviados a ele desde a ultima sinalizacao. */
  aEnviar: number;
};

/** Posto com dia pendente e sem responsavel: nao ha a quem mandar. */
export type PostoSemResponsavel = {
  id: string;
  codigo: string;
  nome: string;
  pendentes: number;
};

export type PreviaDoEnvio = {
  responsavelId: string;
  destinatario: string;
  telefone: string;
  dias: number;
  /** Os que passaram do teto e ficam para o envio seguinte. */
  restantes: number;
  conteudo: string;
  /** SHA-256 do texto: a confirmacao so envia se o texto refeito for o mesmo. */
  assinatura: string;
};

export type EnvioState = {
  status: "idle" | "previa" | "success" | "error";
  mensagem?: string;
  previa?: PreviaDoEnvio;
};

export const estadoInicialEnvio: EnvioState = { status: "idle" };

export type ResolverState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialResolver: ResolverState = { status: "idle" };

/** O link de cada recorte da lista, sem o parametro quando e o padrao. */
export function hrefDaSituacao(situacao: SituacaoDoFiltro) {
  return situacao === "pendentes" ? ROTA_SINALIZACOES : `${ROTA_SINALIZACOES}?situacao=${situacao}`;
}
