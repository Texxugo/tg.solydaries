import "server-only";

import type { NextRequest } from "next/server";

import { exigirAcesso } from "@/features/auth/queries";
import { competenciaEmVigor } from "@/features/competencias/queries";

import { filtrosApontamentosSchema } from "../schema";
import { AREA_APONTAMENTOS } from "../types";
import { listarApontamentosParaExportar } from "./dados";
import { gerarPlanilha } from "./excel";
import { TIPOS_DE_EXPORTACAO, nomeDoArquivo, type TipoDeExportacao } from "./tipos";
import { gerarRelatorio } from "./word";

const GERADORES = { word: gerarRelatorio, excel: gerarPlanilha } satisfies Record<
  TipoDeExportacao,
  unknown
>;

/**
 * O download de uma exportacao — o corpo das duas rotas, que so diferem no
 * gerador.
 *
 * Route Handler, e nao Server Action: download e `GET` de um arquivo, e um
 * `<a href>` o faz sem JavaScript, com o nome que o navegador ja salva. A
 * checagem de acesso e a mesma de uma pagina (`exigirAcesso`), porque nenhuma
 * rota passa pelo layout — e o `proxy.ts` so olha se ha cookie.
 *
 * Exporta a competencia **em vigor**, e nao a aberta: quem esta consultando
 * uma competencia encerrada baixa o que esta vendo. Exportar e leitura.
 */
export async function responderExportacao(request: NextRequest, tipo: TipoDeExportacao) {
  const usuario = await exigirAcesso(AREA_APONTAMENTOS);

  // Os parametros sao entrada do usuario como qualquer outra, e passam pelo
  // mesmo schema da lista: filtro torto e "sem filtro", e nao erro.
  const filtros = filtrosApontamentosSchema.parse(Object.fromEntries(request.nextUrl.searchParams));

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return new Response("Nenhuma competencia aberta: nao ha apontamentos a exportar.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const apontamentos = await listarApontamentosParaExportar(filtros);

  const conteudo = await GERADORES[tipo]({
    competencia: vigor.competencia,
    temporaria: vigor.temporaria,
    recorte: {
      busca: filtros.busca,
      // O nome sai das proprias linhas: com o filtro de empresa, todas sao dela.
      empresa: filtros.empresaId ? (apontamentos[0]?.empresa ?? "(sem apontamentos)") : null,
    },
    geradoPor: usuario.nome,
    geradoEm: new Date(),
    apontamentos,
  });

  const arquivo = nomeDoArquivo(vigor.competencia, tipo);

  return new Response(conteudo as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": TIPOS_DE_EXPORTACAO[tipo].mime,
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      // Dado de folha: nem o navegador nem proxy nenhum guarda uma copia.
      "Cache-Control": "private, no-store",
    },
  });
}
