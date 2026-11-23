import { ScrollText } from "lucide-react";
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
import { partesDoEscopo, rotuloDoEfeito } from "@/features/apontamentos/regras/descricao";
import { ROTA_REGRAS, type RegraResumo } from "@/features/apontamentos/regras/types";

/** Server Component: so exibe. A ordem da lista e a ordem em que elas se aplicam. */
export function ListaRegras({ regras }: { regras: readonly RegraResumo[] }) {
  if (regras.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          <ScrollText className="size-6" aria-hidden />
          <p>
            Nenhuma regra cadastrada. Sem regra, a ficha de cada pessoa continua sendo preenchida a
            mao — a sugestao a partir da grade so aparece quando houver pelo menos uma.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Ordem</TableHead>
          <TableHead>Regra</TableHead>
          <TableHead>Escopo</TableHead>
          <TableHead>Efeito</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {regras.map((regra) => {
          const escopo = partesDoEscopo(regra);

          return (
            <TableRow key={regra.id} className={regra.ativa ? undefined : "opacity-60"}>
              <TableCell className="tabular-nums">{regra.ordem}</TableCell>

              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{regra.nome}</span>
                  {regra.ativa ? null : <Badge variant="outline">Inativa</Badge>}
                </div>
                {regra.descricao ? (
                  <p className="text-muted-foreground text-sm">{regra.descricao}</p>
                ) : null}
              </TableCell>

              <TableCell className="whitespace-normal">
                {escopo.length === 0 ? (
                  <span className="text-muted-foreground text-sm">Todo mundo</span>
                ) : (
                  <div className="flex max-w-sm flex-wrap gap-1">
                    {escopo.map((parte) => (
                      <Badge key={parte} variant="secondary">
                        {parte}
                      </Badge>
                    ))}
                  </div>
                )}
                {regra.excecoes.length > 0 ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    Menos: {regra.excecoes.map((excecao) => excecao.nome).join(", ")}
                  </p>
                ) : null}
              </TableCell>

              <TableCell className="whitespace-normal">{rotuloDoEfeito(regra)}</TableCell>

              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`${ROTA_REGRAS}/${regra.id}`}>
                    Editar<span className="sr-only"> a regra {regra.nome}</span>
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
