import "server-only";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";

import { db } from "@/db";
import {
  empresas,
  eventos,
  funcaoCiclos,
  funcionarios,
  funcoesPosto,
  postoContatos,
  postos,
  preenchimentoLinhas,
} from "@/db/schema";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { formatarHora } from "@/features/escalas/jornada";
import { rotuloDasVigencias, type VigenciaDoCiclo } from "@/features/preenchimento/previsto";

import { idPostoSchema } from "./schema";
import type {
  BlocoDaGrade,
  ContatoDoFuncionario,
  GrupoDeContato,
  PostoDaGrade,
  PostoParaEscolha,
  PostoResumo,
} from "./types";

/**
 * Leituras do cadastro de postos: chamadas por Server Components, nunca pelo
 * client.
 *
 * O **cadastro** nao pertence a competencia — posto e funcao continuam
 * existindo no periodo seguinte, como escalas e funcionarios. O que pertence e
 * a contagem de pessoas do bloco: ela conta linhas de `preenchimento_linhas`, e
 * essas sim sao datadas. Por isso a contagem passa por `competenciaEmVigor()` e
 * o resto nao.
 */

/**
 * Quantas pessoas estao no bloco na competencia em vigor.
 *
 * Subconsulta correlacionada em vez de `left join` + `group by`: o join
 * multiplicaria a funcao por linha da grade, e todo o resto do `select` teria de
 * entrar no agrupamento so para contar.
 *
 * Sem competencia aberta a contagem e zero — `null` de `competenciaEmVigor()`
 * significa "nao ha o que mostrar", e nunca "conte todas as competencias".
 */
function pessoasDoBloco(competenciaId: string | null) {
  if (!competenciaId) {
    return sql<number>`0`;
  }

  return sql<number>`cast((
    select count(*)
    from ${preenchimentoLinhas} linha
    where linha.funcao_id = ${funcoesPosto.id}
      and linha.competencia_id = ${competenciaId}
  ) as int)`;
}

/** Mesmo escape de `listarEscalas`: sem ele, buscar "%" traria a tabela inteira. */
function padraoDeBusca(busca?: string) {
  const termo = busca?.trim();

  return termo ? `%${termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%` : null;
}

const colunasDaFuncao = {
  id: funcoesPosto.id,
  postoId: funcoesPosto.postoId,
  nome: funcoesPosto.nome,
  eventoTrabalhoId: funcoesPosto.eventoTrabalhoId,
  eventoTrabalhoCodigo: eventos.codigo,
  observacao: funcoesPosto.observacao,
  ordem: funcoesPosto.ordem,
  ativa: funcoesPosto.ativa,
};

/**
 * As vigencias de um conjunto de funcoes, agrupadas por funcao.
 *
 * Uma consulta para todas, e nao uma por funcao: o agrupamento aconteceria aqui
 * de qualquer forma. Ordenadas com a inicial primeiro (`nulls first`), que e a
 * ordem em que a tela as le e a que `vigenciaDoDia()` espera.
 */
async function vigenciasDasFuncoes(funcaoIds: string[]) {
  if (funcaoIds.length === 0) {
    return new Map<string, VigenciaDoCiclo[]>();
  }

  const linhas = await db
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
    .from(funcaoCiclos)
    .where(inArray(funcaoCiclos.funcaoId, funcaoIds))
    .orderBy(asc(funcaoCiclos.turma), sql`${funcaoCiclos.vigenciaInicio} asc nulls first`);

  return Map.groupBy(linhas.map(comHorasFormatadas), (linha) => linha.funcaoId);
}

/** O `time` do Postgres volta como `HH:MM:SS`; as telas leem `HH:MM`. */
function comHorasFormatadas<T extends { entrada: string; saida: string }>(linha: T): T {
  return { ...linha, entrada: formatarHora(linha.entrada), saida: formatarHora(linha.saida) };
}

/**
 * O contrato da funcao numa linha, so da turma `escala`.
 *
 * A faixa da grade mostra o que o posto exige; a contraescala e a outra metade
 * da mesma exigencia, e repetir as duas no cabecalho encheria a linha sem dizer
 * mais nada — quem segue qual aparece na propria pessoa.
 */
