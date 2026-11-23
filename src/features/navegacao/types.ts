import type { PerfilUsuario } from "@/db/schema";

/**
 * O que o menu lateral precisa saber sobre quem esta logado. Um recorte de
 * `UsuarioSessao`: o menu e client, entao so atravessa a fronteira o que ele
 * de fato desenha.
 */
export type UsuarioDoMenu = {
  nome: string;
  login: string;
  perfil: PerfilUsuario;
};
