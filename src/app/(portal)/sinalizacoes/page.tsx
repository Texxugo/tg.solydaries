import type { Metadata } from "next";
import { CalendarOff, CircleAlert, ExternalLink, Send } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { podeAcessar } from "@/features/acessos/areas";
import { formatarInstante } from "@/features/apontamentos/components/formatar-instante";
import { exigirAcesso } from "@/features/auth/queries";
import {
  diaDaSemana,
  formatarData,
  formatarPeriodo,
  nomeDaCompetencia,
} from "@/features/competencias/periodo";
import { chaveDaCelula } from "@/features/preenchimento/grade";
import { AREA_PREENCHIMENTO, ROTA_PREENCHIMENTO } from "@/features/preenchimento/types";
import { BotaoResolver } from "@/features/sinalizacoes/components/botao-resolver";
import { listarDiasSinalizados } from "@/features/sinalizacoes/queries";
import { filtroSinalizacoesSchema } from "@/features/sinalizacoes/schema";
import {
  AREA_SINALIZACOES,
  ROTA_ENVIO_SINALIZADOS,
  ROTULO_DA_SITUACAO,
  SEM_COMPETENCIA,
  SITUACOES,
  hrefDaSituacao,
  type SituacaoDoFiltro,
} from "@/features/sinalizacoes/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dias sinalizados",
  description: "Os dias marcados com o ! no preenchimento da escala, para conferir e resolver.",
};

