import { z } from "zod";

import { IDS_AREAS } from "./areas";

/**
 * Schemas de entrada da gestao de acessos. Ficam separados das actions para
 * poderem ser reaproveitados por testes e (futuramente) rotas de API.
 */

const nomeSchema = z
  .string()
  .trim()
  .min(3, "O nome precisa de pelo menos 3 caracteres")
  .max(120, "O nome pode ter no maximo 120 caracteres");

/**
 * O login vira parte da credencial: normalizado para minusculas (a coluna e
 * unica e a comparacao no login e exata) e restrito a um alfabeto previsivel.
 */
const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O login precisa de pelo menos 3 caracteres")
  .max(64, "O login pode ter no maximo 64 caracteres")
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
    "Use apenas letras, numeros, ponto, hifen ou underline",
  );

/** Duplicatas viriam so de FormData adulterado, mas o INSERT quebraria na PK. */
const areasSchema = z
  .array(z.enum(IDS_AREAS, { error: "Area desconhecida" }))
  .transform((areas) => [...new Set(areas)]);

export const idUsuarioSchema = z.uuid("Usuario invalido");

export const criarUsuarioSchema = z.object({
  nome: nomeSchema,
  login: loginSchema,
  administrador: z.boolean(),
  areas: areasSchema,
});

export const atualizarUsuarioSchema = z.object({
  usuarioId: idUsuarioSchema,
  nome: nomeSchema,
  administrador: z.boolean(),
  ativo: z.boolean(),
  areas: areasSchema,
});

export const redefinirSenhaSchema = z.object({
  usuarioId: idUsuarioSchema,
});

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
