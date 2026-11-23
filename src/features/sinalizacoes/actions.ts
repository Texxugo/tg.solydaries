"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { enviosSinalizacao, preenchimentoLinhas, sinalizacoesDia } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import { motivoDoBloqueio } from "@/features/ponto/contato";
import {
  enviarTextoNoWhatsapp,
  ZAPI_NAO_CONFIGURADA,
  zapiConfigurada,
} from "@/features/ponto/zapi";

import { envioDosSinalizados } from "./queries";
import { enviarSinalizadosSchema, resolverSinalizacaoSchema } from "./schema";
import { AREA_SINALIZACOES, type EnvioState, type ResolverState } from "./types";

/**
 * Manda ao responsavel do posto, numa mensagem so, todos os dias sinalizados
 * pendentes dos postos dele que ainda nao foram enviados a ele. Duas etapas,
 * como o consolidado de ponto: sem `confirmar`, devolve a previa; com ele,
 * envia.
 *
 * O texto nao se edita e nao volta do formulario: ele e a lista dos dias que
 * vao ficar como enviados, e editado poderia tirar um dia que o registro daria
 * como avisado. Volta so a assinatura, e a action refaz o envio inteiro com a
 * mesma `envioDosSinalizados()` da previa e recusa se o texto mudou — dia
 * sinalizado ou resolvido no meio tempo, celula corrigida, carga de ponto nova,
 * responsavel trocado ou a saudacao que virou com a hora.
 *
 * Enviar **nao resolve**: o dia continua pendente, marcado como enviado, ate
 * alguem resolver quando o responsavel responder.
 */
export async function enviarSinalizados(
  _estadoAnterior: EnvioState,
  formData: FormData,
): Promise<EnvioState> {
  const usuario = await exigirAcesso(AREA_SINALIZACOES);

  const entrada = enviarSinalizadosSchema.safeParse({
    responsavelId: formData.get("responsavelId"),
    assinatura: formData.get("assinatura") || null,
  });

  if (!entrada.success) {
    return { status: "error", mensagem: "Envio invalido. Recarregue a pagina." };
  }

  const { responsavelId, assinatura } = entrada.data;
  const envio = await envioDosSinalizados(responsavelId);

  if (!envio) {
    refresh();
    return { status: "error", mensagem: "Nao ha dia pendente a enviar a este responsavel." };
  }

  const { destino } = envio;
  const telefone = destino.telefone;

  if (destino.bloqueio || !telefone) {
    return {
      status: "error",
      mensagem: motivoDoBloqueio(destino.bloqueio ?? "responsavel_sem_telefone"),
    };
  }

  if (formData.get("confirmar") !== "1") {
    return {
      status: "previa",
      previa: {
        responsavelId,
        destinatario: destino.nome,
        telefone: formatarTelefone(telefone),
        dias: envio.incluidas.length,
        restantes: envio.restantes,
        conteudo: envio.conteudo,
        assinatura: envio.assinatura,
      },
    };
  }

  if (assinatura !== envio.assinatura) {
    // Algo mudou entre a previa e a confirmacao: a tela refaz a previa com o
    // texto novo, e nada sai ate alguem conferir de novo.
    refresh();
    return {
      status: "error",
      mensagem:
        "O texto mudou desde a previa (dia sinalizado, resolvido ou corrigido no meio tempo, ou a " +
        "saudacao passou de bom dia para boa tarde ou boa noite). Pre-visualize de novo.",
    };
  }

  if (!zapiConfigurada()) {
    return { status: "error", mensagem: ZAPI_NAO_CONFIGURADA };
  }

  // A leitura foi da competencia em vigor, e a escrita vai para a mesma — mas a
  // sessao pode ter encerrado a consulta noutra aba entre as duas etapas.
  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  if (escrita.competencia.id !== envio.competencia.id) {
    refresh();
    return {
      status: "error",
      mensagem: "A competencia em vigor mudou desde a previa. Pre-visualize de novo.",
    };
  }

  const resposta = await enviarTextoNoWhatsapp({ telefone, mensagem: envio.conteudo });
  const loteId = crypto.randomUUID();

  // Fora de transacao com o HTTP: uma chamada de rede nao volta atras com
  // `rollback`. A falha tambem vira linha — "o numero esta errado" precisa
  // ficar distinguivel de "ninguem avisou".
  try {
    await db.insert(enviosSinalizacao).values(
      envio.incluidas.map((sinalizacaoId) => ({
        sinalizacaoId,
        loteId,
        responsavelId: destino.funcionarioId,
        telefone,
        conteudo: envio.conteudo,
        status: resposta.ok ? ("enviada" as const) : ("falhou" as const),
        mensagemExternaId: resposta.ok ? resposta.mensagemExternaId : null,
        erro: resposta.ok ? null : resposta.erro,
        enviadoPor: usuario.id,
      })),
    );
  } catch (erro) {
    console.error("Envio dos dias sinalizados processado, mas o registro falhou", {
      resposta,
      erro,
    });

    return {
      status: "error",
      mensagem:
        "O envio foi processado, mas nao conseguimos registrar. Confira a conversa antes de " +
        "reenviar.",
    };
  }

  refresh();

  if (!resposta.ok) {
    return { status: "error", mensagem: resposta.erro };
  }

  const quantos = envio.incluidas.length === 1 ? "1 dia" : `${envio.incluidas.length} dias`;

  return { status: "success", mensagem: `Mensagem enviada para ${destino.nome} com ${quantos}.` };
}

/**
 * Resolve um dia sinalizado (sai dos pendentes, com quem resolveu e quando) ou
 * o reabre.
 *
 * Nao apaga a marca: o filtro "Resolvidos" continua mostrando o dia, e e assim
 * que se sabe depois que ele foi conferido. Tirar a marca de vez e gesto do
 * modal do dia, enquanto ela esta pendente.
 *
 * A competencia e conferida pela **linha** da marca: a action aponta para uma
 * linha da grade, e a linha precisa ser da competencia em que se grava — a
 * mesma protecao das actions da grade que apontam para uma linha.
 */
export async function resolverSinalizacao(
  _estadoAnterior: ResolverState,
  formData: FormData,
): Promise<ResolverState> {
  const usuario = await exigirAcesso(AREA_SINALIZACOES);

  const entrada = resolverSinalizacaoSchema.safeParse({
    id: formData.get("id"),
    acao: formData.get("acao"),
  });

  if (!entrada.success) {
    return { status: "error", mensagem: z.prettifyError(entrada.error) };
  }

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const { id, acao } = entrada.data;

  const [marca] = await db
    .select({ id: sinalizacoesDia.id })
    .from(sinalizacoesDia)
    .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, sinalizacoesDia.linhaId))
    .where(
      and(
        eq(sinalizacoesDia.id, id),
        eq(preenchimentoLinhas.competenciaId, escrita.competencia.id),
      ),
    );

  if (!marca) {
    return {
      status: "error",
      mensagem: "Este dia nao esta mais sinalizado na competencia aberta.",
    };
  }

  await db
    .update(sinalizacoesDia)
    .set(
      acao === "resolver"
        ? { resolvidoEm: new Date(), resolvidoPor: usuario.id }
        : { resolvidoEm: null, resolvidoPor: null },
    )
    .where(eq(sinalizacoesDia.id, id));

  refresh();

  return {
    status: "success",
    mensagem: acao === "resolver" ? "Dia resolvido." : "Dia de volta aos pendentes.",
  };
}