export default async function DiasSinalizadosPage({ searchParams }: PageProps<"/sinalizacoes">) {
  // Repetida mesmo com o layout: layout nao roda em toda navegacao, e so exige
  // sessao, nao esta area.
  const usuario = await exigirAcesso(AREA_SINALIZACOES);

  // O recorte vem da URL e passa pelo Zod antes de virar consulta.
  const { situacao } = filtroSinalizacoesSchema.parse(await searchParams);
  const resultado = await listarDiasSinalizados(situacao);

  // "Abrir na grade" so para quem pode abrir a grade: o link levaria quem nao
  // pode direto para o redirect do `exigirAcesso()`.
  const abreAGrade = podeAcessar(usuario, AREA_PREENCHIMENTO);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            Dias sinalizados
            {resultado ? (
              <Badge variant="secondary">{nomeDaCompetencia(resultado.competencia.dataFim)}</Badge>
            ) : null}
          </h1>
          {resultado ? (
            <p className="text-muted-foreground text-sm">
              Periodo de{" "}
              {formatarPeriodo(resultado.competencia.dataInicio, resultado.competencia.dataFim)}.
            </p>
          ) : null}
        </div>
        {resultado ? (
          <Button asChild variant="secondary">
            <Link href={ROTA_ENVIO_SINALIZADOS}>
              <Send aria-hidden />
              Envio aos responsaveis
            </Link>
          </Button>
        ) : null}
      </header>

      {resultado ? (
        <div className="space-y-4">
          <nav aria-label="Situacao" className="flex flex-wrap gap-2">
            {SITUACOES.map((opcao) => (
              <Button
                key={opcao}
                asChild
                size="sm"
                variant={opcao === situacao ? "secondary" : "ghost"}
              >
                <Link
                  href={hrefDaSituacao(opcao)}
                  aria-current={opcao === situacao ? "page" : undefined}
                >
                  {ROTULO_DA_SITUACAO[opcao]}
                  <span className="text-muted-foreground tabular-nums">
                    {contagem(opcao, resultado.pendentes, resultado.resolvidos)}
                  </span>
                </Link>
              </Button>
            ))}
          </nav>

          {resultado.dias.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                {mensagemVazia(situacao)}
              </CardContent>
            </Card>
          ) : (
            // A rolagem fica na tabela, e nao na pagina. O `overflow` sozinho nao
            // basta: o `main` do layout e item flex e nao encolhe abaixo da
            // largura minima do conteudo, e numa tela estreita a tabela
            // empurraria o documento para o lado. `contain: inline-size` tira a
            // largura da tabela dessa conta.
            <div className="overflow-x-auto rounded-lg border [contain:inline-size]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Posto e funcao</TableHead>
                    <TableHead>Na grade</TableHead>
                    <TableHead>Situacao</TableHead>
                    <TableHead>
                      <span className="sr-only">Acoes</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.dias.map((dia) => {
                    const resolvido = dia.resolvidoEm !== null;

                    return (
                      <TableRow key={dia.id} className={cn(resolvido && "text-muted-foreground")}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatarData(dia.data)}{" "}
                          <span className="text-muted-foreground">{diaDaSemana(dia.data)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground font-medium">{dia.pessoaNome}</span>
                          <span className="text-muted-foreground block text-xs">
                            {dia.freelancer ? "Freelancer" : "Matricula"}
                            {dia.pessoaCodigo ? ` ${dia.pessoaCodigo}` : ""}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{dia.postoCodigo}</span>{" "}
                          {dia.postoNome}
                          <span className="text-muted-foreground block text-xs">
                            {dia.funcaoNome}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {dia.eventoCodigo || dia.horario ? (
                            <>
                              <span className="font-mono">{dia.eventoCodigo ?? "—"}</span>
                              {dia.horario ? (
                                <span className="text-muted-foreground"> {dia.horario}</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-muted-foreground">em branco</span>
                          )}
                          {dia.observacao ? (
                            <span className="text-foreground block max-w-64 text-xs whitespace-normal">
                              Conferir: {dia.observacao}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {dia.resolvidoEm ? (
                            <Badge variant="outline">Resolvido</Badge>
                          ) : (
                            <Badge variant="destructive">
                              <CircleAlert aria-hidden />
                              Pendente
                            </Badge>
                          )}
                          <span className="text-muted-foreground block pt-1">
                            Sinalizado por {dia.sinalizadoPor ?? "conta removida"},{" "}
                            <span className="tabular-nums">
                              {formatarInstante(dia.sinalizadoEm)}
                            </span>
                          </span>
                          {dia.ultimoEnvio ? (
                            <span className="text-muted-foreground block">
                              Enviado a {dia.ultimoEnvio.responsavel ?? "responsavel removido"},{" "}
                              <span className="tabular-nums">
                                {formatarInstante(dia.ultimoEnvio.em)}
                              </span>
                            </span>
                          ) : null}
                          {dia.resolvidoEm ? (
                            <span className="text-muted-foreground block">
                              Resolvido por {dia.resolvidoPor ?? "conta removida"},{" "}
                              <span className="tabular-nums">
                                {formatarInstante(dia.resolvidoEm)}
                              </span>
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {abreAGrade ? (
                              <Button asChild size="icon-sm" variant="ghost">
                                <Link
                                  href={`${ROTA_PREENCHIMENTO}/${dia.postoId}?dia=${chaveDaCelula(dia.linhaId, dia.data)}`}
                                  title="Abrir na grade, com o dia aberto"
                                >
                                  <ExternalLink aria-hidden />
                                  <span className="sr-only">Abrir na grade</span>
                                </Link>
                              </Button>
                            ) : null}
                            <BotaoResolver id={dia.id} resolvido={resolvido} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <Alert>
          <CalendarOff aria-hidden />
          <AlertTitle>Nenhuma competencia aberta</AlertTitle>
          <AlertDescription>{SEM_COMPETENCIA}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function contagem(situacao: SituacaoDoFiltro, pendentes: number, resolvidos: number) {
  return situacao === "pendentes"
    ? pendentes
    : situacao === "resolvidos"
      ? resolvidos
      : pendentes + resolvidos;
}

function mensagemVazia(situacao: SituacaoDoFiltro) {
  switch (situacao) {
    case "pendentes":
      return "Nenhum dia sinalizado esperando conferencia nesta competencia.";
    case "resolvidos":
      return "Nenhum dia sinalizado foi resolvido ainda nesta competencia.";
    case "todos":
      return "Ninguem sinalizou dia nenhum nesta competencia.";
  }
}
