import { z } from "zod";

import { ehDataValida } from "@/features/competencias/periodo";
import { idEmpresaSchema } from "@/features/funcionarios/schema";

import { IDS_DIVERGENCIA } from "./apuracao";
import { LIMITE_MENSAGEM } from "./mensagens";
import { IDS_STATUS_TRATATIVA } from "./tratativas";
import { MODOS_DA_CARGA } from "./types";

/**
 * Schemas de entrada do modulo de ponto. Ficam separados das actions para
 * poderem ser reaproveitados por testes e (futuramente) rotas de API.
 *
 * `idEmpresaSchema` vem de `funcionarios/schema.ts` em vez de ser reescrito:
 * duplicar a conferencia criaria duas versoes do mesmo criterio para elas
 * divergirem depois — mesmo motivo pelo qual `funcionarios` importa
 * `ehDataValida` de `competencias`.
 */

export const idFuncionarioSchema = z.uuid("Funcionario invalido");

/**
 * O termo da busca, vindo de `?busca=`. `catch("")` porque busca torta nao
 * merece tela de erro: `?busca` repetido chega como array e o parametro ausente
 * chega `undefined`; nos dois casos o resultado certo e "sem filtro".
 */
export const buscaPontoSchema = z.string().trim().max(120).catch("");

/** Pelo mesmo motivo, pagina torta e a primeira pagina, e nao um erro. */
export const paginaPontoSchema = z.coerce.number().int().min(1).catch(1);

/** `?empresa=` fora do formato uuid vale como "todas", e nao como erro de cast. */
export const filtroEmpresaSchema = z
  .uuid()
  .nullable()
  .catch(null)
  .transform((valor) => valor ?? null);

/** `?status=` fora do catalogo vale como "todos". */
export const filtroStatusSchema = z
  .enum(["sem_escala", "com_pendencia", "atencao", "conforme"])
  .nullable()
  .catch(null)
  .transform((valor) => valor ?? null);

/**
 * O codigo da empresa no relogio de ponto.
 *
 * Vem do arquivo, e nao de um campo digitado, mas passa pelo Zod do mesmo
 * jeito: a associacao e postada pelo formulario da previa, e formulario e
 * entrada do usuario como qualquer outra. O formato acompanha o `check` da
 * tabela — se divergir, a recusa vem do banco em vez de virar mensagem no campo.
 */
export const codigoDeEmpresaSchema = z
  .string()
  .trim()
  .min(1, "Informe o codigo da empresa no relogio")
  .max(20, "O codigo pode ter no maximo 20 caracteres")
  .regex(/^[0-9A-Za-z-]+$/, "O codigo aceita letras, numeros e hifen");

/**
 * O botao que enviou a importacao. Ausente (ou torto) e a previa: nada se grava
 * sem um dos dois modos dito de forma explicita.
 */
export const confirmacaoDaCargaSchema = z.enum(MODOS_DA_CARGA).nullable().catch(null);

/**
 * A associacao entre um codigo do relogio e uma empresa do portal. E o passo que
 * destrava a leitura do arquivo: sem ele a matricula nao identifica ninguem.
 */
export const associarEmpresaSchema = z.object({
  codigo: codigoDeEmpresaSchema,
  empresaId: idEmpresaSchema,
});

export type AssociarEmpresaInput = z.infer<typeof associarEmpresaSchema>;

/* -------------------------------------------------------------------------- */
/* Pendencias e tratativas                                                    */
/* -------------------------------------------------------------------------- */

/** `?tratativa=` fora do catalogo vale como "todos os status". */
export const filtroTratativaSchema = z
  .enum(IDS_STATUS_TRATATIVA)
  .nullable()
  .catch(null)
  .transform((valor) => valor ?? null);

/** `?gravidade=` fora do catalogo vale como "as duas". */
export const filtroGravidadeSchema = z
  .enum(["impeditiva", "atencao"])
  .nullable()
  .catch(null)
  .transform((valor) => valor ?? null);

