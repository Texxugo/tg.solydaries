import type { Metadata } from "next";
import { CalendarOff, TimerReset } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { FiltrosExtras } from "@/features/extras/components/filtros-extras";
import { ListaExtras } from "@/features/extras/components/lista-extras";
import { PaginacaoExtras } from "@/features/extras/components/paginacao-extras";
import { listarExtras, listarPostosComExtra } from "@/features/extras/queries";
import { filtrosExtrasSchema } from "@/features/extras/schema";
import { AREA_EXTRAS, SEM_COMPETENCIA, temFiltro } from "@/features/extras/types";

export const metadata: Metadata = {
  title: "Conferencia de horas extras",
  description: "Quem fez hora extra na competencia: horario, posto, local e observacao.",
};

export default async function ExtrasPage({ searchParams }: PageProps<"/extras">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area. A DAL e memoizada,
  // entao nao custa consulta extra.
  await exigirAcesso(AREA_EXTRAS);

  // Busca, filtros e pagina sao entrada do usuario como qualquer outra: passam
  // pelo Zod antes de virar consulta e de voltar para a tela.
  const filtros = filtrosExtrasSchema.parse(await searchParams);

  const [vigor, resultado, postos] = await Promise.all([
    competenciaEmVigor(),
    listarExtras(filtros),
    listarPostosComExtra(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            Conferencia de horas extras
            {vigor ? (
              <Badge variant="secondary">{nomeDaCompetencia(vigor.competencia.dataFim)}</Badge>
            ) : null}
          </h1>
        </div>

        {vigor ? (
          <Button asChild>
            <Link href="/extras/novo">
              <TimerReset aria-hidden />
              Registrar extra
            </Link>
          </Button>
        ) : null}
      </header>

      {vigor ? (
        <p className="text-muted-foreground text-sm">
          Periodo de {formatarPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim)}.
        </p>
      ) : (
        <Alert>
          <CalendarOff aria-hidden />
          <AlertTitle>Sem competencia aberta</AlertTitle>
          <AlertDescription>
            {SEM_COMPETENCIA} O extra pertence ao periodo em que o dia caiu, e sem periodo nao ha a
            que prende-lo.
          </AlertDescription>
        </Alert>
      )}

      {vigor ? (
        <div className="space-y-4">
          <FiltrosExtras
            filtros={filtros}
            postos={postos}
            periodo={{ inicio: vigor.competencia.dataInicio, fim: vigor.competencia.dataFim }}
          />

          <ListaExtras extras={resultado.extras} filtrado={temFiltro(filtros)} />

          <PaginacaoExtras
            filtros={filtros}
            pagina={resultado.pagina}
            paginas={resultado.paginas}
            total={resultado.total}
            minutos={resultado.minutos}
          />
        </div>
      ) : null}
    </div>
  );
}
