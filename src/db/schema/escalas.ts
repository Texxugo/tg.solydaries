import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Escala: a regra da jornada. Ela nao registra o que aconteceu — descreve o que
 * era para acontecer, e e contra ela que a marcacao de cada funcionario sera
 * interpretada (o que e trabalho previsto, o que e intervalo, o que sobra como
 * hora extra).
 *
 * Cadastro, e nao dado datado: escala nao pertence a uma competencia. Se
 * pertencesse, virar a competencia esvaziaria a lista e cada periodo comecaria
 * pedindo o recadastro das mesmas jornadas. Por isso nada aqui passa por
 * `competenciaEmVigor()`.
 */
export const escalas = pgTable(
  "escalas",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    /**
     * Horarios como `time` sem fuso: a escala diz "entra as 22h", nao "entra no
     * instante X". A string trafega como `HH:MM:SS`, mesmo raciocinio das datas
     * de `competencias` — nada aqui vira `Date` no meio do caminho.
     */
    entrada: time("entrada").notNull(),
    saida: time("saida").notNull(),
    /**
     * O tamanho do ciclo em dias — de quantos em quantos dias o padrao se
     * repete. Quais desses dias sao folga vive em `escala_folgas`.
     *
     * Guardar o tamanho e as posicoes de folga (em vez de "N trabalhados x M de
     * folga") e o que permite escala com folga que anda: o 6x1 cuja folga
     * alterna entre sabado e domingo e um ciclo de 14 dias com folga nos dias 7
     * e 13 — padrao que nenhum par de numeros descreve, porque os dias de folga
     * nao sao vizinhos.
     *
     * O ciclo e um padrao, nao um calendario: em que dia ele comeca a valer e
     * de cada funcionario, e nao da escala — a mesma 12x36 serve todas as
     * turmas.
     */
    diasCiclo: smallint("dias_ciclo").notNull().default(7),
    /** Intervalo de refeicao/descanso, em minutos. `0` = jornada sem intrajornada. */
    intrajornadaMinutos: integer("intrajornada_minutos").notNull().default(0),
    /**
     * Quantas batidas o dia deve ter. Sempre par — toda entrada tem a saida
     * correspondente: 2 para jornada corrida, 4 quando a intrajornada e marcada.
     * E o numero que denuncia marcacao faltando antes de qualquer calculo.
     */
    marcacoesEsperadas: smallint("marcacoes_esperadas").notNull().default(2),
    /** Hora extra ja prevista na escala, por dia trabalhado, em minutos. */
    horasExtrasMinutos: integer("horas_extras_minutos").notNull().default(0),
    /**
     * Se a jornada atravessa a meia-noite. **Coluna gerada**, nunca digitada:
     * virada e consequencia dos horarios (sai antes de entrar = virou o dia), e
     * campo a parte so criaria a chance de a escala se contradizer — mesmo
     * motivo de `competencias.referencia`.
     */
    viradaTurno: boolean("virada_turno")
      .notNull()
      .generatedAlwaysAs(sql`(saida < entrada)`),
    /**
     * Escala nao e apagada, e desativada: ela sera referenciada pelas jornadas
     * ja interpretadas, e apagar reescreveria o passado. Inativa some das
     * escolhas novas e continua explicando o que ja foi calculado.
     */
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Nome e como a escala e escolhida nas outras telas: dois "12x36 Diurno"
    // que so diferem na caixa seriam dois nomes iguais para quem le.
    uniqueIndex("escalas_nome_unico").on(sql`lower(${tabela.nome})`),
    // Entrada igual a saida e ambiguo (jornada de 24h ou de zero?); exigir a
    // diferenca tambem e o que faz `virada_turno` ter uma resposta so.
    check("escalas_horario_valido", sql`saida <> entrada`),
    // O teto so barra digitacao: um ciclo de dois meses ja e mais longo do que
    // qualquer jornada contratada. "Sobrou pelo menos um dia trabalhado" nao
    // cabe aqui — depende de contar linhas de outra tabela, e por isso vive na
    // action, como a regra de `dia_ciclo` das excecoes.
    check("escalas_ciclo_valido", sql`dias_ciclo >= 1 and dias_ciclo <= 60`),
    check(
      "escalas_intrajornada_valida",
      sql`intrajornada_minutos >= 0 and intrajornada_minutos < 1440`,
    ),
    // Par, porque cada entrada tem uma saida; o teto evita erro de digitacao.
    check(
      "escalas_marcacoes_validas",
      sql`marcacoes_esperadas >= 2 and marcacoes_esperadas <= 8 and marcacoes_esperadas % 2 = 0`,
    ),
    check(
      "escalas_horas_extras_validas",
      sql`horas_extras_minutos >= 0 and horas_extras_minutos <= 720`,
    ),
  ],
);

