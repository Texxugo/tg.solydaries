import { z } from "zod";

import {
  IDS_GRAU_INSALUBRIDADE,
  lerHoras,
  lerPercentual,
  MAXIMO_DE_DIAS,
  MAXIMO_DE_MINUTOS,
} from "./rubricas";
import { IDS_STATUS_DO_APONTAMENTO } from "./types";

/**
 * Schemas de entrada do modulo de apontamentos.
 *
 * Nada aqui toca o banco: se o funcionario existe e quantos dias a competencia
 * aberta tem sao perguntas que a action faz — a resposta muda entre a validacao
 * e a gravacao. Os tetos daqui sao os mesmos dos `check` da tabela; o limite de
 * dias pelo tamanho do periodo e conferido na action.
 */

export const idFuncionarioSchema = z.uuid("Funcionario invalido");

/** Campo numerico vazio e zero: o formulario inteiro nasce em branco. */
const diasSchema = z
  .string()
  .trim()
  .transform((valor, ctx) => {
    if (valor === "") {
      return 0;
    }

    if (!/^\d{1,2}$/.test(valor) || Number(valor) > MAXIMO_DE_DIAS) {
      ctx.addIssue({ code: "custom", message: `Informe um numero de 0 a ${MAXIMO_DE_DIAS}` });
      return z.NEVER;
    }

    return Number(valor);
  });

const horasSchema = z.string().transform((valor, ctx) => {
  const minutos = lerHoras(valor);

  if (minutos === null) {
    ctx.addIssue({ code: "custom", message: "Use horas e minutos, como 12:30" });
    return z.NEVER;
  }

  if (minutos > MAXIMO_DE_MINUTOS) {
    ctx.addIssue({ code: "custom", message: "O maximo e 744:00 (31 dias inteiros)" });
    return z.NEVER;
  }

  return minutos;
});

const percentualSchema = z.string().transform((valor, ctx) => {
  const percentual = lerPercentual(valor);

  if (percentual === null || percentual > 100) {
    ctx.addIssue({ code: "custom", message: "Informe um percentual de 0 a 100, como 12,5" });
    return z.NEVER;
  }

  return percentual;
});

/** O checkbox marcado posta `"on"`; desmarcado, nao posta nada. */
const simNaoSchema = z.string().transform((valor) => valor === "on");

const grauSchema = z
  .union([z.literal(""), z.enum(IDS_GRAU_INSALUBRIDADE)], { error: "Grau invalido" })
  .transform((valor) => valor || null);

/** `textarea` vazio chega como "" e vira `null` na coluna. */
const observacaoSchema = z
  .string()
  .trim()
  .max(500, "A observacao pode ter no maximo 500 caracteres")
  .transform((valor) => valor || null);

export const salvarApontamentoSchema = z.object({
  funcionarioId: idFuncionarioSchema,
  vtDias: diasSchema,
  vrDias: diasSchema,
  cestaBasica: simNaoSchema,
  he50Minutos: horasSchema,
  he60Minutos: horasSchema,
  he100Minutos: horasSchema,
  adicionalNoturnoMinutos: horasSchema,
  intrajornadaMinutos: horasSchema,
  insalubridade: grauSchema,
  periculosidade: simNaoSchema,
  assiduidade: simNaoSchema,
  gratificacaoPercentual: percentualSchema,
  faltasEscala: diasSchema,
  faltasFolga: diasSchema,
  dsrDescontados: diasSchema,
  observacao: observacaoSchema,
});

export const limparApontamentoSchema = z.object({ funcionarioId: idFuncionarioSchema });

/**
 * Quantos apontamentos a confirmacao mostrou. A action so apaga se for
 * exatamente esse numero — confirmar "apagar 40" nao pode apagar 41.
 */
export const limparCompetenciaSchema = z.object({
  quantidade: z.coerce.number().int().min(1).max(100_000),
});

/**
 * Os filtros da lista, lidos de uma vez dos `searchParams`. Cada campo tem o
 * proprio `catch`: filtro torto e "sem esse filtro", e um recusado nao derruba
 * os outros — mesma escolha de `filtrosExtrasSchema`.
 */
export const filtrosApontamentosSchema = z
  .object({
    busca: z.string().trim().max(120).catch(""),
    empresa: z.uuid().nullable().catch(null),
    status: z.enum(IDS_STATUS_DO_APONTAMENTO).nullable().catch(null),
    inativos: z
      .literal(["1", "true"])
      .transform(() => true)
      .catch(false),
    pagina: z.coerce.number().int().min(1).catch(1),
  })
  .transform(({ empresa, ...resto }) => ({ ...resto, empresaId: empresa }));

export type SalvarApontamentoInput = z.infer<typeof salvarApontamentoSchema>;
