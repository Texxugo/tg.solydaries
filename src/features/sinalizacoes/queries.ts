import "server-only";

import { createHash } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";

import { db } from "@/db";
import {
  enviosSinalizacao,
  eventos,
  freelancers,
  funcionarios,
  funcoesPosto,
  postos,
  preenchimentoDias,
  preenchimentoLinhas,
  sinalizacoesDia,
  usuarios,
} from "@/db/schema";
import { horaNoPortal } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import type { CompetenciaResumo } from "@/features/competencias/types";
import { OCORRENCIAS_POR_CONSOLIDADO } from "@/features/ponto/contato";
import { obterGrade } from "@/features/preenchimento/queries";
import type { GradeDoPosto, LinhaDaGrade } from "@/features/preenchimento/types";

import { modeloDosDiasSinalizados, type ItemDoEnvio } from "./mensagem";
import type {
  DiaSinalizado,
  EnvioDoDia,
  PostoSemResponsavel,
  ResponsavelDosSinalizados,
  SituacaoDoFiltro,
} from "./types";

const quemSinalizou = alias(usuarios, "quem_sinalizou");
const quemResolveu = alias(usuarios, "quem_resolveu");
const responsavelDoPosto = alias(funcionarios, "responsavel_do_posto");
const responsavelDoEnvio = alias(funcionarios, "responsavel_do_envio");

const nomeDaPessoa = sql<string>`coalesce(${funcionarios.nome}, ${freelancers.nome})`;
const codigoDaPessoa = sql<
  string | null
>`coalesce(${funcionarios.matricula}, ${freelancers.codigo})`;

/**
 * Os dias sinalizados da competencia em vigor, no recorte pedido, e quantos
 * ha em cada situacao.
 *
 * So o que foi marcado com o "!" no modal do dia: nada aqui le a apuracao do
 * ponto, as pendencias ou as tratativas — e outra pergunta, e outra tela.
 *
 * A competencia vem da **linha** da grade, e nao de uma coluna da marca: e a
 * linha que pertence ao periodo, e a marca so existe presa a ela. Sem
 * competencia em vigor nao ha o que mostrar (`null`).
 *
 * Sem paginacao: e a lista do que alguem achou que valia conferir, e ela
 * esvazia conforme os dias sao resolvidos. Os resolvidos so aparecem quando
 * pedidos.
 */
