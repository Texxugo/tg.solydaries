import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { sessoes } from "@/db/schema";
import { env } from "@/lib/env";

import { NOME_COOKIE_SESSAO } from "./types";

/** Uma semana. Renovada a cada login; troca de senha invalida as demais. */
const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O cookie guarda o token em claro; o banco guarda so o digest. SHA-256 puro
 * (sem KDF) basta: o token ja tem 256 bits de entropia aleatoria, entao nao ha
 * o que forcar por dicionario como aconteceria com senha de usuario.
 */
function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashDoToken(token: string) {
  return digest(token);
}

/** Cria a sessao no banco e grava o cookie. So pode ser chamada de uma Server Action/Route Handler. */
export async function criarSessao(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);

  await db.insert(sessoes).values({ usuarioId, tokenHash: digest(token), expiraEm });

  const cookieStore = await cookies();
  cookieStore.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: expiraEm,
    path: "/",
  });
}

/** Le o token bruto do cookie. Retorna `undefined` quando nao ha cookie. */
export async function lerTokenDaSessao() {
  const cookieStore = await cookies();
  return cookieStore.get(NOME_COOKIE_SESSAO)?.value;
}

export async function apagarCookieDeSessao() {
  const cookieStore = await cookies();
  cookieStore.delete(NOME_COOKIE_SESSAO);
}

/**
 * Id da sessao desta requisicao, se o cookie apontar para uma sessao viva.
 * Serve a quem prende estado a sessao de login (a consulta de competencia),
 * e nao ao usuario — o mesmo usuario pode ter outras sessoes abertas.
 */
export async function idDaSessaoAtual(): Promise<string | null> {
  const token = await lerTokenDaSessao();

  if (!token) {
    return null;
  }

  const [linha] = await db
    .select({ id: sessoes.id })
    .from(sessoes)
    .where(and(eq(sessoes.tokenHash, digest(token)), gt(sessoes.expiraEm, new Date())))
    .limit(1);

  return linha?.id ?? null;
}

/** Remove a sessao atual do banco e limpa o cookie. */
export async function encerrarSessaoAtual() {
  const token = await lerTokenDaSessao();

  if (token) {
    await db.delete(sessoes).where(eq(sessoes.tokenHash, digest(token)));
  }

  await apagarCookieDeSessao();
}

/** Revoga todas as sessoes do usuario (usado apos a troca de senha). */
export async function encerrarSessoesDoUsuario(usuarioId: string) {
  await db.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId));
}
