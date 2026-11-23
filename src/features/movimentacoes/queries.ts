import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import {
  freelancers,
  funcionarios,
  movimentacaoDocumentos,
  movimentacaoPessoas,
  movimentacoes,
  usuarios,
  type TipoDeMovimentacao,
} from "@/db/schema";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { valorDoFreelancer, valorDoFuncionario } from "@/features/extras/colaborador";

import { conteudoDoDocumento } from "./documentos";
import { idMovimentacaoSchema } from "./schema";
import {
  IDS_TIPO_DE_MOVIMENTACAO,
  MOVIMENTACOES_POR_PAGINA,
  type DocumentoResumo,
  type FiltrosDeMovimentacoes,
  type MovimentacaoResumo,
  type PaginaDeMovimentacoes,
  type PessoaDaMovimentacao,
} from "./types";

/**
 * Leituras do modulo de movimentacoes: chamadas por Server Components e Route
 * Handlers, nunca pelo client.
 *
 * **Toda consulta filtra por `competenciaEmVigor()`**: a movimentacao e dado
 * datado. `null` e "nao ha o que mostrar" — inclusive para o documento pedido
 * pela URL, que so abre se a movimentacao dele estiver na competencia em vigor,
 * do mesmo jeito que a lista so a mostra la.
 */

/**
 * O padrao do `ilike`, com `%` e `_` escapados — sem isso buscar "%" traria a
 * tabela inteira. Mesmo escape das outras buscas do portal.
 */
function padraoDeBusca(busca: string) {
  const termo = busca.trim();

  return termo ? `%${termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%` : null;
}

/**
 * O recorte da URL em SQL, sempre somado a competencia.
 *
 * A busca casa com **tudo o que a linha mostra**: a justificativa, a data no
 * formato da tela e qualquer pessoa envolvida (nome, matricula ou codigo). As
 * pessoas estao noutra tabela, entao o casamento e um `exists` — um `join`
 * repetiria a movimentacao uma vez por pessoa que casou.
 */
function filtroDaLista(competenciaId: string, filtros: FiltrosDeMovimentacoes): SQL | undefined {
  const padrao = padraoDeBusca(filtros.busca);

  return and(
    eq(movimentacoes.competenciaId, competenciaId),
    filtros.tipo ? eq(movimentacoes.tipo, filtros.tipo) : undefined,
    filtros.de ? gte(movimentacoes.data, filtros.de) : undefined,
    filtros.ate ? lte(movimentacoes.data, filtros.ate) : undefined,
    filtros.documento
      ? sql`${filtros.documento === "com" ? sql`exists` : sql`not exists`} (
          select 1 from ${movimentacaoDocumentos}
          where ${movimentacaoDocumentos.movimentacaoId} = ${movimentacoes.id}
        )`
      : undefined,
    padrao
      ? sql`(
          ${movimentacoes.justificativa} ilike ${padrao}
          or to_char(${movimentacoes.data}, 'DD/MM/YYYY') ilike ${padrao}
          or exists (
            select 1 from ${movimentacaoPessoas}
            left join ${funcionarios} on ${funcionarios.id} = ${movimentacaoPessoas.funcionarioId}
            left join ${freelancers} on ${freelancers.id} = ${movimentacaoPessoas.freelancerId}
            where ${movimentacaoPessoas.movimentacaoId} = ${movimentacoes.id}
              and (
                ${funcionarios.nome} ilike ${padrao}
                or ${funcionarios.matricula} ilike ${padrao}
                or ${freelancers.nome} ilike ${padrao}
                or ${freelancers.codigo} ilike ${padrao}
              )
          )
        )`
      : undefined,
  );
}

/**
 * Completa as movimentacoes com pessoas e documentos, numa consulta de cada —
 * e nao uma por linha. Os documentos vem **sem** o conteudo.
 */
