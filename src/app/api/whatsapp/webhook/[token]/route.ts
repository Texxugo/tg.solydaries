import type { NextRequest } from "next/server";

import { receberWebhook } from "@/features/ponto/atendimento/receber";

/** O webhook com o segredo no caminho: `/api/whatsapp/webhook/<segredo>`. */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/whatsapp/webhook/[token]">,
) {
  const { token } = await params;
  return receberWebhook(request, token);
}
