import { z } from "zod";

import { ehDataValida } from "@/features/competencias/periodo";
import { lerColaborador } from "@/features/extras/colaborador";

import {
  IDS_FILTRO_DOCUMENTO,
  IDS_TIPO_DE_MOVIMENTACAO,
  JUSTIFICATIVA_MAXIMA,
  JUSTIFICATIVA_MINIMA,
  MAXIMO_NA_TROCA,
  MINIMO_NA_TROCA,
  ehTroca,
} from "./types";

/**
 * Schemas de entrada do modulo de movimentacoes.
 *
 * Nada aqui toca o banco: se a pessoa existe e esta ativa, e se a data cai na
 * competencia, sao perguntas da action. Os documentos tambem nao passam por
 * aqui — sao `File`, e quem os confere e `documentos.ts`.
 */

export const idMovimentacaoSchema = z.uuid("Movimentacao invalida");

/** `f:<uuid>` ou `l:<uuid>`; vazio vira `null` ("ninguem escolhido"). */
const pessoaSchema = z
  .string()
  .trim()
  .transform((valor) => valor || null)
  .refine((valor) => valor === null || lerColaborador(valor) !== null, "Pessoa invalida");

const camposDaMovimentacao = z.object({
  tipo: z.enum(IDS_TIPO_DE_MOVIMENTACAO, "Escolha o tipo da movimentacao"),
  data: z.string().trim().refine(ehDataValida, "Informe a data da movimentacao"),
  /**
   * O `<textarea>` posta CRLF; sem a troca o texto gravado teria `\r` que
   * ninguem digitou — mesma correcao do conteudo da mensagem do ponto.
   */
  justificativa: z
    .string()
    .transform((valor) => valor.replaceAll("\r\n", "\n").trim())
    .pipe(
      z
        .string()
        .min(JUSTIFICATIVA_MINIMA, "Escreva a justificativa da movimentacao")
        .max(
          JUSTIFICATIVA_MAXIMA,
          `A justificativa pode ter no maximo ${JUSTIFICATIVA_MAXIMA} caracteres`,
        ),
    ),
  ausente: pessoaSchema,
  cobertura: pessoaSchema,
  envolvidos: z.array(pessoaSchema),
  /** Documentos ja gravados que a edicao tira. Nunca usado no registro. */
  removerDocumentos: z.array(z.uuid()),
});

type CamposDaMovimentacao = z.infer<typeof camposDaMovimentacao>;

/**
 * Quem cada tipo pede.
 *
 * Na falta: quem faltou, obrigatorio, e quem cobriu, opcional — e nunca a
 * mesma pessoa. Nas trocas: de duas a seis pessoas, sem repetir. Os campos do
 * outro tipo sao ignorados pela action (o modal os esconde, mas campo escondido
 * nao e garantia de nada).
 */
function conferirPessoas(dados: CamposDaMovimentacao, ctx: z.RefinementCtx) {
  if (!ehTroca(dados.tipo)) {
    if (!dados.ausente) {
      ctx.addIssue({ code: "custom", path: ["ausente"], message: "Escolha quem faltou" });
    } else if (dados.cobertura === dados.ausente) {
      ctx.addIssue({
        code: "custom",
        path: ["cobertura"],
        message: "Quem cobriu nao pode ser quem faltou",
      });
    }

    return;
  }

  const escolhidos = dados.envolvidos.filter((valor) => valor !== null);

  if (escolhidos.length < MINIMO_NA_TROCA) {
    ctx.addIssue({
      code: "custom",
      path: ["envolvidos"],
      message: `Escolha ao menos ${MINIMO_NA_TROCA} pessoas envolvidas na troca`,
    });
  } else if (escolhidos.length > MAXIMO_NA_TROCA) {
    ctx.addIssue({
      code: "custom",
      path: ["envolvidos"],
      message: `Uma troca envolve no maximo ${MAXIMO_NA_TROCA} pessoas`,
    });
  } else if (new Set(escolhidos).size !== escolhidos.length) {
    ctx.addIssue({
      code: "custom",
      path: ["envolvidos"],
      message: "A mesma pessoa aparece duas vezes na troca",
    });
  }
}

export const salvarMovimentacaoSchema = camposDaMovimentacao
  .extend({
    /** Vazio no registro; o id na edicao. */
    movimentacaoId: z
      .string()
      .trim()
      .transform((valor) => valor || null)
      .pipe(idMovimentacaoSchema.nullable()),
  })
  .superRefine(conferirPessoas);

export const excluirMovimentacaoSchema = z.object({ movimentacaoId: idMovimentacaoSchema });

/** Uma ponta do periodo filtrado. Data impossivel ou vazia vira "sem limite". */
const dataFiltroSchema = z.string().trim().refine(ehDataValida).nullable().catch(null);

/**
 * Os filtros da lista (e da exportacao), lidos de uma vez dos `searchParams`.
 * Mesmas regras de `filtrosExtrasSchema`: cada campo com o proprio `catch`
 * (filtro torto e "sem esse filtro"), e "de" depois de "ate" troca as pontas.
 */
export const filtrosMovimentacoesSchema = z
  .object({
    busca: z.string().trim().max(80).catch(""),
    tipo: z.enum(IDS_TIPO_DE_MOVIMENTACAO).nullable().catch(null),
    de: dataFiltroSchema,
    ate: dataFiltroSchema,
    documento: z.enum(IDS_FILTRO_DOCUMENTO).nullable().catch(null),
    pagina: z.coerce.number().int().min(1).catch(1),
  })
  .transform(({ de, ate, ...resto }) => {
    const invertido = de !== null && ate !== null && de > ate;

    return { ...resto, de: invertido ? ate : de, ate: invertido ? de : ate };
  });

export type SalvarMovimentacaoInput = z.infer<typeof salvarMovimentacaoSchema>;
