"use server";

import { and, eq, gt, inArray, or } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { escalaExcecoes, escalaFolgas, escalas } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";

import { diasTrabalhadosDoCiclo, formatarHora, mesmaJornada, type JornadaDoDia } from "./jornada";
import { folgasDaEscala } from "./queries";
import {
  atualizarEscalaSchema,
  criarEscalaSchema,
  definirDiasDoCicloSchema,
  jornadaDoDiaSchema,
} from "./schema";
import type {
  AtualizarEscalaState,
  CriarEscalaState,
  DiasDoCicloState,
  ValoresDaEscala,
} from "./types";

/**
 * Escritas do modulo de escalas.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod e refaz a checagem de acesso — o formulario nao autoriza nada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const AREA = "escalas" as const;

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";
const NOME_EM_USO = "Ja existe uma escala com este nome";

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Substitui em bloco as folgas do ciclo, como as areas em `acessos`. */
async function gravarFolgas(tx: Transacao, escalaId: string, folgas: number[]) {
  await tx.delete(escalaFolgas).where(eq(escalaFolgas.escalaId, escalaId));

  if (folgas.length > 0) {
    await tx.insert(escalaFolgas).values(folgas.map((diaCiclo) => ({ escalaId, diaCiclo })));
  }
}

/**
 * O formulario chega inteiro como texto. Ler tudo antes de validar tambem e o
 * que permite devolver os valores digitados quando o Zod recusa.
 */
function lerValores(formData: FormData): ValoresDaEscala {
  return {
    nome: String(formData.get("nome") ?? ""),
    descricao: String(formData.get("descricao") ?? ""),
    entrada: String(formData.get("entrada") ?? ""),
    saida: String(formData.get("saida") ?? ""),
    diasCiclo: String(formData.get("diasCiclo") ?? ""),
    // Checkbox nao marcado nao vai no FormData: o que vem sao as folgas.
    folgas: formData.getAll("folgas").map(Number),
    intrajornadaMinutos: String(formData.get("intrajornadaMinutos") ?? ""),
    marcacoesEsperadas: String(formData.get("marcacoesEsperadas") ?? ""),
    horasExtrasMinutos: String(formData.get("horasExtrasMinutos") ?? ""),
  };
}

export async function criarEscala(
  _estadoAnterior: CriarEscalaState,
  formData: FormData,
): Promise<CriarEscalaState> {
  await exigirAcesso(AREA);

  const valores = lerValores(formData);
  const resultado = criarEscalaSchema.safeParse(valores);

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      valores,
    };
  }

  const { folgas, ...escala } = resultado.data;

  try {
    await db.transaction(async (tx) => {
      const [criada] = await tx.insert(escalas).values(escala).returning({ id: escalas.id });

      await gravarFolgas(tx, criada.id, folgas);
    });
  } catch (erro) {
    // O nome e unico por indice (`lower(nome)`), e nao por consulta previa:
    // duas requisicoes simultaneas passariam pelo "ja existe?" das duas vezes.
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { nome: [NOME_EM_USO] },
        valores,
      };
    }

    console.error("Falha ao cadastrar escala", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return {
    status: "success",
    mensagem: `Escala ${escala.nome} cadastrada.`,
    chave: crypto.randomUUID(),
  };
}

