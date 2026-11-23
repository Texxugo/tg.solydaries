import { z } from "zod";

import { funcaoTurmaEnum } from "@/db/schema";
import { ehDataValida } from "@/features/competencias/periodo";
import { lerFolgas } from "@/features/preenchimento/previsto";

/**
 * As turmas como tupla, que e o que o `z.enum` exige. Deriva do enum do banco
 * pela mesma razao de `IDS_DIVERGENCIA`: turma invalida precisa falhar antes de
 * virar INSERT.
 */
const IDS_TURMA = funcaoTurmaEnum.enumValues;

/**
 * Schemas de entrada do cadastro de postos. Ficam separados das actions para
 * poderem ser reaproveitados por testes e (futuramente) rotas de API.
 */

/**
 * O apelido curto do posto (GP01, SG27). Sem espaco nem acento porque ele
 * encabeca o bloco da grade e cabe em poucos caracteres — a mesma faixa que o
 * `check` de `postos_codigo_valido` aceita no banco.
 */
const codigoSchema = z
  .string()
  .trim()
  .min(1, "Informe o codigo do posto")
  .max(20, "O codigo pode ter no maximo 20 caracteres")
  .regex(/^[0-9A-Za-z-]+$/, "O codigo aceita letras, numeros e hifen")
  .transform((valor) => valor.toUpperCase());

const nomeSchema = z
  .string()
  .trim()
  .min(3, "O nome precisa de pelo menos 3 caracteres")
  .max(120, "O nome pode ter no maximo 120 caracteres");

/**
 * Campo de escolha opcional: o `<select>` vazio chega como "" e vira `null`.
 * Uuid invalido continua sendo erro — "" e ausencia, "abc" e engano.
 */
const idOpcionalSchema = z
  .string()
  .trim()
  .transform((valor) => valor || null)
  .refine(
    (valor) => valor === null || z.uuid().safeParse(valor).success,
    "Selecione uma opcao valida",
  );

const observacaoSchema = z
  .string()
  .trim()
  .max(280, "A observacao pode ter no maximo 280 caracteres")
  .transform((valor) => valor || null);

export const idPostoSchema = z.uuid("Posto invalido");
export const idFuncaoSchema = z.uuid("Funcao invalida");

const camposDoPosto = z.object({
  codigo: codigoSchema,
  nome: nomeSchema,
  empresaId: idOpcionalSchema,
});

export const criarPostoSchema = camposDoPosto;

export const atualizarPostoSchema = camposDoPosto.extend({
  postoId: idPostoSchema,
  ativo: z.boolean(),
});

/** `HH:MM` do `input[type=time]`. */
const horaSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, "Informe o horario");

/** `YYYY-MM-DD` opcional: vazio e ausencia, e nao erro. */
const dataOpcionalSchema = z
  .string()
  .trim()
  .refine((valor) => valor === "" || ehDataValida(valor), "Informe uma data valida")
  .transform((valor) => valor || null);

/**
 * Os campos de uma funcao. O ciclo saiu daqui: ele agora e uma lista de
 * vigencias (`funcao_ciclos`), com formulario proprio, porque a escala de um
 * posto muda no meio do periodo e porque a contraescala tem a sua.
 */
export const camposDaFuncaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "O nome da funcao precisa de pelo menos 2 caracteres")
    .max(120, "O nome pode ter no maximo 120 caracteres"),
  eventoTrabalhoId: idOpcionalSchema,
  observacao: observacaoSchema,
});

/**
 * Uma vigencia do ciclo: o que o contrato exige, a partir de quando, para qual
 * turma.
 *
 * Tudo obrigatorio menos as duas datas. `vigencia_inicio` vazio e a
 * configuracao **inicial** — a que vale antes de qualquer troca —, e so pode
 * haver uma por turma (o banco garante, com indice parcial). `inicio_ciclo`
 * vazio ancora a posicao 1 no comeco da vigencia.
 *
 * As folgas ficam como **texto** aqui e viram numeros na action, por
 * `lerFolgas()`: elas so podem ser conferidas contra o tamanho do ciclo, que so
 * e conhecido depois do parse. Validar aqui e converter la usa a mesma funcao,
 * entao as duas nunca discordam.
 */
