import type { Metadata } from "next";
import { CalendarOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, hojeNoPortal, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { FiltrosMovimentacoes } from "@/features/movimentacoes/components/filtros-movimentacoes";
import { PaginacaoMovimentacoes } from "@/features/movimentacoes/components/paginacao-movimentacoes";
import { PainelMovimentacoes } from "@/features/movimentacoes/components/painel-movimentacoes";
import { listarMovimentacoes } from "@/features/movimentacoes/queries";
import { filtrosMovimentacoesSchema } from "@/features/movimentacoes/schema";
import {
  AREA_MOVIMENTACOES,
  SEM_COMPETENCIA,
  hrefDaExportacao,
  temFiltro,
} from "@/features/movimentacoes/types";

export const metadata: Metadata = {
  title: "Movimentacoes",
  description: "Faltas, trocas internas e trocas de escala da competencia, com os documentos.",
};

export default async function MovimentacoesPage({ searchParams }: PageProps<"/movimentacoes">) {
  // Repetida mesmo com o layout: layout nao roda em toda navegacao, e so exige
  // sessao, nao esta area.
  await exigirAcesso(AREA_MOVIMENTACOES);

  // Busca, filtros e pagina sao entrada do usuario: passam pelo Zod antes de
  // virar consulta.
  const filtros = filtrosMovimentacoesSchema.parse(await searchParams);

  const [vigor, resultado] = await Promise.all([
    competenciaEmVigor(),
    listarMovimentacoes(filtros),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Movimentacoes
          {vigor ? (
            <Badge variant="secondary">{nomeDaCompetencia(vigor.competencia.dataFim)}</Badge>
          ) : null}
        </h1>
        {vigor ? (
          <p className="text-muted-foreground text-sm">
            Periodo de {formatarPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim)}.
          </p>
        ) : null}
      </header>

      {vigor ? (
        <div className="space-y-6">
          <FiltrosMovimentacoes
            filtros={filtros}
            periodo={{ inicio: vigor.competencia.dataInicio, fim: vigor.competencia.dataFim }}
          />

          <PainelMovimentacoes
            movimentacoes={resultado.movimentacoes}
            filtrado={temFiltro(filtros)}
            periodo={{ inicio: vigor.competencia.dataInicio, fim: vigor.competencia.dataFim }}
            dataPadrao={dataPadrao(vigor.competencia.dataInicio, vigor.competencia.dataFim)}
            hrefDaPlanilha={hrefDaExportacao(filtros)}
            total={resultado.total}
          />

          <PaginacaoMovimentacoes
            filtros={filtros}
            pagina={resultado.pagina}
            paginas={resultado.paginas}
            total={resultado.total}
            porTipo={resultado.porTipo}
          />
        </div>
      ) : (
        <Alert>
          <CalendarOff aria-hidden />
          <AlertTitle>Sem competencia aberta</AlertTitle>
          <AlertDescription>{SEM_COMPETENCIA}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * O dia que o modal ja abre preenchido: hoje, preso ao periodo. `hoje` vem do
 * servidor (`hojeNoPortal()`), pelo mesmo motivo do registro de extras.
 */
function dataPadrao(inicio: string, fim: string) {
  const hoje = hojeNoPortal();

  if (hoje < inicio) {
    return inicio;
  }

  return hoje > fim ? fim : hoje;
}