function rotuloDaEscala(vigencias: VigenciaDoCiclo[] | undefined) {
  return rotuloDasVigencias((vigencias ?? []).filter((vigencia) => vigencia.turma === "escala"));
}

/**
 * Os postos com as funcoes de cada um, ativos primeiro.
 *
 * Sem paginacao de proposito, ao contrario de escalas e funcionarios: a lista e
 * a operacao inteira desenhada de uma vez, e quem monta a escala precisa
 * enxergar todos os blocos para saber o que ainda nao tem gente.
 */
export async function listarPostos(busca?: string): Promise<PostoResumo[]> {
  await connection();

  const padrao = padraoDeBusca(busca);

  // O filtro alcanca o nome da funcao porque e por ela que se procura um posto
  // ("portaria"), e nao pelo codigo que so quem opera decorou.
  const filtro = padrao
    ? or(
        ilike(postos.codigo, padrao),
        ilike(postos.nome, padrao),
        sql`exists (
          select 1 from ${funcoesPosto} funcao
          where funcao.posto_id = ${postos.id} and funcao.nome ilike ${padrao}
        )`,
      )
    : undefined;

  const linhas = await db
    .select({
      id: postos.id,
      codigo: postos.codigo,
      nome: postos.nome,
      empresaId: postos.empresaId,
      empresaNome: empresas.nome,
      ativo: postos.ativo,
    })
    .from(postos)
    .leftJoin(empresas, eq(empresas.id, postos.empresaId))
    .where(filtro)
    .orderBy(desc(postos.ativo), asc(postos.codigo));

  if (linhas.length === 0) {
    return [];
  }

  // Uma consulta para as funcoes de todos os postos, e nao uma por posto: o
  // agrupamento aconteceria aqui de qualquer forma.
  const funcoes = await db
    .select(colunasDaFuncao)
    .from(funcoesPosto)
    .leftJoin(eventos, eq(eventos.id, funcoesPosto.eventoTrabalhoId))
    .orderBy(desc(funcoesPosto.ativa), asc(funcoesPosto.ordem), asc(funcoesPosto.nome));

  const vigencias = await vigenciasDasFuncoes(funcoes.map((funcao) => funcao.id));
  const porPosto = Map.groupBy(funcoes, (funcao) => funcao.postoId);

  return linhas.map((posto) => ({
    ...posto,
    funcoes: (porPosto.get(posto.id) ?? []).map((funcao) => ({
      ...funcao,
      vigencias: vigencias.get(funcao.id) ?? [],
    })),
  }));
}

/** `null` para id inexistente — e tambem para id que nem uuid e. */
export async function obterPosto(id: string): Promise<PostoResumo | null> {
  await connection();

  // Sem essa validacao, um id fora do formato uuid faria o Postgres lancar erro
  // de cast em vez de simplesmente nao encontrar nada.
  const idValido = idPostoSchema.safeParse(id);

  if (!idValido.success) {
    return null;
  }

  const [posto] = await db
    .select({
      id: postos.id,
      codigo: postos.codigo,
      nome: postos.nome,
      empresaId: postos.empresaId,
      empresaNome: empresas.nome,
      ativo: postos.ativo,
    })
    .from(postos)
    .leftJoin(empresas, eq(empresas.id, postos.empresaId))
    .where(eq(postos.id, idValido.data));

  if (!posto) {
    return null;
  }

  const funcoes = await db
    .select(colunasDaFuncao)
    .from(funcoesPosto)
    .leftJoin(eventos, eq(eventos.id, funcoesPosto.eventoTrabalhoId))
    .where(eq(funcoesPosto.postoId, posto.id))
    .orderBy(desc(funcoesPosto.ativa), asc(funcoesPosto.ordem), asc(funcoesPosto.nome));

  const vigencias = await vigenciasDasFuncoes(funcoes.map((funcao) => funcao.id));

  return {
    ...posto,
    funcoes: funcoes.map((funcao) => ({ ...funcao, vigencias: vigencias.get(funcao.id) ?? [] })),
  };
}

