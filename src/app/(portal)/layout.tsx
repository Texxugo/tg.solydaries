import { cookies } from "next/headers";

import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BotaoAjuda } from "@/features/ajuda/components/botao-ajuda";
import { exigirUsuario } from "@/features/auth/queries";
import { FaixaConsulta } from "@/features/competencias/components/faixa-consulta";
import { IndicadorCompetencia } from "@/features/competencias/components/indicador-competencia";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { MenuLateral } from "@/features/navegacao/components/menu-lateral";
import { areasDaConta, modulosVisiveis } from "@/features/navegacao/modulos";

/**
 * Cookie em que o `SidebarProvider` grava aberto/fechado. O nome e uma
 * constante privada de `components/ui/sidebar.tsx` (`SIDEBAR_COOKIE_NAME`);
 * repetido aqui para que o servidor ja renderize o menu no estado certo e nao
 * pisque no primeiro paint.
 */
const COOKIE_MENU = "sidebar_state";

/**
 * Grupo de rotas autenticadas. O `exigirUsuario()` aqui cobre o layout inteiro,
 * mas nao substitui a checagem nas paginas e Server Actions: layout nao roda em
 * toda navegacao e Server Action nenhuma passa por ele. Como a DAL e memoizada
 * com `cache()`, repetir a chamada custa uma consulta so por requisicao.
 */
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const usuario = await exigirUsuario();
  const cookieStore = await cookies();

  // O menu mostra so o que o usuario pode abrir. E conveniencia, nao seguranca:
  // quem digitar a URL de uma area nao liberada esbarra em `exigirAcesso()`.
  const modulos = modulosVisiveis(usuario);
  const opcoesDaConta = areasDaConta(usuario);

  // A competencia acompanha o portal inteiro: toda tela mostra dados de um
  // periodo, entao o periodo precisa estar visivel em toda tela.
  const vigor = await competenciaEmVigor();

  return (
    <SidebarProvider defaultOpen={cookieStore.get(COOKIE_MENU)?.value !== "false"}>
      <MenuLateral
        usuario={{ nome: usuario.nome, login: usuario.login, perfil: usuario.perfil }}
        modulos={modulos}
        areasDaConta={opcoesDaConta}
      />

      <SidebarInset>
        {/*
          Sem titulo aqui: o nome do portal ja esta no topo do menu lateral e
          cada pagina abre com o proprio <h1>. O que a barra carrega e o
          contexto que a pagina nao repete — qual competencia esta em vigor.
        */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
          <IndicadorCompetencia vigor={vigor} />
        </header>

        {/*
          Consulta temporaria muda o que TODA tela mostra. A faixa fica no
          layout para nao depender de cada pagina lembrar de avisar.
        */}
        {vigor?.temporaria ? <FaixaConsulta vigor={vigor} /> : null}

        {children}

        {/*
          No layout, e nao em cada pagina: toda tela ganha a ajuda da propria
          area sem precisar lembrar dela. O botao descobre a area pela URL. O
          respiro abaixo deixa o fim de cada pagina rolar para fora do botao.
        */}
        <div aria-hidden className="h-8 shrink-0" />
        <BotaoAjuda />
      </SidebarInset>
    </SidebarProvider>
  );
}
