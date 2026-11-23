import type { AreaPortal, PerfilUsuario } from "@/db/schema";

import type { LoginInput, TrocarSenhaInput } from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */
export type LoginState = {
  status: "idle" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof LoginInput, string[]>>;
  /**
   * React 19 reseta o formulario depois de uma Server Action. Devolvemos o
   * login digitado para que o campo volte preenchido apos um erro.
   */
  login?: string;
  /** Idem para o checkbox de lembrar o usuario. */
  lembrar?: boolean;
};

export const estadoInicialLogin: LoginState = { status: "idle" };

export type TrocarSenhaState = {
  status: "idle" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof TrocarSenhaInput, string[]>>;
};

export const estadoInicialTrocarSenha: TrocarSenhaState = { status: "idle" };

/** Dados do usuario autenticado expostos a UI (nunca o hash da senha). */
export type UsuarioSessao = {
  id: string;
  login: string;
  nome: string;
  perfil: PerfilUsuario;
  senhaProvisoria: boolean;
  /**
   * Areas concedidas individualmente. Administrador enxerga todas mesmo com a
   * lista vazia — quem decide isso e `podeAcessar()` em `features/acessos`.
   */
  areas: AreaPortal[];
};

export const rotulosPerfil: Record<PerfilUsuario, string> = {
  administrador: "Administrador",
  usuario: "Usuario",
};

/**
 * Nome do cookie de sessao. Fica aqui (e nao em `session.ts`) porque o
 * `src/proxy.ts` precisa dele e nao pode importar modulos `server-only`.
 */
export const NOME_COOKIE_SESSAO = "portal_tg_sessao";

/**
 * Cookie separado, com o login que o usuario pediu para lembrar. Nunca guarda
 * senha nem da acesso a nada: so preenche o campo na proxima visita, e por isso
 * sobrevive ao logout.
 */
export const NOME_COOKIE_LOGIN_LEMBRADO = "portal_tg_login_lembrado";

/** Rota para onde a DAL manda quem ainda esta com senha provisoria. */
export const ROTA_TROCA_SENHA = "/trocar-senha";
export const ROTA_LOGIN = "/login";