/**
 * Para onde a pessoa pode ter ido num dia: uma linha por funcao ativa de posto
 * ativo, no formato que o campo "posto de destino" do modal mostra.
 *
 * Funcao inativa fica de fora porque desativar significa exatamente "nao monte
 * mais escala aqui"; o que ja foi preenchido continua abrindo pela URL.
 */
export async function listarBlocos(): Promise<BlocoDaGrade[]> {
  await connection();

  return db
    .select({
      funcaoId: funcoesPosto.id,
      funcaoNome: funcoesPosto.nome,
      postoCodigo: postos.codigo,
    })
    .from(funcoesPosto)
    .innerJoin(postos, eq(postos.id, funcoesPosto.postoId))
    .where(and(eq(funcoesPosto.ativa, true), eq(postos.ativo, true)))
    .orderBy(asc(postos.codigo), asc(funcoesPosto.ordem), asc(funcoesPosto.nome));
}

/**
 * Os postos que a grade pode abrir, cada um com as suas funcoes.
 *
 * E o posto que vira tela, e nao a funcao: a escala de um lugar se le inteira,
 * com os turnos um embaixo do outro — separar cada funcao numa tela propria
 * obrigaria a abrir quatro para conferir uma portaria. As funcoes continuam
 * existindo, como faixas **dentro** da mesma grade.
 *
 * Funcao inativa fica de fora porque desativar significa exatamente "nao monte
 * mais escala aqui"; o que ja foi preenchido continua na grade do posto.
 */
export async function listarPostosDaGrade(): Promise<PostoDaGrade[]> {
  await connection();

  const vigor = await competenciaEmVigor();
  const competenciaId = vigor?.competencia.id ?? null;

  const linhas = await db
    .select({
      funcaoId: funcoesPosto.id,
      funcaoNome: funcoesPosto.nome,
      postoId: postos.id,
      postoCodigo: postos.codigo,
      postoNome: postos.nome,
      observacao: funcoesPosto.observacao,
      pessoas: pessoasDoBloco(competenciaId),
    })
    .from(funcoesPosto)
    .innerJoin(postos, eq(postos.id, funcoesPosto.postoId))
    .where(and(eq(funcoesPosto.ativa, true), eq(postos.ativo, true)))
    .orderBy(asc(postos.codigo), asc(funcoesPosto.ordem), asc(funcoesPosto.nome));

  const vigencias = await vigenciasDasFuncoes(linhas.map((linha) => linha.funcaoId));

  // Agrupado aqui, e nao em SQL: a consulta ja vem ordenada por posto, e o que
  // falta e desenho. Um `group by` teria de agregar as funcoes num array so
  // para o cliente reabri-lo.
  return [...Map.groupBy(linhas, (linha) => linha.postoId).values()].map((doPosto) => {
    const [primeiro] = doPosto;

    return {
      id: primeiro.postoId,
      codigo: primeiro.postoCodigo,
      nome: primeiro.postoNome,
      funcoes: doPosto.map((funcao) => ({
        id: funcao.funcaoId,
        nome: funcao.funcaoNome,
        rotuloDoCiclo: rotuloDaEscala(vigencias.get(funcao.funcaoId)),
        observacao: funcao.observacao,
      })),
      pessoas: doPosto.reduce((total, funcao) => total + funcao.pessoas, 0),
    };
  });
}

/**
 * Os postos que ainda podem receber um registro novo: so os ativos, so os
 * campos que o campo de escolha mostra.
 *
 * Sem paginacao nem busca de proposito — e um `select` para preencher um campo,
 * nao uma tela. Posto inativo fica de fora porque desativar significa
 * exatamente "nao registre mais aqui"; o que ja foi registrado continua
 * apontando para ele, e por isso as telas leem o posto pelo join e nao por esta
 * funcao. Mesmo arranjo de `listarEscalasAtivas()`.
 */
export async function listarPostosAtivos(): Promise<PostoParaEscolha[]> {
  await connection();

  return db
    .select({ id: postos.id, codigo: postos.codigo, nome: postos.nome })
    .from(postos)
    .where(eq(postos.ativo, true))
    .orderBy(asc(postos.codigo));
}

