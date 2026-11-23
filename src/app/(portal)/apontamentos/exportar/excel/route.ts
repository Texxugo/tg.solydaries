import type { NextRequest } from "next/server";

import { responderExportacao } from "@/features/apontamentos/exportacao/resposta";

/** Planilha dos apontamentos da competencia em vigor (`.xlsx`), uma linha por funcionario. */
export async function GET(request: NextRequest) {
  return responderExportacao(request, "excel");
}
