import type { NextRequest } from "next/server";

import { exigirAcesso } from "@/features/auth/queries";
import { abrirDocumento } from "@/features/movimentacoes/queries";
import { AREA_MOVIMENTACOES } from "@/features/movimentacoes/types";

/**
 * Um documento de movimentacao (atestado, print da troca), aberto no navegador.
 *
 * `inline`, e nao `attachment`: imagem e PDF se leem na propria aba, e quem
 * quer guardar usa o salvar do navegador. O tipo vem do banco, conferido pelos
 * primeiros bytes no envio — so imagem e PDF —, e o `nosniff` impede o
 * navegador de adivinhar outro. Fora da competencia em vigor o documento nao
 * abre, como a movimentacao nao aparece na lista.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/movimentacoes/documentos/[id]">,
) {
  await exigirAcesso(AREA_MOVIMENTACOES);

  const { id } = await params;
  const documento = await abrirDocumento(id);

  if (!documento) {
    return new Response("Documento nao encontrado nesta competencia.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // `filename` em ASCII para navegador antigo; `filename*` com o nome inteiro,
  // acentos inclusive (RFC 6266).
  const ascii = documento.nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "");

  return new Response(Buffer.from(documento.conteudo), {
    headers: {
      "Content-Type": documento.tipoMime,
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(documento.nome)}`,
      "X-Content-Type-Options": "nosniff",
      // Atestado e dado de saude: nenhum cache intermediario guarda copia.
      "Cache-Control": "private, no-store",
    },
  });
}
