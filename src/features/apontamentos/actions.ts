"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { apontamentos, funcionarios } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { diasDoPeriodo } from "@/features/preenchimento/grade";

import { apontamentoVazio, RUBRICAS } from "./rubricas";
import {
  limparApontamentoSchema,
  salvarApontamentoSchema,
  type SalvarApontamentoInput,
} from "./schema";
import type {
  ErrosDoApontamento,
  LimparApontamentoState,
  SalvarApontamentoState,
  ValoresDoApontamento,
} from "./types";

/**
 * Escritas do modulo de apontamentos.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod, refaz a checagem de acesso e — porque o apontamento e dado datado —
 * comeca por `competenciaDeEscrita()`, com a competencia em que a tela foi
 * desenhada: o apontamento nao tem data propria que denuncie um formulario
 * aberto antes de a consulta ser encerrada, e sem essa conferencia ele cairia
 * na competencia aberta com os valores digitados olhando a anterior.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const AREA = "apontamentos" as const;

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

/**
 * O formulario chega inteiro como texto. Ler tudo antes de validar e o que
 * permite devolver o que foi digitado quando a validacao recusa.
 */
function lerValores(formData: FormData): ValoresDoApontamento {
  const valores = {
    observacao: String(formData.get("observacao") ?? ""),
  } as ValoresDoApontamento;

  for (const rubrica of RUBRICAS) {
    const valor = formData.get(rubrica.id);

    valores[rubrica.id] =
      rubrica.unidade === "sim_nao" ? (valor === "on" ? "on" : "") : String(valor ?? "");
  }

  return valores;
}

/**
 * Nenhuma rubrica em dias passa do tamanho da competencia aberta: 25 dias de VT
 * num periodo de 31 e possivel, 32 nao. O `check` do banco so conhece o teto de
 * 31; o periodo, so a action conhece.
 */
function conferirDias(
  apontamento: SalvarApontamentoInput,
  dias: number,
): ErrosDoApontamento | null {
  const erros: ErrosDoApontamento = {};

  for (const rubrica of RUBRICAS) {
    if (rubrica.unidade === "dias" && (apontamento[rubrica.id] as number) > dias) {
      erros[rubrica.id] = [`A competencia tem ${dias} dias`];
    }
  }

  const faltas = apontamento.faltasEscala + apontamento.faltasFolga;

  if (faltas > dias && !erros.faltasFolga) {
    erros.faltasFolga = [`As faltas somam ${faltas} dias, e a competencia tem ${dias}`];
  }

  return Object.keys(erros).length > 0 ? erros : null;
}

function recusa(
  valores: ValoresDoApontamento,
  erros?: ErrosDoApontamento,
  mensagem = "Confira os campos destacados.",
): SalvarApontamentoState {
  return { status: "error", mensagem, erros, valores, tentativa: crypto.randomUUID() };
}

/**
 * Grava o apontamento de um funcionario na competencia aberta — criando a linha
 * ou reescrevendo a que ja existia.
 *
 * O formulario desenha **todas** as rubricas, entao o envio e o apontamento
 * inteiro, e nao uma diferenca: campo vazio e zero. E pela mesma razao que
 * apontamento vazio **apaga** a linha, em vez de grava-la zerada — o `check
 * apontamentos_nao_vazio` recusaria, e a ausencia de linha ja diz "nada
 * apontado".
 *
 * A competencia e a aberta, e nao uma escolhida no formulario: o apontamento
 * nao tem data propria que a decida, e e para o fechamento do periodo corrente
 * que ele existe.
 */
export async function salvarApontamento(
  _estadoAnterior: SalvarApontamentoState,
  formData: FormData,
): Promise<SalvarApontamentoState> {
  const usuario = await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita(formData.get("competenciaId"));

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const valores = lerValores(formData);
  const resultado = salvarApontamentoSchema.safeParse({
    ...valores,
    funcionarioId: formData.get("funcionarioId"),
  });

  if (!resultado.success) {
    return recusa(valores, z.flattenError(resultado.error).fieldErrors);
  }

  const { competencia } = escrita;
  const dias = diasDoPeriodo(competencia.dataInicio, competencia.dataFim).length;
  const errosDeDias = conferirDias(resultado.data, dias);

  if (errosDeDias) {
    return recusa(valores, errosDeDias);
  }

  const { funcionarioId, ...apontamento } = resultado.data;
  const daPessoa = and(
    eq(apontamentos.competenciaId, competencia.id),
    eq(apontamentos.funcionarioId, funcionarioId),
  );

  try {
    // Inativo tambem aponta: quem saiu no meio do periodo ainda tem o que
    // receber. So o funcionario inexistente e recusado.
    const [funcionario] = await db
      .select({ nome: funcionarios.nome })
      .from(funcionarios)
      .where(eq(funcionarios.id, funcionarioId));

    if (!funcionario) {
      return recusa(valores, undefined, "Funcionario nao encontrado.");
    }

    if (apontamentoVazio(apontamento)) {
      const apagados = await db
        .delete(apontamentos)
        .where(daPessoa)
        .returning({ id: apontamentos.id });

      if (apagados.length === 0) {
        return recusa(valores, undefined, "Nada a gravar: todos os campos estao em branco.");
      }

      refresh();

      return {
        status: "success",
        mensagem: `Apontamento de ${funcionario.nome} removido: todos os campos ficaram em branco.`,
      };
    }

    await db
      .insert(apontamentos)
      .values({
        ...apontamento,
        competenciaId: competencia.id,
        funcionarioId,
        atualizadoPorId: usuario.id,
      })
      // O indice unico `(competencia, funcionario)` e o alvo: duas pessoas
      // salvando o mesmo apontamento ao mesmo tempo terminam com a ultima
      // gravacao, e nao com um erro de unicidade para uma delas.
      .onConflictDoUpdate({
        target: [apontamentos.competenciaId, apontamentos.funcionarioId],
        set: { ...apontamento, atualizadoPorId: usuario.id, atualizadoEm: new Date() },
      });
  } catch (erro) {
    console.error("Falha ao salvar apontamento", erro);
    return recusa(valores, undefined, FALHA_GENERICA);
  }

  refresh();

  return { status: "success", mensagem: "Apontamento salvo." };
}

/**
 * Apaga o apontamento da pessoa na competencia aberta.
 *
 * E outro gesto, e nao "esvaziar todos os campos e salvar" — mesma razao do
 * "Apagar este dia" da grade. O apontamento e uma **entrada**, como o extra e
 * o afastamento: lancado na pessoa errada, a linha continuaria dizendo a folha
 * que ha o que pagar.
 */
export async function limparApontamento(
  _estadoAnterior: LimparApontamentoState,
  formData: FormData,
): Promise<LimparApontamentoState> {
  await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita(formData.get("competenciaId"));

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = limparApontamentoSchema.safeParse({
    funcionarioId: formData.get("funcionarioId"),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Funcionario invalido." };
  }

  try {
    const apagados = await db
      .delete(apontamentos)
      .where(
        and(
          eq(apontamentos.competenciaId, escrita.competencia.id),
          eq(apontamentos.funcionarioId, resultado.data.funcionarioId),
        ),
      )
      .returning({ id: apontamentos.id });

    if (apagados.length === 0) {
      return { status: "error", mensagem: "Nao ha apontamento nesta competencia." };
    }
  } catch (erro) {
    console.error("Falha ao limpar apontamento", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  // A tela continua valendo — e a mesma pessoa, agora sem apontamento —, entao
  // `refresh()` e nao `redirect()`, ao contrario da exclusao de um extra.
  refresh();

  return { status: "success", mensagem: "Apontamento removido." };
}
