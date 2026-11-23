import { z } from "zod";

import { digitosDoTelefone } from "@/features/funcionarios/telefone";

/**
 * A leitura do webhook "Ao receber" da Z-API.
 *
 * Modulo puro. O corpo chega de fora e e tratado como entrada de usuario: passa
 * pelo Zod, e o que nao e uma mensagem de texto (ou resposta de menu) de uma
 * pessoa numa conversa individual e **ignorado**, com o motivo — nunca lanca.
 *
 * A Z-API manda para o mesmo endereco coisas que o chatbot nao deve responder:
 * mensagens que o proprio numero enviou (`fromMe`, inclusive as do chatbot),
 * grupos, listas de transmissao, canais e respostas a status. Responder a
 * qualquer uma delas faria o portal conversar consigo mesmo ou falar num grupo.
 */

const payloadSchema = z.object({
  instanceId: z.string().optional(),
  messageId: z.string().min(1),
  phone: z.string().min(1),
  fromMe: z.boolean().optional().default(false),
  isGroup: z.boolean().optional().default(false),
  isNewsletter: z.boolean().optional().default(false),
  isStatusReply: z.boolean().optional().default(false),
  broadcast: z.boolean().optional().default(false),
  /** Milissegundos desde a epoca, no relogio do WhatsApp. */
  momment: z.number().optional(),
  senderName: z.string().nullish(),
  text: z.object({ message: z.string() }).nullish(),
  buttonsResponseMessage: z
    .object({ buttonId: z.string().nullish(), message: z.string().nullish() })
    .nullish(),
  listResponseMessage: z
    .object({
      message: z.string().nullish(),
      title: z.string().nullish(),
      selectedRowId: z.string().nullish(),
    })
    .nullish(),
});

export type MensagemRecebida = {
  instanceId: string | null;
  mensagemExternaId: string;
  /** So digitos, com DDI. */
  telefone: string;
  texto: string;
  opcaoId: string | null;
  momento: Date;
};

export type LeituraDoWebhook =
  { tipo: "mensagem"; mensagem: MensagemRecebida } | { tipo: "ignorada"; motivo: string };

/** O maior texto aceito de uma mensagem recebida. O resto e cortado, e nao recusado. */
const TEXTO_MAXIMO = 2000;

export function lerWebhook(corpo: unknown, agora: Date): LeituraDoWebhook {
  const lido = payloadSchema.safeParse(corpo);

  if (!lido.success) {
    return { tipo: "ignorada", motivo: "payload sem messageId ou phone" };
  }

  const payload = lido.data;

  if (payload.fromMe) {
    return { tipo: "ignorada", motivo: "mensagem enviada pelo proprio numero" };
  }

  if (payload.isGroup || payload.broadcast || payload.isNewsletter || payload.isStatusReply) {
    return { tipo: "ignorada", motivo: "nao e conversa individual" };
  }

  // A resposta de lista e a de botao trazem o id da opcao; o texto que as
  // acompanha e o rotulo que a pessoa tocou — e e ele que vai para a transcricao.
  const opcaoId =
    payload.listResponseMessage?.selectedRowId ?? payload.buttonsResponseMessage?.buttonId ?? null;

  const texto =
    payload.text?.message ??
    payload.listResponseMessage?.title ??
    payload.listResponseMessage?.message ??
    payload.buttonsResponseMessage?.message ??
    null;

  if (texto === null && opcaoId === null) {
    // Audio, imagem, figurinha, localizacao: o chatbot nao os le, e responder
    // "nao entendi" a cada figurinha seria pior do que ficar quieto.
    return { tipo: "ignorada", motivo: "mensagem sem texto" };
  }

  const telefone = digitosDoTelefone(payload.phone);

  if (telefone.length < 10 || telefone.length > 15) {
    return { tipo: "ignorada", motivo: "telefone fora do formato" };
  }

  return {
    tipo: "mensagem",
    mensagem: {
      instanceId: payload.instanceId ?? null,
      mensagemExternaId: payload.messageId,
      telefone,
      texto: (texto ?? "").slice(0, TEXTO_MAXIMO),
      opcaoId,
      // Sem `momment`, o instante de chegada. Arredondado ao milissegundo de
      // proposito: e a precisao que o JavaScript le de volta do banco.
      momento: new Date(payload.momment ?? agora.getTime()),
    },
  };
}

/**
 * Os numeros que podem ser o mesmo WhatsApp.
 *
 * O WhatsApp identifica muitos celulares brasileiros antigos **sem o nono
 * digito** (556299999999), enquanto o cadastro guarda o numero como a pessoa o
 * diz (5562999999999). Os dois sao a mesma linha, e casar so pelo texto exato
 * deixaria essa gente sem atendimento.
 */
export function variantesDoTelefone(telefone: string) {
  const variantes = new Set([telefone]);

  if (telefone.startsWith("55") && telefone.length === 13 && telefone[4] === "9") {
    variantes.add(telefone.slice(0, 4) + telefone.slice(5));
  }

  if (telefone.startsWith("55") && telefone.length === 12) {
    variantes.add(`${telefone.slice(0, 4)}9${telefone.slice(4)}`);
  }

  return [...variantes];
}