export async function listarDiasSinalizados(situacao: SituacaoDoFiltro) {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return null;
  }

  const daCompetencia = eq(preenchimentoLinhas.competenciaId, vigor.competencia.id);
  const doRecorte =
    situacao === "pendentes"
      ? isNull(sinalizacoesDia.resolvidoEm)
      : situacao === "resolvidos"
        ? isNotNull(sinalizacoesDia.resolvidoEm)
        : undefined;

  const [linhas, contagem, envios] = await Promise.all([
    db
      .select({
        id: sinalizacoesDia.id,
        linhaId: sinalizacoesDia.linhaId,
        data: sinalizacoesDia.data,
        postoId: postos.id,
        postoCodigo: postos.codigo,
        postoNome: postos.nome,
        funcaoNome: funcoesPosto.nome,
        pessoaNome: nomeDaPessoa,
        pessoaCodigo: codigoDaPessoa,
        freelancer: sql<boolean>`${preenchimentoLinhas.freelancerId} is not null`,
        eventoCodigo: eventos.codigo,
        horaEntrada: preenchimentoDias.horaEntrada,
        horaSaida: preenchimentoDias.horaSaida,
        sinalizadoPor: quemSinalizou.nome,
        sinalizadoEm: sinalizacoesDia.sinalizadoEm,
        resolvidoPor: quemResolveu.nome,
        resolvidoEm: sinalizacoesDia.resolvidoEm,
        observacao: sinalizacoesDia.observacao,
      })
      .from(sinalizacoesDia)
      .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, sinalizacoesDia.linhaId))
      .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
      .innerJoin(postos, eq(postos.id, funcoesPosto.postoId))
      .leftJoin(funcionarios, eq(funcionarios.id, preenchimentoLinhas.funcionarioId))
      .leftJoin(freelancers, eq(freelancers.id, preenchimentoLinhas.freelancerId))
      // O realizado daquele dia, quando ha celula: e o que a pessoa via na grade
      // quando sinalizou, e muitas vezes e o que explica a marca.
      .leftJoin(
        preenchimentoDias,
        and(
          eq(preenchimentoDias.linhaId, sinalizacoesDia.linhaId),
          eq(preenchimentoDias.data, sinalizacoesDia.data),
        ),
      )
      .leftJoin(eventos, eq(eventos.id, preenchimentoDias.eventoId))
      .leftJoin(quemSinalizou, eq(quemSinalizou.id, sinalizacoesDia.sinalizadoPor))
      .leftJoin(quemResolveu, eq(quemResolveu.id, sinalizacoesDia.resolvidoPor))
      .where(and(daCompetencia, doRecorte))
      .orderBy(
        asc(sinalizacoesDia.data),
        asc(postos.codigo),
        asc(funcoesPosto.nome),
        asc(nomeDaPessoa),
      ),
    db
      .select({
        resolvido: sql<boolean>`${sinalizacoesDia.resolvidoEm} is not null`,
        total: count(),
      })
      .from(sinalizacoesDia)
      .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, sinalizacoesDia.linhaId))
      .where(daCompetencia)
      .groupBy(sql`${sinalizacoesDia.resolvidoEm} is not null`),
    // Os envios aceitos, do mais novo para o mais antigo: a tela mostra o ultimo.
    db
      .select({
        sinalizacaoId: enviosSinalizacao.sinalizacaoId,
        responsavel: responsavelDoEnvio.nome,
        em: enviosSinalizacao.criadoEm,
      })
      .from(enviosSinalizacao)
      .innerJoin(sinalizacoesDia, eq(sinalizacoesDia.id, enviosSinalizacao.sinalizacaoId))
      .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, sinalizacoesDia.linhaId))
      .leftJoin(responsavelDoEnvio, eq(responsavelDoEnvio.id, enviosSinalizacao.responsavelId))
      .where(and(daCompetencia, eq(enviosSinalizacao.status, "enviada")))
      .orderBy(desc(enviosSinalizacao.criadoEm)),
  ]);

  const ultimoEnvio = new Map<string, EnvioDoDia>();

  for (const envio of envios) {
    if (!ultimoEnvio.has(envio.sinalizacaoId)) {
      ultimoEnvio.set(envio.sinalizacaoId, { responsavel: envio.responsavel, em: envio.em });
    }
  }

  const dias: DiaSinalizado[] = linhas.map(({ horaEntrada, horaSaida, ...linha }) => ({
    ...linha,
    horario: horarioDoPar(horaEntrada, horaSaida),
    ultimoEnvio: ultimoEnvio.get(linha.id) ?? null,
  }));

  return {
    competencia: vigor.competencia,
    dias,
    pendentes: contagem.find((grupo) => !grupo.resolvido)?.total ?? 0,
    resolvidos: contagem.find((grupo) => grupo.resolvido)?.total ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Envio aos responsaveis                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Os dias pendentes da competencia com o responsavel do posto de cada um, e se
 * ja foram enviados a ele.
 *
 * O responsavel e o do **posto da grade** em que o dia foi sinalizado — e nao o
 * grupo de contato da pessoa, que e do ponto: assim entram tambem o freelancer
 * e quem nao esta em grupo nenhum. E e o responsavel **de agora**: trocar o
 * responsavel do posto devolve os dias ao proximo envio, para o novo.
 *
 * "Ja enviado" e um envio aceito a esse responsavel **depois** da ultima vez em
 * que o dia foi sinalizado. Reabrir pelo "!" regrava `sinalizado_em` e devolve o
 * dia ao envio; o "Reabrir" da tela nao, porque o responsavel ja sabe do dia.
 */
async function lerPendentes() {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return null;
  }

  const pendentes = await db
    .select({
      id: sinalizacoesDia.id,
      linhaId: sinalizacoesDia.linhaId,
      data: sinalizacoesDia.data,
      observacao: sinalizacoesDia.observacao,
      sinalizadoEm: sinalizacoesDia.sinalizadoEm,
      postoId: postos.id,
      postoCodigo: postos.codigo,
      postoNome: postos.nome,
      pessoaNome: nomeDaPessoa,
      responsavelId: responsavelDoPosto.id,
      responsavelNome: responsavelDoPosto.nome,
      responsavelTelefone: responsavelDoPosto.telefone,
      responsavelAtivo: responsavelDoPosto.ativo,
    })
    .from(sinalizacoesDia)
    .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, sinalizacoesDia.linhaId))
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
    .innerJoin(postos, eq(postos.id, funcoesPosto.postoId))
    .leftJoin(responsavelDoPosto, eq(responsavelDoPosto.id, postos.responsavelId))
    .leftJoin(funcionarios, eq(funcionarios.id, preenchimentoLinhas.funcionarioId))
    .leftJoin(freelancers, eq(freelancers.id, preenchimentoLinhas.freelancerId))
    .where(
      and(
        eq(preenchimentoLinhas.competenciaId, vigor.competencia.id),
        isNull(sinalizacoesDia.resolvidoEm),
      ),
    );

  const enviados =
    pendentes.length === 0
      ? []
      : await db
          .select({
            sinalizacaoId: enviosSinalizacao.sinalizacaoId,
            responsavelId: enviosSinalizacao.responsavelId,
            criadoEm: enviosSinalizacao.criadoEm,
          })
          .from(enviosSinalizacao)
          .where(
            and(
              inArray(
                enviosSinalizacao.sinalizacaoId,
                pendentes.map((dia) => dia.id),
              ),
              eq(enviosSinalizacao.status, "enviada"),
            ),
          );

  const dias = pendentes.map((dia) => ({
    ...dia,
    jaEnviado: enviados.some(
      (envio) =>
        envio.sinalizacaoId === dia.id &&
        envio.responsavelId !== null &&
        envio.responsavelId === dia.responsavelId &&
        envio.criadoEm >= dia.sinalizadoEm,
    ),
  }));

  return { competencia: vigor.competencia, dias };
}

