import { z } from "zod";

import { ehDataValida } from "@/features/competencias/periodo";
import { ehHoraValida, formatarHora } from "@/features/escalas/jornada";

import { lerColaborador } from "./colaborador";
import { IDS_ORIGEM_DO_EXTRA, IDS_TIPO_DE_COLABORADOR } from "./types";

/**
 * Schemas de entrada do modulo de horas extras. Ficam separados das actions
 * para poderem ser reaproveitados por testes e (futuramente) rotas de API.
 *
 * Nada aqui toca o banco: quem confere se o dia cai dentro da competencia, se o
 * posto existe e se o colaborador esta ativo e a action — sao perguntas que so
 * o banco responde, e a resposta muda entre a validacao e a gravacao.
 */

export const idExtraSchema = z.uuid("Extra invalido");

const dataSchema = z
  .string()
  .trim()
  .refine(ehDataValida, "Informe a data em que o extra aconteceu");

/**
 * `<input type="time">` posta `HH:MM`; o `time` do Postgres devolve `HH:MM:SS`.
 * Normalizamos para `HH:MM` na entrada — a coluna completa os segundos — para
 * que a comparacao entre entrada e saida seja sempre entre iguais. Mesma regra
 * (e mesma razao) do `horaSchema` de escalas.
 */
const horaSchema = z
  .string()
  .trim()
  .refine(ehHoraValida, "Informe um horario valido")
  .transform(formatarHora);

/**
 * O local e digitado, e nao escolhido: e o complemento que o posto sozinho nao
 * da ("Portaria 2", "Fortaleza II"), e ele muda de nome antes de virar
 * cadastro.
 */
const localSchema = z
  .string()
  .trim()
  .min(2, "Informe o local em que o extra foi feito")
  .max(120, "O local pode ter no maximo 120 caracteres");

/** Campo opcional: o `textarea` vazio chega como "" e vira `null` na coluna. */
const observacaoSchema = z
  .string()
  .trim()
  .max(280, "A observacao pode ter no maximo 280 caracteres")
  .transform((valor) => valor || null);

/**
 * O nome de um freelancer que ainda nao tem cadastro. Opcional aqui e
 * obrigatorio no `superRefine` — ele so e exigido quando ninguem foi escolhido
 * na lista.
 */
const freelancerNomeSchema = z
  .string()
  .trim()
  .max(120, "O nome pode ter no maximo 120 caracteres")
  .transform((valor) => valor || null);

/**
 * Os campos que descrevem um extra, compartilhados pelo registro e pela edicao:
 * as duas telas descrevem a mesma coisa, e a edicao acrescenta um id — nunca
 * uma regra diferente.
 */
const camposDoExtra = z.object({
  data: dataSchema,
  /** `f:<id>` ou `l:<id>`, vazio quando o nome do freelancer vem digitado. */
  colaborador: z.string().trim(),
  freelancerNome: freelancerNomeSchema,
  postoId: z.uuid("Selecione o posto"),
  local: localSchema,
  horaEntrada: horaSchema,
  horaSaida: horaSchema,
  observacao: observacaoSchema,
});

type CamposDoExtra = z.infer<typeof camposDoExtra>;

/**
 * As regras que so aparecem com os campos juntos.
 *
 * O colaborador vem de um dos dois caminhos, nunca dos dois: escolhido na lista
 * (funcionario ou freelancer ja cadastrado) ou digitado como freelancer novo.
 * Com os dois preenchidos nao ha como saber qual deles a pessoa quis — e
 * escolher um por conta gravaria o extra no nome errado.
 */
