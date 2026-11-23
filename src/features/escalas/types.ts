import type { ExcecaoDoCiclo } from "./jornada";
import type { AtualizarEscalaInput, CriarEscalaInput, JornadaDoDiaInput } from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/** Escala como as telas a enxergam — a regra da jornada e o ciclo. */
export type EscalaResumo = {
  id: string;
  nome: string;
  descricao: string | null;
  /** `HH:MM`, normalizado na leitura: o Postgres devolve `HH:MM:SS`. */
  entrada: string;
  saida: string;
  /** O tamanho do ciclo e as posicoes de folga dentro dele. */
  diasCiclo: number;
  folgas: number[];
  intrajornadaMinutos: number;
  marcacoesEsperadas: number;
  horasExtrasMinutos: number;
  /** Vem da coluna gerada: a tela le, nunca escreve. */
  viradaTurno: boolean;
  ativa: boolean;
  /**
   * Dias do ciclo que nao seguem o padrao, do primeiro ao ultimo. Vazio na
   * escala em que todo dia trabalhado e igual.
   */
  excecoes: ExcecaoDoCiclo[];
};

export type CriarEscalaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof CriarEscalaInput, string[]>>;
  /**
   * Identificador do cadastro concluido, usado como `key` do formulario para
   * remonta-lo limpo. Vem da action porque o campo de ciclo tem estado proprio:
   * `reset()` devolve os campos nao controlados ao padrao, mas deixaria a grade
   * de folgas com o que a escala anterior tinha — e contar cadastros no cliente
   * seria `setState` dentro de efeito, que o `react-hooks` reprova.
   */
  chave?: string;
  /**
   * React 19 reseta o formulario depois de uma Server Action. Devolvemos o que
   * foi digitado para que os campos voltem preenchidos apos um erro.
   */
  valores?: ValoresDaEscala;
};

export const estadoInicialCriarEscala: CriarEscalaState = { status: "idle" };

export type AtualizarEscalaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof AtualizarEscalaInput, string[]>>;
};

export const estadoInicialAtualizarEscala: AtualizarEscalaState = { status: "idle" };

/**
 * O que o formulario devolve para se redesenhar apos um erro: tudo como texto,
 * porque e assim que os campos leem (`defaultValue`) e que o FormData chega.
 */
export type ValoresDaEscala = {
  nome: string;
  descricao: string;
  entrada: string;
  saida: string;
  diasCiclo: string;
  folgas: number[];
  intrajornadaMinutos: string;
  marcacoesEsperadas: string;
  horasExtrasMinutos: string;
};

/**
 * Erros por campo como os campos compartilhados os leem. As duas actions
 * devolvem algo compativel com isto — a edicao acrescenta chaves (`escalaId`,
 * `ativa`) que `CamposEscala` nao desenha.
 */
export type ErrosDaEscala = Partial<Record<keyof ValoresDaEscala, string[]>>;

/**
 * Estado do formulario dos dias do ciclo. Os erros vem por dia
 * (`erros[5].saida`), porque a tela e uma linha por dia trabalhado e a mensagem
 * precisa cair na linha certa.
 */
export type DiasDoCicloState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Record<number, Partial<Record<keyof JornadaDoDiaInput, string[]>>>;
};

export const estadoInicialDiasDoCiclo: DiasDoCicloState = { status: "idle" };

/**
 * A escala como o campo de escolha de outra feature a mostra: so as ativas, so
 * o que o campo precisa. Mora aqui, e nao no modulo que consome, porque quem
 * produz a lista e `listarEscalasAtivas()` — o contrario faria escalas depender
 * de quem por acaso a le.
 */
export type EscalaParaAtribuicao = {
  id: string;
  nome: string;
  /** `HH:MM`, normalizado na leitura: o Postgres devolve `HH:MM:SS`. */
  entrada: string;
  saida: string;
  diasCiclo: number;
  folgas: number[];
};

/** Quantas escalas cabem em uma pagina da lista. */
export const ESCALAS_POR_PAGINA = 10;

/** Uma pagina da lista: as linhas e o que a navegacao precisa saber. */
export type PaginaDeEscalas = {
  escalas: EscalaResumo[];
  /** Total que atende ao filtro, e nao o tamanho desta pagina. */
  total: number;
  pagina: number;
  paginas: number;
};

/** Rota da area de escalas. */
export const ROTA_ESCALAS = "/escalas";

/** A area do portal a que este modulo pertence. */
export const AREA_ESCALAS = "escalas" as const;
