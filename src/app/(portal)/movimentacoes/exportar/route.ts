import type { NextRequest } from "next/server";

import { exigirAcesso } from "@/features/auth/queries";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { gerarPlanilhaDeMovimentacoes, nomeDaPlanilha } from "@/features/movimentacoes/exportacao";
import { listarMovimentacoesParaExportar } from "@/features/movimentacoes/queries";
import { filtrosMovimentacoesSchema } from "@/features/movimentacoes/schema";
import { AREA_MOVIMENTACOES } from "@/features/movimentacoes/types";

/**
 * A planilha das movimentacoes da competencia em vigor, com o recorte da lista.
 *
 * Route Handler, e nao Server Action, pelo mesmo motivo da exportacao dos
 * apontamentos: download e `GET` de um arquivo, e um `<a href download>` o faz
 * sem JavaScript. A checagem de acesso e a de uma pagina — nenhuma rota passa
 * pelo layout.
 */
export async function GET(request: NextRequest) {
  const usuario = await exigirAcesso(AREA_MOVIMENTACOES);

  // Mesmo schema da lista: filtro torto e "sem filtro", e nao erro.
  const filtros = filtrosMovimentacoesSchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return new Response("Nenhuma competencia aberta: nao ha movimentacoes a exportar.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const conteudo = await gerarPlanilhaDeMovimentacoes({
    competencia: vigor.competencia,
    geradoPor: usuario.nome,
    movimentacoes: await listarMovimentacoesParaExportar(filtros),
  });

  return new Response(conteudo as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeDaPlanilha(vigor.competencia)}"`,
      // Dado de pessoal: nem o navegador nem proxy nenhum guarda uma copia.
      "Cache-Control": "private, no-store",
    },
  });
}
