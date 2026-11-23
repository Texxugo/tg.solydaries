import "server-only";

import { and, asc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import {
  empresas,
  eventos,
  funcaoCiclos,
  funcionarios,
  funcoesPosto,
  postos,
  preenchimentoDias,
  preenchimentoLinhas,
  regraApontamentoExcecoes,
  regrasApontamento,
} from "@/db/schema";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { duracaoEmMinutos, formatarHora } from "@/features/escalas/jornada";
import {
  diasDoPeriodo,
  diasTrabalhadosPorTroca,
  naturezaContadaDoDia,
} from "@/features/preenchimento/grade";
import {
  ancoraDaVigencia,
  preveTrabalho,
  vigenciaDoDia,
  type VigenciaDoCiclo,
} from "@/features/preenchimento/previsto";

import {
  sugerirApontamento,
  type AlvoDaExcecao,
  type DiaParaRegras,
  type PessoaParaRegras,
  type RegraParaCalculo,
  type SugestaoDeApontamento,
} from "./calculo";
import { idRegraSchema } from "./schema";
import type { ExcecaoResumo, OpcoesDasRegras, RegraResumo } from "./types";

/**
 * Leituras do cadastro de regras e a derivacao da sugestao.
 *
 * A regra e **cadastro**: `listarRegras()` nao filtra por competencia, como o
 * catalogo de eventos. Ja `sugestoesDaCompetencia()` le a grade, e por isso
 * comeca por `competenciaEmVigor()` — o que ela devolve e dado datado, e nao
 * fica gravado em lugar nenhum.
 */

/** O nome do posto como as listas o mostram: o codigo manda, o nome explica. */
const nomeDoPosto = sql<string>`${postos.codigo} || ' - ' || ${postos.nome}`;

/** A funcao so se identifica com o posto junto: "PORTARIA" existe em todos. */
const nomeDaFuncao = sql<string>`${postos.codigo} || ' / ' || ${funcoesPosto.nome}`;

async function excecoesPorRegra(regraIds: readonly string[]) {
  const porRegra = new Map<string, ExcecaoResumo[]>();

  if (regraIds.length === 0) {
    return porRegra;
  }

  const linhas = await db
    .select({
      id: regraApontamentoExcecoes.id,
      regraId: regraApontamentoExcecoes.regraId,
      empresaId: regraApontamentoExcecoes.empresaId,
      empresaNome: empresas.nome,
      postoId: regraApontamentoExcecoes.postoId,
      postoNome: nomeDoPosto,
      funcaoId: regraApontamentoExcecoes.funcaoId,
      funcaoNome: nomeDaFuncao,
      funcionarioId: regraApontamentoExcecoes.funcionarioId,
      funcionarioNome: funcionarios.nome,
    })
    .from(regraApontamentoExcecoes)
    .leftJoin(empresas, eq(empresas.id, regraApontamentoExcecoes.empresaId))
    .leftJoin(funcoesPosto, eq(funcoesPosto.id, regraApontamentoExcecoes.funcaoId))
    .leftJoin(
      postos,
      sql`${postos.id} = coalesce(${regraApontamentoExcecoes.postoId}, ${funcoesPosto.postoId})`,
    )
    .leftJoin(funcionarios, eq(funcionarios.id, regraApontamentoExcecoes.funcionarioId))
    // Recorte no `where`, e nao um filtro em memoria depois: a tabela cresce com
    // o cadastro inteiro, e quem pergunta quer as excecoes destas regras.
    .where(inArray(regraApontamentoExcecoes.regraId, [...regraIds]));

  for (const linha of linhas) {
    const resumo: ExcecaoResumo = linha.empresaId
      ? { id: linha.id, tipo: "empresa", alvoId: linha.empresaId, nome: linha.empresaNome ?? "" }
      : linha.postoId
        ? { id: linha.id, tipo: "posto", alvoId: linha.postoId, nome: linha.postoNome ?? "" }
        : linha.funcaoId
          ? { id: linha.id, tipo: "funcao", alvoId: linha.funcaoId, nome: linha.funcaoNome ?? "" }
          : {
              id: linha.id,
              tipo: "funcionario",
              alvoId: linha.funcionarioId!,
              nome: linha.funcionarioNome ?? "",
            };

    porRegra.set(linha.regraId, [...(porRegra.get(linha.regraId) ?? []), resumo]);
  }

  return porRegra;
}

const colunasDaRegra = {
  id: regrasApontamento.id,
  nome: regrasApontamento.nome,
  descricao: regrasApontamento.descricao,
  ativa: regrasApontamento.ativa,
  ordem: regrasApontamento.ordem,
  gatilho: regrasApontamento.gatilho,
  rubrica: regrasApontamento.rubrica,
  acao: regrasApontamento.acao,
  quantidade: regrasApontamento.quantidade,
  percentual: regrasApontamento.percentual,
  grau: regrasApontamento.grau,
  empresaId: regrasApontamento.empresaId,
  empresaNome: empresas.nome,
  cargo: regrasApontamento.cargo,
  funcionarioId: regrasApontamento.funcionarioId,
  funcionarioNome: funcionarios.nome,
  postoId: regrasApontamento.postoId,
  funcaoId: regrasApontamento.funcaoId,
  funcaoNome: funcoesPosto.nome,
  turma: regrasApontamento.turma,
  eventoId: regrasApontamento.eventoId,
  eventoCodigo: eventos.codigo,
  cicloDias: regrasApontamento.cicloDias,
  cicloFolgas: regrasApontamento.cicloFolgas,
  jornadaMinutos: regrasApontamento.jornadaMinutos,
  postoNome: nomeDoPosto,
};

type LinhaDaRegra = Awaited<ReturnType<typeof consultarRegras>>[number];

function consultarRegras(filtro?: SQL) {
  return db
    .select(colunasDaRegra)
    .from(regrasApontamento)
    .leftJoin(empresas, eq(empresas.id, regrasApontamento.empresaId))
    .leftJoin(funcionarios, eq(funcionarios.id, regrasApontamento.funcionarioId))
    .leftJoin(funcoesPosto, eq(funcoesPosto.id, regrasApontamento.funcaoId))
    .leftJoin(
      postos,
      sql`${postos.id} = coalesce(${regrasApontamento.postoId}, ${funcoesPosto.postoId})`,
    )
    .leftJoin(eventos, eq(eventos.id, regrasApontamento.eventoId))
    .where(filtro)
    .orderBy(asc(regrasApontamento.ordem), asc(sql`lower(${regrasApontamento.nome})`));
}

function regraDaLinha(linha: LinhaDaRegra, excecoes: ExcecaoResumo[]): RegraResumo {
  return {
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao,
    ativa: linha.ativa,
    ordem: linha.ordem,
    gatilho: linha.gatilho,
    rubrica: linha.rubrica,
    acao: linha.acao,
    quantidade: linha.quantidade,
    percentual: linha.percentual,
    grau: linha.grau,
    escopo: {
      empresaId: linha.empresaId,
      empresaNome: linha.empresaNome,
      cargo: linha.cargo,
      funcionarioId: linha.funcionarioId,
      funcionarioNome: linha.funcionarioNome,
      postoId: linha.postoId,
      postoNome: linha.postoId ? linha.postoNome : null,
      funcaoId: linha.funcaoId,
      funcaoNome: linha.funcaoId ? `${linha.postoNome} / ${linha.funcaoNome}` : null,
      turma: linha.turma,
      eventoId: linha.eventoId,
      eventoCodigo: linha.eventoCodigo,
      cicloDias: linha.cicloDias,
      cicloFolgas: linha.cicloFolgas,
      jornadaMinutos: linha.jornadaMinutos,
    },
    excecoes,
  };
}

/** Todas as regras, ativas e inativas, na ordem em que sao aplicadas. */
export async function listarRegras(): Promise<RegraResumo[]> {
  await connection();

  const linhas = await consultarRegras();
  const excecoes = await excecoesPorRegra(linhas.map((linha) => linha.id));

  return linhas.map((linha) => regraDaLinha(linha, excecoes.get(linha.id) ?? []));
}

/** Uma regra. `null` para id inexistente — e tambem para id que nem uuid e. */
export async function obterRegra(id: string): Promise<RegraResumo | null> {
  await connection();

  const idValido = idRegraSchema.safeParse(id);

  if (!idValido.success) {
    return null;
  }

  // Uma regra, e nao a lista inteira com os cinco joins para achar uma em
  // memoria: a tela de edicao abre uma por vez.
  const [linha] = await consultarRegras(eq(regrasApontamento.id, idValido.data));

  if (!linha) {
    return null;
  }

  const excecoes = await excecoesPorRegra([linha.id]);

  return regraDaLinha(linha, excecoes.get(linha.id) ?? []);
}

/** O que os campos de escopo e de excecao oferecem. Cadastro, sem competencia. */
export async function listarOpcoes(): Promise<OpcoesDasRegras> {
  await connection();

  const [listaEmpresas, listaPostos, listaFuncoes, listaEventos, listaFuncionarios] =
    await Promise.all([
      db
        .select({ id: empresas.id, nome: empresas.nome })
        .from(empresas)
        .orderBy(asc(sql`lower(${empresas.nome})`)),
      db
        .select({ id: postos.id, nome: nomeDoPosto })
        .from(postos)
        .where(eq(postos.ativo, true))
        .orderBy(asc(postos.codigo)),
      db
        .select({ id: funcoesPosto.id, nome: nomeDaFuncao })
        .from(funcoesPosto)
        .innerJoin(postos, eq(postos.id, funcoesPosto.postoId))
        .where(eq(funcoesPosto.ativa, true))
        .orderBy(asc(postos.codigo), asc(funcoesPosto.nome)),
      db
        .select({ id: eventos.id, codigo: eventos.codigo, rotulo: eventos.rotulo })
        .from(eventos)
        .where(eq(eventos.ativo, true))
        .orderBy(asc(eventos.codigo)),
      db
        .select({ id: funcionarios.id, nome: funcionarios.nome })
        .from(funcionarios)
        .where(eq(funcionarios.ativo, true))
        .orderBy(asc(sql`lower(${funcionarios.nome})`)),
    ]);

  return {
    empresas: listaEmpresas,
    postos: listaPostos,
    funcoes: listaFuncoes,
    eventos: listaEventos,
    funcionarios: listaFuncionarios,
  };
}

/**
 * As regras ativas no formato que o calculo puro consome, **na ordem em que
 * sao aplicadas** — `sugerirApontamento()` conta com isso e nao reordena.
 */
async function regrasAtivas(): Promise<RegraParaCalculo[]> {
  const linhas = await db
    .select({
      id: regrasApontamento.id,
      nome: regrasApontamento.nome,
      ordem: regrasApontamento.ordem,
      empresaId: regrasApontamento.empresaId,
      cargo: regrasApontamento.cargo,
      funcionarioId: regrasApontamento.funcionarioId,
      postoId: regrasApontamento.postoId,
      funcaoId: regrasApontamento.funcaoId,
      turma: regrasApontamento.turma,
      eventoId: regrasApontamento.eventoId,
      cicloDias: regrasApontamento.cicloDias,
      cicloFolgas: regrasApontamento.cicloFolgas,
      jornadaMinutos: regrasApontamento.jornadaMinutos,
      gatilho: regrasApontamento.gatilho,
      rubrica: regrasApontamento.rubrica,
      acao: regrasApontamento.acao,
      quantidade: regrasApontamento.quantidade,
      percentual: regrasApontamento.percentual,
      grau: regrasApontamento.grau,
    })
    .from(regrasApontamento)
    .where(eq(regrasApontamento.ativa, true))
    .orderBy(asc(regrasApontamento.ordem), asc(sql`lower(${regrasApontamento.nome})`));

  if (linhas.length === 0) {
    return [];
  }

  const alvos = await db
    .select({
      regraId: regraApontamentoExcecoes.regraId,
      empresaId: regraApontamentoExcecoes.empresaId,
      postoId: regraApontamentoExcecoes.postoId,
      funcaoId: regraApontamentoExcecoes.funcaoId,
      funcionarioId: regraApontamentoExcecoes.funcionarioId,
    })
    .from(regraApontamentoExcecoes)
    // So as das regras ativas: as da regra desligada nao entram em conta
    // nenhuma, e varrer a tabela inteira para descarta-las depois e trabalho
    // que cresce com o cadastro.
    .where(
      inArray(
        regraApontamentoExcecoes.regraId,
        linhas.map((linha) => linha.id),
      ),
    );

  // Agrupadas uma vez, e nao um `filter` por regra: o custo era
  // regras x excecoes a cada leitura da grade.
  const excecoesPorId = new Map<string, AlvoDaExcecao[]>();

  for (const alvo of alvos) {
    excecoesPorId.set(alvo.regraId, [...(excecoesPorId.get(alvo.regraId) ?? []), alvo]);
  }

  return linhas.map(
    ({ id, nome, ordem, gatilho, rubrica, acao, quantidade, percentual, grau, ...escopo }) => ({
      id,
      nome,
      ordem,
      escopo,
      excecoes: excecoesPorId.get(id) ?? [],
      gatilho,
      rubrica,
      acao,
      quantidade,
      percentual,
      grau,
    }),
  );
}

/**
 * Monta, da grade da competencia, o que as regras perguntam sobre cada pessoa.
 *
 * Os dias sao os do **periodo inteiro**, e nao so os que tem celula: e assim
 * que a regra fixa (a periculosidade que a empresa sempre paga) vale para quem
 * esta escalado com a grade ainda em branco. O dia sem celula tem natureza
 * `null` e nao dispara gatilho nenhum.
 *
 * Ciclo e jornada vem da vigencia que vale **naquele dia**, pela mesma
 * `vigenciaDoDia()` da grade: o contrato do posto troca no meio do periodo, e
 * uma regra de 11 horas precisa parar de valer junto.
 */
async function pessoasDaGrade(
  competenciaId: string,
  inicio: string,
  fim: string,
  /**
   * So estas pessoas. A ficha pede uma; a lista pede as da pagina. Sem o
   * recorte, desenhar vinte linhas custava a grade inteira do periodo.
   */
  apenasFuncionarios?: readonly string[],
) {
  const daPessoa = apenasFuncionarios
    ? inArray(preenchimentoLinhas.funcionarioId, [...apenasFuncionarios])
    : undefined;

  const [linhas, celulas, ciclos] = await Promise.all([
    db
      .select({
        linhaId: preenchimentoLinhas.id,
        funcionarioId: preenchimentoLinhas.funcionarioId,
        turma: preenchimentoLinhas.turma,
        funcaoId: preenchimentoLinhas.funcaoId,
        postoId: funcoesPosto.postoId,
        empresaId: funcionarios.empresaId,
        cargo: funcionarios.cargo,
      })
      .from(preenchimentoLinhas)
      .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
      .innerJoin(funcionarios, eq(funcionarios.id, preenchimentoLinhas.funcionarioId))
      .where(
        and(
          eq(preenchimentoLinhas.competenciaId, competenciaId),
          isNotNull(preenchimentoLinhas.funcionarioId),
          daPessoa,
        ),
      ),
    db
      .select({
        linhaId: preenchimentoDias.linhaId,
        data: preenchimentoDias.data,
        eventoId: preenchimentoDias.eventoId,
        natureza: eventos.natureza,
        intrajornada: preenchimentoDias.intrajornada,
        dataTrabalhada: preenchimentoDias.dataTrabalhada,
      })
      .from(preenchimentoDias)
      .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, preenchimentoDias.linhaId))
      .leftJoin(eventos, eq(eventos.id, preenchimentoDias.eventoId))
      .where(and(eq(preenchimentoLinhas.competenciaId, competenciaId), daPessoa)),
    db
      .select({
        id: funcaoCiclos.id,
        funcaoId: funcaoCiclos.funcaoId,
        turma: funcaoCiclos.turma,
        vigenciaInicio: funcaoCiclos.vigenciaInicio,
        diasCiclo: funcaoCiclos.diasCiclo,
        folgas: funcaoCiclos.folgas,
        entrada: funcaoCiclos.entrada,
        saida: funcaoCiclos.saida,
        inicioCiclo: funcaoCiclos.inicioCiclo,
      })
      .from(funcaoCiclos),
  ]);

  const celulasPorLinha = new Map<string, Map<string, (typeof celulas)[number]>>();

  for (const celula of celulas) {
    const daLinha = celulasPorLinha.get(celula.linhaId) ?? new Map();
    daLinha.set(celula.data, celula);
    celulasPorLinha.set(celula.linhaId, daLinha);
  }

  /**
   * As vigencias agrupadas por funcao e turma, uma vez so. Refiltrar a lista
   * inteira por linha custava linhas x vigencias a cada leitura da grade — e as
   * duas crescem juntas.
   */
  const vigenciasPorTurma = new Map<string, VigenciaDoCiclo[]>();

  for (const ciclo of ciclos) {
    const chave = `${ciclo.funcaoId}|${ciclo.turma}`;

    vigenciasPorTurma.set(chave, [
      ...(vigenciasPorTurma.get(chave) ?? []),
      {
        id: ciclo.id,
        turma: ciclo.turma,
        vigenciaInicio: ciclo.vigenciaInicio,
        diasCiclo: ciclo.diasCiclo,
        folgas: ciclo.folgas ?? [],
        entrada: formatarHora(ciclo.entrada),
        saida: formatarHora(ciclo.saida),
        inicioCiclo: ciclo.inicioCiclo,
      },
    ]);
  }

  const dias = diasDoPeriodo(inicio, fim);
  const pessoas = new Map<string, PessoaParaRegras>();

  for (const linha of linhas) {
    if (!linha.funcionarioId) {
      continue;
    }

    const vigencias = vigenciasPorTurma.get(`${linha.funcaoId}|${linha.turma}`) ?? [];
    const celulasDaLinha = celulasPorLinha.get(linha.linhaId);
    // O dia trabalhado de uma TE nao tem celula, mas e trabalho — o mesmo que
    // o T da grade conta.
    const trabalhados = diasTrabalhadosPorTroca(celulasDaLinha?.values() ?? []);

    const diasDaLinha: DiaParaRegras[] = dias.map((data) => {
      const vigencia = vigenciaDoDia(data, vigencias);
      const celula = celulasDaLinha?.get(data);
      // A troca interna so sabe se foi trabalho ou folga olhando o que o dia
      // previa — a mesma leitura da grade, para o VT contar o que o T conta.
      const prevista = vigencia
        ? preveTrabalho(data, ancoraDaVigencia(vigencia, inicio), vigencia)
          ? "trabalho"
          : "folga"
        : null;

      return {
        data,
        natureza: naturezaContadaDoDia(celula?.natureza ?? null, prevista, trabalhados.has(data)),
        eventoId: celula?.eventoId ?? null,
        intrajornada: celula?.intrajornada ?? false,
        postoId: linha.postoId,
        funcaoId: linha.funcaoId,
        turma: linha.turma,
        cicloDias: vigencia?.diasCiclo ?? null,
        cicloFolgas: vigencia ? vigencia.folgas.length : null,
        jornadaMinutos: vigencia ? duracaoEmMinutos(vigencia.entrada, vigencia.saida) : null,
      };
    });

    const pessoa = pessoas.get(linha.funcionarioId);

    // A mesma pessoa pode ocupar duas linhas no mesmo periodo (troca de posto no
    // meio do mes): os dias das duas entram na mesma conta.
    pessoas.set(linha.funcionarioId, {
      funcionarioId: linha.funcionarioId,
      empresaId: linha.empresaId,
      cargo: linha.cargo,
      dias: [...(pessoa?.dias ?? []), ...diasDaLinha],
    });
  }

  return pessoas;
}

