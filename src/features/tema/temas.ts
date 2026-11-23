/**
 * Catalogo dos temas que o portal oferece. Modulo puro: e lido pelo provedor e
 * pelo menu do usuario, os dois client.
 *
 * "Sistema" e o padrao porque acompanha o claro/escuro do aparelho sem pedir
 * nada a ninguem; escolher claro ou escuro e o que fixa a aparencia.
 */
export type Tema = "claro" | "escuro" | "sistema";

/** Chave no `localStorage` em que o `next-themes` guarda a escolha. */
export const CHAVE_TEMA = "portal-tg-tema";

/** O valor que o `next-themes` entende para cada tema (`light`/`dark`/`system`). */
const VALOR_NEXT_THEMES: Record<Tema, string> = {
  claro: "light",
  escuro: "dark",
  sistema: "system",
};

const ROTULOS: Record<Tema, string> = {
  claro: "Claro",
  escuro: "Escuro",
  sistema: "Sistema",
};

export const TEMA_PADRAO = VALOR_NEXT_THEMES.sistema;

export const TEMAS = (Object.keys(ROTULOS) as Tema[]).map((id) => ({
  id,
  rotulo: ROTULOS[id],
  valor: VALOR_NEXT_THEMES[id],
}));