async function completar(
  linhas: {
    id: string;
    tipo: TipoDeMovimentacao;
    data: string;
    justificativa: string;
    registradoPor: string | null;
    criadoEm: Date;
  }[],
): Promise<MovimentacaoResumo[]> {
  if (linhas.length === 0) {
    return [];
  }

  const ids = linhas.map((linha) => linha.id);

  const [pessoas, documentos] = await Promise.all([
    db
      .select({
        movimentacaoId: movimentacaoPessoas.movimentacaoId,
        papel: movimentacaoPessoas.papel,
        funcionarioId: movimentacaoPessoas.funcionarioId,
        funcionarioNome: funcionarios.nome,
        funcionarioMatricula: funcionarios.matricula,
        freelancerId: movimentacaoPessoas.freelancerId,
        freelancerNome: freelancers.nome,
        freelancerCodigo: freelancers.codigo,
      })
      .from(movimentacaoPessoas)
      .leftJoin(funcionarios, eq(funcionarios.id, movimentacaoPessoas.funcionarioId))
      .leftJoin(freelancers, eq(freelancers.id, movimentacaoPessoas.freelancerId))
      .where(inArray(movimentacaoPessoas.movimentacaoId, ids))
      .orderBy(asc(movimentacaoPessoas.ordem)),

    db
      .select({
        movimentacaoId: movimentacaoDocumentos.movimentacaoId,
        id: movimentacaoDocumentos.id,
        nome: movimentacaoDocumentos.nome,
        tipoMime: movimentacaoDocumentos.tipoMime,
        tamanho: movimentacaoDocumentos.tamanho,
        tamanhoOriginal: movimentacaoDocumentos.tamanhoOriginal,
      })
      .from(movimentacaoDocumentos)
      .where(inArray(movimentacaoDocumentos.movimentacaoId, ids))
      .orderBy(asc(movimentacaoDocumentos.criadoEm), asc(movimentacaoDocumentos.nome)),
  ]);

  const pessoasPorMovimentacao = new Map<string, PessoaDaMovimentacao[]>();

  for (const pessoa of pessoas) {
    const lista = pessoasPorMovimentacao.get(pessoa.movimentacaoId) ?? [];

    // O `check movimentacao_pessoas_uma_pessoa` diz que so um dos dois lados
    // tem linha; o nome so faltaria se o cadastro sumisse, e as FKs sao
    // `restrict`.
    lista.push(
      pessoa.funcionarioId
        ? {
            papel: pessoa.papel,
            valor: valorDoFuncionario(pessoa.funcionarioId),
            nome: pessoa.funcionarioNome ?? "(funcionario removido)",
            identificacao: pessoa.funcionarioMatricula,
            freelancer: false,
          }
        : {
            papel: pessoa.papel,
            valor: pessoa.freelancerId ? valorDoFreelancer(pessoa.freelancerId) : "",
            nome: pessoa.freelancerNome ?? "(freelancer removido)",
            identificacao: pessoa.freelancerCodigo,
            freelancer: true,
          },
    );

    pessoasPorMovimentacao.set(pessoa.movimentacaoId, lista);
  }

  const documentosPorMovimentacao = new Map<string, DocumentoResumo[]>();

  for (const { movimentacaoId, ...documento } of documentos) {
    const lista = documentosPorMovimentacao.get(movimentacaoId) ?? [];
    lista.push(documento);
    documentosPorMovimentacao.set(movimentacaoId, lista);
  }

  return linhas.map((linha) => ({
    id: linha.id,
    tipo: linha.tipo,
    data: linha.data,
    justificativa: linha.justificativa,
    pessoas: pessoasPorMovimentacao.get(linha.id) ?? [],
    documentos: documentosPorMovimentacao.get(linha.id) ?? [],
    registradoPor: linha.registradoPor,
    criadoEm: linha.criadoEm.toISOString(),
  }));
}

const colunas = {
  id: movimentacoes.id,
  tipo: movimentacoes.tipo,
  data: movimentacoes.data,
  justificativa: movimentacoes.justificativa,
  registradoPor: usuarios.nome,
  criadoEm: movimentacoes.criadoEm,
};

/**
 * Uma pagina de movimentacoes da competencia em vigor, do dia mais recente para
 * o mais antigo, com a contagem por tipo do recorte inteiro.
 */
