import "server-only";

import { env } from "@/lib/env";

/**
 * O cliente da Z-API — o unico ponto do portal que fala com o mundo de fora.
 *
 * `server-only` pela razao obvia: as credenciais nao podem chegar ao bundle do
 * cliente. E um modulo a parte, e nao codigo dentro da action, porque ele tem
 * uma responsabilidade so — traduzir "mandar esta mensagem para este numero" em
 * uma chamada HTTP e a resposta dela em um resultado que a action entenda. A
 * regra de negocio (quem pode receber, o que a mensagem diz, o que se grava) nao
 * mora aqui.
 */

/** Quanto tempo esperar pela Z-API antes de desistir. */
const TIMEOUT_MS = 15_000;

/** O que a Z-API responde quando aceita a mensagem. Le-se o que interessa. */
type RespostaDaZapi = {
  messageId?: string;
  zaapId?: string;
  id?: string;
  error?: string;
  message?: string;
};

export type ResultadoDoEnvio =
  { ok: true; mensagemExternaId: string | null } | { ok: false; erro: string };

type Credenciais = { instancia: string; token: string; clientToken: string };

/**
 * As credenciais, ou `null` quando a integracao nao foi configurada.
 *
 * As tres andam juntas: instancia e token montam a URL, e o `Client-Token` e o
 * header que a Z-API exige da conta. Com duas de tres, a chamada sairia e
 * voltaria 401 — melhor a tela dizer "nao configurada" antes de o usuario
 * escrever a mensagem.
 */
function credenciais(): Credenciais | null {
  const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN } = env;

  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    return null;
  }

  return {
    instancia: ZAPI_INSTANCE_ID,
    token: ZAPI_TOKEN,
    clientToken: ZAPI_CLIENT_TOKEN,
  };
}

/** `true` quando o portal tem como enviar. A tela pergunta isso antes de oferecer. */
export function zapiConfigurada() {
  return credenciais() !== null;
}

/**
 * A mensagem que a tela mostra quando falta configuracao. Fica aqui, junto de
 * quem sabe o que falta, e nao espalhada pelos componentes.
 */
export const ZAPI_NAO_CONFIGURADA =
  "O envio de mensagens nao esta configurado neste ambiente. Preencha ZAPI_INSTANCE_ID, " +
  "ZAPI_TOKEN e ZAPI_CLIENT_TOKEN no .env para habilitar.";

/**
 * O POST numa rota da Z-API e a leitura da resposta — o que as duas formas de
 * envio tem em comum.
 *
 * Nunca lanca: toda falha — rede, timeout, credencial errada, numero sem
 * WhatsApp — volta como `{ ok: false, erro }`, porque quem chama **grava** a
 * recusa. Uma excecao aqui viraria um envio que nao aconteceu e nao deixou
 * rastro, que e exatamente o que a tratativa nao pode ter.
 *
 * O texto do erro e guardado no historico e mostrado na tela, entao ele nunca
 * carrega credencial nem corpo cru da resposta.
 */
async function postarNaZapi(rota: string, corpoDoPedido: object): Promise<ResultadoDoEnvio> {
  const conta = credenciais();

  if (!conta) {
    return { ok: false, erro: ZAPI_NAO_CONFIGURADA };
  }

  const url = `${env.ZAPI_BASE_URL}/instances/${conta.instancia}/token/${conta.token}/${rota}`;

  let resposta: Response;

  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": conta.clientToken,
      },
      body: JSON.stringify(corpoDoPedido),
      // Sem cache: e uma escrita, e o Next cacheia `fetch` por padrao em
      // alguns caminhos. Uma mensagem servida do cache seria um envio que nao
      // aconteceu com cara de sucesso.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    // O log fica no servidor com o erro inteiro; a tela recebe so a frase.
    console.error("Falha de rede ao chamar a Z-API", erro);

    return {
      ok: false,
      erro:
        erro instanceof DOMException && erro.name === "TimeoutError"
          ? "A Z-API nao respondeu a tempo. Confira o historico antes de reenviar."
          : "Nao foi possivel falar com a Z-API. Confira a conexao e tente de novo.",
    };
  }

  let corpo: RespostaDaZapi = {};

  try {
    corpo = (await resposta.json()) as RespostaDaZapi;
  } catch {
    // Resposta sem JSON acontece em erro de gateway. O status ja diz o bastante.
  }

  if (!resposta.ok) {
    console.error("A Z-API recusou a mensagem", { status: resposta.status, erro: corpo.error });

    return {
      ok: false,
      erro: corpo.error ?? corpo.message ?? `A Z-API recusou a mensagem (HTTP ${resposta.status}).`,
    };
  }

  /**
   * A Z-API devolve `messageId`, `zaapId` e `id` conforme a rota e a versao. O
   * `messageId` vem primeiro porque e ele que aparece no webhook e no WhatsApp —
   * e o que o comprovante registra como id da mensagem.
   */
  return { ok: true, mensagemExternaId: corpo.messageId ?? corpo.zaapId ?? corpo.id ?? null };
}

/** Envia uma mensagem de texto. */
export async function enviarTextoNoWhatsapp({
  telefone,
  mensagem,
}: {
  /** So digitos, com DDI. E o formato que a Z-API espera. */
  telefone: string;
  mensagem: string;
}): Promise<ResultadoDoEnvio> {
  return postarNaZapi("send-text", { phone: telefone, message: mensagem });
}

/**
 * Envia uma mensagem com lista de opcoes (`send-option-list`).
 *
 * O WhatsApp limita a lista a 10 linhas, o titulo de cada uma a 24 caracteres e
 * a descricao a 72; o corte aqui evita que a Z-API recuse o envio inteiro por
 * causa de um rotulo longo. O texto da mensagem deve trazer as opcoes numeradas
 * tambem — ha aparelho em que a lista nao aparece.
 */
export async function enviarOpcoesNoWhatsapp({
  telefone,
  mensagem,
  titulo,
  opcoes,
}: {
  telefone: string;
  mensagem: string;
  titulo: string;
  opcoes: readonly { id: string; titulo: string; descricao?: string }[];
}): Promise<ResultadoDoEnvio> {
  return postarNaZapi("send-option-list", {
    phone: telefone,
    message: mensagem,
    optionList: {
      title: titulo.slice(0, 24),
      buttonLabel: "Ver opcoes",
      options: opcoes.slice(0, 10).map((opcao) => ({
        id: opcao.id,
        title: opcao.titulo.slice(0, 24),
        description: (opcao.descricao ?? "").slice(0, 72),
      })),
    },
  });
}
