import type { AtualizarExtraInput, RegistrarExtraInput } from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/**
 * O colaborador como o campo de escolha o mostra e como ele viaja no
 * formulario.
 *
 * `valor` carrega a origem junto do id (`f:` funcionario, `l:` freelancer)
 * porque o campo e **um** so: sao duas tabelas, com integridade referencial
 * propria, e um `<select>` com duas listas nao teria como dizer de qual delas
 * veio a escolha. A leitura desse valor esta em `colaborador.ts`.
 */
export type ColaboradorDisponivel = {
  valor: string;
  nome: string;
  /** Matricula (funcionario) ou codigo (freelancer). `null` quando nao ha. */
  identificacao: string | null;
  freelancer: boolean;
};

/** O extra como as telas o enxergam, com o cadastro ja resolvido. */
export type ExtraResumo = {
  id: string;
  /** `YYYY-MM-DD`, como o Postgres devolve um `date`. */
  data: string;
  colaborador: ColaboradorDisponivel;
  postoId: string;
  postoCodigo: string;
  postoNome: string;
  local: string;
  /** `HH:MM`, normalizado na leitura: o Postgres devolve `HH:MM:SS`. */
  horaEntrada: string;
  horaSaida: string;
  observacao: string | null;
  /** Quem registrou; `null` quando a conta foi removida depois. */
  registradoPor: string | null;
  /**
   * Se este extra nasceu de uma cobertura marcada no modal do preenchimento.
   *
   * Muda o que a tela avisa, e nao o que ela deixa fazer: o extra da grade e
   * uma linha como outra qualquer — regravar aquele dia o reescreve, e apagar o
   * dia o leva junto.
   */
  daGrade: boolean;
};

/**
 * O que o formulario devolve para se redesenhar apos um erro: tudo como texto,
 * porque e assim que os campos leem (`defaultValue`) e que o FormData chega.
 */
export type ValoresDoExtra = {
  data: string;
  colaborador: string;
  freelancerNome: string;
  postoId: string;
  local: string;
  horaEntrada: string;
  horaSaida: string;
  observacao: string;
};

/** Erros por campo como os campos compartilhados os leem. */
export type ErrosDoExtra = Partial<Record<keyof ValoresDoExtra, string[]>>;

export type RegistrarExtraState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof RegistrarExtraInput, string[]>>;
  /**
   * Identificador do registro concluido, usado como `key` para remontar o
   * formulario limpo. Vem da action porque contar cadastros no cliente seria
   * `setState` dentro de efeito, que o `react-hooks` reprova.
   */
  chave?: string;
  /**
   * React 19 reseta o formulario depois de uma Server Action. Devolvemos o que
   * foi digitado para que os campos voltem preenchidos apos um erro.
   */
  valores?: ValoresDoExtra;
};

export const estadoInicialRegistrarExtra: RegistrarExtraState = { status: "idle" };

export type AtualizarExtraState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof AtualizarExtraInput, string[]>>;
};

export const estadoInicialAtualizarExtra: AtualizarExtraState = { status: "idle" };

export type ExcluirExtraState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialExcluirExtra: ExcluirExtraState = { status: "idle" };

/** Quantos extras cabem em uma pagina da lista. */
export const EXTRAS_POR_PAGINA = 10;

/** De que cadastro vem quem fez o extra — o filtro `?tipo=`. */
export const IDS_TIPO_DE_COLABORADOR = ["funcionario", "freelancer"] as const;
export type TipoDeColaborador = (typeof IDS_TIPO_DE_COLABORADOR)[number];

export const ROTULOS_TIPO_DE_COLABORADOR: Record<TipoDeColaborador, string> = {
  funcionario: "Funcionarios",
  freelancer: "Freelancers",
};

/**
 * De onde o extra veio — o filtro `?origem=`. `grade` e o lancado por uma
 * cobertura marcada no preenchimento (`preenchimento_dia_id` preenchido);
 * `manual` e o digitado nesta tela.
 */
export const IDS_ORIGEM_DO_EXTRA = ["manual", "grade"] as const;
export type OrigemDoExtra = (typeof IDS_ORIGEM_DO_EXTRA)[number];

export const ROTULOS_ORIGEM_DO_EXTRA: Record<OrigemDoExtra, string> = {
  manual: "Registrados aqui",
  grade: "Vindos da grade",
};

/**
 * O recorte pedido pela URL. Tudo e do usuario, e tudo passa pelo
 * `filtrosExtrasSchema` antes de chegar aqui; `null` e "sem esse filtro".
 */
export type FiltrosDeExtras = {
  busca: string;
  postoId: string | null;
  /** `YYYY-MM-DD`, ja com as pontas na ordem certa. */
  de: string | null;
  ate: string | null;
  tipo: TipoDeColaborador | null;
  origem: OrigemDoExtra | null;
  pagina: number;
};

/**
 * Se ha algum recorte alem da competencia. A pagina nao conta: virar a pagina
 * nao filtra nada.
 */
export function temFiltro(filtros: FiltrosDeExtras) {
  return Boolean(
    filtros.busca || filtros.postoId || filtros.de || filtros.ate || filtros.tipo || filtros.origem,
  );
}

/**
 * Uma pagina da lista: as linhas, o que a navegacao precisa saber e o total do
 * periodo.
 *
 * `minutos` e a soma de **tudo o que atende ao filtro**, e nao desta pagina: a
 * pergunta de quem confere e quantas horas extras o periodo tem, e um total que
 * mudasse ao virar a pagina responderia outra coisa.
 */
export type PaginaDeExtras = {
  extras: ExtraResumo[];
  /** Total que atende ao filtro, e nao o tamanho desta pagina. */
  total: number;
  minutos: number;
  pagina: number;
  paginas: number;
};

/**
 * Monta a URL da lista preservando **todos** os filtros — sem isso, virar a
 * pagina descartaria o recorte sem avisar. Filtro vazio e `?pagina=1` ficam de
 * fora: a URL limpa e a lista inteira.
 */
export function hrefDosExtras(filtros: FiltrosDeExtras) {
  const parametros = new URLSearchParams();

  if (filtros.busca) {
    parametros.set("busca", filtros.busca);
  }

  if (filtros.postoId) {
    parametros.set("posto", filtros.postoId);
  }

  if (filtros.de) {
    parametros.set("de", filtros.de);
  }

  if (filtros.ate) {
    parametros.set("ate", filtros.ate);
  }

  if (filtros.tipo) {
    parametros.set("tipo", filtros.tipo);
  }

  if (filtros.origem) {
    parametros.set("origem", filtros.origem);
  }

  if (filtros.pagina > 1) {
    parametros.set("pagina", String(filtros.pagina));
  }

  const consulta = parametros.toString();

  return consulta ? `${ROTA_EXTRAS}?${consulta}` : ROTA_EXTRAS;
}

/** Rota da area de horas extras. */
export const ROTA_EXTRAS = "/extras";

/** A area do portal a que este modulo pertence. */
export const AREA_EXTRAS = "extras" as const;

/** Sem competencia aberta nao ha periodo a que o extra possa pertencer. */
export const SEM_COMPETENCIA =
  "Nenhuma competencia aberta: abra a competencia do periodo para registrar horas extras.";

/** Nao ha posto cadastrado — e todo extra acontece em um. */
export const SEM_POSTO =
  "Nenhum posto ativo cadastrado. Cadastre o posto em Postos de trabalho para registrar o extra.";
