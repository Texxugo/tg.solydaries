import { ChevronRight, MoonStar, PenLine } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rotuloDaSituacao, SITUACAO_TRABALHANDO } from "@/features/funcionarios/situacoes";
import { formatarMinutos } from "@/features/ponto/apuracao";
import {
  rotuloDoStatus,
  ROTA_PONTO,
  type ApuracaoResumo,
  type StatusDaApuracao,
} from "@/features/ponto/types";

/**
 * A conferencia do periodo: uma linha por pessoa, ordenada por quem precisa de
 * trabalho primeiro.
 *
 * Server Component: nao ha nada a interagir aqui — cada linha e um link para o
 * dia a dia daquela pessoa, e os filtros vivem na URL.
 */
export function ListaConferencia({ itens }: { itens: readonly ApuracaoResumo[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
        Ninguem atende a este filtro.
      </p>
    );
  }

  return (
    // Sem `overflow-x-auto` aqui: o proprio `Table` do shadcn ja embrulha a
    // tabela num container que rola, e uma segunda camada de rolagem por fora
    // nao acrescenta nada.
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Funcionario</TableHead>
            {/*
              A situacao vem logo depois do nome, e nao no fim da linha: e a
              coluna que responde "quem precisa de atencao?", que e a pergunta
              da tela. No fim, ela era a primeira a sair de vista quando a
              tabela nao cabia.
            */}
            <TableHead>Situacao</TableHead>
            <TableHead>Escala</TableHead>
            <TableHead className="text-right">Dias</TableHead>
            <TableHead className="text-right">Faltas</TableHead>
            <TableHead className="text-right">Pend.</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => (
            <TableRow key={item.funcionarioId}>
              {/*
                `whitespace-normal` nas duas colunas de texto (a celula do
                shadcn nasce `whitespace-nowrap`): sem ele, a razao social e o
                nome da escala esticavam a tabela muito alem da tela, e as
                colunas da direita — justamente as de pendencia — so apareciam
                depois de rolar.
              */}
              <TableCell className="min-w-48 whitespace-normal">
                <div className="font-medium">{item.nome}</div>
                <div className="text-muted-foreground text-xs">
                  {item.empresaNome} · matricula {item.matricula}
                  {item.cargo ? ` · ${item.cargo}` : null}
                  {item.situacao !== SITUACAO_TRABALHANDO
                    ? ` · ${rotuloDaSituacao(item.situacao)}`
                    : null}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={item.status} />
                  {item.batidasIncluidas > 0 ? (
                    <span
                      className="text-muted-foreground inline-flex items-center gap-1 text-xs"
                      title={`${item.batidasIncluidas} marcacoes incluidas a mao no sistema de ponto`}
                    >
                      <PenLine className="size-3" aria-hidden />
                      {item.batidasIncluidas}
                    </span>
                  ) : null}
                </div>
              </TableCell>

              <TableCell className="whitespace-normal">
                {item.escala ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{item.escala.nome}</span>
                      {item.escala.viradaTurno ? (
                        <MoonStar
                          className="text-muted-foreground size-3.5 shrink-0"
                          aria-label="Vira o dia"
                        />
                      ) : null}
                    </div>
                    {/* Em linha propria, como o subtitulo do nome: emendado ao
                        lado do nome da escala, o par nunca quebrava. */}
                    <div className="text-muted-foreground text-xs">
                      {item.escala.rotuloCiclo} · {item.escala.entrada}–{item.escala.saida}
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {item.escala ? item.diasPrevistos : "—"}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {item.escala ? item.faltas || "—" : "—"}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {item.escala ? item.diasComPendencia || "—" : "—"}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {item.escala ? <Saldo minutos={item.saldoToleradoMinutos} /> : "—"}
              </TableCell>

              <TableCell>
                <Button asChild variant="ghost" size="sm">
                  <Link
                    href={`${ROTA_PONTO}/${item.funcionarioId}`}
                    aria-label={`Abrir o dia a dia de ${item.nome}`}
                  >
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Zero nao e saldo: e o dia que fechou exatamente, e merece um traco, nao "0h". */
export function Saldo({ minutos }: { minutos: number }) {
  if (minutos === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className={minutos < 0 ? "text-destructive" : undefined}>
      {minutos > 0 ? "+" : ""}
      {formatarMinutos(minutos)}
    </span>
  );
}

const VARIANTE: Record<StatusDaApuracao, "destructive" | "secondary" | "outline"> = {
  sem_escala: "outline",
  com_pendencia: "destructive",
  atencao: "secondary",
  conforme: "outline",
};

export function StatusBadge({ status }: { status: StatusDaApuracao }) {
  return <Badge variant={VARIANTE[status]}>{rotuloDoStatus(status)}</Badge>;
}
