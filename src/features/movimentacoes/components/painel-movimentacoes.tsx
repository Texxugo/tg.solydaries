"use client";

import { ArrowLeftRight, FileSpreadsheet, FileText, ImageIcon, Plus, SearchX } from "lucide-react";
import { useState } from "react";

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
import { ModalMovimentacao } from "@/features/movimentacoes/components/modal-movimentacao";
import {
  ROTULOS_PAPEL,
  ROTULOS_TIPO_DE_MOVIMENTACAO,
  ehTroca,
  hrefDoDocumento,
  type MovimentacaoResumo,
} from "@/features/movimentacoes/types";

/**
 * A lista da competencia e o modal que a alimenta.
 *
 * Client porque o modal e um so para a tela inteira — abrir uma linha so troca
 * qual movimentacao ele mostra, sem navegar. Busca, filtros e pagina continuam
 * na URL, desenhados pelo Server Component em volta.
 */
export function PainelMovimentacoes({
  movimentacoes,
  filtrado,
  periodo,
  dataPadrao,
  hrefDaPlanilha,
  total,
}: {
  movimentacoes: MovimentacaoResumo[];
  filtrado: boolean;
  periodo: { inicio: string; fim: string };
  dataPadrao: string;
  hrefDaPlanilha: string;
  total: number;
}) {
  // `movimentacao: null` registra uma nova. Fechar nao a esquece: o titulo do
  // modal continua o mesmo durante a animacao de saida.
  const [modal, setModal] = useState<{ aberto: boolean; movimentacao: MovimentacaoResumo | null }>({
    aberto: false,
    movimentacao: null,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setModal({ aberto: true, movimentacao: null })}>
          <Plus aria-hidden />
          Registrar movimentacao
        </Button>

        {/* `<a download>`, e nao `Link`: o `Link` tentaria navegar ate um arquivo. */}
        {total > 0 ? (
          <Button asChild variant="outline">
            <a href={hrefDaPlanilha} download>
              <FileSpreadsheet aria-hidden />
              Exportar Excel{filtrado ? " (recorte)" : ""}
            </a>
          </Button>
        ) : null}
      </div>

      {movimentacoes.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            {filtrado ? (
              <>
                <SearchX className="size-6" aria-hidden />
                <p>Nenhuma movimentacao desta competencia atende a busca e aos filtros.</p>
              </>
            ) : (
              <>
                <ArrowLeftRight className="size-6" aria-hidden />
                <p>Nenhuma movimentacao registrada nesta competencia.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Pessoas</TableHead>
              <TableHead>Justificativa</TableHead>
              <TableHead>Documentos</TableHead>
              <TableHead className="sr-only">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimentacoes.map((movimentacao) => (
              <TableRow key={movimentacao.id}>
                <TableCell className="align-top whitespace-normal">
                  <div>{formatarData(movimentacao.data)}</div>
                  <p className="text-muted-foreground text-sm">{diaDaSemana(movimentacao.data)}</p>
                </TableCell>

                <TableCell className="align-top">
                  <Badge variant={movimentacao.tipo === "falta" ? "destructive" : "secondary"}>
                    {ROTULOS_TIPO_DE_MOVIMENTACAO[movimentacao.tipo]}
                  </Badge>
                </TableCell>

                <TableCell className="align-top whitespace-normal">
                  <ul className="space-y-0.5">
                    {movimentacao.pessoas.map((pessoa) => (
                      <li key={pessoa.valor}>
                        <span className="font-medium">{pessoa.nome}</span>
                        {/* Nas trocas todos sao "envolvidos": o papel nao diz nada. */}
                        {!ehTroca(movimentacao.tipo) ? (
                          <span className="text-muted-foreground text-sm">
                            {" "}
                            · {ROTULOS_PAPEL[pessoa.papel].toLowerCase()}
                          </span>
                        ) : null}
                        {pessoa.identificacao ? (
                          <span className="text-muted-foreground text-sm">
                            {" "}
                            · {pessoa.identificacao}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </TableCell>

                <TableCell className="max-w-xs align-top whitespace-normal">
                  <p className="line-clamp-3">{movimentacao.justificativa}</p>
                </TableCell>

                <TableCell className="align-top whitespace-normal">
                  {movimentacao.documentos.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {movimentacao.documentos.map((documento) => (
                        <li key={documento.id}>
                          <a
                            href={hrefDoDocumento(documento.id)}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex max-w-48 items-center gap-1 text-sm hover:underline"
                          >
                            {documento.tipoMime === "application/pdf" ? (
                              <FileText className="size-3.5 shrink-0" aria-hidden />
                            ) : (
                              <ImageIcon className="size-3.5 shrink-0" aria-hidden />
                            )}
                            <span className="truncate">{documento.nome}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>

                <TableCell className="text-right align-top">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ aberto: true, movimentacao })}
                  >
                    Abrir
                    <span className="sr-only">
                      {" "}
                      a {ROTULOS_TIPO_DE_MOVIMENTACAO[movimentacao.tipo].toLowerCase()} de{" "}
                      {formatarData(movimentacao.data)}
                    </span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ModalMovimentacao
        aberto={modal.aberto}
        aoFechar={() => setModal((atual) => ({ ...atual, aberto: false }))}
        movimentacao={modal.movimentacao}
        periodo={periodo}
        dataPadrao={dataPadrao}
      />
    </div>
  );
}