function conferirExtra(dados: CamposDoExtra, ctx: z.RefinementCtx) {
  const escolhido = dados.colaborador ? lerColaborador(dados.colaborador) : null;

  if (dados.colaborador && !escolhido) {
    ctx.addIssue({ code: "custom", path: ["colaborador"], message: "Colaborador invalido" });
  } else if (!dados.colaborador && !dados.freelancerNome) {
    ctx.addIssue({
      code: "custom",
      path: ["colaborador"],
      message: "Escolha quem fez o extra ou informe o nome de um freelancer novo",
    });
  } else if (escolhido && dados.freelancerNome) {
    ctx.addIssue({
      code: "custom",
      path: ["freelancerNome"],
      message: "Ou escolha alguem da lista, ou informe um freelancer novo — nao os dois",
    });
  }

  if (dados.freelancerNome && dados.freelancerNome.length < 3) {
    ctx.addIssue({
      code: "custom",
      path: ["freelancerNome"],
      message: "Informe o nome do freelancer",
    });
  }

  // Mesma regra do `check extras_horario_valido`: entrada igual a saida seria
  // "24 horas ou nenhuma?" sem resposta. A virada da meia-noite continua
  // valendo — ela e lida do proprio par, como em escalas.
  if (dados.horaEntrada === dados.horaSaida) {
    ctx.addIssue({
      code: "custom",
      path: ["horaSaida"],
      message: "A saida precisa ser diferente da entrada",
    });
  }
}

export const registrarExtraSchema = camposDoExtra.superRefine(conferirExtra);

export const atualizarExtraSchema = camposDoExtra
  .extend({ extraId: idExtraSchema })
  .superRefine(conferirExtra);

export const excluirExtraSchema = z.object({ extraId: idExtraSchema });

/**
 * O termo da busca, vindo de `?busca=` — entrada do usuario como qualquer
 * outra, e por isso validada antes de virar filtro.
 *
 * `catch("")` porque busca torta nao merece tela de erro: `?busca` repetido
 * chega como array e o parametro ausente chega `undefined`; nos dois casos o
 * resultado certo e "sem filtro", e nao uma excecao. Mesma escolha da lista de
 * escalas.
 */
const buscaExtrasSchema = z.string().trim().max(80).catch("");

/**
 * Uma ponta do periodo filtrado (`?de=`, `?ate=`). Data impossivel ou campo
 * vazio viram `null` — "sem limite deste lado" —, e nao erro.
 */
const dataFiltroSchema = z.string().trim().refine(ehDataValida).nullable().catch(null);

/**
 * Os filtros da lista, lidos de uma vez dos `searchParams`.
 *
 * Cada campo tem o proprio `catch`, pelo mesmo motivo do termo de busca: filtro
 * torto e "sem esse filtro", e nao tela de erro — o `<select>` de "todos os
 * postos" posta `posto=` vazio, e isso nao e um uuid invalido, e a ausencia de
 * escolha. Um campo recusado nao derruba os outros.
 *
 * "De" depois de "ate" troca as pontas em vez de devolver uma lista vazia: quem
 * digitou 15/09 a 01/09 quis o intervalo entre as duas datas.
 *
 * A pagina segue a mesma regra: "pagina 0", "pagina abc" e pagina ausente sao
 * todas a primeira, e passar do fim a DAL prende na ultima.
 */
export const filtrosExtrasSchema = z
  .object({
    busca: buscaExtrasSchema,
    posto: z.uuid().nullable().catch(null),
    de: dataFiltroSchema,
    ate: dataFiltroSchema,
    tipo: z.enum(IDS_TIPO_DE_COLABORADOR).nullable().catch(null),
    origem: z.enum(IDS_ORIGEM_DO_EXTRA).nullable().catch(null),
    pagina: z.coerce.number().int().min(1).catch(1),
  })
  .transform(({ posto, de, ate, ...resto }) => {
    const invertido = de !== null && ate !== null && de > ate;

    return {
      ...resto,
      postoId: posto,
      de: invertido ? ate : de,
      ate: invertido ? de : ate,
    };
  });

export type RegistrarExtraInput = z.infer<typeof registrarExtraSchema>;
export type AtualizarExtraInput = z.infer<typeof atualizarExtraSchema>;
