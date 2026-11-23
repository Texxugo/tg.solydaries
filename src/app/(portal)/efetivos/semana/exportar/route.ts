import type { NextRequest } from "next/server";
import { z } from "zod";

import { exigirAcesso } from "@/features/auth/queries";
import { ehDataValida, hojeNoPortal } from "@/features/competencias/periodo";
import { gerarPlanilhaDaSemana, nomeDaPlanilhaDaSemana } from "@/features/efetivos/exportacao";
import { listarLancamentos, listarPostosDoLancamento } from "@/features/efetivos/queries";
import { diasDaSemana, montarSemana, segundaDaSemana } from "@/features/efetivos/semana";
import { AREA_EFETIVOS } from "@/features/efetivos/types";

/**
 * A planilha da semana (`?semana=&posto=`), com o mesmo recorte da tela.
 *
 * Route Handler, e nao Server Action, pelo mesmo motivo das outras
 * exportacoes: download e `GET` de um arquivo, e um `<a href download>` o faz
 * sem JavaScript. A checagem de acesso e a de uma pagina — nenhuma rota passa
 * pelo layout.
 */
export async function GET(request: NextRequest) {
  const usuario = await exigirAcesso(AREA_EFETIVOS);

  const parametros = request.nextUrl.searchParams;
  const pedida = parametros.get("semana") ?? "";
  const segunda = segundaDaSemana(ehDataValida(pedida) ? pedida : hojeNoPortal());
  const dias = diasDaSemana(segunda);

  const postos = await listarPostosDoLancamento();
  const postoPedido = z.uuid().safeParse(parametros.get("posto")).data ?? null;
  const posto = postos.find((item) => item.id === postoPedido) ?? null;

  const lancamentos = await listarLancamentos({
    de: segunda,
    ate: dias[6],
    postoId: posto?.id ?? null,
  });

  const conteudo = await gerarPlanilhaDaSemana({
    geradoPor: usuario.nome,
    dias,
    semana: montarSemana(lancamentos, dias),
    lancamentos,
  });

  return new Response(conteudo as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeDaPlanilhaDaSemana(segunda, posto?.codigo)}"`,
      // Dado de pessoal: nem o navegador nem proxy nenhum guarda uma copia.
      "Cache-Control": "private, no-store",
    },
  });
}
