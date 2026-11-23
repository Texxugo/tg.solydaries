import { z } from "zod";

import { ehDataValida } from "@/features/competencias/periodo";

import { IDS_TIPOS_AFASTAMENTO } from "./afastamentos";
import { ehCpfValido, normalizarCpf } from "./cpf";
import { ehTelefoneValido, normalizarTelefone } from "./telefone";

/**
 * Schemas de entrada do modulo de funcionarios. Ficam separados das actions
 * para poderem ser reaproveitados por testes e (futuramente) rotas de API.
 *
 * `ehDataValida` vem de `competencias/periodo.ts` — modulo puro, como este.
 * Duplicar a conferencia de data seria criar duas versoes do mesmo criterio
 * para elas divergirem depois; e o mesmo motivo pelo qual `navegacao` importa
 * `podeAcessar` de `acessos` em vez de reescreve-lo.
 */

const nomeSchema = z
  .string()
  .trim()
  .min(3, "O nome precisa de pelo menos 3 caracteres")
  .max(120, "O nome pode ter no maximo 120 caracteres");

/** O "Codigo" da folha. Texto, e nao numero: e um identificador, nao uma quantidade. */
const matriculaSchema = z
  .string()
  .trim()
  .min(1, "Informe a matricula")
  .max(20, "A matricula pode ter no maximo 20 caracteres");

/**
 * O CPF chega mascarado da tela e cru da planilha; normalizamos antes de
 * conferir para que os dois cheguem iguais ao banco, que guarda so os digitos.
 */
const cpfSchema = z
  .string()
  .trim()
  .transform(normalizarCpf)
  .refine(ehCpfValido, "Informe um CPF valido");

/** Campo opcional: o input vazio chega como "" e vira `null` na coluna. */
const cargoSchema = z
  .string()
  .trim()
  .max(80, "O cargo pode ter no maximo 80 caracteres")
  .transform((valor) => valor || null);

/**
 * O WhatsApp do colaborador. Opcional: a folha nao traz telefone, e obrigar
 * travaria a importacao — a mesma razao pela qual escala e inicio de ciclo sao
 * anulaveis. Normalizado antes de conferir para que o campo mascarado da tela e
 * um numero colado de outro lugar cheguem iguais ao banco, que guarda so os
 * digitos com DDI.
 */
const telefoneSchema = z
  .string()
  .trim()
  .transform((valor) => (valor ? normalizarTelefone(valor) : ""))
  .refine((valor) => valor === "" || ehTelefoneValido(valor), "Informe um telefone valido")
  .transform((valor) => valor || null);

/**
 * `<input type="date">` sempre posta `YYYY-MM-DD`, que e tambem o formato do
 * `date` no Postgres — a string atravessa sem conversao.
 */
const dataSchema = z.string().trim().refine(ehDataValida, "Informe uma data valida");

/** Data que pode nao ter sido informada: "" vira `null`, o resto e conferido. */
const dataOpcionalSchema = z
  .string()
  .trim()
  .refine((valor) => valor === "" || ehDataValida(valor), "Informe uma data valida")
  .transform((valor) => valor || null);

/**
 * O codigo de situacao da folha. O teto acompanha o `check` da tabela: a legenda
 * do relatorio vai ate 91, e o catalogo de `situacoes.ts` pode nao conhecer um
 * codigo novo sem que isso seja motivo para recusar o cadastro.
 */
const situacaoSchema = z.coerce
  .number({ error: "Informe a situacao" })
  .int("Informe um codigo de situacao inteiro")
  .min(1, "Situacao invalida")
  .max(99, "Situacao invalida");

export const idFuncionarioSchema = z.uuid("Funcionario invalido");
export const idEmpresaSchema = z.uuid("Empresa invalida");

/**
 * O termo da busca, vindo de `?busca=` — entrada do usuario como qualquer
 * outra, e por isso validada antes de virar filtro.
 *
 * `catch("")` porque busca torta nao merece tela de erro: `?busca` repetido
 * chega como array e o parametro ausente chega `undefined`; nos dois casos o
 * resultado certo e "sem filtro", e nao uma excecao. Mesma escolha de
 * `buscaEscalasSchema`.
 */
export const buscaFuncionariosSchema = z.string().trim().max(120).catch("");

/** Pelo mesmo motivo, pagina torta e a primeira pagina, e nao um erro. */
export const paginaFuncionariosSchema = z.coerce.number().int().min(1).catch(1);

/** `?empresa=` fora do formato uuid vale como "todas", e nao como erro de cast. */
export const filtroEmpresaSchema = z
  .uuid()
  .nullable()
  .catch(null)
  .transform((valor) => valor ?? null);

/** `?pendentes=1` liga o filtro; qualquer outra coisa o deixa desligado. */
export const filtroPendentesSchema = z
  .literal(["1", "true"])
  .transform(() => true)
  .catch(false);

/**
 * Escala e inicio de ciclo: os dois ou nenhum.
 *
 * A regra tambem existe como `check` no banco (`funcionarios_escala_com_inicio`)
 * — aqui ela vira mensagem no campo certo do formulario. Escala sem a data de
 * virada nao responde "hoje e dia de trabalho?", e a data sozinha nao tem ciclo
 * a comecar; a pendencia legitima e nao ter nenhum dos dois.
 */
