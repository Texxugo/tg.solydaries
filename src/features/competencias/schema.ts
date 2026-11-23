import { z } from "zod";

import { ehDataValida } from "./periodo";

/**
 * Schemas de entrada do modulo de competencias. Ficam separados das actions
 * para poderem ser reaproveitados por testes e (futuramente) rotas de API.
 */

/**
 * `<input type="date">` sempre posta `YYYY-MM-DD`, que e tambem o formato do
 * `date` no Postgres — a string atravessa sem conversao. O `refine` barra o que
 * a regex deixa passar (2026-02-31).
 */
const dataSchema = z.string().trim().refine(ehDataValida, "Informe uma data valida");

export const competenciaIdSchema = z.uuid("Competencia invalida");

export const abrirCompetenciaSchema = z
  .object({
    dataInicio: dataSchema,
    dataFim: dataSchema,
  })
  // Datas ISO comparam como texto na mesma ordem em que comparam como data.
  .refine((periodo) => periodo.dataFim > periodo.dataInicio, {
    path: ["dataFim"],
    error: "A data final precisa ser posterior a inicial",
  });

export const consultarCompetenciaSchema = z.object({
  competenciaId: competenciaIdSchema,
});

export type AbrirCompetenciaInput = z.infer<typeof abrirCompetenciaSchema>;
