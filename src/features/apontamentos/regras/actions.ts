"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { apontamentos, regraApontamentoExcecoes, regrasApontamento } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";

import { apontamentoVazio, lerHoras, lerPercentual } from "../rubricas";
import { AREA_APONTAMENTOS } from "../types";
import { unidadeDaRubricaDaRegra } from "./campos";
import { sugestoesDaCompetencia } from "./queries";
import {
  atualizarRegraSchema,
  criarRegraSchema,
  excluirRegraSchema,
  lerExcecao,
  type CriarRegraInput,
} from "./schema";
import {
  ROTA_REGRAS,
  type ExcluirRegraState,
  type GerarApontamentosState,
  type RegraState,
  type ValoresDaRegra,
} from "./types";

/**
 * Escritas do cadastro de regras, e a geracao em lote que elas alimentam.
 *
 * O cadastro **nao** passa por `competenciaDeEscrita()`: regra e cadastro, como
 * evento e posto. Ja `gerarApontamentos()` grava dado datado, e comeca por ela
 * — com o id da competencia que a tela desenhou, pela mesma razao das demais
 * telas sem campo de data.
 */

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

const NOME_REPETIDO = "Ja existe uma regra com este nome";

function lerValores(formData: FormData): ValoresDaRegra {
  const texto = (campo: string) => String(formData.get(campo) ?? "");

  return {
    nome: texto("nome"),
    descricao: texto("descricao"),
    ordem: texto("ordem"),
    ativa: formData.get("ativa") === "on" ? "on" : "",
    empresaId: texto("empresaId"),
    cargo: texto("cargo"),
    funcionarioId: texto("funcionarioId"),
    postoId: texto("postoId"),
    funcaoId: texto("funcaoId"),
    turma: texto("turma"),
    eventoId: texto("eventoId"),
    cicloDias: texto("cicloDias"),
    cicloFolgas: texto("cicloFolgas"),
    jornadaMinutos: texto("jornadaMinutos"),
    gatilho: texto("gatilho"),
    rubrica: texto("rubrica"),
    acao: texto("acao"),
    quantidade: texto("quantidade"),
    percentual: texto("percentual"),
    grau: texto("grau"),
    excecoes: formData.getAll("excecoes").map(String),
  };
}

function recusa(
  valores: ValoresDaRegra,
  erros?: RegraState["erros"],
  mensagem?: string,
): RegraState {
  return {
    status: "error",
    mensagem: mensagem ?? "Confira os campos destacados.",
    erros,
    valores,
    tentativa: crypto.randomUUID(),
  };
}

/**
 * O valor da regra, na coluna que a unidade da rubrica manda — as outras duas
 * ficam nulas, como o `check regras_apontamento_um_valor` exige.
 */
function valorDaRegra(dados: CriarRegraInput) {
  const unidade = unidadeDaRubricaDaRegra(dados.rubrica);

  if (unidade === "grau") {
    return { quantidade: null, percentual: null, grau: dados.grau };
  }

  if (unidade === "percentual") {
    return { quantidade: null, percentual: lerPercentual(dados.percentual) ?? 0, grau: null };
  }

  if (unidade === "horas") {
    return { quantidade: lerHoras(dados.quantidade) ?? 0, percentual: null, grau: null };
  }

  // Dias e marcacao: a marcacao chega como 1 (marcada) ou 0, e a acao e sempre
  // `definir` — quem garante isso e o `conferirRegra` do schema.
  return { quantidade: Number(dados.quantidade || 0), percentual: null, grau: null };
}

