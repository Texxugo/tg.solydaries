import { z } from "zod";

import {
  duracaoEmMinutos,
  ehHoraValida,
  formatarDuracao,
  formatarHora,
  listarDias,
} from "./jornada";

/**
 * Schemas de entrada do modulo de escalas. Ficam separados das actions para
 * poderem ser reaproveitados por testes e (futuramente) rotas de API.
 */

const nomeSchema = z
  .string()
  .trim()
  .min(3, "O nome precisa de pelo menos 3 caracteres")
  .max(80, "O nome pode ter no maximo 80 caracteres");

/** Campo opcional: o `textarea` vazio chega como "" e vira `null` na coluna. */
const descricaoSchema = z
  .string()
  .trim()
  .max(280, "A descricao pode ter no maximo 280 caracteres")
  .transform((valor) => valor || null);

/**
 * `<input type="time">` posta `HH:MM`; o `time` do Postgres devolve `HH:MM:SS`.
 * Normalizamos para `HH:MM` na entrada — a coluna completa os segundos — para
 * que a comparacao entre entrada e saida seja sempre entre iguais.
 */
const horaSchema = z
  .string()
  .trim()
  .refine(ehHoraValida, "Informe um horario valido")
  .transform(formatarHora);

/** Campo numerico de formulario chega como string — inclusive vazia. */
function minutosSchema(maximo: number, rotulo: string) {
  return z.coerce
    .number({ error: `Informe ${rotulo} em minutos` })
    .int(`Informe ${rotulo} em minutos inteiros`)
    .min(0, "O valor nao pode ser negativo")
    .max(maximo, `O valor nao pode passar de ${formatarDuracao(maximo)}`);
}

/** Par, porque cada entrada tem a saida correspondente. */
const marcacoesSchema = z.coerce
  .number({ error: "Informe a quantidade de marcacoes" })
  .int("Informe um numero inteiro de marcacoes")
  .min(2, "Sao no minimo 2 marcacoes por dia")
  .max(8, "Sao no maximo 8 marcacoes por dia")
  .refine((valor) => valor % 2 === 0, "A quantidade precisa ser par: toda entrada tem uma saida");

export const idEscalaSchema = z.uuid("Escala invalida");

/**
 * O termo da busca, vindo de `?busca=` — entrada do usuario como qualquer
 * outra, e por isso validada antes de virar filtro.
 *
 * `catch("")` porque busca torta nao merece tela de erro: `?busca` repetido
 * chega como array e o parametro ausente chega `undefined`; nos dois casos o
 * resultado certo e "sem filtro", e nao uma excecao.
 */
export const buscaEscalasSchema = z.string().trim().max(80).catch("");

/**
 * A pagina pedida em `?pagina=`. Pelo mesmo motivo do termo de busca, nada aqui
 * lanca: "pagina 0", "pagina abc" e pagina ausente sao todas a primeira. Passar
 * do fim tambem nao e erro — a DAL prende o valor na ultima pagina existente.
 */
export const paginaEscalasSchema = z.coerce.number().int().min(1).catch(1);

/**
 * Os campos que descrevem a jornada. Extraidos para que criar e atualizar
 * validem exatamente a mesma coisa: a edicao acrescenta id e situacao, nunca
 * uma regra diferente.
 */
const camposDaEscala = z.object({
  nome: nomeSchema,
  descricao: descricaoSchema,
  entrada: horaSchema,
  saida: horaSchema,
  /** De quantos em quantos dias o padrao se repete. */
  diasCiclo: z.coerce
    .number({ error: "Informe o tamanho do ciclo" })
    .int("Informe um numero inteiro de dias")
    .min(1, "O ciclo precisa de pelo menos 1 dia")
    .max(60, "O ciclo pode ter no maximo 60 dias"),
  /**
   * As posicoes de folga dentro do ciclo. Lista vazia e valida (escala sem
   * folga no ciclo); o que nao pode e folga em todo dia — nem a posicao cair
   * fora do ciclo. As duas coisas dependem de `diasCiclo` e por isso sao
   * conferidas no `superRefine` abaixo.
   */
  folgas: z
    .array(z.coerce.number().int().min(1).max(60), { error: "Marque as folgas do ciclo" })
    .transform((dias) => [...new Set(dias)].sort((a, b) => a - b)),
  intrajornadaMinutos: minutosSchema(720, "a intrajornada"),
  marcacoesEsperadas: marcacoesSchema,
  horasExtrasMinutos: minutosSchema(720, "as horas extras"),
});

