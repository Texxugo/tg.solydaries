"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { eventos, type EventoNatureza } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { ehViolacaoDeUnicidade, restricaoViolada } from "@/lib/postgres";

import { atualizarEventoSchema, criarEventoSchema } from "./schema";
import type { AtualizarEventoState, CriarEventoState, ValoresDoEvento } from "./types";

/**
 * Escritas do catalogo de eventos.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod e refaz a checagem de acesso — o formulario nao autoriza nada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const AREA = "eventos" as const;

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Traduz a recusa do banco para o campo certo do formulario. A tabela tem tres
 * indices unicos, e sem saber qual falhou a mensagem cairia no campo errado —
 * mesma razao de `restricaoViolada()` existir.
 */
function erroDeUnicidade(erro: unknown) {
  switch (restricaoViolada(erro)) {
    case "eventos_codigo_unico":
      return { codigo: ["Ja existe um evento com esta sigla"] };
    case "eventos_rotulo_unico":
      return { rotulo: ["Ja existe um evento com este nome"] };
    default:
      return null;
  }
}

/**
 * Marcar um evento como padrao desmarca o anterior da mesma natureza, na mesma
 * transacao — em vez de recusar o cadastro por causa do indice parcial.
 *
 * E o mesmo arranjo de `abrirCompetencia()`: quando so pode existir um, trocar
 * qual e ele e a operacao que a pessoa quis fazer. Recusar obrigaria a editar
 * dois cadastros para mudar uma escolha.
 */
async function desmarcarPadraoAnterior(tx: Transacao, natureza: EventoNatureza, exceto?: string) {
  await tx
    .update(eventos)
    .set({ padrao: false })
    .where(
      and(
        eq(eventos.natureza, natureza),
        eq(eventos.padrao, true),
        exceto ? ne(eventos.id, exceto) : undefined,
      ),
    );
}

/**
 * O formulario chega inteiro como texto. Ler tudo antes de validar tambem e o
 * que permite devolver os valores digitados quando o Zod recusa.
 */
function lerValores(formData: FormData): ValoresDoEvento {
  return {
    codigo: String(formData.get("codigo") ?? ""),
    rotulo: String(formData.get("rotulo") ?? ""),
    descricao: String(formData.get("descricao") ?? ""),
    natureza: String(formData.get("natureza") ?? ""),
    cor: String(formData.get("cor") ?? ""),
    // Checkbox nao marcado nao vai no FormData: ausencia e `false`.
    exigeHorario: formData.get("exigeHorario") !== null,
    exigePessoa: formData.get("exigePessoa") !== null,
    exigeDestino: formData.get("exigeDestino") !== null,
    exigeDiaTrabalhado: formData.get("exigeDiaTrabalhado") !== null,
    padrao: formData.get("padrao") !== null,
  };
}

export async function criarEvento(
  _estadoAnterior: CriarEventoState,
  formData: FormData,
): Promise<CriarEventoState> {
  await exigirAcesso(AREA);

  const valores = lerValores(formData);
  const resultado = criarEventoSchema.safeParse(valores);

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      valores,
    };
  }

  const evento = resultado.data;

  try {
    await db.transaction(async (tx) => {
      if (evento.padrao) {
        await desmarcarPadraoAnterior(tx, evento.natureza);
      }

      await tx.insert(eventos).values(evento);
    });
  } catch (erro) {
    // A unicidade e do indice, e nao de um SELECT previo: duas requisicoes
    // simultaneas passariam pelo "ja existe?" as duas vezes.
    const erros = ehViolacaoDeUnicidade(erro) ? erroDeUnicidade(erro) : null;

    if (erros) {
      return { status: "error", mensagem: "Confira os campos destacados.", erros, valores };
    }

    console.error("Falha ao cadastrar evento", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return { status: "success", mensagem: `Evento ${evento.codigo} cadastrado.` };
}

export async function atualizarEvento(
  _estadoAnterior: AtualizarEventoState,
  formData: FormData,
): Promise<AtualizarEventoState> {
  await exigirAcesso(AREA);

  const resultado = atualizarEventoSchema.safeParse({
    ...lerValores(formData),
    eventoId: String(formData.get("eventoId") ?? ""),
    ativo: formData.get("ativo") !== null,
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { eventoId, ...evento } = resultado.data;

  try {
    await db.transaction(async (tx) => {
      if (evento.padrao) {
        await desmarcarPadraoAnterior(tx, evento.natureza, eventoId);
      }

      await tx.update(eventos).set(evento).where(eq(eventos.id, eventoId));
    });
  } catch (erro) {
    const erros = ehViolacaoDeUnicidade(erro) ? erroDeUnicidade(erro) : null;

    if (erros) {
      return { status: "error", mensagem: "Confira os campos destacados.", erros };
    }

    console.error("Falha ao atualizar evento", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: `Evento ${evento.codigo} atualizado.` };
}