/** `?tipo=` fora do catalogo vale como "todos os tipos". */
export const filtroTipoSchema = z
  .enum(IDS_DIVERGENCIA)
  .nullable()
  .catch(null)
  .transform((valor) => valor ?? null);

/**
 * A data de uma ocorrencia. Diferente dos filtros, aqui **nao** ha `catch`: ela
 * e parte da chave que identifica a ocorrencia, e uma data torta que virasse
 * "hoje" apontaria para o dia errado em silencio.
 */
export const dataDaOcorrenciaSchema = z
  .string()
  .trim()
  .refine(ehDataValida, "Informe uma data valida");

/** O tipo, tambem parte da chave: sem `catch`, pelo mesmo motivo. */
export const tipoDaOcorrenciaSchema = z.enum(IDS_DIVERGENCIA, { error: "Divergencia invalida" });

/** A chave de uma ocorrencia, como as actions e a rota a recebem. */
export const chaveDaOcorrenciaSchema = z.object({
  funcionarioId: idFuncionarioSchema,
  data: dataDaOcorrenciaSchema,
  tipo: tipoDaOcorrenciaSchema,
});

/**
 * O registro de uma tratativa: o status e o que se apurou.
 *
 * A observacao e opcional em quase tudo, mas obrigatoria para **descartar**: um
 * "isto nao era ocorrencia" sem motivo escrito e indistinguivel de alguem
 * limpando a fila, e e justamente o caso em que quem le depois precisa saber
 * por que o dia sumiu do painel.
 */
export const registrarTratativaSchema = chaveDaOcorrenciaSchema
  .extend({
    status: z.enum(IDS_STATUS_TRATATIVA, { error: "Escolha o status da tratativa" }),
    observacao: z
      .string()
      .trim()
      .max(2000, "A observacao pode ter no maximo 2000 caracteres")
      .transform((valor) => valor || null),
  })
  .superRefine((dados, ctx) => {
    if (dados.status === "descartada" && !dados.observacao) {
      ctx.addIssue({
        code: "custom",
        path: ["observacao"],
        message: "Escreva por que esta ocorrencia nao deve ser tratada",
      });
    }
  });

/**
 * A mensagem a enviar. So o **texto** vem do formulario: o destinatario e o
 * numero sao relidos do cadastro na hora do envio, porque quem o cliente diz
 * que vai receber nao e evidencia — a action e um POST publico como todas as
 * outras.
 */
export const enviarMensagemSchema = chaveDaOcorrenciaSchema.extend({
  conteudo: z
    .string()
    // O `<textarea>` normaliza as quebras de linha para CRLF ao enviar (e o que
    // a especificacao do HTML manda), e o modelo foi escrito com LF. Sem isto,
    // o texto gravado teria `\r` invisiveis que nao estavam no que se leu.
    .transform((valor) => valor.replaceAll("\r\n", "\n"))
    .pipe(
      z
        .string()
        .trim()
        .min(10, "Escreva a mensagem que o colaborador vai receber")
        .max(LIMITE_MENSAGEM, `A mensagem pode ter no maximo ${LIMITE_MENSAGEM} caracteres`),
    ),
});

/**
 * A confirmacao das escalas sugeridas: so a competencia em que a tela foi
 * desenhada e **quem** foi marcado. A escala e o inicio de ciclo de cada um
 * sao recalculados na action — um plano vindo do formulario gravaria a escala
 * que quisesse em quem quisesse.
 */
/**
 * O envio consolidado: de quem e, e — na confirmacao — a assinatura do texto
 * que a previa mostrou. O texto em si nao viaja: ele e refeito na action.
 */
export const enviarConsolidadoSchema = z.object({
  responsavelId: idFuncionarioSchema,
  assinatura: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
});

export const definirEscalasSugeridasSchema = z.object({
  competenciaId: z.uuid("Competencia invalida"),
  funcionarioIds: z.array(z.uuid()).min(1, "Selecione ao menos um funcionario"),
});

export type RegistrarTratativaInput = z.infer<typeof registrarTratativaSchema>;
export type EnviarMensagemInput = z.infer<typeof enviarMensagemSchema>;
