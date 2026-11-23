"use client";

import { CircleHelp } from "lucide-react";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import type { SecaoDeAjuda } from "../conteudo";
import { ajudaDaRota } from "../rota";

/**
 * O botao fixo no canto inferior direito, e o painel que ele abre com a ajuda
 * da area aberta.
 *
 * Vive no layout do portal, e nao em cada pagina: toda tela ganha o botao sem
 * precisar lembrar dele. Por isso a area sai do `usePathname()`, e nao de uma
 * prop — o layout nao sabe que pagina esta desenhando.
 */
export function BotaoAjuda() {
  const { ajuda, nestaTela, demais } = ajudaDaRota(usePathname());

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon-lg"
          aria-label="Ajuda"
          title="Ajuda"
          className="fixed right-4 bottom-4 z-40 size-11 rounded-full shadow-lg"
        >
          <CircleHelp className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="flex items-center gap-2">
            <CircleHelp className="size-4" aria-hidden />
            Ajuda · {ajuda.titulo}
          </SheetTitle>
          <SheetDescription>{ajuda.resumo}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {nestaTela.map((secao) => (
            <Secao key={secao.titulo} secao={secao} nestaTela />
          ))}
          {demais.map((secao) => (
            <Secao key={secao.titulo} secao={secao} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Secao({ secao, nestaTela = false }: { secao: SecaoDeAjuda; nestaTela?: boolean }) {
  return (
    <section className="space-y-2">
      <h3 className="flex flex-wrap items-center gap-2 font-medium">
        {secao.titulo}
        {nestaTela ? <Badge variant="secondary">Nesta tela</Badge> : null}
      </h3>

      {secao.paragrafos?.map((paragrafo) => (
        <p key={paragrafo} className="text-muted-foreground leading-relaxed">
          {paragrafo}
        </p>
      ))}

      {secao.passos ? (
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 leading-relaxed">
          {secao.passos.map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
        </ol>
      ) : null}

      {secao.termos ? (
        <dl className="space-y-2">
          {secao.termos.map(({ termo, descricao }) => (
            <div key={termo}>
              <dt className="text-foreground font-medium">{termo}</dt>
              <dd className="text-muted-foreground leading-relaxed">{descricao}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {secao.notas?.map((nota) => (
        <p key={nota} className="text-muted-foreground leading-relaxed">
          {nota}
        </p>
      ))}
    </section>
  );
}
