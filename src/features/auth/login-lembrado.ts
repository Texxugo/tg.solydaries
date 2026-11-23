import "server-only";

import { cookies } from "next/headers";

import { env } from "@/lib/env";

import { loginSchema } from "./schema";
import { NOME_COOKIE_LOGIN_LEMBRADO } from "./types";

/**
 * Cookie de conveniencia com o ultimo login usado, para preencher o campo na
 * proxima visita.
 *
 * Fica fora de `session.ts` de proposito: nao e credencial, nao autentica nada
 * e sobrevive ao logout — misturar com o ciclo de vida da sessao so confundiria
 * quem mexer depois. `httpOnly` mesmo assim: quem le e o Server Component da
 * tela de login, nao o navegador.
 */
const DURACAO_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Le e revalida com o mesmo schema do formulario. Cookie e entrada do usuario
 * como qualquer outra: um valor plantado (por subdominio, por exemplo) nao pode
 * virar `defaultValue` sem passar pela mesma regra.
 */
export async function lerLoginLembrado(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const valor = cookieStore.get(NOME_COOKIE_LOGIN_LEMBRADO)?.value;

  if (!valor) {
    return undefined;
  }

  const resultado = loginSchema.shape.login.safeParse(valor);

  return resultado.success ? resultado.data : undefined;
}

export async function lembrarLogin(login: string) {
  const cookieStore = await cookies();

  cookieStore.set(NOME_COOKIE_LOGIN_LEMBRADO, login, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: new Date(Date.now() + DURACAO_MS),
    path: "/",
  });
}

export async function esquecerLogin() {
  const cookieStore = await cookies();
  cookieStore.delete(NOME_COOKIE_LOGIN_LEMBRADO);
}