/**
 * Os dias de folga do ciclo, um por linha. O que nao esta aqui e dia
 * trabalhado — a escala e uma regra de trabalho, e listar a excecao (a folga) e
 * mais curto e mais direto do que listar o comum.
 *
 * Posicoes, e nao "os ultimos N dias": e assim que cabe o 6x1 de folga
 * alternada (ciclo de 14 dias, folga nos dias 7 e 13), em que as folgas nao
 * ficam lado a lado. O 5x2 continua sendo o caso simples — ciclo de 7 com folga
 * nos dias 6 e 7.
 */
export const escalaFolgas = pgTable(
  "escala_folgas",
  {
    escalaId: uuid("escala_id")
      .notNull()
      .references(() => escalas.id, { onDelete: "cascade" }),
    diaCiclo: smallint("dia_ciclo").notNull(),
  },
  // A PK composta ja indexa `escala_id` (coluna a esquerda), que e como a
  // leitura sempre consulta, e impede a mesma folga duas vezes.
  (tabela) => [
    primaryKey({ columns: [tabela.escalaId, tabela.diaCiclo] }),
    // O teto acompanha o de `dias_ciclo`; o limite real e o da escala, e quem
    // confere e a action — `check` nao enxerga outra tabela.
    check("escala_folgas_dia_valido", sql`dia_ciclo >= 1 and dia_ciclo <= 60`),
  ],
);

/**
 * Dia do ciclo que nao segue o horario padrao da escala: o 5o dia de um 5x2 que
 * sai uma hora mais cedo, o dia de meio periodo, o dia com intervalo diferente.
 *
 * Preso a **posicao no ciclo** (1 = primeiro dia do ciclo), e nao ao dia da
 * semana: e o ciclo que diz o que e dia de trabalho, e a excecao so ajusta um
 * desses dias. Por isso `dia_ciclo` fica dentro de `escalas.dias_ciclo` e nunca
 * cai em um dia listado em `escala_folgas` — dia de folga nao tem horario a
 * ajustar. Regra da action, ja que `check` nao enxerga outra tabela.
 *
 * A linha descreve o dia **inteiro**, e nao so o que mudou: sem colunas
 * anulaveis nao existe "herdou ou sobrescreveu?" na hora de interpretar. E, pela
 * mesma logica, dia igual ao padrao nao vira linha nenhuma — excecao e o que
 * difere, e isso a action decide comparando, nao um campo que alguem marca.
 */
export const escalaExcecoes = pgTable(
  "escala_excecoes",
  {
    escalaId: uuid("escala_id")
      .notNull()
      .references(() => escalas.id, { onDelete: "cascade" }),
    diaCiclo: smallint("dia_ciclo").notNull(),
    entrada: time("entrada").notNull(),
    saida: time("saida").notNull(),
    intrajornadaMinutos: integer("intrajornada_minutos").notNull().default(0),
    marcacoesEsperadas: smallint("marcacoes_esperadas").notNull().default(2),
    horasExtrasMinutos: integer("horas_extras_minutos").notNull().default(0),
    /** Mesma coluna gerada da escala: o dia de excecao tambem pode virar o turno. */
    viradaTurno: boolean("virada_turno")
      .notNull()
      .generatedAlwaysAs(sql`(saida < entrada)`),
  },
  // A PK composta ja indexa `escala_id` (coluna a esquerda), que e como a
  // leitura sempre consulta, e impede duas excecoes para o mesmo dia do ciclo.
  (tabela) => [
    primaryKey({ columns: [tabela.escalaId, tabela.diaCiclo] }),
    // O teto acompanha o de `dias_ciclo`; o limite real e o da escala.
    check("escala_excecoes_dia_valido", sql`dia_ciclo >= 1 and dia_ciclo <= 60`),
    check("escala_excecoes_horario_valido", sql`saida <> entrada`),
    check(
      "escala_excecoes_intrajornada_valida",
      sql`intrajornada_minutos >= 0 and intrajornada_minutos < 1440`,
    ),
    check(
      "escala_excecoes_marcacoes_validas",
      sql`marcacoes_esperadas >= 2 and marcacoes_esperadas <= 8 and marcacoes_esperadas % 2 = 0`,
    ),
    check(
      "escala_excecoes_horas_extras_validas",
      sql`horas_extras_minutos >= 0 and horas_extras_minutos <= 720`,
    ),
  ],
);

export type Escala = typeof escalas.$inferSelect;
export type NovaEscala = typeof escalas.$inferInsert;
export type EscalaFolga = typeof escalaFolgas.$inferSelect;
export type EscalaExcecao = typeof escalaExcecoes.$inferSelect;
