import type { NextRequest } from "next/server";

import { receberWebhook } from "@/features/ponto/atendimento/receber";

/** O webhook com o segredo na query: `/api/whatsapp/webhook?token=<segredo>`. */
export async function POST(request: NextRequest) {
  return receberWebhook(request, request.nextUrl.searchParams.get("token"));
}
