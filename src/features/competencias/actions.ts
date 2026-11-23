"use server";

import { and, desc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { competencias, consultasCompetencia } from "@/db/schema";
import { exigirAcesso, exigirUsuario } from "@/features/auth/queries";
import { idDaSessaoAtual } from "@/features/auth/session";
import { levarGradeAdiante } from "@/features/preenchimento/virada";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";

import { formatarData, nomeDaCompetencia } from "./periodo";
import { abrirCompetenciaSchema, consultarCompetenciaSchema } from "./schema";
import { AREA_COMPETENCIAS, type AbrirCompetenciaState, type ConsultaState } from "./types";

/**
 * Escritas do modulo de competencias.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod e refaz a checagem de acesso — o formulario nao autoriza nada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

/**
 * Abre a proxima competencia e encerra a anterior na mesma transacao — que
 * tambem leva a escalacao dos postos para a nova (`levarGradeAdiante()`): as
 * mesmas pessoas nas mesmas funcoes, turmas e ordem, com os dias em branco.
 *
 * Nao existe "encerrar" avulso: o portal so trabalha com uma competencia aberta
 * e ficar sem nenhuma travaria toda escrita. Virar a competencia e um ato so.
 */
export async function abrirCompetencia(
  _estadoAnterior: AbrirCompetenciaState,
  formData: FormData,
): Promise<AbrirCompetenciaState> {
  await exigirAcesso(AREA_COMPETENCIAS);

  const valores = {
    dataInicio: String(formData.get("dataInicio") ?? ""),
    dataFim: String(formData.get("dataFim") ?? ""),
  };

  const resultado = abrirCompetenciaSchema.safeParse(valores);

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      valores,
    };
  }

  const { dataInicio, dataFim } = resultado.data;
  let levadas = 0;

  try {
    // A competencia mais recente por data final, aberta ou nao: o calendario
    // precisa seguir em frente sem buraco nem sobreposicao.
    const [ultima] = await db
      .select({ dataFim: competencias.dataFim })
      .from(competencias)
      .orderBy(desc(competencias.dataFim))
      .limit(1);

    if (ultima && dataInicio <= ultima.dataFim) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: {
          dataInicio: [
            `A competencia anterior vai ate ${formatarData(ultima.dataFim)}. Comece depois dessa data.`,
          ],
        },
        valores,
      };
    }

    levadas = await db.transaction(async (tx) => {
      // Encerra a atual antes de inserir: o indice parcial de unicidade so
      // admite uma linha com status 'aberta'.
      const [anterior] = await tx
        .update(competencias)
        .set({ status: "encerrada", encerradaEm: new Date() })
        .where(eq(competencias.status, "aberta"))
        .returning({ id: competencias.id, dataInicio: competencias.dataInicio });

      const [nova] = await tx
        .insert(competencias)
        .values({ dataInicio, dataFim, status: "aberta" })
        .returning({ id: competencias.id });

      // A escalacao dos postos segue para a nova competencia; o preenchimento
      // dos dias fica na que se encerrou.
      return anterior ? levarGradeAdiante(tx, anterior, nova.id) : 0;
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: {
          dataFim: [`Ja existe uma competencia de ${nomeDaCompetencia(dataFim)}.`],
        },
        valores,
      };
    }

    console.error("Falha ao abrir competencia", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return {
    status: "success",
    mensagem:
      `Competencia ${nomeDaCompetencia(dataFim)} aberta.` +
      (levadas > 0
        ? ` ${levadas} ${levadas === 1 ? "pessoa seguiu" : "pessoas seguiram"} na grade dos postos, com os dias em branco.`
        : ""),
  };
}

/**
 * Passa esta sessao a trabalhar numa competencia encerrada — lendo e gravando
 * nela — ate a consulta ser encerrada ou a sessao acabar. A competencia aberta
 * do portal nao muda: as outras pessoas, e as outras sessoes da mesma pessoa,
 * continuam nela.
 */
export async function consultarCompetencia(
  _estadoAnterior: ConsultaState,
  formData: FormData,
): Promise<ConsultaState> {
  await exigirAcesso(AREA_COMPETENCIAS);

  const resultado = consultarCompetenciaSchema.safeParse({
    competenciaId: formData.get("competenciaId"),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Competencia invalida." };
  }

  const { competenciaId } = resultado.data;

  try {
    const [alvo] = await db
      .select({ dataFim: competencias.dataFim, status: competencias.status })
      .from(competencias)
      .where(eq(competencias.id, competenciaId))
      .limit(1);

    if (!alvo) {
      return { status: "error", mensagem: "Competencia nao encontrada." };
    }

    // Consultar a competencia aberta seria pedir o que a sessao ja tem.
    if (alvo.status === "aberta") {
      return { status: "error", mensagem: "Esta competencia ja e a ativa do portal." };
    }

    const sessaoId = await idDaSessaoAtual();

    if (!sessaoId) {
      return { status: "error", mensagem: "Sessao encerrada. Entre de novo no portal." };
    }

    // Uma consulta por sessao: pedir outra substitui a anterior.
    await db
      .insert(consultasCompetencia)
      .values({ sessaoId, competenciaId })
      .onConflictDoUpdate({
        target: consultasCompetencia.sessaoId,
        set: { competenciaId, iniciadaEm: new Date() },
      });
  } catch (erro) {
    console.error("Falha ao iniciar consulta de competencia", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Consulta iniciada." };
}

/**
 * Encerra a consulta desta sessao, que volta a trabalhar na competencia aberta.
 *
 * Exige apenas sessao, e nao a area: voltar ao periodo corrente nao e
 * privilegio, e quem perdeu a area no meio da consulta tambem precisa voltar.
 */
export async function encerrarConsulta(
  _estadoAnterior: ConsultaState,
  formData: FormData,
): Promise<ConsultaState> {
  await exigirUsuario();

  const resultado = consultarCompetenciaSchema.safeParse({
    competenciaId: formData.get("competenciaId"),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Consulta invalida." };
  }

  const sessaoId = await idDaSessaoAtual();

  if (!sessaoId) {
    return { status: "error", mensagem: "Sessao encerrada. Entre de novo no portal." };
  }

  try {
    // Encerra a consulta que esta tela estava mostrando, e nao "a consulta da
    // sessao": se ela tiver sido trocada em outra aba, o delete nao pega nada e
    // o `refresh()` mostra a situacao real, em vez de derrubar a consulta que
    // acabou de ser aberta.
    await db
      .delete(consultasCompetencia)
      .where(
        and(
          eq(consultasCompetencia.sessaoId, sessaoId),
          eq(consultasCompetencia.competenciaId, resultado.data.competenciaId),
        ),
      );
  } catch (erro) {
    console.error("Falha ao encerrar consulta de competencia", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Consulta encerrada." };
}
