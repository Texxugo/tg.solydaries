import type { PeriodoDeAfastamento } from "./afastamentos";
import type { LinhaRecusada } from "./planilha";
import type {
  AtualizarFuncionarioInput,
  CriarFuncionarioInput,
  DefinirJornadaInput,
  RegistrarAfastamentoInput,
} from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/** A area do portal a que este modulo pertence. */
export const AREA_FUNCIONARIOS = "funcionarios" as const;

/** Rota da area. */
export const ROTA_FUNCIONARIOS = "/funcionarios";

/** Quantos funcionarios cabem em uma pagina da lista. */
export const FUNCIONARIOS_POR_PAGINA = 20;

/** Empresa como as telas a enxergam. */
export type EmpresaResumo = {
  id: string;
  nome: string;
  cnpj: string | null;
  ativa: boolean;
  /** Quantos funcionarios ela tem hoje — o que a tela de empresas mostra. */
  funcionarios: number;
};

/**
 * A escala de um funcionario **com** a data em que o ciclo comeca a valer para
 * ele. Um objeto so, e nao dois campos anulaveis lado a lado, porque no banco
 * eles sao inseparaveis (`funcionarios_escala_com_inicio`): escala sem inicio
 * nao responde "hoje e dia de trabalho?" e inicio sem escala nao tem ciclo a
 * comecar. O tipo repete a regra da tabela em vez de deixar a tela combinar
 * `escalaId` preenchido com `inicioCiclo` vazio.
 */
export type AtribuicaoDeEscala = {
  escalaId: string;
  escalaNome: string;
  /** `HH:MM`, normalizado na leitura. */
  entrada: string;
  saida: string;
  diasCiclo: number;
  folgas: number[];
  /** `YYYY-MM-DD`: o dia 1 do ciclo desta pessoa. */
  inicioCiclo: string;
};

/** Funcionario como a lista e a edicao o enxergam. */
export type FuncionarioResumo = {
  id: string;
  empresaId: string;
  empresaNome: string;
  matricula: string;
  nome: string;
  /** Onze digitos, sem mascara — a formatacao e da tela. */
  cpf: string;
  cargo: string | null;
  /** So digitos com DDI, ou `null`. A mascara e da tela. */
  telefone: string | null;
  admissao: string | null;
  /** Codigo da folha; o rotulo vem de `situacoes.ts`. */
  situacao: number;
  /** `null` enquanto ninguem definiu a jornada desta pessoa. */
  escala: AtribuicaoDeEscala | null;
  ativo: boolean;
};

/**
 * Os filtros da lista, todos vindos da URL. Ficam juntos num tipo so porque
 * viajam juntos: cada link da paginacao precisa carregar os outros tres, senao
 * virar a pagina descartaria o filtro sem avisar.
 */
export type FiltrosDeFuncionarios = {
  busca: string;
  /** `null` = todas as empresas. */
  empresaId: string | null;
  /** So quem ainda esta sem escala definida — a fila de trabalho da tela. */
  pendentes: boolean;
  pagina: number;
};

/**
 * A URL da lista com estes filtros. Um lugar so para monta-la porque todo link
 * da tela precisa carregar os filtros dos outros: virar a pagina sem levar a
 * busca, ou desligar as pendencias descartando a empresa, seria perder um
 * filtro sem avisar.
 *
 * O que e padrao fica de fora dos parametros — a primeira pagina, sem filtro, e
 * a URL limpa.
 */
export function hrefDosFuncionarios(filtros: FiltrosDeFuncionarios) {
  const parametros = new URLSearchParams();

  if (filtros.busca) {
    parametros.set("busca", filtros.busca);
  }

  if (filtros.empresaId) {
    parametros.set("empresa", filtros.empresaId);
  }

  if (filtros.pendentes) {
    parametros.set("pendentes", "1");
  }

  if (filtros.pagina > 1) {
    parametros.set("pagina", String(filtros.pagina));
  }

  const consulta = parametros.toString();

  return consulta ? `${ROTA_FUNCIONARIOS}?${consulta}` : ROTA_FUNCIONARIOS;
}

/** Uma pagina da lista: as linhas e o que a navegacao precisa saber. */
export type PaginaDeFuncionarios = {
  funcionarios: FuncionarioResumo[];
  /** Total que atende ao filtro, e nao o tamanho desta pagina. */
  total: number;
  pagina: number;
  paginas: number;
  /** Quantos estao sem escala no cadastro inteiro, independente do filtro. */
  semEscala: number;
};

/**
 * O que o formulario devolve para se redesenhar apos um erro: tudo como texto,
 * porque e assim que os campos leem (`defaultValue`) e que o FormData chega.
 */
export type ValoresDoFuncionario = {
  empresaId: string;
  matricula: string;
  nome: string;
  cpf: string;
  cargo: string;
  telefone: string;
  admissao: string;
  situacao: string;
  escalaId: string;
  inicioCiclo: string;
};

