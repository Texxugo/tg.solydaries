"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { acessos, usuarios, type AreaPortal } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { encerrarSessoesDoUsuario } from "@/features/auth/session";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";
import { criarHashSenha, gerarSenhaProvisoria } from "@/lib/senha";

import { atualizarUsuarioSchema, criarUsuarioSchema, redefinirSenhaSchema } from "./schema";
import type { AtualizarUsuarioState, CriarUsuarioState, RedefinirSenhaState } from "./types";

/**
 * Escritas da gestao de acessos.
 *
 * Server Actions sao endpoints POST publicos: alem de revalidar a entrada com
 * Zod, cada uma refaz a checagem de acesso — o formulario esconder um campo nao
 * impede ninguem de postar esse campo na mao.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const AREA = "acessos" as const;

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";
const SO_ADMIN_ALTERA_ADMIN = "Somente um administrador pode alterar outro administrador.";
const SO_ADMIN_CONCEDE_ADMIN = "Somente um administrador pode conceder o perfil de administrador.";

function perfilPara(administrador: boolean) {
  return administrador ? ("administrador" as const) : ("usuario" as const);
}

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Substitui em bloco as areas do usuario: apaga o que saiu, grava o que ficou. */
async function gravarAreas(tx: Transacao, usuarioId: string, areas: AreaPortal[]) {
  await tx.delete(acessos).where(eq(acessos.usuarioId, usuarioId));

  if (areas.length > 0) {
    await tx.insert(acessos).values(areas.map((area) => ({ usuarioId, area })));
  }
}

export async function criarUsuario(
  _estadoAnterior: CriarUsuarioState,
  formData: FormData,
): Promise<CriarUsuarioState> {
  const autor = await exigirAcesso(AREA);

  const valores = {
    nome: String(formData.get("nome") ?? ""),
    login: String(formData.get("login") ?? ""),
  };

  const resultado = criarUsuarioSchema.safeParse({
    ...valores,
    // Checkbox nao marcado nao vai no FormData: a presenca do campo e o valor.
    administrador: formData.has("administrador"),
    areas: formData.getAll("areas"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      valores,
    };
  }

  const { nome, login, administrador, areas } = resultado.data;

  if (administrador && autor.perfil !== "administrador") {
    return { status: "error", mensagem: SO_ADMIN_CONCEDE_ADMIN, valores };
  }

  const senha = gerarSenhaProvisoria();
  // Hash fora da transacao: scrypt custa ~100ms e seguraria a conexao a toa.
  const senhaHash = await criarHashSenha(senha);

  try {
    const [existente] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.login, login))
      .limit(1);

    if (existente) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { login: ["Este login ja esta em uso"] },
        valores,
      };
    }

    await db.transaction(async (tx) => {
      const [criado] = await tx
        .insert(usuarios)
        .values({
          nome,
          login,
          perfil: perfilPara(administrador),
          senhaHash,
          // Nasce provisoria: a DAL barra o portal ate a troca no primeiro acesso.
          senhaProvisoria: true,
        })
        .returning({ id: usuarios.id });

      await gravarAreas(tx, criado.id, areas);
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { login: ["Este login ja esta em uso"] },
        valores,
      };
    }

    console.error("Falha ao cadastrar usuario", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return {
    status: "success",
    mensagem: `Usuario ${login} cadastrado.`,
    credenciais: { login, senha },
  };
}

export async function atualizarUsuario(
  _estadoAnterior: AtualizarUsuarioState,
  formData: FormData,
): Promise<AtualizarUsuarioState> {
  const autor = await exigirAcesso(AREA);

  const resultado = atualizarUsuarioSchema.safeParse({
    usuarioId: formData.get("usuarioId"),
    nome: formData.get("nome"),
    administrador: formData.has("administrador"),
    ativo: formData.has("ativo"),
    areas: formData.getAll("areas"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { usuarioId, nome, administrador, ativo, areas } = resultado.data;
  const autorEhAdministrador = autor.perfil === "administrador";
  const ehOProprioUsuario = usuarioId === autor.id;

  try {
    const [alvo] = await db
      .select({ perfil: usuarios.perfil, ativo: usuarios.ativo })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!alvo) {
      return { status: "error", mensagem: "Usuario nao encontrado." };
    }

    // Escalonamento de privilegio: quem nao e administrador pode gerenciar
    // areas, mas nao promove ninguem (nem a si mesmo) nem mexe em um admin.
    if (!autorEhAdministrador && alvo.perfil === "administrador") {
      return { status: "error", mensagem: SO_ADMIN_ALTERA_ADMIN };
    }

    if (!autorEhAdministrador && administrador) {
      return { status: "error", mensagem: SO_ADMIN_CONCEDE_ADMIN };
    }

    // Travas contra se trancar do lado de fora.
    if (ehOProprioUsuario && !ativo) {
      return { status: "error", mensagem: "Voce nao pode desativar a propria conta." };
    }

    if (ehOProprioUsuario && alvo.perfil === "administrador" && !administrador) {
      return {
        status: "error",
        mensagem: "Voce nao pode remover o proprio perfil de administrador.",
      };
    }

    // Administrador enxerga tudo mesmo sem a linha em `acessos`; os demais
    // ficariam sem como voltar a esta tela.
    if (ehOProprioUsuario && !autorEhAdministrador && !areas.includes(AREA)) {
      return { status: "error", mensagem: "Voce nao pode remover o proprio acesso a esta area." };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(usuarios)
        .set({ nome, perfil: perfilPara(administrador), ativo })
        .where(eq(usuarios.id, usuarioId));

      await gravarAreas(tx, usuarioId, areas);
    });

    // Desativar precisa derrubar o acesso na hora; perder uma area nao, porque
    // a DAL reconsulta os acessos a cada requisicao.
    if (alvo.ativo && !ativo) {
      await encerrarSessoesDoUsuario(usuarioId);
    }
  } catch (erro) {
    console.error("Falha ao atualizar acessos", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Acessos atualizados." };
}

export async function redefinirSenha(
  _estadoAnterior: RedefinirSenhaState,
  formData: FormData,
): Promise<RedefinirSenhaState> {
  const autor = await exigirAcesso(AREA);

  const resultado = redefinirSenhaSchema.safeParse({ usuarioId: formData.get("usuarioId") });

  if (!resultado.success) {
    return { status: "error", mensagem: "Usuario invalido." };
  }

  const { usuarioId } = resultado.data;

  if (usuarioId === autor.id) {
    return {
      status: "error",
      mensagem: "Para trocar a propria senha use a tela de troca de senha.",
    };
  }

  const senha = gerarSenhaProvisoria();

  try {
    const [alvo] = await db
      .select({ login: usuarios.login, perfil: usuarios.perfil })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!alvo) {
      return { status: "error", mensagem: "Usuario nao encontrado." };
    }

    if (autor.perfil !== "administrador" && alvo.perfil === "administrador") {
      return { status: "error", mensagem: SO_ADMIN_ALTERA_ADMIN };
    }

    await db
      .update(usuarios)
      .set({ senhaHash: await criarHashSenha(senha), senhaProvisoria: true })
      .where(eq(usuarios.id, usuarioId));

    // Mesma regra da troca de senha: senha nova invalida o que estava aberto.
    await encerrarSessoesDoUsuario(usuarioId);

    refresh();

    return {
      status: "success",
      mensagem: "Senha provisoria gerada.",
      credenciais: { login: alvo.login, senha },
    };
  } catch (erro) {
    console.error("Falha ao redefinir a senha", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }
}