export async function atualizarEscala(
  _estadoAnterior: AtualizarEscalaState,
  formData: FormData,
): Promise<AtualizarEscalaState> {
  await exigirAcesso(AREA);

  const resultado = atualizarEscalaSchema.safeParse({
    ...lerValores(formData),
    escalaId: formData.get("escalaId"),
    // Checkbox nao marcado nao vai no FormData: a presenca do campo e o valor.
    ativa: formData.has("ativa"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { escalaId, folgas, ...escala } = resultado.data;

  try {
    const atualizadas = await db.transaction(async (tx) => {
      const linhas = await tx
        .update(escalas)
        .set(escala)
        .where(eq(escalas.id, escalaId))
        .returning({ id: escalas.id });

      await gravarFolgas(tx, escalaId, folgas);

      // Encurtar o ciclo — ou marcar como folga um dia que era trabalhado —
      // deixaria excecao apontando para um dia que nao existe mais ou que
      // virou folga, e dia de folga nao tem horario a ajustar.
      await tx
        .delete(escalaExcecoes)
        .where(
          and(
            eq(escalaExcecoes.escalaId, escalaId),
            or(
              gt(escalaExcecoes.diaCiclo, escala.diasCiclo),
              folgas.length > 0 ? inArray(escalaExcecoes.diaCiclo, folgas) : undefined,
            ),
          ),
        );

      return linhas;
    });

    if (atualizadas.length === 0) {
      return { status: "error", mensagem: "Escala nao encontrada." };
    }
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { nome: [NOME_EM_USO] },
      };
    }

    console.error("Falha ao atualizar escala", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Escala atualizada." };
}

/**
 * Grava os dias do ciclo que fogem do padrao — o 5o dia do 5x2 que sai uma hora
 * mais cedo, o dia de meio periodo.
 *
 * O formulario manda **todos** os dias trabalhados, cada um com a jornada
 * inteira; quem decide o que e excecao e esta action, comparando com o padrao
 * da escala. Dia igual ao padrao nao vira linha: excecao e o que difere, e nao
 * um campo que alguem marca — mesma logica de `virada_turno`.
 *
 * Quantos dias existem — e quais sao de trabalho — vem do banco, e nao do
 * formulario: campo postado na mao nao inventa um sexto dia num 5x2 nem da
 * horario a um dia de folga.
 */
export async function definirDiasDoCiclo(
  _estadoAnterior: DiasDoCicloState,
  formData: FormData,
): Promise<DiasDoCicloState> {
  await exigirAcesso(AREA);

  const identificacao = definirDiasDoCicloSchema.safeParse({
    escalaId: formData.get("escalaId"),
  });

  if (!identificacao.success) {
    return { status: "error", mensagem: "Escala invalida." };
  }

  const { escalaId } = identificacao.data;

  try {
    const [padrao] = await db
      .select({
        diasCiclo: escalas.diasCiclo,
        folgas: folgasDaEscala,
        entrada: escalas.entrada,
        saida: escalas.saida,
        intrajornadaMinutos: escalas.intrajornadaMinutos,
        marcacoesEsperadas: escalas.marcacoesEsperadas,
        horasExtrasMinutos: escalas.horasExtrasMinutos,
      })
      .from(escalas)
      .where(eq(escalas.id, escalaId))
      .limit(1);

    if (!padrao) {
      return { status: "error", mensagem: "Escala nao encontrada." };
    }

    const { diasCiclo, folgas, ...jornadaPadrao } = padrao;
    const jornadaDaEscala: JornadaDoDia = {
      ...jornadaPadrao,
      entrada: formatarHora(jornadaPadrao.entrada),
      saida: formatarHora(jornadaPadrao.saida),
    };

    const erros: NonNullable<DiasDoCicloState["erros"]> = {};
    const excecoes: (JornadaDoDia & { escalaId: string; diaCiclo: number })[] = [];

    // Quais dias existem — e quais deles sao de trabalho — vem do banco, e nao
    // do formulario: dia de folga postado na mao nao ganha horario.
    for (const diaCiclo of diasTrabalhadosDoCiclo({ diasCiclo, folgas })) {
      const campo = (nome: string) => String(formData.get(`dia-${diaCiclo}-${nome}`) ?? "");

      const dia = jornadaDoDiaSchema.safeParse({
        entrada: campo("entrada"),
        saida: campo("saida"),
        intrajornadaMinutos: campo("intrajornadaMinutos"),
        marcacoesEsperadas: campo("marcacoesEsperadas"),
        horasExtrasMinutos: campo("horasExtrasMinutos"),
      });

      if (!dia.success) {
        erros[diaCiclo] = z.flattenError(dia.error).fieldErrors;
        continue;
      }

      if (!mesmaJornada(dia.data, jornadaDaEscala)) {
        excecoes.push({ escalaId, diaCiclo, ...dia.data });
      }
    }

    if (Object.keys(erros).length > 0) {
      return { status: "error", mensagem: "Confira os dias destacados.", erros };
    }

    // Substitui em bloco, como as areas em `acessos`: o que sumiu da lista
    // voltou a seguir o padrao, e nao ha estado intermediario visivel.
    await db.transaction(async (tx) => {
      await tx.delete(escalaExcecoes).where(eq(escalaExcecoes.escalaId, escalaId));

      if (excecoes.length > 0) {
        await tx.insert(escalaExcecoes).values(excecoes);
      }
    });
  } catch (erro) {
    console.error("Falha ao gravar os dias do ciclo", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return {
    status: "success",
    mensagem: "Dias do ciclo atualizados.",
  };
}
