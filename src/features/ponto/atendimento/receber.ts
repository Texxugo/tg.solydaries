import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

import { processarMensagem } from "./processar";
import { lerWebhook } from "./webhook";

/**
 * O webhook "Ao receber" da Z-API: toda mensagem que chega ao WhatsApp do RH.
 *
 * Fica em `/api`, fora do `proxy.ts` — a Z-API nao tem sessao nem cookie. A
 * autenticacao e o segredo na URL, porque a Z-API nao assina o que envia; sem
 * `ZAPI_WEBHOOK_SECRET` configurado o endpoint fica desligado.
 *
 * O segredo vale em dois formatos (`?token=` e `/webhook/<token>`), que chegam
 * aqui pelas duas rotas: o painel da Z-API ja estava configurado com o segundo,
 * e os dois sao o mesmo segredo, comparado do mesmo jeito.
 *
 * O que nao e mensagem de conversa individual responde 200 e e ignorado: a
 * Z-API reentrega o que nao recebe 200, e reentregar um aviso de grupo para
 * sempre nao ajuda ninguem. Erro de processamento responde 500 **de proposito**:
 * a transacao voltou inteira, e a reentrega e o que faz a mensagem ser
 * processada de novo em vez de sumir.
 */

/** Um webhook de mensagem tem poucos KB. Acima disto nao e o que esperamos. */
const CORPO_MAXIMO = 256 * 1024;

function resposta(status: number, corpo: object) {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

/** Comparacao em tempo constante: os digests tem sempre o mesmo tamanho. */
function segredoConfere(recebido: string | null, esperado: string) {
  if (!recebido) {
    return false;
  }

  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();

  return timingSafeEqual(a, b);
}

/** As chaves do payload (dois niveis) e os campos de tipo, sem nenhum valor pessoal. */
function formatoDoPayload(corpo: unknown) {
  if (typeof corpo !== "object" || corpo === null) {
    return typeof corpo;
  }

  const registro = corpo as Record<string, unknown>;

  return {
    type: registro.type,
    status: registro.status,
    chaves: Object.entries(registro).map(([chave, valor]) =>
      typeof valor === "object" && valor !== null && !Array.isArray(valor)
        ? `${chave}{${Object.keys(valor).join(",")}}`
        : chave,
    ),
  };
}

export async function receberWebhook(request: NextRequest, token: string | null) {
  const segredo = env.ZAPI_WEBHOOK_SECRET;

  if (!segredo) {
    return resposta(503, { erro: "webhook desligado" });
  }

  if (!segredoConfere(token, segredo)) {
    return resposta(401, { erro: "nao autorizado" });
  }

  // Desligado, o webhook ainda confere o segredo e ainda responde 200: a Z-API
  // reentrega o que nao recebe 200, e a mensagem que nao vai ser respondida
  // tambem nao precisa voltar. Nada e lido, gravado nem enviado.
  if (!env.ZAPI_CHATBOT_ATIVO) {
    return resposta(200, { resultado: "ignorada", motivo: "chatbot desativado" });
  }

  const tamanho = Number(request.headers.get("content-length") ?? 0);

  if (tamanho > CORPO_MAXIMO) {
    return resposta(413, { erro: "corpo grande demais" });
  }

  let corpo: unknown;

  try {
    corpo = await request.json();
  } catch {
    return resposta(400, { erro: "corpo invalido" });
  }

  const leitura = lerWebhook(corpo, new Date());

  if (leitura.tipo === "ignorada") {
    // So o formato, nunca o conteudo: o que a Z-API manda num evento que o
    // chatbot nao reconhece e o que se precisa para entender por que ele calou.
    console.info("Webhook do WhatsApp ignorado", {
      motivo: leitura.motivo,
      formato: formatoDoPayload(corpo),
    });
    return resposta(200, { resultado: "ignorada", motivo: leitura.motivo });
  }

  // Com a instancia configurada, mensagem de outra instancia nao e nossa — o
  // mesmo segredo copiado para o webhook de outro numero nao abre conversa aqui.
  if (
    env.ZAPI_INSTANCE_ID &&
    leitura.mensagem.instanceId &&
    leitura.mensagem.instanceId !== env.ZAPI_INSTANCE_ID
  ) {
    return resposta(200, { resultado: "ignorada", motivo: "outra instancia" });
  }

  try {
    const resultado = await processarMensagem(leitura.mensagem);
    return resposta(200, { resultado });
  } catch (erro) {
    console.error("Falha ao processar mensagem do WhatsApp", {
      mensagemId: leitura.mensagem.mensagemExternaId,
      erro,
    });
    return resposta(500, { erro: "falha no processamento" });
  }
}