function colunasDaRegra(dados: CriarRegraInput, usuarioId: string) {
  // Campo a campo, e nao um `rest` do que sobrou: as tres colunas de valor sao
  // escolhidas por `valorDaRegra()`, e as excecoes viram linhas de outra tabela.
  return {
    nome: dados.nome,
    descricao: dados.descricao,
    ordem: dados.ordem,
    ativa: dados.ativa,
    empresaId: dados.empresaId,
    cargo: dados.cargo,
    funcionarioId: dados.funcionarioId,
    postoId: dados.postoId,
    funcaoId: dados.funcaoId,
    turma: dados.turma,
    eventoId: dados.eventoId,
    cicloDias: dados.cicloDias,
    cicloFolgas: dados.cicloFolgas,
    jornadaMinutos: dados.jornadaMinutos,
    gatilho: dados.gatilho,
    rubrica: dados.rubrica,
    acao: dados.acao,
    ...valorDaRegra(dados),
    atualizadoPorId: usuarioId,
  };
}

/** As excecoes viram linhas: uma por alvo, com a coluna do tipo preenchida. */
function linhasDasExcecoes(regraId: string, excecoes: readonly string[]) {
  return excecoes.flatMap((valor) => {
    const alvo = lerExcecao(valor);

    if (!alvo) {
      return [];
    }

    return [
      {
        regraId,
        empresaId: alvo.tipo === "empresa" ? alvo.id : null,
        postoId: alvo.tipo === "posto" ? alvo.id : null,
        funcaoId: alvo.tipo === "funcao" ? alvo.id : null,
        funcionarioId: alvo.tipo === "funcionario" ? alvo.id : null,
      },
    ];
  });
}

export async function criarRegra(
  _estadoAnterior: RegraState,
  formData: FormData,
): Promise<RegraState> {
  const usuario = await exigirAcesso(AREA_APONTAMENTOS);

  const valores = lerValores(formData);
  const resultado = criarRegraSchema.safeParse(valores);

  if (!resultado.success) {
    return recusa(valores, z.flattenError(resultado.error).fieldErrors);
  }

  let regraId: string;

  try {
    regraId = await db.transaction(async (tx) => {
      const [criada] = await tx
        .insert(regrasApontamento)
        .values(colunasDaRegra(resultado.data, usuario.id))
        .returning({ id: regrasApontamento.id });

      const excecoes = linhasDasExcecoes(criada.id, resultado.data.excecoes);

      if (excecoes.length > 0) {
        await tx.insert(regraApontamentoExcecoes).values(excecoes);
      }

      return criada.id;
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return recusa(valores, { nome: [NOME_REPETIDO] });
    }

    console.error("Falha ao criar regra de apontamento", erro);
    return recusa(valores, undefined, FALHA_GENERICA);
  }

  // A tela de cadastro nao tem o que mostrar depois de gravar: quem acabou de
  // criar quer ver a regra na lista, ao lado das outras que ja a precedem.
  redirect(`${ROTA_REGRAS}/${regraId}`);
}

export async function atualizarRegra(
  _estadoAnterior: RegraState,
  formData: FormData,
): Promise<RegraState> {
  const usuario = await exigirAcesso(AREA_APONTAMENTOS);

  const valores = lerValores(formData);
  const resultado = atualizarRegraSchema.safeParse({
    ...valores,
    regraId: formData.get("regraId"),
  });

  if (!resultado.success) {
    return recusa(valores, z.flattenError(resultado.error).fieldErrors);
  }

  const { regraId, ...dados } = resultado.data;

  try {
    const gravada = await db.transaction(async (tx) => {
      const linhas = await tx
        .update(regrasApontamento)
        .set(colunasDaRegra(dados, usuario.id))
        .where(eq(regrasApontamento.id, regraId))
        .returning({ id: regrasApontamento.id });

      if (linhas.length === 0) {
        return false;
      }

      // As excecoes sao substituidas em bloco, como as areas de um usuario: o
      // formulario manda a lista inteira, e o que nao veio deixou de valer.
      await tx
        .delete(regraApontamentoExcecoes)
        .where(eq(regraApontamentoExcecoes.regraId, regraId));

      const excecoes = linhasDasExcecoes(regraId, dados.excecoes);

      if (excecoes.length > 0) {
        await tx.insert(regraApontamentoExcecoes).values(excecoes);
      }

      return true;
    });

    if (!gravada) {
      return recusa(valores, undefined, "Regra nao encontrada.");
    }
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return recusa(valores, { nome: [NOME_REPETIDO] });
    }

    console.error("Falha ao atualizar regra de apontamento", erro);
    return recusa(valores, undefined, FALHA_GENERICA);
  }

  refresh();

  return { status: "success", mensagem: "Regra salva." };
}

