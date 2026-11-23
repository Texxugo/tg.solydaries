"use client";

import { ThemeProvider } from "next-themes";

import { CHAVE_TEMA, TEMA_PADRAO } from "../temas";

/**
 * O script que aplica o tema antes do primeiro paint so precisa rodar no HTML
 * do servidor. No cliente o React 19 acusa (em dev) todo `<script>` executavel
 * renderizado por componente — e o `next-themes` 0.4 o renderiza dos dois
 * lados. Com `text/plain` no cliente ele vira texto inerte; a diferenca de
 * atributo na hidratacao ja e suprimida pela propria biblioteca.
 */
const PROPS_DO_SCRIPT =
  typeof window === "undefined" ? undefined : ({ type: "text/plain" } as const);

/**
 * Aplica o tema escolhido como a classe `dark` no `<html>`, que e o que o
 * `@custom-variant dark` do `globals.css` le.
 *
 * A escolha vive no `localStorage` do navegador, e nao no banco: e preferencia
 * de aparelho (o mesmo usuario quer o escuro no notebook e o claro no monitor
 * da portaria), vale tambem na tela de login — antes de haver sessao — e o
 * script do `next-themes` a aplica antes do primeiro paint, sem piscar.
 *
 * `disableTransitionOnChange` porque toda superficie do portal tem `transition`
 * em cor: sem ele a troca seria uma onda de animacoes desencontradas.
 */
export function ProvedorTema({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={TEMA_PADRAO}
      enableSystem
      storageKey={CHAVE_TEMA}
      disableTransitionOnChange
      scriptProps={PROPS_DO_SCRIPT}
    >
      {children}
    </ThemeProvider>
  );
}
