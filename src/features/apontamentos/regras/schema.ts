import { z } from "zod";

import { IDS_GRAU_INSALUBRIDADE, lerHoras, lerPercentual, MAXIMO_DE_DIAS } from "../rubricas";
import {
  aceitaSoma,
  IDS_ACAO,
  IDS_GATILHO,
  IDS_RUBRICA_DA_REGRA,
  unidadeDaRubricaDaRegra,
} from "./campos";
import { TIPOS_DE_EXCECAO } from "./types";

/**
 * Schemas do cadastro de regras.
 *
 * O que muda de campo obrigatorio conforme a rubrica escolhida esta no
 * `superRefine`: a unidade da rubrica decide se o valor e dias, horas,
 * percentual, grau ou marcacao — a mesma tabela que o `check
 * regras_apontamento_um_valor` guarda no banco.
 */

export const idRegraSchema = z.uuid("Regra invalida");

/** `<select>` vazio e "nao filtra por isso", e nao um uuid invalido. */
const idOpcionalSchema = z
  .string()
  .trim()
  .transform((valor) => valor || null)
  .refine((valor) => valor === null || z.uuid().safeParse(valor).success, "Opcao invalida");

const inteiroOpcionalSchema = (maximo: number, mensagem: string) =>
  z
    .string()
    .trim()
    .transform((valor, ctx) => {
      if (valor === "") {
        return null;
      }

      if (!/^\d{1,5}$/.test(valor) || Number(valor) > maximo) {
        ctx.addIssue({ code: "custom", message: mensagem });
        return z.NEVER;
      }

      return Number(valor);
    });

/** A jornada da vigencia e digitada como duracao (`12:00`), como no apontamento. */
const jornadaSchema = z
  .string()
  .trim()
  .transform((valor, ctx) => {
    if (valor === "") {
      return null;
    }

    const minutos = lerHoras(valor);

    if (minutos === null || minutos === 0) {
      ctx.addIssue({ code: "custom", message: "Use horas e minutos, como 12:00" });
      return z.NEVER;
    }

    return minutos;
  });

const camposDaRegra = z.object({
  nome: z
    .string()
    .trim()
    .min(3, "Informe o nome da regra")
    .max(80, "O nome pode ter no maximo 80 caracteres"),
  descricao: z
    .string()
    .trim()
    .max(280, "A descricao pode ter no maximo 280 caracteres")
    .transform((valor) => valor || null),
  ordem: inteiroOpcionalSchema(999, "Informe um numero de 0 a 999").transform(
    (valor) => valor ?? 0,
  ),
  ativa: z.string().transform((valor) => valor === "on"),

  empresaId: idOpcionalSchema,
  cargo: z
    .string()
    .trim()
    .max(60, "O cargo pode ter no maximo 60 caracteres")
    .transform((valor) => valor || null),
  funcionarioId: idOpcionalSchema,
  postoId: idOpcionalSchema,
  funcaoId: idOpcionalSchema,
  turma: z
    .union([z.literal(""), z.enum(["escala", "contraescala"])], { error: "Turma invalida" })
    .transform((valor) => valor || null),
  eventoId: idOpcionalSchema,
  cicloDias: inteiroOpcionalSchema(31, "Informe um numero de 1 a 31"),
  cicloFolgas: inteiroOpcionalSchema(31, "Informe um numero de 0 a 31"),
  jornadaMinutos: jornadaSchema,

  gatilho: z.enum(IDS_GATILHO, { error: "Escolha o que dispara a regra" }),
  rubrica: z.enum(IDS_RUBRICA_DA_REGRA, { error: "Escolha a rubrica" }),
  acao: z.enum(IDS_ACAO, { error: "Escolha a acao" }),
  quantidade: z.string().trim(),
  percentual: z.string().trim(),
  grau: z
    .union([z.literal(""), z.enum(IDS_GRAU_INSALUBRIDADE)], { error: "Grau invalido" })
    .transform((valor) => valor || null),
  /** `empresa:<uuid>`, uma por alvo escolhido. */
  excecoes: z.array(z.string().trim()).default([]),
});

type CamposDaRegra = z.output<typeof camposDaRegra>;

/** `empresa:<uuid>` -> o par que a gravacao usa. `null` para o que nao e alvo. */
export function lerExcecao(valor: string) {
  const [tipo, id] = valor.split(":");
  const conhecido = (TIPOS_DE_EXCECAO as readonly string[]).includes(tipo ?? "");

  return conhecido && z.uuid().safeParse(id).success
    ? { tipo: tipo as (typeof TIPOS_DE_EXCECAO)[number], id: id! }
    : null;
}

/**
 * As regras que so existem com os campos juntos: a unidade da rubrica decide
 * qual valor e obrigatorio, e marcacao e grau nao se somam.
 */
function conferirRegra(dados: CamposDaRegra, ctx: z.RefinementCtx) {
  const unidade = unidadeDaRubricaDaRegra(dados.rubrica);

  if ((dados.cicloDias === null) !== (dados.cicloFolgas === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["cicloFolgas"],
      message: "Informe o tamanho do ciclo e as folgas, ou nenhum dos dois",
    });
  }

  if (
    dados.cicloDias !== null &&
    dados.cicloFolgas !== null &&
    dados.cicloFolgas > dados.cicloDias
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["cicloFolgas"],
      message: "O ciclo nao pode ter mais folgas do que dias",
    });
  }

  if (!aceitaSoma(dados.rubrica) && dados.acao === "somar") {
    ctx.addIssue({
      code: "custom",
      path: ["acao"],
      message: "Esta rubrica so aceita Definir: marcacao e grau nao se somam",
    });
  }

  if (unidade === "grau" && !dados.grau) {
    ctx.addIssue({ code: "custom", path: ["grau"], message: "Escolha o grau" });
  }

  if (unidade === "percentual" && lerPercentual(dados.percentual) === null) {
    ctx.addIssue({
      code: "custom",
      path: ["percentual"],
      message: "Informe um percentual de 0 a 100, como 12,5",
    });
  }

  if (
    unidade === "dias" &&
    (!/^\d{1,2}$/.test(dados.quantidade) || Number(dados.quantidade) > MAXIMO_DE_DIAS)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["quantidade"],
      message: `Informe um numero de 0 a ${MAXIMO_DE_DIAS}`,
    });
  }

  if (unidade === "horas") {
    const minutos = lerHoras(dados.quantidade);

    if (minutos === null || minutos === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quantidade"],
        message: "Use horas e minutos, como 3:00",
      });
    }
  }

  for (const excecao of dados.excecoes) {
    if (!lerExcecao(excecao)) {
      ctx.addIssue({ code: "custom", path: ["excecoes"], message: "Excecao invalida" });
      break;
    }
  }
}

export const criarRegraSchema = camposDaRegra.superRefine(conferirRegra);

export const atualizarRegraSchema = camposDaRegra
  .extend({ regraId: idRegraSchema })
  .superRefine(conferirRegra);

export const excluirRegraSchema = z.object({ regraId: idRegraSchema });

export type CriarRegraInput = z.infer<typeof criarRegraSchema>;
export type AtualizarRegraInput = z.infer<typeof atualizarRegraSchema>;
