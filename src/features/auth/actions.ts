"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { criarHashSenha, verificarSenha } from "@/lib/senha";

import { loginSchema, trocarSenhaSchema } from "./schema";
import { exigirUsuario } from "./queries";
import { esquecerLogin, lembrarLogin } from "./login-lembrado";
import { criarSessao, encerrarSessaoAtual, encerrarSessoesDoUsuario } from "./session";
import { ROTA_LOGIN, ROTA_TROCA_SENHA, type LoginState, type TrocarSenhaState } from "./types";

/**
 * Server Actions sao endpoints POST publicos: toda entrada e revalidada aqui,
 * mesmo que o formulario ja valide no client. Este arquivo so pode exportar
 * funcoes async (regra do "use server").
 */

/**
 * Hash descartavel usado quando o login nao existe: sem ele, o tempo de
 * resposta denunciaria quais usuarios estao cadastrados.
 */
const HASH_FICTICIO =
  "scrypt$16384$8$1$5hgV47NIXKkDzsPrpLSeAA==$ILzzkY0Iz7+laeYcjPDEpHdyoOeh/CP7B3f1VjUsKdl5h3R5GV6VJUf9KktuqKU8YUMYW7zLB+utkzqY8c7PCg==";

/** Mensagem unica para usuario inexistente, senha errada ou conta inativa. */
const CREDENCIAIS_INVALIDAS = "Usuario ou senha invalidos.";

/**
 * Aceita apenas caminhos internos: `//evil.com` e `https://evil.com` viram
 * `/`, fechando o open redirect via `?redirecionar=`.
 */
function destinoSeguro(valor: FormDataEntryValue | null) {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//")) {
    return "/";
  }

  return valor;
}

export async function entrar(_estadoAnterior: LoginState, formData: FormData): Promise<LoginState> {
  const loginDigitado = String(formData.get("login") ?? "");
  // Checkbox nao marcado nao vai no FormData: a presenca do campo e o valor.
  const lembrar = formData.has("lembrar");
  const resultado = loginSchema.safeParse({
    login: formData.get("login"),
    senha: formData.get("senha"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      login: loginDigitado,
      lembrar,
    };
  }

  const { login, senha } = resultado.data;
  let destino = destinoSeguro(formData.get("redirecionar"));

  try {
    const [usuario] = await db
      .select({
        id: usuarios.id,
        senhaHash: usuarios.senhaHash,
        senhaProvisoria: usuarios.senhaProvisoria,
        ativo: usuarios.ativo,
      })
      .from(usuarios)
      .where(eq(usuarios.login, login))
      .limit(1);

    const senhaConfere = await verificarSenha(senha, usuario?.senhaHash ?? HASH_FICTICIO);

    if (!usuario || !usuario.ativo || !senhaConfere) {
      return { status: "error", mensagem: CREDENCIAIS_INVALIDAS, login: loginDigitado, lembrar };
    }

    await criarSessao(usuario.id);
    await db
      .update(usuarios)
      .set({ ultimoAcessoEm: new Date() })
      .where(eq(usuarios.id, usuario.id));

    // Senha provisoria: nenhum destino vale antes da troca.
    if (usuario.senhaProvisoria) {
      destino = ROTA_TROCA_SENHA;
    }

    // So grava depois de autenticar: nao ha por que lembrar um login que nem
    // existe. O cookie sobrevive ao logout — e esse o ponto dele.
    if (lembrar) {
      await lembrarLogin(login);
    } else {
      await esquecerLogin();
    }
  } catch (erro) {
    console.error("Falha ao autenticar", erro);
    return {
      status: "error",
      mensagem: "Nao foi possivel entrar agora. Tente novamente.",
      login: loginDigitado,
      lembrar,
    };
  }

  // `redirect` lanca — precisa ficar fora do try/catch.
  redirect(destino);
}

export async function trocarSenha(
  _estadoAnterior: TrocarSenhaState,
  formData: FormData,
): Promise<TrocarSenhaState> {
  // A propria tela de troca e a unica rota liberada com senha provisoria.
  const sessao = await exigirUsuario({ permitirSenhaProvisoria: true });

  const resultado = trocarSenhaSchema.safeParse({
    senhaAtual: formData.get("senhaAtual"),
    novaSenha: formData.get("novaSenha"),
    confirmacao: formData.get("confirmacao"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { senhaAtual, novaSenha } = resultado.data;

  try {
    const [usuario] = await db
      .select({ senhaHash: usuarios.senhaHash })
      .from(usuarios)
      .where(eq(usuarios.id, sessao.id))
      .limit(1);

    if (!usuario || !(await verificarSenha(senhaAtual, usuario.senhaHash))) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { senhaAtual: ["Senha atual incorreta"] },
      };
    }

    await db
      .update(usuarios)
      .set({ senhaHash: await criarHashSenha(novaSenha), senhaProvisoria: false })
      .where(eq(usuarios.id, sessao.id));

    // Troca de senha revoga tudo que estava aberto; a sessao nova mantem
    // apenas este navegador logado.
    await encerrarSessoesDoUsuario(sessao.id);
    await criarSessao(sessao.id);
  } catch (erro) {
    console.error("Falha ao trocar a senha", erro);
    return { status: "error", mensagem: "Nao foi possivel trocar a senha. Tente novamente." };
  }

  redirect("/");
}

export async function sair() {
  // Sem sessao no banco nao ha o que apagar, mas o cookie cai de qualquer forma.
  await encerrarSessaoAtual();

  redirect(ROTA_LOGIN);
}
