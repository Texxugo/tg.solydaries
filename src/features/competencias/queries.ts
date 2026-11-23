import "server-only";

import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { competencias, consultasCompetencia } from "@/db/schema";
import { podeAcessar } from "@/features/acessos/areas";
import { obterUsuarioAtual } from "@/features/auth/queries";
import { idDaSessaoAtual } from "@/features/auth/session";

import {
  AREA_COMPETENCIAS,
  COMPETENCIA_MUDOU,
  SEM_COMPETENCIA_ABERTA,
  type CompetenciaEmVigor,
  type CompetenciaResumo,
} from "./types";

/**
 * DAL da base temporal do portal.
 *
 * Toda leitura de dado datado filtra pela competencia de `competenciaEmVigor()`
 * e toda escrita passa por `competenciaDeEscrita()`. E o mesmo arranjo da
 * autenticacao: a decisao mora perto do banco, e nao na pagina que por acaso
 * lembrou de filtrar.
 *
 * As tres funcoes memoizadas com `cache()` do React compartilham uma consulta
 * por requisicao entre layout, pagina e Server Actions.
 */

const colunas = {
  id: competencias.id,
  dataInicio: competencias.dataInicio,
  dataFim: competencias.dataFim,
  status: competencias.status,
  encerradaEm: competencias.encerradaEm,
};

/** A competencia que recebe todo dado novo. `null` antes da primeira. */
export const competenciaAberta = cache(async (): Promise<CompetenciaResumo | null> => {
  await connection();

  const [linha] = await db
    .select(colunas)
    .from(competencias)
    .where(eq(competencias.status, "aberta"))
    .limit(1);

  return linha ?? null;
});

/**
 * Consulta em andamento nesta sessao de login, se houver. Termina quando alguem
 * a encerra, quando a sessao acaba (logout, expiracao, troca de senha — a linha
 * vai junto por `cascade`) e tambem quando o usuario perde a area de
 * competencias, para que uma concessao revogada nao continue valendo.
 */
const consultaEmAndamento = cache(async (): Promise<CompetenciaEmVigor | null> => {
  await connection();

  const usuario = await obterUsuarioAtual();

  if (!usuario || !podeAcessar(usuario, AREA_COMPETENCIAS)) {
    return null;
  }

  const sessaoId = await idDaSessaoAtual();

  if (!sessaoId) {
    return null;
  }

  const [competencia] = await db
    .select(colunas)
    .from(consultasCompetencia)
    .innerJoin(competencias, eq(competencias.id, consultasCompetencia.competenciaId))
    .where(eq(consultasCompetencia.sessaoId, sessaoId))
    .limit(1);

  return competencia ? { competencia, temporaria: true } : null;
});

/**
 * A competencia em que esta sessao trabalha: a consultada, se houver consulta
 * em andamento, senao a competencia aberta do portal. `null` significa que
 * nao ha o que mostrar — e nao "mostre tudo".
 */
export const competenciaEmVigor = cache(async (): Promise<CompetenciaEmVigor | null> => {
  const consulta = await consultaEmAndamento();

  if (consulta) {
    return consulta;
  }

  const aberta = await competenciaAberta();

  return aberta ? { competencia: aberta, temporaria: false } : null;
});

export type ResultadoEscrita =
  { ok: true; competencia: CompetenciaResumo } | { ok: false; mensagem: string };

/**
 * Guarda de escrita: toda action que grava dado datado comeca por aqui, do
 * mesmo jeito que comeca por `exigirAcesso()`.
 *
 * Devolve resultado em vez de lancar porque quem chama e uma Server Action de
 * formulario: a recusa vira mensagem na tela, nao stack trace.
 *
 * Grava na competencia em vigor **desta sessao** — a consultada, durante uma
 * consulta. `esperada` e o id da competencia em que a tela foi desenhada:
 * sem ele, um formulario aberto antes de encerrar a consulta (em outra aba, por
 * exemplo) gravaria na competencia aberta dados digitados olhando a anterior.
 * As actions cuja entrada tem data ja se protegem pelo periodo; as que nao tem
 * (apontamento, inclusao na grade) mandam `esperada`.
 */
export async function competenciaDeEscrita(
  esperada?: FormDataEntryValue | null,
): Promise<ResultadoEscrita> {
  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return { ok: false, mensagem: SEM_COMPETENCIA_ABERTA };
  }

  if (esperada !== undefined && esperada !== vigor.competencia.id) {
    return { ok: false, mensagem: COMPETENCIA_MUDOU };
  }

  return { ok: true, competencia: vigor.competencia };
}

/** Todas as competencias, da mais recente para a mais antiga. */
export async function listarCompetencias(): Promise<CompetenciaResumo[]> {
  await connection();

  return db.select(colunas).from(competencias).orderBy(desc(competencias.dataFim));
}