export const camposDaVigenciaSchema = z
  .object({
    turma: z.enum(IDS_TURMA, { error: "Turma invalida" }),
    vigenciaInicio: dataOpcionalSchema,
    diasCiclo: z
      .string()
      .trim()
      .regex(/^\d{1,2}$/, "Informe de quantos em quantos dias o ciclo se repete")
      .transform(Number),
    folgas: z.string().trim().max(80, "Folgas demais para um ciclo"),
    entrada: horaSchema,
    saida: horaSchema,
    inicioCiclo: dataOpcionalSchema,
  })
  .superRefine((dados, ctx) => {
    if (dados.diasCiclo < 1 || dados.diasCiclo > 62) {
      ctx.addIssue({ code: "custom", path: ["diasCiclo"], message: "O ciclo vai de 1 a 62 dias" });
    }

    if (dados.entrada === dados.saida) {
      ctx.addIssue({
        code: "custom",
        path: ["entrada"],
        message: "Entrada e saida iguais: seriam 24h ou nenhuma",
      });
    }

    if (lerFolgas(dados.folgas, dados.diasCiclo) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["folgas"],
        message: `Use as posicoes do ciclo, de 1 a ${dados.diasCiclo}, e deixe ao menos um dia de trabalho`,
      });
    }
  });

/** O dono da vigencia. `vigenciaId` vazio significa "e uma nova". */
export const donoDaVigenciaSchema = z.object({
  funcaoId: idFuncaoSchema,
  vigenciaId: z.union([z.uuid("Vigencia invalida"), z.literal("")]).transform((v) => v || null),
});

export const removerVigenciaSchema = z.object({
  vigenciaId: z.uuid("Vigencia invalida"),
});

/**
 * O id viaja num schema separado dos campos: `extend()` nao existe depois de um
 * `superRefine`, e — mais importante — `flattenError` de um objeto aninhado
 * devolveria todos os erros sob a chave do aninhamento, longe do campo que
 * falhou. Duas metades, cada uma com os proprios erros por campo.
 */
export const criarFuncaoSchema = z.object({
  postoId: idPostoSchema,
});

export const atualizarFuncaoSchema = z.object({
  funcaoId: idFuncaoSchema,
  ativa: z.boolean(),
});

/** Mesma razao de `buscaEscalasSchema`: busca torta nao merece tela de erro. */
export const buscaPostosSchema = z.string().trim().max(80).catch("");

/**
 * A pessoa escolhida no campo de busca: `f:<uuid>`, que e o que `CampoPessoa`
 * posta. So funcionario — freelancer nao tem cadastro de folha a que a
 * mensagem de ponto se refira. Vazio vira `null`.
 */
const funcionarioEscolhidoSchema = z
  .string()
  .trim()
  .transform((valor) => valor || null)
  .refine(
    (valor) =>
      valor === null || (valor.startsWith("f:") && z.uuid().safeParse(valor.slice(2)).success),
    "Escolha um funcionario da lista",
  )
  .transform((valor) => (valor === null ? null : valor.slice(2)));

/** Vazio tira o responsavel — e assim que se desfaz uma escolha errada. */
export const definirResponsavelSchema = z.object({
  postoId: idPostoSchema,
  responsavel: funcionarioEscolhidoSchema,
});

export const incluirNoGrupoSchema = z.object({
  postoId: idPostoSchema,
  pessoa: funcionarioEscolhidoSchema.pipe(z.string("Escolha um funcionario")),
});

export const retirarDoGrupoSchema = z.object({
  postoId: idPostoSchema,
  funcionarioId: z.uuid("Funcionario invalido"),
});

export type CriarPostoInput = z.infer<typeof criarPostoSchema>;
export type AtualizarPostoInput = z.infer<typeof atualizarPostoSchema>;
export type CamposDaFuncaoInput = z.infer<typeof camposDaFuncaoSchema>;
export type CamposDaVigenciaInput = z.infer<typeof camposDaVigenciaSchema>;