export async function listarMovimentacoes(
  filtros: FiltrosDeMovimentacoes,
): Promise<PaginaDeMovimentacoes> {
  await connection();

  const porTipo = Object.fromEntries(IDS_TIPO_DE_MOVIMENTACAO.map((tipo) => [tipo, 0])) as Record<
    TipoDeMovimentacao,
    number
  >;

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return { movimentacoes: [], total: 0, porTipo, pagina: 1, paginas: 1 };
  }

  const filtro = filtroDaLista(vigor.competencia.id, filtros);

  // A contagem por tipo faz as vezes do `count(*)`: o total e a soma dela.
  const contagens = await db
    .select({ tipo: movimentacoes.tipo, quantas: count() })
    .from(movimentacoes)
    .where(filtro)
    .groupBy(movimentacoes.tipo);

  for (const { tipo, quantas } of contagens) {
    porTipo[tipo] = quantas;
  }

  const total = contagens.reduce((soma, { quantas }) => soma + quantas, 0);
  const paginas = Math.max(1, Math.ceil(total / MOVIMENTACOES_POR_PAGINA));
  // Link velho (`?pagina=99`) cai na ultima pagina, e nao numa tela vazia.
  const paginaAtual = Math.min(filtros.pagina, paginas);

  const linhas = await db
    .select(colunas)
    .from(movimentacoes)
    .leftJoin(usuarios, eq(usuarios.id, movimentacoes.registradoPorId))
    .where(filtro)
    // `criado_em` desempata: duas do mesmo dia nao trocam de lugar entre paginas.
    .orderBy(desc(movimentacoes.data), desc(movimentacoes.criadoEm))
    .limit(MOVIMENTACOES_POR_PAGINA)
    .offset((paginaAtual - 1) * MOVIMENTACOES_POR_PAGINA);

  return {
    movimentacoes: await completar(linhas),
    total,
    porTipo,
    pagina: paginaAtual,
    paginas,
  };
}

/**
 * Tudo o que o recorte alcanca, sem paginar e em ordem cronologica — a
 * planilha. Mesmo `filtroDaLista()` da tela: o arquivo e o que a lista mostra,
 * e nao uma segunda leitura que poderia divergir dela.
 */
export async function listarMovimentacoesParaExportar(
  filtros: FiltrosDeMovimentacoes,
): Promise<MovimentacaoResumo[]> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return [];
  }

  const linhas = await db
    .select(colunas)
    .from(movimentacoes)
    .leftJoin(usuarios, eq(usuarios.id, movimentacoes.registradoPorId))
    .where(filtroDaLista(vigor.competencia.id, filtros))
    .orderBy(asc(movimentacoes.data), asc(movimentacoes.criadoEm));

  return completar(linhas);
}

/**
 * Um documento para download, ja descomprimido. `null` para id invalido,
 * inexistente ou de movimentacao fora da competencia em vigor.
 */
export async function abrirDocumento(
  id: string,
): Promise<{ nome: string; tipoMime: string; conteudo: Uint8Array } | null> {
  await connection();

  const vigor = await competenciaEmVigor();
  const idValido = idMovimentacaoSchema.safeParse(id);

  if (!vigor || !idValido.success) {
    return null;
  }

  const [documento] = await db
    .select({
      nome: movimentacaoDocumentos.nome,
      tipoMime: movimentacaoDocumentos.tipoMime,
      compressao: movimentacaoDocumentos.compressao,
      conteudo: movimentacaoDocumentos.conteudo,
    })
    .from(movimentacaoDocumentos)
    .innerJoin(movimentacoes, eq(movimentacoes.id, movimentacaoDocumentos.movimentacaoId))
    .where(
      and(
        eq(movimentacaoDocumentos.id, idValido.data),
        eq(movimentacoes.competenciaId, vigor.competencia.id),
      ),
    );

  if (!documento) {
    return null;
  }

  return {
    nome: documento.nome,
    tipoMime: documento.tipoMime,
    conteudo: await conteudoDoDocumento(documento),
  };
}
