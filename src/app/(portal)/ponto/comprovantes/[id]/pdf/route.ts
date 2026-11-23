import type { NextRequest } from "next/server";

import { exigirAcesso } from "@/features/auth/queries";
import { pdfDoComprovante } from "@/features/ponto/atendimento/queries";
import { AREA_PONTO } from "@/features/ponto/types";

/**
 * O PDF de um comprovante de tratativa. Route Handler pelo mesmo motivo das
 * exportacoes de apontamentos: e `GET` de um arquivo, e um `<a href>` o baixa
 * sem JavaScript. A checagem de acesso e a de uma pagina da area de ponto —
 * nenhum Route Handler passa pelo layout.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/ponto/comprovantes/[id]/pdf">,
) {
  await exigirAcesso(AREA_PONTO);

  const { id } = await params;
  const comprovante = await pdfDoComprovante(id);

  if (!comprovante) {
    return new Response("Comprovante nao encontrado.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const nome = `comprovante-ponto-${comprovante.data}-${comprovante.atendimentoId.slice(0, 8)}.pdf`;

  return new Response(Buffer.from(comprovante.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      // Dado pessoal de colaborador: nenhum cache intermediario guarda copia.
      "Cache-Control": "private, no-store",
    },
  });
}