/** Erros por campo como os campos compartilhados os leem. */
export type ErrosDoFuncionario = Partial<Record<keyof ValoresDoFuncionario, string[]>>;

export type CriarFuncionarioState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof CriarFuncionarioInput, string[]>>;
  /**
   * React 19 reseta o formulario depois de uma Server Action. Devolvemos o que
   * foi digitado para que os campos voltem preenchidos apos um erro.
   */
  valores?: ValoresDoFuncionario;
};

export const estadoInicialCriarFuncionario: CriarFuncionarioState = { status: "idle" };

export type AtualizarFuncionarioState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof AtualizarFuncionarioInput, string[]>>;
};

export const estadoInicialAtualizarFuncionario: AtualizarFuncionarioState = { status: "idle" };

/**
 * A jornada de uma pessoa e um formulario proprio, ao lado do de dados: os
 * dados vem da folha e a jornada nasce no portal, entao corrigir um cargo nao
 * deveria reenviar escala e inicio de ciclo.
 */
export type DefinirJornadaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof DefinirJornadaInput, string[]>>;
};

export const estadoInicialDefinirJornada: DefinirJornadaState = { status: "idle" };

/**
 * A atribuicao em lote nao tem erro por campo: os tres campos vivem juntos numa
 * barra acima da lista, e a mensagem aparece nela — nao ha onde pendurar um
 * erro por campo sem inventar um formulario que a tela nao tem.
 */
export type AtribuirEscalaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialAtribuirEscala: AtribuirEscalaState = { status: "idle" };

/* -------------------------------------------------------------------------- */
/* Importacao                                                                 */
/* -------------------------------------------------------------------------- */

/** Quantas linhas de cada grupo a previa detalha antes de virar so um numero. */
export const ITENS_NA_PREVIA = 50;

/** Teto de recusas listadas: arquivo torto nao pode virar uma resposta gigante. */
export const RECUSAS_NA_PREVIA = 200;

/** Uma linha na previa da importacao. */
export type ItemDaPrevia = {
  linha: number;
  nome: string;
  empresa: string;
  /** O cargo (em quem entra) ou o que muda (em quem ja existe). */
  detalhe: string;
};

/**
 * O que o arquivo faria com o cadastro, mostrado antes de gravar. Nenhuma
 * escrita aconteceu quando isto chega a tela.
 */
export type PreviaDaImportacao = {
  arquivo: string;
  /** Linhas de funcionario reconhecidas no arquivo, antes de qualquer recusa. */
  lidas: number;
  empresasNovas: string[];
  criar: number;
  atualizar: number;
  inalterados: number;
  amostraCriar: ItemDaPrevia[];
  amostraAtualizar: ItemDaPrevia[];
  recusadas: LinhaRecusada[];
  /** `true` quando a lista de recusas foi cortada em `RECUSAS_NA_PREVIA`. */
  recusasCortadas: boolean;
};

/** O que a importacao de fato gravou. */
export type ResultadoDaImportacao = {
  criados: number;
  atualizados: number;
  inalterados: number;
  empresasCriadas: string[];
  recusadas: LinhaRecusada[];
  recusasCortadas: boolean;
};

/**
 * O estado da tela de importacao, em duas etapas: `previa` mostra o que vai
 * acontecer, `success` conta o que aconteceu.
 *
 * A confirmacao reenvia o mesmo arquivo em vez de devolver a previa recebida —
 * o que o cliente manda de volta nao e evidencia, e o cadastro pode ter mudado
 * entre uma tela e outra. Reprocessar e o que mantem a gravacao honesta.
 */
export type ImportacaoState = {
  status: "idle" | "previa" | "success" | "error";
  mensagem?: string;
  previa?: PreviaDaImportacao;
  resultado?: ResultadoDaImportacao;
};

export const estadoInicialImportacao: ImportacaoState = { status: "idle" };

/** Teto do upload. O relatorio completo da folha nao passa de algumas centenas de KB. */
export const TAMANHO_MAXIMO_ARQUIVO = 5 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Afastamentos                                                               */
/* -------------------------------------------------------------------------- */

/** Um afastamento como a tela o mostra. */
export type AfastamentoResumo = PeriodoDeAfastamento & {
  id: string;
  observacao: string | null;
};

export type RegistrarAfastamentoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof RegistrarAfastamentoInput, string[]>>;
};

export const estadoInicialRegistrarAfastamento: RegistrarAfastamentoState = { status: "idle" };

/**
 * Remover nao tem campo a destacar: e um botao por linha, e o que pode dar
 * errado ("ja foi removido") cabe num toast.
 */
export type RemoverAfastamentoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialRemoverAfastamento: RemoverAfastamentoState = { status: "idle" };
