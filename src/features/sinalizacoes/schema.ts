import { z } from "zod";

import { SITUACOES } from "./types";

/** O recorte da lista, vindo da URL: valor torto e o padrao, e nao erro. */
export const filtroSinalizacoesSchema = z.object({
  situacao: z.enum(SITUACOES).catch("pendentes"),
});

/** O envio aos responsaveis: quem, e a assinatura da previa na confirmacao. */
export const enviarSinalizadosSchema = z.object({
  responsavelId: z.uuid(),
  assinatura: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
});

/** Resolver ou reabrir uma sinalizacao. */
export const resolverSinalizacaoSchema = z.object({
  id: z.uuid(),
  acao: z.enum(["resolver", "reabrir"]),
});
