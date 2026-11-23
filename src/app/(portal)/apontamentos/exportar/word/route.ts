import type { NextRequest } from "next/server";

import { responderExportacao } from "@/features/apontamentos/exportacao/resposta";

/** Relatorio dos apontamentos da competencia em vigor (`.docx`). */
export async function GET(request: NextRequest) {
  return responderExportacao(request, "word");
}