/**
 * A sugestao de cada pessoa escalada na competencia em vigor.
 *
 * Vazio quando nao ha competencia, quando nao ha regra ativa ou quando ninguem
 * esta na grade — os tres casos em que nao ha o que sugerir.
 *
 * `apenasFuncionarios` recorta a varredura: a lista so marca as linhas da
 * pagina, e derivar a competencia inteira para desenhar vinte delas era jogar
 * fora quase todo o trabalho. A geracao em lote chama sem recorte, porque ali o
 * alvo e todo mundo mesmo.
 */
export async function sugestoesDaCompetencia(
  apenasFuncionarios?: readonly string[],
): Promise<Map<string, SugestaoDeApontamento>> {
  // Pagina sem ninguem (lista vazia ou filtro que nao encontrou) nao tem
  // sugestao a buscar — e um `in ()` vazio so custaria a ida ao banco.
  if (apenasFuncionarios?.length === 0) {
    return new Map();
  }

  /**
   * A chave e uma **string**, e nao a lista: `cache()` compara os argumentos por
   * identidade, e um array novo a cada chamada nunca acertaria o cache. Ordenada
   * para que as mesmas pessoas em outra ordem sejam a mesma leitura.
   */
  return derivarSugestoes(apenasFuncionarios ? [...apenasFuncionarios].sort().join(",") : "");
}