/**
 * Os responsaveis com dias sinalizados pendentes nos postos deles, e os postos
 * com pendencia e sem responsavel — nao ha a quem mandar, e a tela diz onde.
 */
export async function listarResponsaveisDosSinalizados(): Promise<{
  competencia: CompetenciaResumo | null;
  responsaveis: ResponsavelDosSinalizados[];
  semResponsavel: PostoSemResponsavel[];
}> {
  const leitura = await lerPendentes();

  if (!leitura) {
    return { competencia: null, responsaveis: [], semResponsavel: [] };
  }

  const porResponsavel = new Map<string, ResponsavelDosSinalizados>();
  const semResponsavel = new Map<string, PostoSemResponsavel>();

  for (const dia of leitura.dias) {
    if (!dia.responsavelId || !dia.responsavelNome) {
      const posto = semResponsavel.get(dia.postoId) ?? {
        id: dia.postoId,
        codigo: dia.postoCodigo,
        nome: dia.postoNome,
        pendentes: 0,
      };

      posto.pendentes++;
      semResponsavel.set(dia.postoId, posto);
      continue;
    }

    let responsavel = porResponsavel.get(dia.responsavelId);

    if (!responsavel) {
      responsavel = {
        id: dia.responsavelId,
        nome: dia.responsavelNome,
        telefone: dia.responsavelTelefone,
        bloqueio: bloqueioDoResponsavel(dia.responsavelAtivo, dia.responsavelTelefone),
        postos: [],
        pendentes: 0,
        aEnviar: 0,
      };
      porResponsavel.set(dia.responsavelId, responsavel);
    }

    if (!responsavel.postos.some((posto) => posto.id === dia.postoId)) {
      responsavel.postos.push({ id: dia.postoId, codigo: dia.postoCodigo, nome: dia.postoNome });
    }

    responsavel.pendentes++;

    if (!dia.jaEnviado) {
      responsavel.aEnviar++;
    }
  }

  return {
    competencia: leitura.competencia,
    responsaveis: [...porResponsavel.values()]
      .map((responsavel) => ({
        ...responsavel,
        postos: responsavel.postos.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
      }))
      // Quem tem o que enviar primeiro; depois quem tem mais.
      .sort(
        (a, b) =>
          Number(b.aEnviar > 0) - Number(a.aEnviar > 0) ||
          b.aEnviar - a.aEnviar ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      ),
    semResponsavel: [...semResponsavel.values()].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, "pt-BR"),
    ),
  };
}

/** O envio de um responsavel, pronto: quem recebe, quais dias entram e o texto. */
export type EnvioDosSinalizados = {
  competencia: CompetenciaResumo;
  destino: {
    funcionarioId: string;
    nome: string;
    telefone: string | null;
    bloqueio: ResponsavelDosSinalizados["bloqueio"];
  };
  /** Os ids das marcas que entram, na ordem do texto. */
  incluidas: string[];
  restantes: number;
  conteudo: string;
  assinatura: string;
};