const jornadaSchema = z.object({
  escalaId: z.union([z.uuid("Escala invalida"), z.literal("")]).transform((valor) => valor || null),
  inicioCiclo: dataOpcionalSchema,
});

function conferirJornada(
  dados: { escalaId: string | null; inicioCiclo: string | null },
  ctx: z.RefinementCtx,
) {
  if (dados.escalaId && !dados.inicioCiclo) {
    ctx.addIssue({
      code: "custom",
      path: ["inicioCiclo"],
      message: "Informe o dia em que o ciclo comeca a valer para esta pessoa",
    });
  }

  if (!dados.escalaId && dados.inicioCiclo) {
    ctx.addIssue({
      code: "custom",
      path: ["escalaId"],
      message: "Escolha a escala a que esta data se refere",
    });
  }
}

/**
 * Os dados que a folha conhece. Extraidos para que criar e atualizar validem
 * exatamente a mesma coisa: a edicao acrescenta id e situacao de cadastro,
 * nunca uma regra diferente.
 */
const dadosDoFuncionario = z.object({
  empresaId: idEmpresaSchema,
  matricula: matriculaSchema,
  nome: nomeSchema,
  cpf: cpfSchema,
  cargo: cargoSchema,
  telefone: telefoneSchema,
  admissao: dataOpcionalSchema,
  situacao: situacaoSchema,
});

/**
 * O cadastro manda dados e jornada no mesmo envio: nao ha a quem atribuir
 * escala antes de a pessoa existir. A jornada continua opcional aqui — quem
 * entra sem ela aparece na lista como pendencia.
 */
export const criarFuncionarioSchema = dadosDoFuncionario
  .extend(jornadaSchema.shape)
  .superRefine(conferirJornada);

/**
 * A edicao dos dados **nao** carrega jornada: sao dois formularios em telas
 * separadas, cada um com o seu botao. Se a jornada viajasse junto, salvar uma
 * correcao de cargo reenviaria escala e inicio de ciclo — e um campo que o
 * formulario por acaso nao desenhou chegaria vazio, apagando a jornada de quem
 * ja tinha uma.
 */
export const atualizarFuncionarioSchema = dadosDoFuncionario.extend({
  funcionarioId: idFuncionarioSchema,
  ativo: z.boolean(),
});

/**
 * A jornada de uma pessoa, na tela propria dela. Aceita o par vazio: e assim
 * que se **tira** a escala de alguem que a recebeu por engano — sem isso, a
 * unica saida seria o banco.
 */
export const definirJornadaSchema = z
  .object({ funcionarioId: idFuncionarioSchema, ...jornadaSchema.shape })
  .superRefine(conferirJornada);

/**
 * A atribuicao de escala em lote, feita da propria lista: o mesmo par
 * escala + inicio de ciclo para varias pessoas de uma vez.
 *
 * E o caminho normal depois de uma importacao — o relatorio da folha traz
 * centenas de pessoas e nenhuma escala, e quem faz a mesma jornada costuma
 * comecar o ciclo no mesmo dia. Aqui os dois campos sao obrigatorios: atribuir
 * em lote e justamente o ato de definir a jornada, entao "nenhum dos dois" nao
 * e uma opcao valida.
 */
export const atribuirEscalaSchema = z.object({
  escalaId: z.uuid("Escolha a escala"),
  inicioCiclo: dataSchema,
  funcionarios: z
    .array(idFuncionarioSchema)
    .min(1, "Selecione pelo menos um funcionario")
    .max(500, "Selecione no maximo 500 funcionarios por vez"),
});

export type CriarFuncionarioInput = z.infer<typeof criarFuncionarioSchema>;
export type AtualizarFuncionarioInput = z.infer<typeof atualizarFuncionarioSchema>;
export type DefinirJornadaInput = z.infer<typeof definirJornadaSchema>;
export type AtribuirEscalaInput = z.infer<typeof atribuirEscalaSchema>;

/**
 * Um periodo de afastamento: ferias, atestado ou INSS.
 *
 * As duas datas sao obrigatorias — e justamente o intervalo que a folha nao
 * informa e a apuracao precisa. `dataFim >= dataInicio` tambem e `check` no
 * banco; aqui a regra vira mensagem no campo certo.
 */
export const registrarAfastamentoSchema = z
  .object({
    funcionarioId: idFuncionarioSchema,
    tipo: z.enum(IDS_TIPOS_AFASTAMENTO, { error: "Escolha o tipo do afastamento" }),
    dataInicio: dataSchema,
    dataFim: dataSchema,
    observacao: z
      .string()
      .trim()
      .max(200, "A observacao pode ter no maximo 200 caracteres")
      .transform((valor) => valor || null),
  })
  // Datas ISO comparam como texto na mesma ordem em que comparam como data.
  .refine((periodo) => periodo.dataFim >= periodo.dataInicio, {
    path: ["dataFim"],
    error: "A data final nao pode ser anterior a inicial",
  });

export const removerAfastamentoSchema = z.object({
  afastamentoId: z.uuid("Afastamento invalido"),
});

export type RegistrarAfastamentoInput = z.infer<typeof registrarAfastamentoSchema>;