/**
 * A derivacao em si, memoizada por requisicao com `cache()` do React — mesmo
 * arranjo da DAL de competencias.
 *
 * Ela varre a grade do periodo e aplica as regras pessoa por pessoa: duas
 * chamadas com o mesmo recorte na mesma tela (a lista e um cartao, por exemplo)
 * pagariam a varredura duas vezes sem isso.
 */
const derivarSugestoes = cache(
  async (chave: string): Promise<Map<string, SugestaoDeApontamento>> => {
    await connection();

    const vigor = await competenciaEmVigor();

    if (!vigor) {
      return new Map();
    }

    const regras = await regrasAtivas();

    if (regras.length === 0) {
      return new Map();
    }

    const pessoas = await pessoasDaGrade(
      vigor.competencia.id,
      vigor.competencia.dataInicio,
      vigor.competencia.dataFim,
      chave ? chave.split(",") : undefined,
    );

    const sugestoes = new Map<string, SugestaoDeApontamento>();

    for (const [funcionarioId, pessoa] of pessoas) {
      sugestoes.set(funcionarioId, sugerirApontamento(pessoa, regras));
    }

    return sugestoes;
  },
);

/**
 * A sugestao de uma pessoa so — o que a ficha mostra ao lado dos campos.
 *
 * Recorta na mesma derivacao da lista, com a pessoa como unico alvo: a ficha e
 * de uma, e varrer a grade inteira do periodo para desenhar um cartao seria
 * pagar trezentas vezes o que se usa uma.
 */
export async function sugestaoDoFuncionario(
  funcionarioId: string,
): Promise<SugestaoDeApontamento | null> {
  const sugestoes = await derivarSugestoes(funcionarioId);

  return sugestoes.get(funcionarioId) ?? null;
}
