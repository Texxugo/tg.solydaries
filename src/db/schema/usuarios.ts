import { sql } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Perfis de acesso. Enum no banco (e nao text livre) para que um perfil
 * invalido falhe no INSERT, nao so na validacao da aplicacao.
 */
export const perfilUsuarioEnum = pgEnum("perfil_usuario", ["administrador", "usuario"]);

export const usuarios = pgTable("usuarios", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** Identificador de login, sempre em minusculas (normalizado no Zod). */
  login: text("login").notNull().unique(),
  nome: text("nome").notNull(),
  perfil: perfilUsuarioEnum("perfil").notNull().default("usuario"),
  senhaHash: text("senha_hash").notNull(),
  /**
   * Marca a senha como provisoria. Enquanto for `true` a DAL redireciona
   * qualquer rota autenticada para `/trocar-senha`.
   */
  senhaProvisoria: boolean("senha_provisoria").notNull().default(true),
  ativo: boolean("ativo").notNull().default(true),
  ultimoAcessoEm: timestamp("ultimo_acesso_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
export type PerfilUsuario = (typeof perfilUsuarioEnum.enumValues)[number];
