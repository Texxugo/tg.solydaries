import type { EfetivoComportamento } from "@/db/schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios do modulo de
 * efetivos.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/** A area do portal a que este modulo pertence. */
export const AREA_EFETIVOS = "efetivos" as const;

export const ROTA_EFETIVOS = "/efetivos";
export const ROTA_CADASTROS_EFETIVOS = "/efetivos/cadastros";

/**
 * O que cada comportamento faz, nas palavras da tela. `Record` amarrado ao enum
 * do banco: comportamento novo sem rotulo quebra o typecheck.
 */
export const COMPORTAMENTOS: Record<EfetivoComportamento, { rotulo: string; descricao: string }> = {
  falta_sem_cobertura: {
    rotulo: "Falta sem cobertura",
    descricao: "Registra a falta e marca o posto como descoberto",
  },
  cobertura: {
    rotulo: "Cobertura de falta",
    descricao: "Pede quem faltou e registra a falta dessa pessoa",
  },
  troca: {
    rotulo: "Troca",
    descricao: "Pede com quem trocou ou de qual posto veio",
  },
  simples: {
    rotulo: "Simples",
    descricao: "So o tipo, com observacao opcional",
  },
};

/** Mesma lista, no formato de tupla que o `z.enum` exige. */
export const IDS_COMPORTAMENTOS = Object.keys(COMPORTAMENTOS) as [
  EfetivoComportamento,
  ...EfetivoComportamento[],
];

/** Os dois cadastros base do modulo, que a tela de cadastros desenha igual. */
export type Catalogo = "locais" | "tipos";

/** Uma linha de cadastro como a tela a enxerga — local ou tipo de excecao. */
export type ItemDoCatalogo = {
  id: string;
  nome: string;
  ativo: boolean;
  /** So nos tipos de excecao. */
  comportamento?: EfetivoComportamento;
};

export type CatalogoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: { nome?: string[]; comportamento?: string[] };
  /** O que foi digitado, para o campo nao voltar vazio depois da recusa. */
  valores?: { nome: string; comportamento: string };
  /**
   * Muda a cada resposta. O formulario usa como `key` dos campos: campo nao
   * controlado ignora `defaultValue` novo, e sem remontar ele nao traria de
   * volta o que foi recusado nem se limparia depois do sucesso.
   */
  versao?: number;
};

export const estadoInicialCatalogo: CatalogoState = { status: "idle" };

/** O posto como o lancamento o oferece: o codigo e o que se digita. */
export type PostoDoLancamento = { id: string; codigo: string; nome: string };

/**
 * Um local ativo, com quantas vezes foi usado **neste posto**. A lista ja vem
 * na ordem do lancamento: os mais usados no posto primeiro, depois os demais em
 * ordem alfabetica.
 */
export type LocalDoPosto = { id: string; nome: string; usos: number };

/** Quem lancou ou alterou, e quando — a auditoria que a lista mostra. */
export type Autoria = { nome: string | null; em: string };

/** Uma linha da lista do posto no dia. */
export type LancamentoDoDia = {
  id: string;
  /** `f:<uuid>` ou `l:<uuid>`, como em extras e na grade. */
  pessoa: string;
  nome: string;
  identificacao: string | null;
  freelancer: boolean;
  localId: string;
  local: string;
  /** `HH:MM`. */
  entrada: string;
  saida: string;
  viraODia: boolean;
  duracao: number;
  criado: Autoria;
  /** `null` quando nunca foi alterado depois de lancado. */
  alterado: Autoria | null;
  /** `null` e o dia normal, sem excecao. */
  excecao: ExcecaoDoLancamento | null;
};

/** A excecao de um lancamento, como a lista e o formulario de edicao a leem. */
export type ExcecaoDoLancamento = {
  tipoId: string;
  tipo: string;
  comportamento: EfetivoComportamento;
  /** Quem faltou (cobertura) ou com quem trocou (troca). */
  contraparte: { valor: string; nome: string } | null;
  /** De qual posto a pessoa veio (troca). */
  postoOrigem: { id: string; codigo: string } | null;
  observacao: string | null;
};

/** Um tipo de excecao como o formulario o oferece. */
export type TipoDoLancamento = {
  id: string;
  rotulo: string;
  comportamento: EfetivoComportamento;
  ativo: boolean;
};

export type CamposDoLancamento =
  | "data"
  | "postoId"
  | "pessoa"
  | "localId"
  | "entrada"
  | "saida"
  | "tipoId"
  | "contraparte"
  | "postoOrigemId"
  | "observacao";

export type LancamentoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<CamposDoLancamento, string[]>>;
  /**
   * A mesma pessoa em outro lugar no mesmo horario. Nada foi gravado: a tela
   * mostra e pede confirmacao, e o reenvio vai com `confirmarConflito`.
   */
  conflitos?: string[];
  /** Muda a cada resposta: e o que o formulario observa para limpar e voltar o foco. */
  versao?: number;
};

export const estadoInicialLancamento: LancamentoState = { status: "idle" };

/** O que a action do freelancer devolve: a pessoa pronta para o campo, ou o motivo. */
export type FreelancerCadastrado =
  { ok: true; valor: string; nome: string; novo: boolean } | { ok: false; mensagem: string };

/** Minimo de caracteres do nome do freelancer cadastrado na hora. */
export const NOME_MINIMO_FREELANCER = 3;

/** Uma pessoa do rascunho "Copiar da mesma equipe (D-2)". */
export type ItemDoRascunho = {
  /** Unica no rascunho: a pessoa (uma pessoa entra uma vez so). */
  chave: string;
  pessoa: string;
  nome: string;
  identificacao: string | null;
  freelancer: boolean;
  localId: string;
  local: string;
  entrada: string;
  saida: string;
  viraODia: boolean;
  /** Por que a pessoa esta no rascunho sem ter trabalhado em D-2 (faltou). */
  nota: string | null;
  /** Ja lancada hoje neste posto: vem desmarcada. */
  jaLancada: boolean;
  /** Pessoa ou local desativado depois de D-2: nao pode ser lancado. */
  bloqueio: string | null;
};

export type RascunhoDaEquipe =
  | {
      ok: true;
      /** O dia de onde a equipe veio (D-2), `YYYY-MM-DD`. */
      dataOrigem: string;
      itens: ItemDoRascunho[];
      /** Quem trabalhou em D-2 por excecao e por isso nao foi copiado. */
      ignorados: { nome: string; tipo: string }[];
    }
  | { ok: false; mensagem: string };

/** Quantos lancamentos um rascunho confirma de uma vez, no maximo. */
export const MAXIMO_DO_RASCUNHO = 100;

/** Uma falta do dia, no painel. */
export type FaltaDoDia = {
  nome: string;
  postoId: string;
  posto: string;
  local: string;
  entrada: string;
  saida: string;
  /** `null` e falta sem cobertura: o posto ficou descoberto. */
  cobertoPor: string | null;
};

export type PainelDoDia = {
  postosSemEfetivo: PostoDoLancamento[];
  faltasSemCobertura: FaltaDoDia[];
  faltasCobertas: FaltaDoDia[];
  conflitos: { pessoa: string; nome: string; descricao: string }[];
};

/** Um lancamento de qualquer dia e posto: o do dia, mais a data e o posto. */
export type LancamentoDoPeriodo = LancamentoDoDia & {
  data: string;
  posto: PostoDoLancamento;
};

export const ROTA_SEMANA_EFETIVOS = "/efetivos/semana";
