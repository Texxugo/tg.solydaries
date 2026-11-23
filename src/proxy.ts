import { NextResponse, type NextRequest } from "next/server";

import { NOME_COOKIE_SESSAO, ROTA_LOGIN } from "@/features/auth/types";

/**
 * Checagem otimista: olha apenas se existe cookie de sessao, sem tocar no
 * banco. O proxy roda em toda navegacao (inclusive prefetch), entao consulta
 * aqui viraria gargalo — a validacao real fica na DAL
 * (`src/features/auth/queries.ts`), perto dos dados.
 *
 * Serve para dois ganhos: redirecionar cedo quem nem cookie tem e preservar o
 * destino original em `?redirecionar=`, coisa que a DAL nao consegue fazer
 * (Server Component nao enxerga o pathname).
 */
const ROTAS_PUBLICAS = new Set<string>([ROTA_LOGIN]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (ROTAS_PUBLICAS.has(pathname) || request.cookies.has(NOME_COOKIE_SESSAO)) {
    return NextResponse.next();
  }

  const destinoLogin = request.nextUrl.clone();
  destinoLogin.pathname = ROTA_LOGIN;
  destinoLogin.search = "";

  if (pathname !== "/") {
    destinoLogin.searchParams.set("redirecionar", `${pathname}${search}`);
  }

  return NextResponse.redirect(destinoLogin);
}

export const config = {
  /**
   * Fora do matcher: assets e `/api`. Route Handlers precisam checar a sessao
   * por conta propria — hoje so existe `/api/health`, que e publico.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
