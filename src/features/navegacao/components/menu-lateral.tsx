"use client";

import { ChevronRight, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Area } from "@/features/acessos/areas";

import { iconesDeArea, iconesDeModulo } from "../icones";
import type { Modulo } from "../modulos";
import type { UsuarioDoMenu } from "../types";
import { MenuUsuario } from "./menu-usuario";

/**
 * Navegacao do portal: um modulo por linha, expansivel, com as opcoes que o
 * usuario pode abrir. O gerenciamento de acessos nao e modulo — vive no menu
 * que abre no nome do usuario, no rodape.
 *
 * Client Component por inteiro: depende de `usePathname` para marcar a rota
 * atual e de estado para abrir/fechar. Os dados chegam prontos do layout, que
 * ja filtrou tudo pelo que este usuario enxerga.
 */
export function MenuLateral({
  usuario,
  modulos,
  areasDaConta,
}: {
  usuario: UsuarioDoMenu;
  modulos: Modulo[];
  areasDaConta: Area[];
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <LayoutGrid aria-hidden />
                <span className="font-semibold">Portal TG</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Modulos</SidebarGroupLabel>
          {modulos.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1 text-xs">Nenhum modulo liberado ainda.</p>
          ) : (
            <SidebarMenu>
              {modulos.map((modulo) => (
                <ItemDeModulo key={modulo.id} modulo={modulo} pathname={pathname} />
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <MenuUsuario usuario={usuario} areasDaConta={areasDaConta} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function ItemDeModulo({ modulo, pathname }: { modulo: Modulo; pathname: string }) {
  const { setOpenMobile } = useSidebar();
  const contemRotaAtual = modulo.opcoes.some((opcao) => estaAtiva(pathname, opcao.href));
  const [aberto, setAberto] = useState(contemRotaAtual);
  const [rotaAnterior, setRotaAnterior] = useState(contemRotaAtual);

  // Quem chega a uma opcao por fora do menu (cards da home, URL digitada,
  // redirecionamento) encontra o modulo dela aberto. Fora isso, abrir e fechar
  // e do usuario — por isso estado, e nao `open` derivado do pathname.
  //
  // Ajuste durante o render, o padrao do React para "estado que reage a uma
  // prop": um efeito com `setState` renderiza duas vezes e o `react-hooks` do
  // eslint reprova.
  if (contemRotaAtual !== rotaAnterior) {
    setRotaAnterior(contemRotaAtual);

    if (contemRotaAtual) {
      setAberto(true);
    }
  }

  const IconeModulo = iconesDeModulo[modulo.id];

  return (
    <Collapsible asChild open={aberto} onOpenChange={setAberto}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={contemRotaAtual && !aberto}>
            <IconeModulo aria-hidden />
            <span>{modulo.rotulo}</span>
            <ChevronRight
              className="ml-auto transition-transform duration-200 group-data-[state=open]/menu-item:rotate-90"
              aria-hidden
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SidebarMenuSub>
            {modulo.opcoes.map((opcao) => {
              const IconeArea = iconesDeArea[opcao.id];

              return (
                <SidebarMenuSubItem key={opcao.id}>
                  <SidebarMenuSubButton asChild isActive={estaAtiva(pathname, opcao.href)}>
                    <Link href={opcao.href} onClick={() => setOpenMobile(false)}>
                      <IconeArea aria-hidden />
                      <span>{opcao.rotulo}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/** A rota da opcao esta ativa tambem nas telas filhas (`/acessos/novo`). */
function estaAtiva(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
