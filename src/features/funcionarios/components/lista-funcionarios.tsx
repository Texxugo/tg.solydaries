"use client";

import { CalendarOff, SearchX, UsersRound } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData } from "@/features/competencias/periodo";
import { diaDoCiclo, ehDiaTrabalhado, rotuloDoCiclo } from "@/features/escalas/jornada";
import { formatarCpf } from "@/features/funcionarios/cpf";
import { estaTrabalhando, rotuloDaSituacao } from "@/features/funcionarios/situacoes";
import type { FiltrosDeFuncionarios, FuncionarioResumo } from "@/features/funcionarios/types";

/**
 * A lista de funcionarios, com a selecao que alimenta a atribuicao em lote.
 *
 * Client Component por causa da selecao: os checkboxes sao controlados para que
 * "selecionar todos" e a contagem da barra sejam sempre a mesma verdade. Sem
 * JavaScript a tela continua listando e os links continuam abrindo — o que fica
 * indisponivel e a selecao, como ja acontece nos checkboxes de `acessos`.
 *
 * `hoje` vem do servidor de proposito: calculado aqui, o primeiro render do
 * cliente poderia cair em outro dia que o do servidor e a hidratacao acusaria a
 * diferenca — justamente na virada da meia-noite, quando a resposta importa.
 */
export function ListaFuncionarios({
  funcionarios,
  hoje,
  filtros,
  selecionados,
  aoAlternar,
}: {
  funcionarios: readonly FuncionarioResumo[];
  /** `YYYY-MM-DD` no fuso do portal. */
  hoje: string;
  /** Em vigor, so para o estado vazio saber por que a lista esta vazia. */
  filtros: FiltrosDeFuncionarios;
  selecionados: ReadonlySet<string>;
  aoAlternar: (id: string, marcado: boolean) => void;
}) {
  if (funcionarios.length === 0) {
    return <ListaVazia filtros={filtros} />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">Selecionar</span>
            </TableHead>
            <TableHead>Funcionario</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Escala</TableHead>
            <TableHead>Hoje</TableHead>
            <TableHead className="sr-only">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {funcionarios.map((funcionario) => (
            <TableRow
              key={funcionario.id}
              data-state={selecionados.has(funcionario.id) ? "selected" : undefined}
            >
              <TableCell>
                <Checkbox
                  name="funcionarios"
                  value={funcionario.id}
                  checked={selecionados.has(funcionario.id)}
                  onCheckedChange={(marcado) => aoAlternar(funcionario.id, marcado === true)}
                  aria-label={`Selecionar ${funcionario.nome}`}
                />
              </TableCell>

              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{funcionario.nome}</span>
                  {funcionario.ativo ? null : <Badge variant="destructive">Inativo</Badge>}
                  {/*
                    So o que foge do normal ganha rotulo: 299 das 314 linhas do
                    relatorio sao "Trabalhando", e marcar todas elas esconderia
                    justamente as que pedem atencao.
                  */}
                  {estaTrabalhando(funcionario.situacao) ? null : (
                    <Badge variant="secondary">{rotuloDaSituacao(funcionario.situacao)}</Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {formatarCpf(funcionario.cpf)}
                  {funcionario.admissao
                    ? ` · admitido em ${formatarData(funcionario.admissao)}`
                    : null}
                </p>
              </TableCell>

              <TableCell className="whitespace-normal">
                <div>{funcionario.empresaNome}</div>
                <p className="text-muted-foreground text-sm">Matricula {funcionario.matricula}</p>
              </TableCell>

              <TableCell className="whitespace-normal">{funcionario.cargo ?? "—"}</TableCell>

              <TableCell className="whitespace-normal">
                {funcionario.escala ? (
                  <>
                    <div>{funcionario.escala.escalaNome}</div>
                    <p className="text-muted-foreground text-sm">
                      {rotuloDoCiclo(funcionario.escala)} · {funcionario.escala.entrada} as{" "}
                      {funcionario.escala.saida}
                    </p>
                  </>
                ) : (
                  <Badge variant="outline">Sem escala</Badge>
                )}
              </TableCell>

              <TableCell>
                <DiaDeHoje funcionario={funcionario} hoje={hoje} />
              </TableCell>

              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/funcionarios/${funcionario.id}`}>
                    Editar<span className="sr-only"> {funcionario.nome}</span>
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

/**
 * Se hoje e dia de trabalho para esta pessoa — a pergunta que a escala e o
 * inicio de ciclo existem para responder, e a unica forma de conferir a
 * atribuicao sem esperar a folha do mes.
 */
function DiaDeHoje({ funcionario, hoje }: { funcionario: FuncionarioResumo; hoje: string }) {
  if (!funcionario.escala) {
    return <span className="text-muted-foreground text-sm">Indefinido</span>;
  }

  const { inicioCiclo } = funcionario.escala;
  const trabalha = ehDiaTrabalhado(hoje, inicioCiclo, funcionario.escala);
  const dia = diaDoCiclo(hoje, inicioCiclo, funcionario.escala);

  return (
    <div>
      <Badge variant={trabalha ? "default" : "secondary"}>{trabalha ? "Trabalha" : "Folga"}</Badge>
      <p className="text-muted-foreground mt-1 text-sm">Dia {dia} do ciclo</p>
    </div>
  );
}

/** Cada filtro tem um vazio proprio: o texto diz o que remover para ver algo. */
function ListaVazia({ filtros }: { filtros: FiltrosDeFuncionarios }) {
  return (
    <Card>
      <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
        {filtros.pendentes ? (
          <>
            <CalendarOff className="size-6" aria-hidden />
            <p>Ninguem esta sem escala. Todo funcionario cadastrado ja tem jornada definida.</p>
          </>
        ) : filtros.busca ? (
          <>
            <SearchX className="size-6" aria-hidden />
            <p>
              Nenhum funcionario encontrado para{" "}
              <span className="font-medium">{filtros.busca}</span>.
            </p>
          </>
        ) : filtros.empresaId ? (
          <>
            <UsersRound className="size-6" aria-hidden />
            <p>Nenhum funcionario nesta empresa.</p>
          </>
        ) : (
          <>
            <UsersRound className="size-6" aria-hidden />
            <p>
              Nenhum funcionario cadastrado ainda. Importe o relatorio da folha ou cadastre o
              primeiro a mao.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
