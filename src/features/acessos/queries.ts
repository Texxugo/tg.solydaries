import "server-only";

import { asc, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { acessos, usuarios } from "@/db/schema";

import { idUsuarioSchema } from "./schema";
import type { UsuarioGerenciado } from "./types";

/**
 * Leituras da feature: chamadas por Server Components, nunca pelo client.
 *
 * `connection()` interrompe o prerender: sem ele o Next resolveria a query no
 * build e a pagina serviria dados congelados.
 */

const colunas = {
  id: usuarios.id,
  login: usuarios.login,
  nome: usuarios.nome,
  perfil: usuarios.perfil,
  ativo: usuarios.ativo,
  senhaProvisoria: usuarios.senhaProvisoria,
  ultimoAcessoEm: usuarios.ultimoAcessoEm,
  criadoEm: usuarios.criadoEm,
};

export async function listarUsuarios(): Promise<UsuarioGerenciado[]> {
  await connection();

  const linhas = await db.select(colunas).from(usuarios).orderBy(asc(usuarios.nome));

  if (linhas.length === 0) {
    return [];
  }

  // Duas consultas em vez de um join: o join repetiria os dados do usuario uma
  // vez por area e o agrupamento teria de acontecer aqui de qualquer forma.
  const concedidos = await db
    .select({ usuarioId: acessos.usuarioId, area: acessos.area })
    .from(acessos)
    .where(
      inArray(
        acessos.usuarioId,
        linhas.map((linha) => linha.id),
      ),
    );

  const porUsuario = Map.groupBy(concedidos, (acesso) => acesso.usuarioId);

  return linhas.map((linha) => ({
    ...linha,
    areas: porUsuario.get(linha.id)?.map((acesso) => acesso.area) ?? [],
  }));
}

/** `null` para id inexistente — e tambem para id que nem uuid e. */
export async function obterUsuario(id: string): Promise<UsuarioGerenciado | null> {
  await connection();

  // Sem essa validacao, um id fora do formato uuid faria o Postgres lancar
  // erro de cast em vez de simplesmente nao encontrar ninguem.
  const idValido = idUsuarioSchema.safeParse(id);

  if (!idValido.success) {
    return null;
  }

  const [linha] = await db.select(colunas).from(usuarios).where(eq(usuarios.id, idValido.data));

  if (!linha) {
    return null;
  }

  const concedidos = await db
    .select({ area: acessos.area })
    .from(acessos)
    .where(eq(acessos.usuarioId, linha.id));

  return { ...linha, areas: concedidos.map((acesso) => acesso.area) };
}
