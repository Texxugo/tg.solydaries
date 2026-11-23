import { z } from "zod";

import { funcaoTurmaEnum } from "@/db/schema";
import { ehDataValida } from "@/features/competencias/periodo";

import { OBSERVACAO_DA_SINALIZACAO_MAX } from "./types";

/**
 * Schemas de entrada do preenchimento. Ficam separados das actions para poderem
 * ser reaproveitados por testes e (futuramente) rotas de API.
 *
 * O previsto **nao** tem schema nenhum aqui: ele nao e digitado — sai do ciclo
 * da funcao (cadastro de postos) e da turma da linha. O que passa por
 * este arquivo e o realizado, dia a dia, e quem entra na grade.
 */

export const idPostoSchema = z.uuid("Posto invalido");
export const idFuncaoSchema = z.uuid("Funcao invalida");
export const idLinhaSchema = z.uuid("Linha invalida");

const dataSchema = z
  .string()
  .trim()
  .refine((valor) => ehDataValida(valor), "Data invalida");

/**
 * A inclusao de um funcionario ja cadastrado. `funcionarioId` chega do
 * `<select>`, e o Zod o confere antes de virar consulta — a action ainda checa
 * se a pessoa existe e esta ativa.
 */
export const incluirFuncionarioSchema = z.object({
  funcaoId: idFuncaoSchema,
  funcionarioId: z.uuid("Selecione um funcionario"),
});

/**
 * A inclusao de um freelancer, criado na hora.
 *
 * O nome e a unica exigencia: o freela entra na grade no dia em que aparece, e
 * quem monta a escala nao tem a documentacao dele em maos. O codigo e o numero
 * pelo qual a operacao o chama e serve para reencontra-lo no mes seguinte.
 */
export const incluirFreelancerSchema = z.object({
  funcaoId: idFuncaoSchema,
  nome: z
    .string()
    .trim()
    .min(3, "Informe o nome do freelancer")
    .max(120, "O nome pode ter no maximo 120 caracteres"),
  codigo: z
    .string()
    .trim()
    .max(20, "O codigo pode ter no maximo 20 caracteres")
    .regex(/^[0-9A-Za-z-]*$/, "O codigo aceita letras, numeros e hifen")
    .transform((valor) => valor.toUpperCase() || null),
});

export const linhaSchema = z.object({
  linhaId: idLinhaSchema,
});

/**
 * O que a aba Pessoas diz de uma linha: qual das duas escalas da funcao esta
 * pessoa segue, que sigla os dias de trabalho dela escrevem e a observacao.
 *
 * Sao as unicas coisas de escala que a linha diz: o ciclo, o horario e as
 * vigencias sao da funcao, e mudam em Postos de trabalho. A turma deriva do enum
 * do banco pela mesma razao de `IDS_DIVERGENCIA` — turma invalida precisa
 * falhar antes de virar UPDATE. A sigla vazia e "a da funcao"; que ela exista,
 * esteja ativa e seja de trabalho so o banco responde, e a action confere.
 */
export const pessoaDaFuncaoSchema = linhaSchema
  .extend({
    turma: z.enum(funcaoTurmaEnum.enumValues, { error: "Turma invalida" }),
    eventoTrabalhoId: z
      .union([z.uuid("Sigla invalida"), z.literal("")])
      .transform((valor) => valor || null),
    /**
     * O horario do previsto de quem tem sigla propria (o 18:00-06:00 do `N`).
     * Os dois juntos ou nenhum; sem sigla propria a action grava vazio.
     */
    horaEntrada: horaSchema(),
    horaSaida: horaSchema(),
    observacao: z
      .string()
      .trim()
      .max(200, "A observacao pode ter no maximo 200 caracteres")
      .transform((valor) => valor || null),
  })
  .superRefine((dados, ctx) => {
    if ((dados.horaEntrada === null) !== (dados.horaSaida === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["horaEntrada"],
        message: "Informe entrada e saida do horario, ou deixe os dois em branco",
      });
    }

    if (dados.horaEntrada !== null && dados.horaEntrada === dados.horaSaida) {
      ctx.addIssue({
        code: "custom",
        path: ["horaSaida"],
        message: "Entrada e saida iguais: seriam 24h ou nenhuma",
      });
    }
  });

/**
 * As linhas alteradas de uma funcao, gravadas juntas. So vem quem mudou: a tela
 * nao reenvia a linha intocada, que outra pessoa pode ter acabado de gravar.
 */
export const pessoasDaFuncaoSchema = z
  .array(pessoaDaFuncaoSchema)
  .min(1, "Nenhuma alteracao a gravar.")
  .max(200, "Alteracoes demais de uma vez.")
  .refine(
    (linhas) => new Set(linhas.map((linha) => linha.linhaId)).size === linhas.length,
    "A mesma pessoa veio duas vezes.",
  );

/**
 * Um dia do realizado, como o modal o manda.
 *
 * Os horarios sao dois campos `time` separados, e nao uma caixa de texto: o
 * modal tem espaco para os dois e o navegador ja valida cada um. Os dois andam
 * juntos ou nao andam, como em `preenchimento_dias_horario_completo`.
 */
