import { CalendarOff, SearchX } from "lucide-react";
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
import {
  descricaoDoCiclo,
  formatarDuracao,
  jornadaLiquidaEmMinutos,
  rotuloDoCiclo,
} from "@/features/escalas/jornada";
import type { EscalaResumo } from "@/features/escalas/types";

/** Server Component: so exibe. Toda escrita passa pelos formularios da feature. */
export function ListaEscalas({
  escalas,
  busca = "",
}: {
  escalas: EscalaResumo[];
  /** Termo em vigor, so para o estado vazio saber por que a lista esta vazia. */
  busca?: string;
}) {
  if (escalas.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          {/* O texto vai num `p` proprio: solto, cada trecho vira um item do
              flex e a frase quebra a cada palavra em negrito. */}
          {busca ? (
            <>
              <SearchX className="size-6" aria-hidden />
              <p>
                Nenhuma escala encontrada para <span className="font-medium">{busca}</span>.
              </p>
            </>
          ) : (
            <>
              <CalendarOff className="size-6" aria-hidden />
              <p>
                Nenhuma escala cadastrada ainda. A primeira delas ja serve para interpretar a
                jornada de quem a seguir.
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
          <TableHead>Escala</TableHead>
          <TableHead>Horario</TableHead>
          <TableHead>Ciclo</TableHead>
          <TableHead>Jornada</TableHead>
          <TableHead>Marcacoes</TableHead>
          <TableHead>Situacao</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {escalas.map((escala) => {
          const liquida = jornadaLiquidaEmMinutos(
            escala.entrada,
            escala.saida,
            escala.intrajornadaMinutos,
          );

          return (
            <TableRow key={escala.id}>
              <TableCell className="whitespace-normal">
                <div className="font-medium">{escala.nome}</div>
                {escala.descricao ? (
                  <p className="text-muted-foreground text-sm">{escala.descricao}</p>
                ) : null}
              </TableCell>

              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    {escala.entrada} as {escala.saida}
                  </span>
                  {/* Vem da coluna gerada: e consequencia dos horarios, nao um campo. */}
                  {escala.viradaTurno ? <Badge variant="outline">Vira o turno</Badge> : null}
                </div>
              </TableCell>

              <TableCell>
                <div>{rotuloDoCiclo(escala)}</div>
                <p className="text-muted-foreground text-sm">
                  {escala.excecoes.length === 0
                    ? descricaoDoCiclo(escala)
                    : `${escala.excecoes.length} ${
                        escala.excecoes.length === 1 ? "dia ajustado" : "dias ajustados"
                      }: ${escala.excecoes.map((dia) => dia.diaCiclo).join(", ")}`}
                </p>
              </TableCell>

              <TableCell>
                <div>{formatarDuracao(liquida)}</div>
                <p className="text-muted-foreground text-sm">
                  {escala.intrajornadaMinutos > 0
                    ? `Intervalo de ${formatarDuracao(escala.intrajornadaMinutos)}`
                    : "Sem intervalo"}
                  {escala.horasExtrasMinutos > 0
                    ? ` · ${formatarDuracao(escala.horasExtrasMinutos)} de extra`
                    : null}
                </p>
              </TableCell>

              <TableCell>{escala.marcacoesEsperadas}</TableCell>

              <TableCell>
                {escala.ativa ? (
                  <span className="text-sm">Ativa</span>
                ) : (
                  <Badge variant="destructive">Inativa</Badge>
                )}
              </TableCell>

              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/escalas/${escala.id}`}>
                    Editar<span className="sr-only"> a escala {escala.nome}</span>
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
