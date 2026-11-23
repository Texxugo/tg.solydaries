import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Campo de escolha sobre o `<select>` do proprio navegador.
 *
 * Escrito a mao, e nao gerado pelo shadcn CLI: o `select` do shadcn e um menu
 * do Radix, que **exige JavaScript** para abrir e para enviar valor. Os campos
 * de empresa e de situacao aparecem em formularios que hoje funcionam por
 * progressive enhancement, e trocar um `<select>` nativo por um menu que nao
 * abre sem JS tiraria isso — a mesma preocupacao que ja esta registrada no
 * `CLAUDE.md` sobre o menu lateral e os checkboxes.
 *
 * A escolha da escala e a excecao: ela precisa de busca dentro da lista, que
 * `select` nenhum comporta, e por isso vive em `escalas/components/campo-escala.tsx`
 * como combobox — com a dependencia de JS que isso traz.
 *
 * O nome tambem e deliberado: `shadcn add select` gera `select.tsx`, e um
 * arquivo com outro nome nao e sobrescrito por engano.
 *
 * A aparencia acompanha `Input` de proposito — os dois aparecem lado a lado nos
 * mesmos formularios, e um campo com meio pixel de diferenca so chama atencao
 * para si.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { NativeSelect };