/**
 * Apaga uma regra.
 *
 * Ela se apaga, ao contrario de evento e posto, porque nao explica nada
 * gravado: a sugestao e derivada a cada leitura, e o apontamento ja gravado nao
 * guarda de que regra veio. Uma regra cadastrada por engano so polui a lista —
 * e desativar bastaria, mas deixaria lixo para sempre.
 */
export async function excluirRegra(
  _estadoAnterior: ExcluirRegraState,
  formData: FormData,
): Promise<ExcluirRegraState> {
  await exigirAcesso(AREA_APONTAMENTOS);

  const resultado = excluirRegraSchema.safeParse({ regraId: formData.get("regraId") });

  if (!resultado.success) {
    return { status: "error", mensagem: "Regra invalida." };
  }

  try {
    const apagadas = await db
      .delete(regrasApontamento)
      .where(eq(regrasApontamento.id, resultado.data.regraId))
      .returning({ id: regrasApontamento.id });

    if (apagadas.length === 0) {
      return { status: "error", mensagem: "Regra nao encontrada." };
    }
  } catch (erro) {
    console.error("Falha ao excluir regra de apontamento", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  // A tela aberta e a da regra que deixou de existir — mesmo arranjo da
  // exclusao de um extra.
  redirect(ROTA_REGRAS);
}

/**
 * Grava a sugestao das regras para quem ainda **nao** tem apontamento na
 * competencia.
 *
 * Nunca sobrescreve: o dia lancado a mao vale mais que o lote, pela mesma razao
 * do "Preencher varios dias" da grade — desfazer trezentas fichas reescritas
 * nao tem botao. Quem ja tem apontamento continua aparecendo na lista com o
 * aviso de que ele difere da sugestao, e a ficha mostra os dois lados.
 */
export async function gerarApontamentos(
  _estadoAnterior: GerarApontamentosState,
  formData: FormData,
): Promise<GerarApontamentosState> {
  const usuario = await exigirAcesso(AREA_APONTAMENTOS);

  const escrita = await competenciaDeEscrita(formData.get("competenciaId"));

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const { competencia } = escrita;

  try {
    const sugestoes = await sugestoesDaCompetencia();

    const linhas = [...sugestoes.entries()]
      .filter(([, sugestao]) => !apontamentoVazio(sugestao.apontamento))
      .map(([funcionarioId, sugestao]) => ({
        ...sugestao.apontamento,
        competenciaId: competencia.id,
        funcionarioId,
        atualizadoPorId: usuario.id,
      }));

    if (linhas.length === 0) {
      return {
        status: "error",
        mensagem: "Nenhuma sugestao a gravar: confira as regras e a grade da competencia.",
      };
    }

    const gravadas = await db
      .insert(apontamentos)
      .values(linhas)
      // Quem ja tem apontamento fica como esta — o `returning` diz quantos
      // entraram de fato.
      .onConflictDoNothing({
        target: [apontamentos.competenciaId, apontamentos.funcionarioId],
      })
      .returning({ id: apontamentos.id });

    refresh();

    const mantidos = linhas.length - gravadas.length;

    return {
      status: "success",
      mensagem:
        `${gravadas.length} ${gravadas.length === 1 ? "apontamento gerado" : "apontamentos gerados"}` +
        (mantidos > 0 ? `; ${mantidos} ja existiam e ficaram como estavam.` : "."),
    };
  } catch (erro) {
    console.error("Falha ao gerar apontamentos pelas regras", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }
}
