import type { CompetenciaStatus } from "@/db/schema";

import type { AbrirCompetenciaInput } from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/** Competencia como as telas a enxergam. */
export type CompetenciaResumo = {
  id: string;
  dataInicio: string;
  dataFim: string;
  status: CompetenciaStatus;
  encerradaEm: Date | null;
};

/**
 * A competencia que vale para a requisicao atual — a base temporal de toda
 * leitura e de toda escrita. `temporaria` marca a consulta a uma competencia
 * encerrada: nesta sessao os dados sao lidos e gravados em outro periodo, e a
 * competencia aberta do portal continua a mesma para todos os demais.
 */
export type CompetenciaEmVigor = {
  competencia: CompetenciaResumo;
  temporaria: boolean;
};

export type AbrirCompetenciaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof AbrirCompetenciaInput, string[]>>;
  /**
   * React 19 reseta o formulario depois de uma Server Action. Devolvemos as
   * datas digitadas para que os campos voltem preenchidos apos um erro.
   */
  valores?: { dataInicio: string; dataFim: string };
};

export const estadoInicialAbrirCompetencia: AbrirCompetenciaState = { status: "idle" };

export type ConsultaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialConsulta: ConsultaState = { status: "idle" };

export const ROTA_COMPETENCIAS = "/competencias";

/** A area do portal a que este modulo pertence. */
export const AREA_COMPETENCIAS = "competencias" as const;

/** Motivos de recusa de escrita, compartilhados por toda action com dado datado. */
export const SEM_COMPETENCIA_ABERTA =
  "Nenhuma competencia aberta. Abra uma competencia antes de registrar dados.";

export const COMPETENCIA_MUDOU =
  "A competencia em vigor mudou desde que esta tela foi aberta. Recarregue a pagina antes de gravar.";