/**
 * Monta o envio de um responsavel — chamado pela previa **e** pela confirmacao,
 * como o consolidado de ponto: a previa so promete alguma coisa se a gravacao
 * refizer a mesma conta.
 *
 * O previsto, o que a grade registra e as marcacoes de cada dia saem de
 * `obterGrade()` do posto — a mesma leitura que a grade desenha, com as batidas
 * ja devolvidas ao dia do turno. Uma conta a parte divergiria no primeiro
 * plantao noturno.
 *
 * `null` quando nao ha competencia ou nada pendente esta para enviar a ele.
 */
export async function envioDosSinalizados(
  responsavelId: string,
): Promise<EnvioDosSinalizados | null> {
  const leitura = await lerPendentes();

  if (!leitura) {
    return null;
  }

  const aEnviar = leitura.dias
    .filter((dia) => dia.responsavelId === responsavelId && !dia.jaEnviado)
    // Por posto e por data: e a ordem em que o responsavel vai conferir.
    .sort(
      (a, b) =>
        a.postoCodigo.localeCompare(b.postoCodigo, "pt-BR") ||
        a.data.localeCompare(b.data) ||
        a.pessoaNome.localeCompare(b.pessoaNome, "pt-BR"),
    );

  if (aEnviar.length === 0) {
    return null;
  }

  const incluidas = aEnviar.slice(0, OCORRENCIAS_POR_CONSOLIDADO);
  const primeiro = incluidas[0];

  const grades = new Map<string, GradeDoPosto | null>();

  for (const postoId of new Set(incluidas.map((dia) => dia.postoId))) {
    grades.set(postoId, await obterGrade(postoId));
  }

  const itens: ItemDoEnvio[] = incluidas.map((dia) => {
    const grade = grades.get(dia.postoId) ?? null;
    const linha = grade?.grupos
      .flatMap((grupo) => grupo.linhas)
      .find((atual) => atual.id === dia.linhaId);

    return {
      pessoa: dia.pessoaNome,
      data: dia.data,
      batidas: batidasDoDia(grade, linha, dia.data),
      observacao: dia.observacao,
    };
  });

  const conteudo = modeloDosDiasSinalizados({
    responsavel: primeiro.responsavelNome ?? "",
    hora: horaNoPortal(),
    itens,
  });

  return {
    competencia: leitura.competencia,
    destino: {
      funcionarioId: responsavelId,
      nome: primeiro.responsavelNome ?? "",
      telefone: primeiro.responsavelTelefone,
      bloqueio: bloqueioDoResponsavel(primeiro.responsavelAtivo, primeiro.responsavelTelefone),
    },
    incluidas: incluidas.map((dia) => dia.id),
    restantes: aEnviar.length - incluidas.length,
    conteudo,
    assinatura: createHash("sha256").update(conteudo).digest("hex"),
  };
}

/**
 * Responsavel que nao pode receber: desativado ou sem telefone. Bloqueia o
 * envio com aviso, como no consolidado de ponto — nada vai para outra pessoa
 * no lugar dele.
 */
function bloqueioDoResponsavel(
  ativo: boolean | null,
  telefone: string | null,
): ResponsavelDosSinalizados["bloqueio"] {
  if (ativo === false) {
    return "responsavel_inativo";
  }

  return telefone ? null : "responsavel_sem_telefone";
}

function horarioDoPar(entrada: string | null, saida: string | null) {
  return entrada && saida ? `${entrada.slice(0, 5)}-${saida.slice(0, 5)}` : null;
}

/**
 * As batidas do turno daquele dia. `null` quando o relogio nao tem o que dizer:
 * freelancer (nao bate ponto) ou dia fora do periodo importado — ai "sem
 * marcacao" seria afirmar o que ninguem sabe.
 */
function batidasDoDia(grade: GradeDoPosto | null, linha: LinhaDaGrade | undefined, data: string) {
  const janela = grade?.janelaDoRelogio;

  if (!linha?.batidas || !janela || data < janela.inicio || data > janela.fim) {
    return null;
  }

  return (linha.batidas[data] ?? []).map(
    (batida) => `${batida.hora}${batida.diaSeguinte ? " (dia seguinte)" : ""}`,
  );
}
