"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Abas do Radix, no mesmo formato dos outros primitivos desta pasta.
 *
 * Escrito a mao em vez de `shadcn add tabs` so porque o CLI precisa de rede; a
 * estrutura segue `dropdown-menu.tsx` e `popover.tsx`, que ja embrulham o mesmo
 * pacote `radix-ui`. Se um dia o CLI gerar `tabs.tsx`, este arquivo pode ser
 * substituido sem cerimonia.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg p-1",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `data-[state=inactive]:hidden` e obrigatorio, e nao enfeite: com `forceMount`
 * esta versao do Radix mantem o painel inativo montado **sem** marcar `hidden`,
 * entao os dois apareceriam empilhados. Escondendo por CSS, o conteudo continua
 * no DOM — que e justamente o que `forceMount` existe para fazer: preservar o
 * que foi digitado e ainda nao salvo quando alguem so da uma olhada na outra
 * aba. Sem `forceMount` o Radix desmonta e a marcacao nao muda nada.
 */
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none data-[state=inactive]:hidden", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
