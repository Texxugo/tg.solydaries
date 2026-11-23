import type { Metadata } from "next";
import { ArrowLeft, CalendarClock, MoonStar } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { rotuloDaSituacao, SITUACAO_TRABALHANDO } from "@/features/funcionarios/situacoes";
import { formatarMinutos } from "@/features/ponto/apuracao";
import { DiasDoFuncionario } from "@/features/ponto/components/dias-do-funcionario";
import { Saldo, StatusBadge } from "@/features/ponto/components/lista-conferencia";
import { comprovantesDoFuncionario } from "@/features/ponto/atendimento/queries";
import { ComprovantesWhatsapp } from "@/features/ponto/components/comprovantes-whatsapp";
import { obterApuracao } from "@/features/ponto/queries";
import { AREA_PONTO, descricaoDoStatus } from "@/features/ponto/types";

export const metadata: Metadata = {
  title: "Ponto do funcionario",
  description: "O dia a dia do periodo apurado, lido contra a escala.",
};

export default async function PontoDoFuncionarioPage({ params }: PageProps<"/ponto/[id]">) {
  await exigirAcesso(AREA_PONTO);

  const { id } = await params;

  // As duas leituras saem juntas: a dos comprovantes depende so do id da URL,
  // e nao do que a apuracao devolve. Os comprovantes sao de **todas** as
  // competencias — o comprovante e da pessoa, e continua valendo depois que o
  // periodo em que foi feito se encerra.
  const [detalhe, comprovantes] = await Promise.all([
    obterApuracao(id),
    comprovantesDoFuncionario(id),
  ]);

  if (!detalhe) {
    notFound();
  }

  const { competencia, janela, resumo, apuracao } = detalhe;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/ponto">
            <ArrowLeft aria-hidden />
            Voltar para a analise de ponto
          </Link>
        </Button>
      </div>

      <header className="space-y-2">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {resumo.nome}
          <StatusBadge status={resumo.status} />
          {resumo.situacao !== SITUACAO_TRABALHANDO ? (
            <Badge variant="secondary">{rotuloDaSituacao(resumo.situacao)}</Badge>
          ) : null}
        </h1>

        <p className="text-muted-foreground text-sm">
          {resumo.empresaNome} · matricula {resumo.matricula}
          {resumo.cargo ? ` · ${resumo.cargo}` : null}
        </p>

        <p className="text-muted-foreground text-sm">
          {nomeDaCompetencia(competencia.dataFim)} · periodo apurado{" "}
          {formatarPeriodo(janela.inicio, janela.fim)}
        </p>
      </header>

      {resumo.escala ? (
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <CalendarClock className="size-4" aria-hidden />
          <span className="text-foreground font-medium">{resumo.escala.nome}</span>
          <span>
            {resumo.escala.rotuloCiclo} · {resumo.escala.entrada}–{resumo.escala.saida}
          </span>
          {resumo.escala.viradaTurno ? (
            <span className="inline-flex items-center gap-1">
              <MoonStar className="size-3.5" aria-hidden />
              vira o dia
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
          {descricaoDoStatus("sem_escala")} Defina a escala e o inicio de ciclo em{" "}
          <Link href={`/funcionarios/${resumo.funcionarioId}`} className="underline">
            Funcionarios
          </Link>{" "}
          — o portal so consegue dizer o que falta depois de saber o que era para acontecer.
        </p>
      )}

      {resumo.escala ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Numero rotulo="Dias previstos" valor={String(apuracao.diasPrevistos)} />
            <Numero rotulo="Faltas" valor={String(apuracao.faltas)} alerta={apuracao.faltas > 0} />
            <Numero
              rotulo="Dias com pendencia"
              valor={String(apuracao.diasComPendencia)}
              alerta={apuracao.diasComPendencia > 0}
            />
            <Numero rotulo="Previsto" valor={formatarMinutos(apuracao.previstoMinutos)} />
            <Numero rotulo="Trabalhado" valor={formatarMinutos(apuracao.trabalhadoMinutos)} />
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-semibold">
                <Saldo minutos={apuracao.saldoToleradoMinutos} />
              </div>
              <p className="text-muted-foreground text-sm">Saldo</p>
            </div>
          </div>

          {resumo.batidasIncluidas > 0 ? (
            <p className="text-muted-foreground text-sm">
              {resumo.batidasIncluidas}{" "}
              {resumo.batidasIncluidas === 1
                ? "marcacao foi incluida"
                : "marcacoes foram incluidas"}{" "}
              a mao no sistema de ponto — elas aparecem marcadas na tabela abaixo.
            </p>
          ) : null}

          <DiasDoFuncionario funcionarioId={resumo.funcionarioId} dias={apuracao.dias} />
        </>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Comprovantes do WhatsApp
          {comprovantes.length > 0 ? ` (${comprovantes.length})` : null}
        </h2>
        <ComprovantesWhatsapp comprovantes={comprovantes} mostrarOcorrencia />
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div
        className={alerta ? "text-destructive text-2xl font-semibold" : "text-2xl font-semibold"}
      >
        {valor}
      </div>
      <p className="text-muted-foreground text-sm">{rotulo}</p>
    </div>
  );
}
