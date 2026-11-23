import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { usuarios } from "./usuarios";

/**
 * Sessoes persistidas no banco (e nao um JWT autocontido) para que logout,
 * troca de senha e desativacao de usuario revoguem o acesso na hora.
 *
 * O cookie carrega um token opaco aleatorio; aqui guardamos apenas o SHA-256
 * dele — um dump da tabela nao permite se passar por ninguem.
 */
export const sessoes = pgTable(
  "sessoes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index("sessoes_usuario_id_idx").on(tabela.usuarioId)],
);

export type Sessao = typeof sessoes.$inferSelect;
