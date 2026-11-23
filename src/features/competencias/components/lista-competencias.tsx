import { CalendarOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import type { CompetenciaResumo } from "@/features/competencias/types";

import { ConsultarCompetenciaForm } from "./consultar-competencia-form";

const formatador = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Server Component: so exibe. Toda escrita passa pelos formularios da feature. */
export function ListaCompetencias({
  competencias,
  idEmConsulta,
}: {
  competencias: CompetenciaResumo[];
  /** Competencia que este usuario esta consultando temporariamente, se houver. */
  idEmConsulta: string | null;
}) {
  if (competencias.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          <CalendarOff className="size-6" aria-hidden />
          Nenhuma competencia aberta ainda. A primeira delas passa a receber todos os dados do
          portal.
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Competencia</TableHead>
          <TableHead>Periodo</TableHead>
          <TableHead>Situacao</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {competencias.map((competencia) => {
          const nome = nomeDaCompetencia(competencia.dataFim);
          const emConsulta = competencia.id === idEmConsulta;

          return (
            <TableRow key={competencia.id}>
              <TableCell className="font-medium">{nome}</TableCell>

              <TableCell className="text-muted-foreground text-sm">
                {formatarPeriodo(competencia.dataInicio, competencia.dataFim)}
              </TableCell>

              <TableCell>
                {competencia.status === "aberta" ? (
                  <Badge>Ativa</Badge>
                ) : emConsulta ? (
                  <Badge variant="outline">Em consulta</Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {competencia.encerradaEm ? (
                      <>
                        Encerrada em{" "}
                        <time dateTime={competencia.encerradaEm.toISOString()}>
                          {formatador.format(competencia.encerradaEm)}
                        </time>
                      </>
                    ) : (
                      "Encerrada"
                    )}
                  </span>
                )}
              </TableCell>

              <TableCell className="text-right">
                {competencia.status === "encerrada" && !emConsulta ? (
                  <ConsultarCompetenciaForm competenciaId={competencia.id} nome={nome} />
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
