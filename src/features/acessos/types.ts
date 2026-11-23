import type { AreaPortal, PerfilUsuario } from "@/db/schema";

import type { AtualizarUsuarioInput, CriarUsuarioInput } from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/** Usuario como a tela de acessos o enxerga. Nunca inclui o hash da senha. */
export type UsuarioGerenciado = {
  id: string;
  login: string;
  nome: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  senhaProvisoria: boolean;
  ultimoAcessoEm: Date | null;
  criadoEm: Date;
  areas: AreaPortal[];
};

/**
 * Credencial recem-gerada. Volta pelo estado do formulario para ser exibida
 * uma unica vez: o portal guarda so o hash e nao tem como mostra-la de novo.
 */
export type CredenciaisProvisorias = {
  login: string;
  senha: string;
};

export type CriarUsuarioState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof CriarUsuarioInput, string[]>>;
  credenciais?: CredenciaisProvisorias;
  /**
   * React 19 reseta o formulario depois de uma Server Action. Devolvemos o que
   * foi digitado para que os campos voltem preenchidos apos um erro.
   */
  valores?: { nome: string; login: string };
};

export const estadoInicialCriarUsuario: CriarUsuarioState = { status: "idle" };

export type AtualizarUsuarioState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof AtualizarUsuarioInput, string[]>>;
};

export const estadoInicialAtualizarUsuario: AtualizarUsuarioState = { status: "idle" };

export type RedefinirSenhaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  credenciais?: CredenciaisProvisorias;
};

export const estadoInicialRedefinirSenha: RedefinirSenhaState = { status: "idle" };

/** Rota da area de gestao de acessos. */
export const ROTA_ACESSOS = "/acessos";
