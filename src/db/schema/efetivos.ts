import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { funcionarios } from "./funcionarios";
import { postos } from "./postos";
import { freelancers } from "./preenchimento";
import { usuarios } from "./usuarios";

/**
 * O local dentro do posto onde a pessoa esta no dia: Portaria, Ronda, CFTV,
 * Zeladoria.
 *
 * Lista **global**, e nao por posto: todo posto ve todos os locais. Nao se
 * confunde com `funcoes_posto` — a funcao e o contrato do posto (ciclo,
 * vigencias, quem se substitui), por posto; o local e so o "onde" do lancamento
 * do efetivo, igual em toda a operacao. A ordem em que aparece no lancamento sai
 * do uso daquele posto, e nao de uma coluna daqui.
 *
 * Cadastro, e nao dado datado: nenhuma query chama `competenciaEmVigor()`.
 */
export const locais = pgTable(
  "locais",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nome: text("nome").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // "portaria" e "Portaria" sao o mesmo local para quem digita.
  (tabela) => [uniqueIndex("locais_nome_unico").on(sql`lower(${tabela.nome})`)],
);

/**
 * O que o tipo de excecao faz com o lancamento — e o que o formulario pede.
 *
 * Enum, e nao texto livre, porque decide comportamento: `cobertura` pede quem
 * faltou e conta a falta dessa pessoa; `troca` pede com quem trocou ou de que
 * posto veio; `falta_sem_cobertura` conta a falta de quem esta na linha e marca
 * o posto como descoberto; `simples` e so o tipo e a observacao. Tipo novo
 * escolhe um destes — e assim que a lista cresce sem migration.
 */
export const efetivoComportamentoEnum = pgEnum("efetivo_comportamento", [
  "falta_sem_cobertura",
  "cobertura",
  "troca",
  "simples",
]);

/**
 * Os tipos de excecao do lancamento de efetivo (Cobertura de falta, Troca
 * interna, Atestado...).
 *
 * Tabela propria, e nao `eventos`: eventos sao as siglas da grade (D, N, F),
 * com cor e natureza que decidem contagem no preenchimento. Misturar faria a
 * lista de excecoes oferecer "D" e "F", e a grade oferecer "Cobertura de falta".
 *
 * O comportamento **nao muda depois de criado**: ele decide como os lancamentos
 * ja gravados com o tipo sao lidos, e troca-lo reinterpretaria o passado.
 */
export const efetivoTipos = pgTable(
  "efetivo_tipos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rotulo: text("rotulo").notNull(),
    comportamento: efetivoComportamentoEnum("comportamento").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [uniqueIndex("efetivo_tipos_rotulo_unico").on(sql`lower(${tabela.rotulo})`)],
);

/**
 * Um lancamento de efetivo: quem esteve em que posto, em que local e em que
 * horario, num dia.
 *
 * **Dado datado, mas por data, e nao por competencia** — como os afastamentos.
 * O "copiar de D-2" do dia 21 busca o dia 19, que esta na competencia anterior,
 * e a consulta semanal atravessa a virada do periodo. Prender a linha a uma
 * competencia faria as duas perguntas esbarrarem na virada.
 *
 * A pessoa e um funcionario ou um freelancer, nunca os dois e nunca nenhum —
 * o mesmo par de colunas de `extras` e `preenchimento_linhas`.
 *
 * O horario e de relogio (`time`). Saida **menor** que a entrada e o turno que
 * vira o dia (19:00 -> 07:00). Igual e recusado pelo `check` — seria um turno
 * de zero ou de 24 horas, e nenhum dos dois e o que alguem quis digitar. A
 * duracao nao e coluna: sai de `duracaoEmMinutos()` a cada leitura, como nos
 * extras.
 *
 * A excecao (`tipo_id`) e opcional. Quando o tipo pede, a linha diz tambem a
 * **contraparte** (quem faltou, na cobertura; com quem trocou, na troca) ou o
 * posto de onde a pessoa veio. A falta de quem foi coberto **nao e outra
 * linha**: ela e lida da contraparte, e assim nao ha duas linhas a divergir.
 */
export const efetivos = pgTable(
  "efetivos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    data: date("data", { mode: "string" }).notNull(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "restrict" }),
    funcionarioId: uuid("funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "restrict" }),
    localId: uuid("local_id")
      .notNull()
      .references(() => locais.id, { onDelete: "restrict" }),
    horaEntrada: time("hora_entrada").notNull(),
    horaSaida: time("hora_saida").notNull(),
    tipoId: uuid("tipo_id").references(() => efetivoTipos.id, { onDelete: "restrict" }),
    contraparteFuncionarioId: uuid("contraparte_funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    contraparteFreelancerId: uuid("contraparte_freelancer_id").references(() => freelancers.id, {
      onDelete: "restrict",
    }),
    /** Na troca: o posto de onde a pessoa veio cobrir este. */
    postoOrigemId: uuid("posto_origem_id").references(() => postos.id, { onDelete: "restrict" }),
    observacao: text("observacao"),
    criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoPor: uuid("atualizado_por").references(() => usuarios.id, { onDelete: "set null" }),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    check(
      "efetivos_uma_pessoa",
      sql`(${tabela.funcionarioId} is null) <> (${tabela.freelancerId} is null)`,
    ),
    check(
      "efetivos_uma_contraparte",
      sql`${tabela.contraparteFuncionarioId} is null or ${tabela.contraparteFreelancerId} is null`,
    ),
    // Contraparte e posto de origem so existem numa excecao.
    check(
      "efetivos_detalhe_da_excecao",
      sql`${tabela.tipoId} is not null or (${tabela.contraparteFuncionarioId} is null and ${tabela.contraparteFreelancerId} is null and ${tabela.postoOrigemId} is null)`,
    ),
    check("efetivos_horario", sql`${tabela.horaEntrada} <> ${tabela.horaSaida}`),
    // A tela le "o posto no dia"; o painel le "o dia".
    index("efetivos_data_posto").on(tabela.data, tabela.postoId),
    // A ordem dos locais conta os lancamentos do posto por local.
    index("efetivos_posto_local").on(tabela.postoId, tabela.localId),
    // O mesmo lancamento nao entra duas vezes (o Enter apertado duas vezes).
    // Parciais porque uma das duas colunas de pessoa e sempre nula.
    uniqueIndex("efetivos_funcionario_unico")
      .on(tabela.data, tabela.postoId, tabela.funcionarioId, tabela.horaEntrada)
      .where(sql`${tabela.funcionarioId} is not null`),
    uniqueIndex("efetivos_freelancer_unico")
      .on(tabela.data, tabela.postoId, tabela.freelancerId, tabela.horaEntrada)
      .where(sql`${tabela.freelancerId} is not null`),
  ],
);

export type Local = typeof locais.$inferSelect;
export type EfetivoTipo = typeof efetivoTipos.$inferSelect;
export type Efetivo = typeof efetivos.$inferSelect;
export type EfetivoComportamento = (typeof efetivoComportamentoEnum.enumValues)[number];
