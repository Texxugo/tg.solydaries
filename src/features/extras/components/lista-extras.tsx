import { SearchX, TimerOff } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { duracaoEmMinutos, formatarDuracao } from "@/features/escalas/jornada";
import type { ExtraResumo } from "@/features/extras/types";

/** Server Component: so exibe. Toda escrita passa pelos formularios da feature. */
export function ListaExtras({
  extras,
  filtrado = false,
}: {
  extras: readonly ExtraResumo[];
  /** Se ha busca ou filtro em vigor, so para o estado vazio saber por que a lista esta vazia. */
  filtrado?: boolean;
}) {
  if (extras.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          {/* O texto vai num `p` proprio: solto, cada trecho vira um item do
              flex e a frase quebra a cada palavra. */}
          {filtrado ? (
            <>
              <SearchX className="size-6" aria-hidden />
              <p>Nenhum extra desta competencia atende a busca e aos filtros escolhidos.</p>
            </>
          ) : (
            <>
              <TimerOff className="size-6" aria-hidden />
              <p>
                Nenhuma hora extra registrada nesta competencia. O registro e o que separa o extra
                reconhecido do que so aparece como divergencia na analise de ponto.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Colaborador</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Horario</TableHead>
          <TableHead>Posto</TableHead>
          <TableHead>Local</TableHead>
          <TableHead>Observacao</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {extras.map((extra) => {
          // A duracao sai dos dois horarios a cada leitura, como os totais do
          // rodape da grade: corrigir o horario corrige a conta, sem coluna
          // nenhuma a atualizar.
          const duracao = duracaoEmMinutos(extra.horaEntrada, extra.horaSaida);

          return (
            <TableRow key={extra.id}>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{extra.colaborador.nome}</span>
                  {extra.colaborador.freelancer ? (
                    <Badge variant="outline">Freelancer</Badge>
                  ) : null}
                  {/* De onde o extra veio muda quem o mantem em dia: o da grade
                      e reescrito por aquele dia do preenchimento. */}
                  {extra.daGrade ? <Badge variant="outline">Grade</Badge> : null}
                </div>
                {extra.colaborador.identificacao ? (
                  <p className="text-muted-foreground text-sm">{extra.colaborador.identificacao}</p>
                ) : null}
              </TableCell>

              <TableCell className="whitespace-normal">
                <div>{formatarData(extra.data)}</div>
                <p className="text-muted-foreground text-sm">{diaDaSemana(extra.data)}</p>
              </TableCell>

              <TableCell className="whitespace-normal">
                <div>
                  {extra.horaEntrada} as {extra.horaSaida}
                </div>
                <p className="text-muted-foreground text-sm">
                  {formatarDuracao(duracao)}
                  {extra.horaSaida < extra.horaEntrada ? " · vira o dia" : null}
                </p>
              </TableCell>

              <TableCell className="whitespace-normal">
                <div>{extra.postoCodigo}</div>
                <p className="text-muted-foreground text-sm">{extra.postoNome}</p>
              </TableCell>

              <TableCell className="whitespace-normal">{extra.local}</TableCell>

              <TableCell className="whitespace-normal">
                {extra.observacao ?? "—"}
                {extra.registradoPor ? (
                  <p className="text-muted-foreground text-sm">
                    Registrado por {extra.registradoPor}
                  </p>
                ) : null}
              </TableCell>

              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/extras/${extra.id}`}>
                    Editar
                    <span className="sr-only">
                      {" "}
                      o extra de {extra.colaborador.nome} em {formatarData(extra.data)}
                    </span>
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
