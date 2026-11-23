import {
  horasParaCampo,
  percentualParaCampo,
  RUBRICAS,
  type ApontamentoDaFolha,
  type Rubrica,
} from "./rubricas";

/**
 * Contratos compartilhados entre as Server Actions, a DAL e as telas.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/** A area do portal a que este modulo pertence. */
export const AREA_APONTAMENTOS = "apontamentos" as const;

/** Rota da area de apontamentos. */
export const ROTA_APONTAMENTOS = "/apontamentos";

/** Quantas pessoas cabem numa pagina da lista — o mesmo tamanho da de funcionarios. */
export const APONTAMENTOS_POR_PAGINA = 20;

/** O funcionario como a tela do apontamento o identifica. */
export type FuncionarioDoApontamento = {
  id: string;
  nome: string;
  matricula: string;
  cargo: string | null;
  empresaNome: string;
  /** Codigo da folha; o rotulo vem de `funcionarios/situacoes.ts`. */
  situacao: number;
  ativo: boolean;
};

/** O apontamento gravado, com quem mexeu por ultimo. */
export type ApontamentoGravado = ApontamentoDaFolha & {
  atualizadoPor: string | null;
  atualizadoEm: Date;
};

/** Uma linha da lista: a pessoa, e o apontamento dela na competencia, se houver. */
export type LinhaDeApontamentos = {
  funcionario: FuncionarioDoApontamento;
  apontamento: ApontamentoGravado | null;
};

/**
 * `pendentes` e quem ainda nao tem apontamento; `apontados`, quem ja tem. E o
 * filtro `?status=` — a fila de trabalho do fechamento.
 */
export const IDS_STATUS_DO_APONTAMENTO = ["pendentes", "apontados"] as const;
export type StatusDoApontamento = (typeof IDS_STATUS_DO_APONTAMENTO)[number];

/**
 * Os filtros da lista, todos vindos da URL. Viajam juntos porque cada link da
 * paginacao precisa carregar os outros — mesmo arranjo de `FiltrosDeFuncionarios`.
 */
export type FiltrosDeApontamentos = {
  busca: string;
  /** `null` = todas as empresas. */
  empresaId: string | null;
  /** `null` = todos. */
  status: StatusDoApontamento | null;
  /**
   * Inclui quem esta inativo e ainda nao tem apontamento. Sem ele a lista traz
   * os ativos **e** qualquer inativo que ja tenha apontamento: quem saiu no
   * meio do periodo ainda pode ter o que receber, mas nao deve engordar a fila
   * de pendentes de todo mes.
   */
  inativos: boolean;
  pagina: number;
};

export function temFiltro(filtros: FiltrosDeApontamentos) {
  return Boolean(filtros.busca || filtros.empresaId || filtros.status || filtros.inativos);
}

/**
 * A URL da lista com estes filtros. O que e padrao fica de fora: a primeira
 * pagina, sem filtro, e a URL limpa.
 */
export function hrefDosApontamentos(filtros: FiltrosDeApontamentos) {
  const parametros = new URLSearchParams();

  if (filtros.busca) {
    parametros.set("busca", filtros.busca);
  }

  if (filtros.empresaId) {
    parametros.set("empresa", filtros.empresaId);
  }

  if (filtros.status) {
    parametros.set("status", filtros.status);
  }

  if (filtros.inativos) {
    parametros.set("inativos", "1");
  }

  if (filtros.pagina > 1) {
    parametros.set("pagina", String(filtros.pagina));
  }

  const consulta = parametros.toString();

  return consulta ? `${ROTA_APONTAMENTOS}?${consulta}` : ROTA_APONTAMENTOS;
}

export type PaginaDeApontamentos = {
  linhas: LinhaDeApontamentos[];
  /** Total que atende ao filtro, e nao o tamanho desta pagina. */
  total: number;
  pagina: number;
  paginas: number;
  /**
   * As duas contagens da competencia, independentes do filtro: sao o andamento
   * do fechamento, e nao podem mudar so porque a tela esta recortada por uma
   * empresa.
   */
  apontados: number;
  pendentes: number;
};

/** Os campos do formulario: uma rubrica por campo, mais a observacao. */
export type CampoDoApontamento = Rubrica | "observacao";

/**
 * O que o formulario devolve para se redesenhar apos um erro: tudo como texto,
 * porque e assim que os campos leem (`defaultValue`) e que o FormData chega.
 * Marcacoes sim/nao viajam como `"on"` ou `""`, como o checkbox posta.
 */
export type ValoresDoApontamento = Record<CampoDoApontamento, string>;

export type ErrosDoApontamento = Partial<Record<CampoDoApontamento | "funcionarioId", string[]>>;

/** O apontamento gravado (ou o vazio) no formato dos campos. */
export function valoresDoApontamento(apontamento: ApontamentoDaFolha): ValoresDoApontamento {
  const valores = { observacao: apontamento.observacao ?? "" } as ValoresDoApontamento;

  for (const rubrica of RUBRICAS) {
    const valor = apontamento[rubrica.id];

    switch (rubrica.unidade) {
      case "dias":
        valores[rubrica.id] = valor ? String(valor) : "";
        break;
      case "horas":
        valores[rubrica.id] = horasParaCampo(valor as number);
        break;
      case "percentual":
        valores[rubrica.id] = percentualParaCampo(valor as number);
        break;
      case "sim_nao":
        valores[rubrica.id] = valor ? "on" : "";
        break;
      case "grau":
        valores[rubrica.id] = (valor as string | null) ?? "";
        break;
    }
  }

  return valores;
}

export type SalvarApontamentoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: ErrosDoApontamento;
  valores?: ValoresDoApontamento;
  /**
   * Muda a cada recusa, e entra na `key` do formulario. O checkbox do Radix
   * volta ao valor da montagem quando o React reseta o formulario depois da
   * action — sem remontar, a marcacao que a pessoa acabou de fazer sumiria
   * junto com o erro que a explicava.
   */
  tentativa?: string;
};

export const estadoInicialSalvarApontamento: SalvarApontamentoState = { status: "idle" };

export type LimparApontamentoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialLimparApontamento: LimparApontamentoState = { status: "idle" };

/** Sem competencia aberta nao ha periodo a que o apontamento possa pertencer. */
export const SEM_COMPETENCIA =
  "Nenhuma competencia aberta: abra a competencia do periodo para registrar apontamentos.";
