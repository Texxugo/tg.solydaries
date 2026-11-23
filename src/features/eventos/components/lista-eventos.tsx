import { SearchX, TagsIcon } from "lucide-react";
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
import { classesDaCor, rotuloDaNatureza } from "@/features/eventos/cores";
import type { EventoResumo } from "@/features/eventos/types";
import { cn } from "@/lib/utils";

/** Server Component: so exibe. Toda escrita passa pelos formularios da feature. */
export function ListaEventos({ eventos, busca = "" }: { eventos: EventoResumo[]; busca?: string }) {
  if (eventos.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          {busca ? (
            <>
              <SearchX className="size-6" aria-hidden />
              <p>
                Nenhum evento encontrado para <span className="font-medium">{busca}</span>.
              </p>
            </>
          ) : (
            <>
              <TagsIcon className="size-6" aria-hidden />
              <p>
                Nenhum evento cadastrado ainda. Sem eles a grade nao tem o que aceitar em cada dia —
                comece pelo dia trabalhado e pela folga.
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
          <TableHead>Sigla</TableHead>
          <TableHead>Evento</TableHead>
          <TableHead>Natureza</TableHead>
          <TableHead>Celula</TableHead>
          <TableHead>Situacao</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {eventos.map((evento) => (
          <TableRow key={evento.id}>
            <TableCell>
              <span
                className={cn(
                  "inline-block rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium",
                  classesDaCor(evento.cor),
                )}
              >
                {evento.codigo}
              </span>
            </TableCell>
            <TableCell>
              <div className="space-y-0.5">
                <p className="font-medium">{evento.rotulo}</p>
                {evento.descricao ? (
                  <p className="text-muted-foreground max-w-md text-sm">{evento.descricao}</p>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm">{rotuloDaNatureza(evento.natureza)}</span>
                {evento.padrao ? <Badge variant="secondary">padrao</Badge> : null}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {/* O que o modal do dia vai cobrar quando a sigla for usada. */}
              {[
                evento.exigeHorario ? "horario" : null,
                evento.exigePessoa ? "pessoa" : null,
                evento.exigeDestino ? "posto" : null,
                evento.exigeDiaTrabalhado ? "dia trabalhado" : null,
              ]
                .filter(Boolean)
                .join(", ") || "So a sigla"}
            </TableCell>
            <TableCell>
              {evento.ativo ? (
                <Badge variant="outline">Ativo</Badge>
              ) : (
                <Badge variant="ghost">Inativo</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/eventos/${evento.id}`}>Editar</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