/**
 * O responsavel e o grupo de contato de um posto, para a aba Responsavel.
 *
 * Cadastro, e nao dado datado: nenhuma das duas leituras passa pela
 * competencia. O grupo nao e a grade — a grade muda todo mes, e quem cobre dois
 * postos teria dois responsaveis.
 */
export async function obterGrupoDeContato(postoId: string): Promise<GrupoDeContato> {
  await connection();

  const [linha] = await db
    .select({
      id: funcionarios.id,
      nome: funcionarios.nome,
      matricula: funcionarios.matricula,
      cargo: funcionarios.cargo,
      telefone: funcionarios.telefone,
      ativo: funcionarios.ativo,
    })
    .from(postos)
    .innerJoin(funcionarios, eq(funcionarios.id, postos.responsavelId))
    .where(eq(postos.id, postoId));

  const membros = await db
    .select({
      funcionarioId: funcionarios.id,
      nome: funcionarios.nome,
      matricula: funcionarios.matricula,
      cargo: funcionarios.cargo,
      empresaNome: empresas.nome,
      telefone: funcionarios.telefone,
      ativo: funcionarios.ativo,
    })
    .from(postoContatos)
    .innerJoin(funcionarios, eq(funcionarios.id, postoContatos.funcionarioId))
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .where(eq(postoContatos.postoId, postoId))
    .orderBy(desc(funcionarios.ativo), asc(sql`lower(${funcionarios.nome})`));

  return { responsavel: linha ?? null, membros };
}

/** O funcionario do responsavel, com nome proprio na consulta: `funcionarios` aparece duas vezes. */
const responsavel = alias(funcionarios, "responsavel");

/**
 * Para quem vai a mensagem de correcao de ponto de cada pessoa — em lote, para
 * o painel de pendencias nao fazer uma consulta por linha.
 *
 * Quem nao aparece no mapa e `colaborador`: nao esta em grupo nenhum, ou o
 * posto do grupo nao tem responsavel. O `innerJoin` com o responsavel e o que
 * faz o segundo caso cair fora. O `ativo` do responsavel **nao** filtra: o
 * responsavel desativado continua sendo o caminho, e o envio para por isso —
 * voltar ao contato direto sem ninguem decidir e o que o grupo existe para
 * evitar.
 */
export async function contatosDosFuncionarios(
  funcionarioIds: readonly string[],
): Promise<Map<string, ContatoDoFuncionario>> {
  await connection();

  const contatos = new Map<string, ContatoDoFuncionario>();

  if (funcionarioIds.length === 0) {
    return contatos;
  }

  const linhas = await db
    .select({
      funcionarioId: postoContatos.funcionarioId,
      postoId: postos.id,
      postoCodigo: postos.codigo,
      postoNome: postos.nome,
      responsavelId: responsavel.id,
      responsavelNome: responsavel.nome,
      responsavelTelefone: responsavel.telefone,
      responsavelAtivo: responsavel.ativo,
    })
    .from(postoContatos)
    .innerJoin(postos, eq(postos.id, postoContatos.postoId))
    .innerJoin(responsavel, eq(responsavel.id, postos.responsavelId))
    .where(inArray(postoContatos.funcionarioId, [...new Set(funcionarioIds)]));

  for (const linha of linhas) {
    contatos.set(linha.funcionarioId, {
      via: "responsavel",
      posto: { id: linha.postoId, codigo: linha.postoCodigo, nome: linha.postoNome },
      responsavel: {
        id: linha.responsavelId,
        nome: linha.responsavelNome,
        telefone: linha.responsavelTelefone,
        ativo: linha.responsavelAtivo,
      },
    });
  }

  return contatos;
}

/** O mesmo, para uma pessoa so — a tela da ocorrencia, o envio e o chatbot. */
export async function contatoDoFuncionario(funcionarioId: string): Promise<ContatoDoFuncionario> {
  const contatos = await contatosDosFuncionarios([funcionarioId]);
  return contatos.get(funcionarioId) ?? { via: "colaborador" };
}
