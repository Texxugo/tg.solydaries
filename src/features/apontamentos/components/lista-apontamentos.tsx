import { SearchX, Users } from "lucide-react";
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
import type { SugestaoDeApontamento } from "@/features/apontamentos/regras/calculo";
import {
  apontamentoVazio,
  mesmasRubricas,
  resumoDoApontamento,
} from "@/features/apontamentos/rubricas";
import type { LinhaDeApontamentos } from "@/features/apontamentos/types";

import { formatarInstante } from "./formatar-instante";

/** Server Component: so exibe. Toda escrita passa pela tela de cada pessoa. */
export function ListaApontamentos({
  linhas,
  filtrado = false,
  sugestoes,
}: {
  linhas: readonly LinhaDeApontamentos[];
  filtrado?: boolean;
  /**
   * O que as regras leem da grade, por funcionario. Vazio quando nao ha regra
   * ativa — e ai a coluna nao diz nada, em vez de dizer que todos divergem.
   */
  sugestoes?: ReadonlyMap<string, SugestaoDeApontamento>;
}) {
  if (linhas.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          {filtrado ? (
            <>
              <SearchX className="size-6" aria-hidden />
              <p>Ninguem atende a busca e aos filtros escolhidos.</p>
            </>
          ) : (
            <>
              <Users className="size-6" aria-hidden />
              <p>Nenhum funcionario cadastrado. Importe a folha em Funcionarios.</p>
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
          <TableHead>Funcionario</TableHead>
          <TableHead>Apontamento</TableHead>
          <TableHead>Ultima alteracao</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map(({ funcionario, apontamento }) => {
          const itens = apontamento ? resumoDoApontamento(apontamento) : [];
          const sugestao = sugestoes?.get(funcionario.id);
          const temSugestao = sugestao ? !apontamentoVazio(sugestao.apontamento) : false;

          return (
            <TableRow key={funcionario.id}>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{funcionario.nome}</span>
                  {funcionario.ativo ? null : <Badge variant="outline">Inativo</Badge>}
                </div>
                <p className="text-muted-foreground text-sm">
                  {funcionario.matricula} · {funcionario.empresaNome}
                </p>
              </TableCell>

              <TableCell className="whitespace-normal">
                {apontamento ? (
                  <div className="flex max-w-xl flex-wrap gap-1">
                    {itens.map((item) => (
                      // Ocorrencia desconta, e o resto soma: a cor separa as
                      // duas leituras sem precisar de uma coluna para cada.
                      <Badge
                        key={item.id}
                        variant={item.grupo === "ocorrencias" ? "destructive" : "secondary"}
                      >
                        {item.texto}
                      </Badge>
                    ))}
                    {apontamento.observacao ? (
                      <p className="text-muted-foreground w-full text-sm">
                        {apontamento.observacao}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {temSugestao ? "Sem apontamento — ha sugestao pronta" : "Sem apontamento"}
                  </span>
                )}

                {/* A sugestao e leitura da grade: ela avisa, e nao muda nada. */}
                {apontamento &&
                temSugestao &&
                !mesmasRubricas(apontamento, sugestao!.apontamento) ? (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    Difere da sugestao das regras
                  </p>
                ) : null}
              </TableCell>

              <TableCell className="text-muted-foreground text-sm whitespace-normal">
                {apontamento ? (
                  <>
                    {formatarInstante(apontamento.atualizadoEm)}
                    {apontamento.atualizadoPor ? <p>{apontamento.atualizadoPor}</p> : null}
                  </>
                ) : (
                  "—"
                )}
              </TableCell>

              <TableCell className="text-right">
                <Button asChild variant={apontamento ? "ghost" : "outline"} size="sm">
                  <Link href={`/apontamentos/${funcionario.id}`}>
                    {apontamento ? "Editar" : "Apontar"}
                    <span className="sr-only"> {funcionario.nome}</span>
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
