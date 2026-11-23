import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { sessoes } from "./sessoes";

/**
 * Situacao da competencia. So existe uma `aberta` por vez (indice parcial
 * abaixo): e ela que recebe todo dado novo. Abrir a proxima encerra a atual.
 */
export const competenciaStatusEnum = pgEnum("competencia_status", ["aberta", "encerrada"]);

/**
 * Competencia: a janela de tempo a que todo dado do portal pertence.
 *
 * As datas sao `date` (nao `timestamptz`) e trafegam como string `YYYY-MM-DD`
 * (`mode: "string"`): competencia e um intervalo de dias de calendario, e
 * converter para `Date` no meio do caminho so criaria a chance de o fuso
 * empurrar o dia 21 para o 20.
 */
export const competencias = pgTable(
  "competencias",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    dataInicio: date("data_inicio", { mode: "string" }).notNull(),
    dataFim: date("data_fim", { mode: "string" }).notNull(),
    /**
     * Primeiro dia do mes da data final — o mes que da nome a competencia
     * (21/07 a 21/08 = Agosto). Coluna gerada, e nao gravada pela aplicacao,
     * para que o nome nunca discorde do periodo: mudou `data_fim`, mudou o mes.
     * Existe como coluna (em vez de so no codigo) porque e sobre ela que roda o
     * indice unico que impede duas competencias do mesmo mes.
     */
    referencia: date("referencia", { mode: "string" }).generatedAlwaysAs(
      sql`(date_trunc('month', data_fim::timestamp))::date`,
    ),
    status: competenciaStatusEnum("status").notNull().default("aberta"),
    encerradaEm: timestamp("encerrada_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  () => [
    uniqueIndex("competencias_referencia_unica").on(sql`referencia`),
    // Indice parcial: a regra "existe no maximo uma competencia aberta" e do
    // banco, nao da action. Duas requisicoes simultaneas abrindo competencia
    // terminam com uma delas em erro de unicidade, e nao com o portal em dois
    // presentes ao mesmo tempo.
    uniqueIndex("competencias_unica_aberta")
      .on(sql`status`)
      .where(sql`status = 'aberta'`),
    check("competencias_periodo_valido", sql`data_fim > data_inicio`),
  ],
);

/**
 * Consulta a uma competencia encerrada: por uma sessao de login, a competencia
 * em vigor passa a ser outra — para ler **e** para gravar — sem mexer na
 * competencia aberta, que continua sendo a de todo mundo (e das outras sessoes
 * do mesmo usuario).
 *
 * Vive no banco, e nao em um cookie, porque decide em que periodo os dados sao
 * lidos e gravados: cookie e cliente, e cliente e adulteravel. Uma linha por
 * sessao — abrir outra consulta substitui a anterior — e ela morre com a sessao
 * (`cascade`): sair do portal devolve a competencia aberta sem ninguem lembrar
 * de encerrar nada.
 */
export const consultasCompetencia = pgTable(
  "consultas_competencia",
  {
    sessaoId: uuid("sessao_id")
      .primaryKey()
      .references(() => sessoes.id, { onDelete: "cascade" }),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "cascade" }),
    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index("consultas_competencia_competencia_idx").on(tabela.competenciaId)],
);

export type Competencia = typeof competencias.$inferSelect;
export type NovaCompetencia = typeof competencias.$inferInsert;
export type CompetenciaStatus = (typeof competenciaStatusEnum.enumValues)[number];
export type ConsultaCompetencia = typeof consultasCompetencia.$inferSelect;
