import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { acessos, sessoes, usuarios, type AreaPortal } from "@/db/schema";
import { podeAcessar } from "@/features/acessos/areas";

import { hashDoToken, lerTokenDaSessao } from "./session";
import { ROTA_LOGIN, ROTA_TROCA_SENHA, type UsuarioSessao } from "./types";

/**
 * Data Access Layer da autenticacao.
 *
 * Toda leitura/escrita protegida passa por `exigirUsuario()`. O `src/proxy.ts`
 * faz apenas uma checagem otimista (existe cookie?) para redirecionar cedo; a
 * validacao real — sessao viva, usuario ativo, senha ja trocada — e aqui,
 * o mais perto possivel do banco.
 *
 * `cache()` do React memoiza por render pass: layout, pagina e Server Actions
 * da mesma requisicao compartilham uma unica consulta.
 */
export const obterUsuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  // O `cookies()` la dentro ja tornaria a rota dinamica; mantido por
  // consistencia com a regra do projeto para queries nao cacheadas.
  await connection();

  const token = await lerTokenDaSessao();

  if (!token) {
    return null;
  }

  const [linha] = await db
    .select({
      id: usuarios.id,
      login: usuarios.login,
      nome: usuarios.nome,
      perfil: usuarios.perfil,
      senhaProvisoria: usuarios.senhaProvisoria,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(
      and(
        eq(sessoes.tokenHash, hashDoToken(token)),
        gt(sessoes.expiraEm, new Date()),
        eq(usuarios.ativo, true),
      ),
    )
    .limit(1);

  if (!linha) {
    return null;
  }

  // Consulta separada em vez de join: um join com `acessos` multiplicaria as
  // linhas da sessao por area. Como a DAL e memoizada, isso custa uma consulta
  // por requisicao, nao por chamada.
  const areas = await db
    .select({ area: acessos.area })
    .from(acessos)
    .where(eq(acessos.usuarioId, linha.id));

  return { ...linha, areas: areas.map((acesso) => acesso.area) };
});

type OpcoesExigirUsuario = {
  /**
   * Deixa passar quem ainda esta com senha provisoria. So a propria tela de
   * troca de senha usa isso — qualquer outra rota deve barrar.
   */
  permitirSenhaProvisoria?: boolean;
};

/** Garante uma sessao valida. Redireciona em vez de retornar `null`. */
export async function exigirUsuario({
  permitirSenhaProvisoria = false,
}: OpcoesExigirUsuario = {}): Promise<UsuarioSessao> {
  const usuario = await obterUsuarioAtual();

  if (!usuario) {
    redirect(ROTA_LOGIN);
  }

  if (usuario.senhaProvisoria && !permitirSenhaProvisoria) {
    redirect(ROTA_TROCA_SENHA);
  }

  return usuario;
}

/**
 * Guarda de autorizacao por area. Toda rota e toda Server Action de uma area
 * comeca por aqui — inclusive as que ja rodam sob um layout protegido, porque
 * layout nao roda em toda navegacao e Server Action nenhuma passa por ele.
 */
export async function exigirAcesso(area: AreaPortal): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();

  if (!podeAcessar(usuario, area)) {
    redirect("/");
  }

  return usuario;
}

/**
 * Guarda de autorizacao por perfil. Reservada ao que so administrador pode
 * fazer (promover/rebaixar outro administrador); o resto usa `exigirAcesso`.
 */
export async function exigirAdministrador(): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();

  if (usuario.perfil !== "administrador") {
    redirect("/");
  }

  return usuario;
}
