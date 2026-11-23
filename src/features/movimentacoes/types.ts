import type { PapelNaMovimentacao, TipoDeMovimentacao } from "@/db/schema";

/**
 * Contratos compartilhados entre as Server Actions, a DAL e os componentes do
 * modulo de movimentacoes.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async. So `import type` do schema: este modulo e lido por componente
 * client, e nao deve arrastar o Drizzle junto.
 */

/** Rota da area. */
export const ROTA_MOVIMENTACOES = "/movimentacoes";

/** A area do portal a que este modulo pertence. */
export const AREA_MOVIMENTACOES = "movimentacoes" as const;

/** Sem competencia aberta nao ha periodo a que a movimentacao possa pertencer. */
export const SEM_COMPETENCIA =
  "Nenhuma competencia aberta: abra a competencia do periodo para registrar movimentacoes.";

/**
 * Os tipos, na ordem em que aparecem no formulario, no filtro e na planilha.
 * Repete o enum `movimentacao_tipo` porque o Zod e os componentes client nao
 * podem importar o schema em runtime; o `Record` abaixo quebra o typecheck se
 * os dois divergirem.
 */
export const IDS_TIPO_DE_MOVIMENTACAO = ["falta", "troca_interna", "troca_escala"] as const;

export const ROTULOS_TIPO_DE_MOVIMENTACAO: Record<TipoDeMovimentacao, string> = {
  falta: "Falta",
  troca_interna: "Troca interna",
  troca_escala: "Troca de escala",
};

/** O plural, para as contagens do topo da lista. */
export const PLURAIS_TIPO_DE_MOVIMENTACAO: Record<TipoDeMovimentacao, string> = {
  falta: "faltas",
  troca_interna: "trocas internas",
  troca_escala: "trocas de escala",
};

export const ROTULOS_PAPEL: Record<PapelNaMovimentacao, string> = {
  ausente: "Faltou",
  cobertura: "Cobriu",
  envolvido: "Envolvido",
};

/**
 * Se o tipo e uma troca: duas ou mais pessoas no mesmo pe (`envolvido`), em vez
 * de quem faltou e quem cobriu.
 */
export function ehTroca(tipo: TipoDeMovimentacao) {
  return tipo !== "falta";
}

/** Quantas pessoas uma troca pode envolver. Duas e o caso comum; seis ja e um rodizio. */
export const MINIMO_NA_TROCA = 2;
export const MAXIMO_NA_TROCA = 6;

/** Tamanhos da justificativa: menos de cinco letras nao explica nada. */
export const JUSTIFICATIVA_MINIMA = 5;
export const JUSTIFICATIVA_MAXIMA = 1000;

/** Uma pessoa envolvida, como a lista e o modal a mostram. */
export type PessoaDaMovimentacao = {
  papel: PapelNaMovimentacao;
  /** `f:<uuid>` ou `l:<uuid>` — o mesmo valor que o campo de pessoa posta. */
  valor: string;
  nome: string;
  /** Matricula (funcionario) ou codigo (freelancer). */
  identificacao: string | null;
  freelancer: boolean;
};

/** Um documento anexado, sem o conteudo — so o que a tela mostra. */
export type DocumentoResumo = {
  id: string;
  nome: string;
  tipoMime: string;
  /** Bytes que o documento ocupa no banco. */
  tamanho: number;
  /** Bytes que chegaram ao servidor, antes do gzip. */
  tamanhoOriginal: number;
};

/** Uma movimentacao como as telas a enxergam, com o cadastro ja resolvido. */
export type MovimentacaoResumo = {
  id: string;
  tipo: TipoDeMovimentacao;
  /** `YYYY-MM-DD`. */
  data: string;
  justificativa: string;
  pessoas: PessoaDaMovimentacao[];
  documentos: DocumentoResumo[];
  /** Quem registrou; `null` quando a conta foi removida depois. */
  registradoPor: string | null;
  /** ISO 8601 — atravessa a fronteira servidor/cliente como texto. */
  criadoEm: string;
};

/** Quantas movimentacoes cabem em uma pagina da lista. */
export const MOVIMENTACOES_POR_PAGINA = 15;

