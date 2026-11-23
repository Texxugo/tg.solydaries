import type { Metadata } from "next";
import { ArrowLeft, CalendarOff } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportarHorasForm } from "@/features/apontamentos/importacao-horas/components/importar-horas-form";
import {
  AREA_APONTAMENTOS,
  ROTA_APONTAMENTOS,
  SEM_COMPETENCIA,
} from "@/features/apontamentos/types";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";

export const metadata: Metadata = {
  title: "Importar horas extras",
  description: "Horas extras das verbas 150 e 200 lancadas no apontamento da competencia.",
};

export default async function ImportarHorasPage() {
  await exigirAcesso(AREA_APONTAMENTOS);

  const vigor = await competenciaEmVigor();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROTA_APONTAMENTOS}>
            <ArrowLeft aria-hidden />
            Voltar para apontamentos
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="flex flex-wrap items-center gap-2">
              Importar horas extras
              {vigor ? (
                <Badge variant="secondary">{nomeDaCompetencia(vigor.competencia.dataFim)}</Badge>
              ) : null}
              {vigor?.temporaria ? <Badge variant="outline">Em consulta</Badge> : null}
            </h1>
          </CardTitle>
          {vigor ? (
            <p className="text-muted-foreground text-sm">
              Periodo de {formatarPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim)}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {vigor ? (
            <ImportarHorasForm competenciaId={vigor.competencia.id} />
          ) : (
            <Alert>
              <CalendarOff aria-hidden />
              <AlertTitle>Sem competencia aberta</AlertTitle>
              <AlertDescription>{SEM_COMPETENCIA}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
