import { z } from "zod";

import { IDS_CORES, IDS_NATUREZAS, normalizarCodigo } from "./cores";

/**
 * Schemas de entrada do cadastro de eventos. Ficam separados das actions para
 * poderem ser reaproveitados por testes e (futuramente) rotas de API.
 */

/**
 * A sigla da celula. Curta porque e o que cabe numa coluna de dia, e sem espaco
 * porque a grade separa os codigos por espaco quando le uma linha inteira de
 * uma vez.
 */
const codigoSchema = z
  .string()
  .trim()
  .min(1, "Informe a sigla do evento")
  .max(6, "A sigla pode ter no maximo 6 caracteres")
  .regex(/^[A-Za-z0-9?/-]+$/, "A sigla aceita letras, numeros e os sinais ? / -")
  .transform(normalizarCodigo);

const rotuloSchema = z
  .string()
  .trim()
  .min(3, "O nome precisa de pelo menos 3 caracteres")
  .max(60, "O nome pode ter no maximo 60 caracteres");

/** Campo opcional: o `textarea` vazio chega como "" e vira `null` na coluna. */
const descricaoSchema = z
  .string()
  .trim()
  .max(280, "A descricao pode ter no maximo 280 caracteres")
  .transform((valor) => valor || null);

export const idEventoSchema = z.uuid("Evento invalido");

/**
 * Os campos que descrevem o evento. Extraidos para que criar e atualizar
 * validem exatamente a mesma coisa: a edicao acrescenta id e situacao, nunca
 * uma regra diferente.
 */
const camposDoEvento = z.object({
  codigo: codigoSchema,
  rotulo: rotuloSchema,
  descricao: descricaoSchema,
  natureza: z.enum(IDS_NATUREZAS, { error: "Escolha a natureza do evento" }),
  cor: z.enum(IDS_CORES, { error: "Escolha a cor da celula" }),
  exigeHorario: z.boolean(),
  exigePessoa: z.boolean(),
  exigeDestino: z.boolean(),
  exigeDiaTrabalhado: z.boolean(),
  padrao: z.boolean(),
});

export const criarEventoSchema = camposDoEvento;

export const atualizarEventoSchema = camposDoEvento.extend({
  eventoId: idEventoSchema,
  ativo: z.boolean(),
});

/**
 * O termo de `?busca=`, pelas mesmas razoes de `buscaEscalasSchema`: e entrada
 * do usuario, e busca torta nao merece tela de erro.
 */
export const buscaEventosSchema = z.string().trim().max(60).catch("");

export type CriarEventoInput = z.infer<typeof criarEventoSchema>;
export type AtualizarEventoInput = z.infer<typeof atualizarEventoSchema>;
