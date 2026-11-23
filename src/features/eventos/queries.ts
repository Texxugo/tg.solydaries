import "server-only";

import { asc, desc, eq, ilike, or } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { eventos } from "@/db/schema";

import { idEventoSchema } from "./schema";
import type { EventoDaGrade, EventoResumo } from "./types";

/**
 * Leituras do catalogo de eventos: chamadas por Server Components, nunca pelo
 * client.
 *
 * `connection()` interrompe o prerender: sem ele o Next resolveria a query no
 * build e a pagina serviria dados congelados.
 *
 * Nenhuma consulta aqui filtra por competencia: evento e cadastro, e nao dado
 * datado — "F" nao muda de significado ao virar o periodo.
 */

const colunas = {
  id: eventos.id,
  codigo: eventos.codigo,
  rotulo: eventos.rotulo,
  descricao: eventos.descricao,
  natureza: eventos.natureza,
  cor: eventos.cor,
  exigeHorario: eventos.exigeHorario,
  exigePessoa: eventos.exigePessoa,
  exigeDestino: eventos.exigeDestino,
  exigeDiaTrabalhado: eventos.exigeDiaTrabalhado,
  padrao: eventos.padrao,
  ativo: eventos.ativo,
};

/** Mesmo escape de `listarEscalas`: sem ele, buscar "%" traria a tabela inteira. */
function padraoDeBusca(busca?: string) {
  const termo = busca?.trim();

  return termo ? `%${termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%` : null;
}

/**
 * O catalogo inteiro, ativos primeiro. Sem paginacao de proposito: o
 * vocabulario de uma operacao tem dezenas de siglas, e quem cadastra precisa
 * ver todas de uma vez para nao inventar a segunda sigla da mesma coisa.
 */
export async function listarEventos(busca?: string): Promise<EventoResumo[]> {
  await connection();

  const padrao = padraoDeBusca(busca);

  return db
    .select(colunas)
    .from(eventos)
    .where(
      padrao
        ? or(
            ilike(eventos.codigo, padrao),
            ilike(eventos.rotulo, padrao),
            ilike(eventos.descricao, padrao),
          )
        : undefined,
    )
    .orderBy(desc(eventos.ativo), asc(eventos.codigo));
}

/**
 * Os eventos que a grade oferece — so os ativos, so o que a celula precisa.
 *
 * Memoizada com `cache()` porque a pagina da grade a consulta uma vez para o
 * cabecalho, uma para a legenda e uma por bloco desenhado; sao dezenas de
 * linhas lidas uma vez por requisicao.
 */
export const listarEventosAtivos = cache(async (): Promise<EventoDaGrade[]> => {
  await connection();

  return db
    .select({
      id: eventos.id,
      codigo: eventos.codigo,
      rotulo: eventos.rotulo,
      natureza: eventos.natureza,
      cor: eventos.cor,
      exigeHorario: eventos.exigeHorario,
      exigePessoa: eventos.exigePessoa,
      exigeDestino: eventos.exigeDestino,
      exigeDiaTrabalhado: eventos.exigeDiaTrabalhado,
    })
    .from(eventos)
    .where(eq(eventos.ativo, true))
    .orderBy(asc(eventos.codigo));
});

/** `null` para id inexistente — e tambem para id que nem uuid e. */
export async function obterEvento(id: string): Promise<EventoResumo | null> {
  await connection();

  // Sem essa validacao, um id fora do formato uuid faria o Postgres lancar erro
  // de cast em vez de simplesmente nao encontrar nada.
  const idValido = idEventoSchema.safeParse(id);

  if (!idValido.success) {
    return null;
  }

  const [linha] = await db.select(colunas).from(eventos).where(eq(eventos.id, idValido.data));

  return linha ?? null;
}
