import "server-only";

import { and, asc, between, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";

import { db } from "@/db";
import {
  efetivoTipos,
  efetivos,
  freelancers,
  funcionarios,
  locais,
  postos,
  usuarios,
} from "@/db/schema";
import { diaAnterior, diaSeguinte } from "@/features/competencias/periodo";
import { duracaoEmMinutos, formatarHora, temViradaDeTurno } from "@/features/escalas/jornada";

import { conflitosDoDia, type Turno } from "./conflitos";

import type {
  ItemDoCatalogo,
  LancamentoDoPeriodo,
  PainelDoDia,
  LancamentoDoDia,
  LocalDoPosto,
  PostoDoLancamento,
  TipoDoLancamento,
} from "./types";

/**
 * Leituras do modulo de efetivos: chamadas por Server Components, nunca pelo
 * client.
 *
 * Locais e tipos de excecao sao cadastro, e nao dado datado — nenhuma consulta
 * deles filtra por competencia.
 */

/** Todos os locais, ativos primeiro e em ordem alfabetica. */
export async function listarLocais(): Promise<ItemDoCatalogo[]> {
  await connection();

  return db
    .select({ id: locais.id, nome: locais.nome, ativo: locais.ativo })
    .from(locais)
    .orderBy(desc(locais.ativo), asc(sql`lower(${locais.nome})`));
}

/** Todos os tipos de excecao, ativos primeiro e em ordem alfabetica. */
export async function listarTiposDeExcecao(): Promise<ItemDoCatalogo[]> {
  await connection();

  return db
    .select({
      id: efetivoTipos.id,
      nome: efetivoTipos.rotulo,
      ativo: efetivoTipos.ativo,
      comportamento: efetivoTipos.comportamento,
    })
    .from(efetivoTipos)
    .orderBy(desc(efetivoTipos.ativo), asc(sql`lower(${efetivoTipos.rotulo})`));
}

/** Os postos ativos, pelo codigo — e o codigo que se digita no lancamento. */
export async function listarPostosDoLancamento(): Promise<PostoDoLancamento[]> {
  await connection();

  return db
    .select({ id: postos.id, codigo: postos.codigo, nome: postos.nome })
    .from(postos)
    .where(eq(postos.ativo, true))
    .orderBy(asc(postos.codigo));
}

/**
 * Os locais ativos na ordem do lancamento daquele posto: os mais usados nele
 * primeiro (contagem dos lancamentos anteriores), depois os demais em ordem
 * alfabetica. Sem historico no posto, tudo empata em zero e sai alfabetico.
 *
 * A contagem e de todo o historico do posto, e nao de uma janela: o volume e de
 * dezenas de linhas por dia, e o indice `efetivos_posto_local` responde.
 */
export async function listarLocaisDoPosto(postoId: string | null): Promise<LocalDoPosto[]> {
  await connection();

  const nome = asc(sql`lower(${locais.nome})`);

  if (!postoId) {
    // Sem posto, nao ha uso a contar. E a ordem nao pode ser `order by 0`: o
    // Postgres le numero solto no ORDER BY como posicao de coluna.
    return db
      .select({ id: locais.id, nome: locais.nome, usos: sql<number>`0` })
      .from(locais)
      .where(eq(locais.ativo, true))
      .orderBy(nome);
  }

  const usos = sql<number>`(
    select count(*)::int from ${efetivos}
    where ${efetivos.postoId} = ${postoId} and ${efetivos.localId} = ${locais.id}
  )`;

  return db
    .select({ id: locais.id, nome: locais.nome, usos })
    .from(locais)
    .where(eq(locais.ativo, true))
    .orderBy(desc(usos), nome);
}

const criador = alias(usuarios, "criador");
const editor = alias(usuarios, "editor");
const contraparteFuncionario = alias(funcionarios, "contraparte_funcionario");
const contraparteFreelancer = alias(freelancers, "contraparte_freelancer");
const postoOrigem = alias(postos, "posto_origem");

/**
 * Os tipos de excecao que o formulario oferece: os ativos, mais os que algum
 * lancamento do dia ja usa (desativado depois, ele ainda precisa aparecer na
 * edicao daquela linha).
 */
export async function listarTiposDoLancamento(usados: string[]): Promise<TipoDoLancamento[]> {
  await connection();

  return db
    .select({
      id: efetivoTipos.id,
      rotulo: efetivoTipos.rotulo,
      comportamento: efetivoTipos.comportamento,
      ativo: efetivoTipos.ativo,
    })
    .from(efetivoTipos)
    .where(
      usados.length > 0
        ? or(eq(efetivoTipos.ativo, true), inArray(efetivoTipos.id, usados))
        : eq(efetivoTipos.ativo, true),
    )
    .orderBy(asc(sql`lower(${efetivoTipos.rotulo})`));
}

/** Os lancamentos do posto no dia, por horario de entrada e nome. */
export async function listarLancamentosDoDia(
  data: string,
  postoId: string,
): Promise<LancamentoDoDia[]> {
  return listarLancamentos({ de: data, ate: data, postoId });
}

/**
 * Os lancamentos de um intervalo de datas, de um posto ou de todos — a mesma
 * leitura da lista do dia e da consulta semanal, para as duas nunca divergirem
 * no que mostram de um lancamento. Ordem: data, posto, entrada, nome.
 */
export async function listarLancamentos(filtro: {
  de: string;
  ate: string;
  postoId?: string | null;
}): Promise<LancamentoDoPeriodo[]> {
  await connection();

  const linhas = await db
    .select({
      id: efetivos.id,
      data: efetivos.data,
      postoId: efetivos.postoId,
      postoCodigo: postos.codigo,
      postoNome: postos.nome,
      funcionarioId: efetivos.funcionarioId,
      freelancerId: efetivos.freelancerId,
      nomeFuncionario: funcionarios.nome,
      matricula: funcionarios.matricula,
      nomeFreelancer: freelancers.nome,
      codigoFreelancer: freelancers.codigo,
      localId: efetivos.localId,
      local: locais.nome,
      entrada: efetivos.horaEntrada,
      saida: efetivos.horaSaida,
      criadoPor: criador.nome,
      criadoEm: efetivos.criadoEm,
      atualizadoPor: editor.nome,
      atualizadoEm: efetivos.atualizadoEm,
      tipoId: efetivos.tipoId,
      tipo: efetivoTipos.rotulo,
      comportamento: efetivoTipos.comportamento,
      contraparteFuncionarioId: efetivos.contraparteFuncionarioId,
      contraparteFuncionarioNome: contraparteFuncionario.nome,
      contraparteFreelancerId: efetivos.contraparteFreelancerId,
      contraparteFreelancerNome: contraparteFreelancer.nome,
      postoOrigemId: efetivos.postoOrigemId,
      postoOrigemCodigo: postoOrigem.codigo,
      observacao: efetivos.observacao,
    })
    .from(efetivos)
    .innerJoin(postos, eq(postos.id, efetivos.postoId))
    .innerJoin(locais, eq(locais.id, efetivos.localId))
    .leftJoin(funcionarios, eq(funcionarios.id, efetivos.funcionarioId))
    .leftJoin(freelancers, eq(freelancers.id, efetivos.freelancerId))
    .leftJoin(criador, eq(criador.id, efetivos.criadoPor))
    .leftJoin(editor, eq(editor.id, efetivos.atualizadoPor))
    .leftJoin(efetivoTipos, eq(efetivoTipos.id, efetivos.tipoId))
    .leftJoin(
      contraparteFuncionario,
      eq(contraparteFuncionario.id, efetivos.contraparteFuncionarioId),
    )
    .leftJoin(contraparteFreelancer, eq(contraparteFreelancer.id, efetivos.contraparteFreelancerId))
    .leftJoin(postoOrigem, eq(postoOrigem.id, efetivos.postoOrigemId))
    .where(
      and(
        between(efetivos.data, filtro.de, filtro.ate),
        filtro.postoId ? eq(efetivos.postoId, filtro.postoId) : undefined,
      ),
    )
    .orderBy(
      asc(efetivos.data),
      asc(postos.codigo),
      asc(efetivos.horaEntrada),
      asc(sql`lower(coalesce(${funcionarios.nome}, ${freelancers.nome}))`),
    );

  return linhas.map((linha) => {
    const freelancer = linha.freelancerId !== null;
    const entrada = formatarHora(linha.entrada);
    const saida = formatarHora(linha.saida);

    return {
      id: linha.id,
      data: linha.data,
      posto: { id: linha.postoId, codigo: linha.postoCodigo, nome: linha.postoNome },
      pessoa: freelancer ? `l:${linha.freelancerId}` : `f:${linha.funcionarioId}`,
      nome: (freelancer ? linha.nomeFreelancer : linha.nomeFuncionario) ?? "",
      identificacao: freelancer ? linha.codigoFreelancer : linha.matricula,
      freelancer,
      localId: linha.localId,
      local: linha.local,
      entrada,
      saida,
      viraODia: temViradaDeTurno(entrada, saida),
      duracao: duracaoEmMinutos(entrada, saida),
      criado: { nome: linha.criadoPor, em: linha.criadoEm.toISOString() },
      // So "alterado" quem editou de fato: a coluna nasce preenchida com o
      // instante da criacao, e quem lancou nao "alterou" nada.
      alterado: linha.atualizadoPor
        ? { nome: linha.atualizadoPor, em: linha.atualizadoEm.toISOString() }
        : null,
      excecao:
        linha.tipoId && linha.tipo && linha.comportamento
          ? {
              tipoId: linha.tipoId,
              tipo: linha.tipo,
              comportamento: linha.comportamento,
              contraparte: linha.contraparteFuncionarioId
                ? {
                    valor: `f:${linha.contraparteFuncionarioId}`,
                    nome: linha.contraparteFuncionarioNome ?? "",
                  }
                : linha.contraparteFreelancerId
                  ? {
                      valor: `l:${linha.contraparteFreelancerId}`,
                      nome: linha.contraparteFreelancerNome ?? "",
                    }
                  : null,
              postoOrigem:
                linha.postoOrigemId && linha.postoOrigemCodigo
                  ? { id: linha.postoOrigemId, codigo: linha.postoOrigemCodigo }
                  : null,
              observacao: linha.observacao,
            }
          : null,
    };
  });
}

/**
 * Os turnos de D-1 a D+1 — o que pode encostar num turno de D, contando quem
 * vira o dia. Cada lancamento vira o turno da pessoa da linha (ausente na falta
 * sem cobertura) e, na cobertura, tambem o turno ausente de quem faltou.
 *
 * Com `pessoas`, so as linhas em que alguma delas aparece (como pessoa ou como
 * quem faltou): e o que a action precisa para conferir um lancamento novo.
 */
export async function listarTurnosAoRedor(
  data: string,
  pessoas?: { funcionarios: string[]; freelancers: string[] },
): Promise<Turno[]> {
  await connection();

  const filtroDePessoa = pessoas
    ? or(
        pessoas.funcionarios.length
          ? or(
              inArray(efetivos.funcionarioId, pessoas.funcionarios),
              inArray(efetivos.contraparteFuncionarioId, pessoas.funcionarios),
            )
          : undefined,
        pessoas.freelancers.length
          ? or(
              inArray(efetivos.freelancerId, pessoas.freelancers),
              inArray(efetivos.contraparteFreelancerId, pessoas.freelancers),
            )
          : undefined,
      )
    : undefined;

  if (pessoas && !filtroDePessoa) {
    return [];
  }

  const linhas = await db
    .select({
      id: efetivos.id,
      data: efetivos.data,
      funcionarioId: efetivos.funcionarioId,
      freelancerId: efetivos.freelancerId,
      nomeFuncionario: funcionarios.nome,
      nomeFreelancer: freelancers.nome,
      contraparteFuncionarioId: efetivos.contraparteFuncionarioId,
      contraparteFuncionarioNome: contraparteFuncionario.nome,
      contraparteFreelancerId: efetivos.contraparteFreelancerId,
      contraparteFreelancerNome: contraparteFreelancer.nome,
      comportamento: efetivoTipos.comportamento,
      entrada: efetivos.horaEntrada,
      saida: efetivos.horaSaida,
      postoId: efetivos.postoId,
      posto: postos.codigo,
      local: locais.nome,
    })
    .from(efetivos)
    .innerJoin(postos, eq(postos.id, efetivos.postoId))
    .innerJoin(locais, eq(locais.id, efetivos.localId))
    .leftJoin(funcionarios, eq(funcionarios.id, efetivos.funcionarioId))
    .leftJoin(freelancers, eq(freelancers.id, efetivos.freelancerId))
    .leftJoin(efetivoTipos, eq(efetivoTipos.id, efetivos.tipoId))
    .leftJoin(
      contraparteFuncionario,
      eq(contraparteFuncionario.id, efetivos.contraparteFuncionarioId),
    )
    .leftJoin(contraparteFreelancer, eq(contraparteFreelancer.id, efetivos.contraparteFreelancerId))
    .where(and(between(efetivos.data, diaAnterior(data), diaSeguinte(data)), filtroDePessoa));

  return linhas.flatMap((linha) => {
    const base = {
      lancamentoId: linha.id,
      data: linha.data,
      entrada: formatarHora(linha.entrada),
      saida: formatarHora(linha.saida),
      postoId: linha.postoId,
      posto: linha.posto,
      local: linha.local,
    };
    const nome = linha.nomeFuncionario ?? linha.nomeFreelancer ?? "";
    const turnos: Turno[] = [
      {
        ...base,
        pessoa: linha.funcionarioId ? `f:${linha.funcionarioId}` : `l:${linha.freelancerId}`,
        nome,
        presente: linha.comportamento !== "falta_sem_cobertura",
      },
    ];

    const contraparte = linha.contraparteFuncionarioId
      ? `f:${linha.contraparteFuncionarioId}`
      : linha.contraparteFreelancerId
        ? `l:${linha.contraparteFreelancerId}`
        : null;

    if (linha.comportamento === "cobertura" && contraparte) {
      turnos.push({
        ...base,
        pessoa: contraparte,
        nome: linha.contraparteFuncionarioNome ?? linha.contraparteFreelancerNome ?? "",
        presente: false,
        cobertoPor: nome,
      });
    }

    return turnos;
  });
}

/**
 * O painel do dia: o que ainda falta lancar e o que pede atencao.
 *
 * - postos ativos sem nenhum lancamento na data;
 * - faltas sem cobertura (posto descoberto) e faltas cobertas;
 * - conflitos de horario ja gravados (confirmados apesar do aviso).
 *
 * As faltas saem dos mesmos turnos da conferencia de conflito: a falta coberta
 * e a contraparte da linha de cobertura, e nao uma linha propria.
 */
export async function obterPainelDoDia(data: string): Promise<PainelDoDia> {
  await connection();

  const [semEfetivo, turnos] = await Promise.all([
    db
      .select({ id: postos.id, codigo: postos.codigo, nome: postos.nome })
      .from(postos)
      .where(
        and(
          eq(postos.ativo, true),
          sql`not exists (
            select 1 from ${efetivos}
            where ${efetivos.postoId} = ${postos.id} and ${efetivos.data} = ${data}
          )`,
        ),
      )
      .orderBy(asc(postos.codigo)),
    listarTurnosAoRedor(data),
  ]);

  const faltas = turnos
    .filter((turno) => turno.data === data && !turno.presente)
    .sort((a, b) => a.posto.localeCompare(b.posto) || a.entrada.localeCompare(b.entrada))
    .map((turno) => ({
      nome: turno.nome,
      postoId: turno.postoId,
      posto: turno.posto,
      local: turno.local,
      entrada: turno.entrada,
      saida: turno.saida,
      cobertoPor: turno.cobertoPor ?? null,
    }));

  return {
    postosSemEfetivo: semEfetivo,
    faltasSemCobertura: faltas.filter((falta) => !falta.cobertoPor),
    faltasCobertas: faltas.filter((falta) => falta.cobertoPor),
    conflitos: conflitosDoDia(turnos, data),
  };
}
