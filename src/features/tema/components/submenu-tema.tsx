"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

import { TEMA_PADRAO, TEMAS, type Tema } from "../temas";

const ICONES: Record<Tema, LucideIcon> = {
  claro: Sun,
  escuro: Moon,
  sistema: Monitor,
};

/**
 * "Tema" no menu do usuario, com Claro, Escuro e Sistema.
 *
 * Mora dentro do dropdown, que so monta ao abrir: o `theme` do `next-themes` e
 * `undefined` no servidor, e ler ele fora de algo montado depois da hidratacao
 * faria o HTML do servidor divergir do primeiro render do cliente.
 */
export function SubmenuTema() {
  const { theme = TEMA_PADRAO, setTheme } = useTheme();
  const atual = TEMAS.find((tema) => tema.valor === theme) ?? TEMAS[TEMAS.length - 1];
  const IconeAtual = ICONES[atual.id];

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconeAtual aria-hidden />
        Tema
        <span className="text-muted-foreground ml-auto text-xs">{atual.rotulo}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {TEMAS.map((tema) => {
            const Icone = ICONES[tema.id];

            return (
              // `onSelect` com `preventDefault` deixa o menu aberto: quem esta
              // comparando os temas quer ver a troca sem reabrir o menu a cada um.
              <DropdownMenuRadioItem
                key={tema.id}
                value={tema.valor}
                onSelect={(evento) => evento.preventDefault()}
              >
                <Icone aria-hidden />
                {tema.rotulo}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