export const salvarDiaSchema = z
  .object({
    linhaId: idLinhaSchema,
    data: dataSchema,
    eventoId: z
      .union([z.uuid("Evento invalido"), z.literal("")])
      .transform((valor) => valor || null),
    horaEntrada: horaSchema(),
    horaSaida: horaSchema(),
    pessoa: z.string().trim().max(40),
    destino: z.union([idFuncaoSchema, z.literal("")]).transform((valor) => valor || null),
    /**
     * Se o dia lanca hora extra na conferencia. Chega como `"on"` (a caixa
     * marcada) ou vazio, e nao como booleano: o que o formulario posta e texto.
     */
    extra: z.string().transform((valor) => valor === "on"),
    /**
     * Se o intervalo intrajornada nao foi usufruido. Chega como `"on"` ou
     * vazio, como o extra, e pelo mesmo motivo — formulario posta texto.
     *
     * Nao exige horario nenhum: ela diz que o intervalo nao houve, e nao quanto
     * ele teria durado.
     */
    intrajornada: z.string().transform((valor) => valor === "on"),
    /**
     * A folga em que a pessoa trabalhou no lugar deste dia — so vale quando a
     * sigla pede (a TE). Vazio e `null`; a action ignora o campo nas outras.
     */
    dataTrabalhada: z.union([dataSchema, z.literal("")]).transform((valor) => valor || null),
    observacao: z
      .string()
      .trim()
      .max(200, "A observacao pode ter no maximo 200 caracteres")
      // O `<textarea>` posta CRLF; sem normalizar, o texto gravado teria
      // quebras invisiveis que ninguem digitou. Mesma razao de `mensagens_ponto`.
      .transform((valor) => (valor ? valor.replaceAll("\r\n", "\n") : null)),
  })
  .superRefine((dados, ctx) => {
    if ((dados.horaEntrada === null) !== (dados.horaSaida === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["horario"],
        message: "Informe a entrada e a saida — uma sem a outra nao mede jornada nenhuma",
      });
    }

    if (dados.horaEntrada && dados.horaEntrada === dados.horaSaida) {
      ctx.addIssue({
        code: "custom",
        path: ["horario"],
        message: "Entrada e saida iguais: seriam 24h ou nenhuma",
      });
    }

    /*
      O extra e um horario, e nao um aviso: `extras` exige entrada e saida
      (`not null`, e diferentes entre si), e e delas que sai a duracao que
      alguem vai conferir. Deriva-las do previsto da funcao faria o lancamento
      mudar sozinho quando o contrato do posto mudasse — o oposto do que o
      modulo de extras e. Quem quer o horario da funcao tem o "Igual ao
      previsto" a um clique.
    */
    if (dados.extra && !dados.horaEntrada) {
      ctx.addIssue({
        code: "custom",
        path: ["extra"],
        message: "Informe a entrada e a saida: e o horario que vira hora extra",
      });
    }
  });

/** `HH:MM` do `input[type=time]`; vazio e ausencia, e nao erro. */
function horaSchema() {
  return z
    .string()
    .trim()
    .refine((valor) => valor === "" || /^\d{2}:\d{2}$/.test(valor), "Horario invalido")
    .transform((valor) => valor || null);
}

/**
 * Varios dias de uma vez: quem, de quando ate quando, e o que gravar.
 *
 * A sigla vazia e "igual ao previsto" — o caso que motivou o formulario, e o
 * mais comum de todos. As pessoas chegam como ids de linha, e a action confere
 * que todas sao deste posto e desta competencia: o formulario so oferece essas,
 * mas ele e um POST publico.
 */
export const preencherDiasSchema = z
  .object({
    postoId: idPostoSchema,
    linhaIds: z
      .array(idLinhaSchema)
      .min(1, "Escolha ao menos uma pessoa")
      .max(300, "Pessoas demais num envio so"),
    de: dataSchema,
    ate: dataSchema,
    sigla: z.union([z.uuid("Sigla invalida"), z.literal("")]).transform((valor) => valor || null),
  })
  .refine((dados) => dados.de <= dados.ate, {
    path: ["ate"],
    message: "O ultimo dia precisa vir depois do primeiro",
  });

export const limparDiaSchema = z.object({
  linhaId: idLinhaSchema,
  data: dataSchema,
});

/**
 * O dia que a grade abre ja no modal: `?dia=<linha>:<data>`, a mesma chave de
 * `chaveDaCelula()`. Vira `{ linhaId, data }`; a tela confere se o dia e dela.
 */
export const diaDaUrlSchema = z
  .string()
  .transform((valor) => {
    const separador = valor.lastIndexOf(":");
    return { linhaId: valor.slice(0, separador), data: valor.slice(separador + 1) };
  })
  .pipe(z.object({ linhaId: idLinhaSchema, data: dataSchema }))
  .nullable();

/** O "!" do modal: sinalizar o dia, ou tirar a marca ainda pendente. */
export const sinalizarDiaSchema = limparDiaSchema.extend({
  sinalizado: z.boolean(),
});

/** A observacao da marca: o que conferir. Vazia apaga. */
export const anotarSinalizacaoSchema = limparDiaSchema.extend({
  observacao: z
    .string()
    .trim()
    .max(OBSERVACAO_DA_SINALIZACAO_MAX, `Ate ${OBSERVACAO_DA_SINALIZACAO_MAX} caracteres`)
    .transform((valor) => valor || null),
});

export type IncluirFuncionarioInput = z.infer<typeof incluirFuncionarioSchema>;
export type IncluirFreelancerInput = z.infer<typeof incluirFreelancerSchema>;
export type SalvarDiaInput = z.infer<typeof salvarDiaSchema>;
