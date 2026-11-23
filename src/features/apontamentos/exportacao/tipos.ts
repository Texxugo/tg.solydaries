import type { CompetenciaResumo } from "@/features/competencias/types";

import { ROTA_APONTAMENTOS, type ApontamentoGravado, type FiltrosDeApontamentos } from "../types";

/**
 * Contratos da exportacao dos apontamentos: o que a DAL entrega aos dois
 * geradores (Word e Excel) e como a tela monta o link de cada um.
 *
 * Modulo puro (so `import type` e constantes): a pagina importa
 * `hrefDaExportacao()`, e nao deve arrastar `exceljs` nem `docx` junto.
 */

/** Um funcionario com apontamento, com o que as duas exportacoes mostram dele. */
export type ApontamentoExportado = {
  matricula: string;
  nome: string;
  empresa: string;
  cargo: string | null;
  ativo: boolean;
  /**
   * Os postos em que a pessoa esta escalada nesta competencia
   * (`GP01 - Portaria`), vindos do preenchimento. Vazio quando ela nao esta em
   * grade nenhuma — o funcionario nao tem posto no cadastro.
   */
  postos: string[];
  apontamento: ApontamentoGravado;
};

export type DadosDaExportacao = {
  competencia: CompetenciaResumo;
  /** Consulta temporaria: o arquivo e de uma competencia encerrada. */
  temporaria: boolean;
  /** O recorte aplicado, para o relatorio dizer que nao e a competencia inteira. */
  recorte: { busca: string; empresa: string | null };
  geradoPor: string;
  geradoEm: Date;
  apontamentos: ApontamentoExportado[];
};

export const TIPOS_DE_EXPORTACAO = {
  word: {
    extensao: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  excel: {
    extensao: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
} as const;

export type TipoDeExportacao = keyof typeof TIPOS_DE_EXPORTACAO;

/**
 * `apontamentos-2026-09.xlsx` — o mes da competencia em numero, e nao
 * `Setembro/2026`: a barra nao cabe em nome de arquivo, e ano-mes ordena certo
 * numa pasta com varios meses.
 */
export function nomeDoArquivo(competencia: CompetenciaResumo, tipo: TipoDeExportacao) {
  return `apontamentos-${competencia.dataFim.slice(0, 7)}.${TIPOS_DE_EXPORTACAO[tipo].extensao}`;
}

/**
 * O link de download, com a busca e a empresa da lista. Status, inativos e
 * pagina ficam de fora: a exportacao e sempre de **todos os apontados** do
 * recorte — "sem apontamento" nao tem o que exportar, e o arquivo nao pagina.
 */
export function hrefDaExportacao(tipo: TipoDeExportacao, filtros: FiltrosDeApontamentos) {
  const parametros = new URLSearchParams();

  if (filtros.busca) {
    parametros.set("busca", filtros.busca);
  }

  if (filtros.empresaId) {
    parametros.set("empresa", filtros.empresaId);
  }

  const consulta = parametros.toString();
  const rota = `${ROTA_APONTAMENTOS}/exportar/${tipo}`;

  return consulta ? `${rota}?${consulta}` : rota;
}