/** Se a movimentacao tem documento — o filtro `?documento=`. */
export const IDS_FILTRO_DOCUMENTO = ["com", "sem"] as const;
export type FiltroDocumento = (typeof IDS_FILTRO_DOCUMENTO)[number];

export const ROTULOS_FILTRO_DOCUMENTO: Record<FiltroDocumento, string> = {
  com: "Com documento",
  sem: "Sem documento",
};

/**
 * O recorte pedido pela URL. Tudo passa pelo `filtrosMovimentacoesSchema`
 * antes de chegar aqui; `null` e "sem esse filtro".
 */
export type FiltrosDeMovimentacoes = {
  busca: string;
  tipo: TipoDeMovimentacao | null;
  /** `YYYY-MM-DD`, ja com as pontas na ordem certa. */
  de: string | null;
  ate: string | null;
  documento: FiltroDocumento | null;
  pagina: number;
};

/** Se ha algum recorte alem da competencia. A pagina nao conta. */
export function temFiltro(filtros: FiltrosDeMovimentacoes) {
  return Boolean(filtros.busca || filtros.tipo || filtros.de || filtros.ate || filtros.documento);
}

/** Os parametros do recorte, sem a pagina — o que a lista e a exportacao compartilham. */
function parametrosDoRecorte(filtros: FiltrosDeMovimentacoes) {
  const parametros = new URLSearchParams();

  if (filtros.busca) {
    parametros.set("busca", filtros.busca);
  }

  if (filtros.tipo) {
    parametros.set("tipo", filtros.tipo);
  }

  if (filtros.de) {
    parametros.set("de", filtros.de);
  }

  if (filtros.ate) {
    parametros.set("ate", filtros.ate);
  }

  if (filtros.documento) {
    parametros.set("documento", filtros.documento);
  }

  return parametros;
}

/**
 * A URL da lista preservando **todos** os filtros — sem isso, virar a pagina
 * descartaria o recorte sem avisar. Filtro vazio e `?pagina=1` ficam de fora.
 */
export function hrefDasMovimentacoes(filtros: FiltrosDeMovimentacoes) {
  const parametros = parametrosDoRecorte(filtros);

  if (filtros.pagina > 1) {
    parametros.set("pagina", String(filtros.pagina));
  }

  const consulta = parametros.toString();

  return consulta ? `${ROTA_MOVIMENTACOES}?${consulta}` : ROTA_MOVIMENTACOES;
}

/**
 * O link da planilha, com o mesmo recorte da lista. A pagina fica de fora: o
 * arquivo e de tudo o que o filtro alcanca, e nao da pagina que estava aberta.
 */
export function hrefDaExportacao(filtros: FiltrosDeMovimentacoes) {
  const consulta = parametrosDoRecorte(filtros).toString();
  const rota = `${ROTA_MOVIMENTACOES}/exportar`;

  return consulta ? `${rota}?${consulta}` : rota;
}

/** O link de um documento — abre no navegador (imagem ou PDF). */
export function hrefDoDocumento(id: string) {
  return `${ROTA_MOVIMENTACOES}/documentos/${id}`;
}

/** Uma pagina da lista e o que a navegacao precisa saber. */
export type PaginaDeMovimentacoes = {
  movimentacoes: MovimentacaoResumo[];
  /** Total que atende ao filtro, e nao o tamanho desta pagina. */
  total: number;
  /** Quantas de cada tipo o recorte tem. */
  porTipo: Record<TipoDeMovimentacao, number>;
  pagina: number;
  paginas: number;
};

/** Os campos do formulario, para os erros por campo. */
export type CampoDaMovimentacao =
  "tipo" | "data" | "justificativa" | "ausente" | "cobertura" | "envolvidos" | "documentos";

export type SalvarMovimentacaoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<CampoDaMovimentacao, string[]>>;
};

export const estadoInicialSalvarMovimentacao: SalvarMovimentacaoState = { status: "idle" };

export type ExcluirMovimentacaoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialExcluirMovimentacao: ExcluirMovimentacaoState = { status: "idle" };
