"use client";

import { ChevronsUpDown, KeyRound, LogOut } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Area } from "@/features/acessos/areas";
import { sair } from "@/features/auth/actions";
import { rotulosPerfil } from "@/features/auth/types";
import { SubmenuTema } from "@/features/tema/components/submenu-tema";

import { iconesDeArea } from "../icones";
import type { UsuarioDoMenu } from "../types";

/** Id do form de logout, referenciado pelo botao de dentro do dropdown. */
const FORM_SAIR = "form-sair";

/**
 * Rodape do menu lateral: clicar no nome do usuario abre as opcoes da conta —
 * as areas que nao pertencem a modulo nenhum (hoje so acessos), a troca de
 * senha, o tema e o logout.
 */
export function MenuUsuario({
  usuario,
  areasDaConta,
}: {
  usuario: UsuarioDoMenu;
  areasDaConta: Area[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/*
          O form fica fora do dropdown e o botao o alcanca pelo atributo `form`:
          o item some junto com o menu no clique, e um form desmontado no meio
          do submit nao chega a Server Action. Logout e POST, nunca link — GET
          nao pode ter efeito colateral (um prefetch derrubaria a sessao).
        */}
        <form id={FORM_SAIR} action={sair} className="hidden" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium">
                {iniciais(usuario.nome)}
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{usuario.nome}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {usuario.perfil === "administrador" ? rotulosPerfil.administrador : usuario.login}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="grid leading-tight">
              <span className="truncate text-sm font-medium">{usuario.nome}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">
                {usuario.login}
              </span>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {areasDaConta.map((area) => {
              const Icone = iconesDeArea[area.id];

              return (
                <DropdownMenuItem key={area.id} asChild>
                  <Link href={area.href} onClick={() => setOpenMobile(false)}>
                    <Icone aria-hidden />
                    {area.rotulo}
                  </Link>
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuItem asChild>
              <Link href="/trocar-senha" onClick={() => setOpenMobile(false)}>
                <KeyRound aria-hidden />
                Trocar senha
              </Link>
            </DropdownMenuItem>

            <SubmenuTema />

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" form={FORM_SAIR} className="w-full">
                <LogOut aria-hidden />
                Sair
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Primeira e ultima inicial, para o quadradinho do rodape. */
function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.charAt(0) ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? "") : "";

  return `${primeira}${ultima}`.toUpperCase();
}
