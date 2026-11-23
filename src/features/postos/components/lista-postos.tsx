import { MapPinOff, SearchX } from "lucide-react";
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
import type { PostoResumo } from "@/features/postos/types";

/** Server Component: so exibe. Toda escrita passa pelos formularios da feature. */
export function ListaPostos({ postos, busca = "" }: { postos: PostoResumo[]; busca?: string }) {
  if (postos.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          {busca ? (
            <>
              <SearchX className="size-6" aria-hidden />
              <p>
                Nenhum posto encontrado para <span className="font-medium">{busca}</span>.
              </p>
            </>
          ) : (
            <>
              <MapPinOff className="size-6" aria-hidden />
              <p>
                Nenhum posto cadastrado ainda. E o posto que diz o que a escala do periodo precisa
                cobrir — a grade desenha um bloco por funcao dele.
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
          <TableHead>Posto</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Funcoes</TableHead>
          <TableHead>Situacao</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {postos.map((posto) => {
          const ativas = posto.funcoes.filter((funcao) => funcao.ativa);

          return (
            <TableRow key={posto.id}>
              <TableCell>
                <div className="space-y-0.5">
                  <p className="font-medium">
                    <span className="text-muted-foreground font-mono text-xs">{posto.codigo}</span>{" "}
                    {posto.nome}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {posto.empresaNome ?? "—"}
              </TableCell>
              <TableCell>
                {ativas.length === 0 ? (
                  <span className="text-muted-foreground text-sm">Nenhuma</span>
                ) : (
                  <div className="flex max-w-md flex-wrap gap-1">
                    {ativas.map((funcao) => (
                      <Badge key={funcao.id} variant="outline">
                        {funcao.nome}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {posto.ativo ? (
                  <Badge variant="outline">Ativo</Badge>
                ) : (
                  <Badge variant="ghost">Inativo</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/postos/${posto.id}`}>Editar</Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
