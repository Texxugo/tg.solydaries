import type { Metadata } from "next";
import { ArrowLeft, CalendarOff, MapPinOff } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, hojeNoPortal, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { NovoExtraForm } from "@/features/extras/components/novo-extra-form";
import { listarColaboradores } from "@/features/extras/queries";
import { AREA_EXTRAS, SEM_COMPETENCIA, SEM_POSTO } from "@/features/extras/types";
import { listarPostosAtivos } from "@/features/postos/queries";

export const metadata: Metadata = {
  title: "Registrar hora extra",
  description: "Quem fez o extra, em que horario, em que posto e em que local.",
};

export default async function NovoExtraPage() {
  await exigirAcesso(AREA_EXTRAS);

  const [vigor, colaboradores, postos] = await Promise.all([
    competenciaEmVigor(),
    listarColaboradores(),
    listarPostosAtivos(),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/extras">
            <ArrowLeft aria-hidden />
            Voltar para horas extras
          </Link>
        </Button>
      </div>

      {!vigor ? (
        <Alert>
          <CalendarOff aria-hidden />
          <AlertTitle>Sem competencia aberta</AlertTitle>
          <AlertDescription>{SEM_COMPETENCIA}</AlertDescription>
        </Alert>
      ) : postos.length === 0 ? (
        <Alert>
          <MapPinOff aria-hidden />
          <AlertTitle>Nenhum posto ativo</AlertTitle>
          <AlertDescription>{SEM_POSTO}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              Registrar hora extra — {nomeDaCompetencia(vigor.competencia.dataFim)}
            </CardTitle>
            <CardDescription>
              O dia cai dentro do periodo de{" "}
              {formatarPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NovoExtraForm
              colaboradores={colaboradores}
              postos={postos}
              periodo={{ inicio: vigor.competencia.dataInicio, fim: vigor.competencia.dataFim }}
              dataPadrao={dataPadrao(vigor.competencia.dataInicio, vigor.competencia.dataFim)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * O dia que o formulario ja abre preenchido: hoje, preso ao periodo.
 *
 * `hoje` vem do servidor (`hojeNoPortal()`) porque `toISOString()` daria a data
 * em UTC, que a partir das 21h ja e a de amanha — erraria justo no turno da
 * noite, que e quando mais se faz extra. Fora do periodo (a competencia
 * anterior ainda aberta, por exemplo), o padrao vira a ponta mais proxima: e
 * onde a data valida esta.
 */
function dataPadrao(inicio: string, fim: string) {
  const hoje = hojeNoPortal();

  if (hoje < inicio) {
    return inicio;
  }

  return hoje > fim ? fim : hoje;
}