/** O que uma jornada precisa ter para ser conferida — a escala e o dia de excecao. */
type JornadaConferivel = { entrada: string; saida: string; intrajornadaMinutos: number };

/**
 * As duas regras que so aparecem com os campos juntos. Elas tambem existem como
 * `check` no banco (`escalas_horario_valido`) ou seriam impossiveis de calcular
 * la; aqui viram mensagem no campo certo do formulario.
 */
function conferirJornada(dados: JornadaConferivel, ctx: z.RefinementCtx) {
  if (dados.entrada === dados.saida) {
    ctx.addIssue({
      code: "custom",
      path: ["saida"],
      message: "A saida precisa ser diferente da entrada",
    });

    return;
  }

  const duracao = duracaoEmMinutos(dados.entrada, dados.saida);

  if (dados.intrajornadaMinutos >= duracao) {
    ctx.addIssue({
      code: "custom",
      path: ["intrajornadaMinutos"],
      message: `A jornada dura ${formatarDuracao(duracao)}: a intrajornada precisa ser menor.`,
    });
  }
}

/**
 * O ciclo so faz sentido inteiro: folga fora do ciclo nunca aconteceria, e
 * ciclo todo de folga nao e escala — e a ausencia de uma.
 */
function conferirCiclo(dados: { diasCiclo: number; folgas: number[] }, ctx: z.RefinementCtx) {
  const forade = dados.folgas.filter((dia) => dia > dados.diasCiclo);

  if (forade.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["folgas"],
      message: `O ciclo tem ${dados.diasCiclo} dias: ${listarDias(forade)} nao existe nele.`,
    });

    return;
  }

  if (dados.folgas.length >= dados.diasCiclo) {
    ctx.addIssue({
      code: "custom",
      path: ["folgas"],
      message: "O ciclo precisa de pelo menos um dia trabalhado.",
    });
  }
}

export const criarEscalaSchema = camposDaEscala.superRefine((dados, ctx) => {
  conferirJornada(dados, ctx);
  conferirCiclo(dados, ctx);
});

export const atualizarEscalaSchema = camposDaEscala
  .extend({
    escalaId: idEscalaSchema,
    ativa: z.boolean(),
  })
  .superRefine((dados, ctx) => {
    conferirJornada(dados, ctx);
    conferirCiclo(dados, ctx);
  });

/**
 * Um dia do ciclo, como o formulario de dias o envia. Mesma forma da escala
 * menos nome e ciclo: o dia descreve a jornada inteira, e nao "o que mudou".
 *
 * Nada aqui diz se o dia e excecao — quem decide e a action, comparando com o
 * padrao. Dia igual ao padrao nao vira linha no banco.
 */
export const jornadaDoDiaSchema = z
  .object({
    entrada: horaSchema,
    saida: horaSchema,
    intrajornadaMinutos: minutosSchema(720, "a intrajornada"),
    marcacoesEsperadas: marcacoesSchema,
    horasExtrasMinutos: minutosSchema(720, "as horas extras"),
  })
  .superRefine(conferirJornada);

export const definirDiasDoCicloSchema = z.object({
  escalaId: idEscalaSchema,
});

export type CriarEscalaInput = z.infer<typeof criarEscalaSchema>;
export type AtualizarEscalaInput = z.infer<typeof atualizarEscalaSchema>;
export type JornadaDoDiaInput = z.infer<typeof jornadaDoDiaSchema>;
