import { z } from "zod";

import { ehDataValida } from "@/features/competencias/periodo";
import { lerColaborador } from "@/features/extras/colaborador";

import { interpretarHora } from "./horario";
import { IDS_COMPORTAMENTOS, MAXIMO_DO_RASCUNHO, NOME_MINIMO_FREELANCER } from "./types";

/**
 * Schemas de entrada do modulo de efetivos. Server Actions sao endpoints POST
 * publicos: o formulario nao valida nada que conte.
 */

const nomeSchema = z
  .string()
  .trim()
  .min(2, "O nome precisa de pelo menos 2 caracteres")
  .max(40, "O nome pode ter no maximo 40 caracteres");

/** Vazio e "cadastro novo"; preenchido e a edicao daquele id. */
const idOpcional = z
  .string()
  .trim()
  .transform((valor) => valor || undefined)
  .pipe(z.uuid("Cadastro invalido").optional());

export const salvarLocalSchema = z.object({
  id: idOpcional,
  nome: nomeSchema,
});

/**
 * O comportamento so e lido no cadastro: depois de criado ele nao muda (ver
 * `efetivoTipos`), e a edicao que o mandasse seria ignorada.
 */
export const salvarTipoSchema = z
  .object({
    id: idOpcional,
    nome: nomeSchema,
    comportamento: z
      .string()
      .transform((valor) => valor || undefined)
      .pipe(z.enum(IDS_COMPORTAMENTOS, { error: "Escolha o comportamento" }).optional()),
  })
  .refine((tipo) => tipo.id || tipo.comportamento, {
    path: ["comportamento"],
    message: "Escolha o comportamento",
  });

export const situacaoSchema = z.object({
  id: z.uuid("Cadastro invalido"),
  ativo: z.enum(["true", "false"]).transform((valor) => valor === "true"),
});

/** O horario digitado, ja interpretado ("0730" -> "07:30"). */
const horaSchema = z.string().transform((texto, contexto) => {
  const hora = interpretarHora(texto);

  if (!hora) {
    contexto.addIssue({
      code: "custom",
      message: texto.trim() ? "Horario invalido" : "Informe o horario",
    });
    return z.NEVER;
  }

  return hora;
});

/**
 * Um lancamento. A pessoa chega como `f:`/`l:` e sai ja lida; o freelancer novo
 * nao passa por aqui — ele e cadastrado antes, no proprio campo, e chega como
 * `l:<uuid>`.
 */
export const salvarLancamentoSchema = z
  .object({
    id: idOpcional,
    data: z.string().refine(ehDataValida, "Data invalida"),
    postoId: z.uuid("Escolha o posto"),
    pessoa: z.string().transform((valor, contexto) => {
      const pessoa = lerColaborador(valor);

      if (!pessoa) {
        contexto.addIssue({ code: "custom", message: "Escolha a pessoa" });
        return z.NEVER;
      }

      return pessoa;
    }),
    localId: z.uuid("Escolha o local"),
    entrada: horaSchema,
    saida: horaSchema,
    /** A caixa "Excecao": desmarcada, os quatro campos abaixo sao ignorados. */
    excecao: z.string().transform((valor) => valor === "1"),
    tipoId: z
      .string()
      .transform((valor) => valor || null)
      .pipe(z.uuid("Escolha o tipo de excecao").nullable()),
    contraparte: z.string().transform((valor) => (valor ? lerColaborador(valor) : null)),
    postoOrigemId: z
      .string()
      .transform((valor) => valor || null)
      .pipe(z.uuid("Posto invalido").nullable()),
    observacao: z
      .string()
      .trim()
      .max(280, "A observacao pode ter no maximo 280 caracteres")
      .transform((valor) => valor || null),
  })
  .refine((lancamento) => lancamento.entrada !== lancamento.saida, {
    path: ["saida"],
    message: "A saida nao pode ser igual a entrada",
  });

export const idLancamentoSchema = z.uuid("Lancamento invalido");

export const nomeFreelancerSchema = z
  .string()
  .trim()
  .min(NOME_MINIMO_FREELANCER, `O nome precisa de pelo menos ${NOME_MINIMO_FREELANCER} letras`)
  .max(80, "O nome pode ter no maximo 80 caracteres");

/** Pessoa `f:`/`l:` ja lida; o resto e recusado. */
const pessoaSchema = z.string().transform((valor, contexto) => {
  const pessoa = lerColaborador(valor);

  if (!pessoa) {
    contexto.addIssue({ code: "custom", message: "Pessoa invalida" });
    return z.NEVER;
  }

  return pessoa;
});

/**
 * O rascunho confirmado: as pessoas marcadas, com local e horario. Chega como
 * JSON num campo do formulario e passa pela mesma leitura de horario do
 * lancamento um a um — o rascunho veio do servidor, mas o POST e publico.
 */
export const confirmarRascunhoSchema = z.object({
  data: z.string().refine(ehDataValida, "Data invalida"),
  postoId: z.uuid("Posto invalido"),
  itens: z
    .array(
      z
        .object({ pessoa: pessoaSchema, localId: z.uuid(), entrada: horaSchema, saida: horaSchema })
        .refine((item) => item.entrada !== item.saida),
    )
    .min(1, "Marque ao menos uma pessoa")
    .max(MAXIMO_DO_RASCUNHO, `No maximo ${MAXIMO_DO_RASCUNHO} pessoas por vez`),
});
