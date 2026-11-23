import { customType } from "drizzle-orm/pg-core";

/**
 * Tipos de coluna que o Drizzle 0.45 nao traz prontos, compartilhados pelos
 * schemas que os usam.
 *
 * Fica fora de `index.ts` de proposito: nao e tabela nem enum, e o drizzle-kit
 * so precisa enxergar o que vira objeto no banco.
 */

/**
 * `bytea` como `Uint8Array`. O `pg` devolve `Buffer` (que ja e um
 * `Uint8Array`) — nenhuma conversao no caminho.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (valor) => Buffer.from(valor),
});
