import { pgEnum, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { usuarios } from "./usuarios";

/**
 * Areas do portal liberadas individualmente. Nao existem perfis nem cargos
 * predefinidos: cada usuario recebe exatamente a lista de areas que enxerga.
 *
 * Enum no banco (e nao text livre) pelo mesmo motivo de `perfil_usuario`: uma
 * area inexistente falha no INSERT, nao so na validacao da aplicacao. Criar uma
 * area nova exige migration aqui **e** a entrada correspondente no catalogo de
 * `src/features/acessos/areas.ts` — o `Record<AreaPortal, ...>` de la quebra o
 * typecheck enquanto o catalogo estiver incompleto.
 */
export const areaPortalEnum = pgEnum("area_portal", [
  "competencias",
  "acessos",
  "escalas",
  "funcionarios",
  "ponto",
  "postos",
  "eventos",
  "preenchimento",
  "extras",
  "apontamentos",
  "movimentacoes",
  "sinalizacoes",
  "efetivos",
]);

/**
 * Uma linha por area concedida. Modelar como tabela (e nao como coluna
 * `text[]`) mantem a integridade referencial: apagar o usuario leva os acessos
 * junto, e a PK composta impede a mesma area duas vezes.
 */
export const acessos = pgTable(
  "acessos",
  {
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    area: areaPortalEnum("area").notNull(),
    concedidoEm: timestamp("concedido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  // A PK composta ja indexa `usuario_id` (coluna a esquerda), que e como a DAL
  // consulta em toda requisicao. Nao precisa de indice extra.
  (tabela) => [primaryKey({ columns: [tabela.usuarioId, tabela.area] })],
);

export type Acesso = typeof acessos.$inferSelect;
export type AreaPortal = (typeof areaPortalEnum.enumValues)[number];
