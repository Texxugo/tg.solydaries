import type { Metadata } from "next";
import { ArrowLeft, CalendarClock, CircleCheck, Phone, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { exigirAcesso } from "@/features/auth/queries";
import { diaDaSemana, formatarData, nomeDaCompetencia } from "@/features/competencias/periodo";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import { formatarMinutos, rotuloDaDivergencia } from "@/features/ponto/apuracao";
import { HistoricoMensagens } from "@/features/ponto/components/historico-mensagens";
import { PrazoBadge, TratativaBadge } from "@/features/ponto/components/lista-ocorrencias";
import { MensagemForm } from "@/features/ponto/components/mensagem-form";
import { TratativaForm } from "@/features/ponto/components/tratativa-form";
import {
  atendimentosDaOcorrencia,
  comprovantesDaOcorrencia,
} from "@/features/ponto/atendimento/queries";
import {
  AtendimentosDaOcorrencia,
  ComprovantesWhatsapp,
} from "@/features/ponto/components/comprovantes-whatsapp";
import { obterOcorrencia } from "@/features/ponto/queries";
import { dataDaOcorrenciaSchema, tipoDaOcorrenciaSchema } from "@/features/ponto/schema";
import { idFuncionarioSchema } from "@/features/funcionarios/schema";
import { AREA_PONTO, ROTA_PENDENCIAS, type ChaveDaOcorrencia } from "@/features/ponto/types";

export const metadata: Metadata = {
  title: "Tratativa da ocorrencia",
  description: "O dia, o que nao fechou, o que ja foi feito e o contato com o colaborador.",
};

export default async function OcorrenciaPage({
  params,
}: PageProps<"/ponto/pendencias/[funcionarioId]/[data]/[tipo]">) {
  await exigirAcesso(AREA_PONTO);

  const { funcionarioId, data, tipo } = await params;

  /**
   * A chave inteira vem da URL, e por isso passa pelo Zod antes de virar
   * consulta — sem `catch`, ao contrario dos filtros: uma data torta que virasse
   * "hoje" apontaria para o dia errado em silencio, e um uuid invalido faria o
   * Postgres lancar erro de cast.
   */
  const chaveValida = {
    funcionarioId: idFuncionarioSchema.safeParse(funcionarioId),
    data: dataDaOcorrenciaSchema.safeParse(decodeURIComponent(data)),
    tipo: tipoDaOcorrenciaSchema.safeParse(tipo),
  };

  if (
    !chaveValida.funcionarioId.success ||
    !chaveValida.data.success ||
    !chaveValida.tipo.success
  ) {
    notFound();
  }

  const chave: ChaveDaOcorrencia = {
    funcionarioId: chaveValida.funcionarioId.data,
    data: chaveValida.data.data,
    tipo: chaveValida.tipo.data,
  };

  const ocorrencia = await obterOcorrencia(chave);

  if (!ocorrencia) {
    notFound();
  }

  const { funcionario, dia, divergencia } = ocorrencia;

  const [comprovantes, atendimentos] = await Promise.all([
    comprovantesDaOcorrencia(chave.funcionarioId, chave.data, chave.tipo),
    atendimentosDaOcorrencia(chave.funcionarioId, chave.data, chave.tipo),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROTA_PENDENCIAS}>
            <ArrowLeft aria-hidden />
            Voltar para as pendencias
          </Link>
        </Button>
      </div>

      <header className="space-y-2">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {rotuloDaDivergencia(ocorrencia.tipo)}
          {divergencia ? (
            <Badge variant={divergencia.gravidade === "impeditiva" ? "destructive" : "secondary"}>
              {divergencia.gravidade === "impeditiva" ? "Impeditiva" : "Atencao"}
            </Badge>
          ) : null}
          <TratativaBadge status={ocorrencia.status} />
        </h1>

        <p className="text-muted-foreground text-sm">
          {formatarData(ocorrencia.data)} ({diaDaSemana(ocorrencia.data)}) ·{" "}
          <Link href={`/ponto/${funcionario.id}`} className="underline">
            {funcionario.nome}
          </Link>{" "}
          · {funcionario.empresaNome} · matricula {funcionario.matricula}
          {funcionario.cargo ? ` · ${funcionario.cargo}` : null}
        </p>

        <p className="text-muted-foreground text-sm">
          {nomeDaCompetencia(ocorrencia.competencia.dataFim)}
          {funcionario.telefone ? (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" aria-hidden />
                {formatarTelefone(funcionario.telefone)}
              </span>
            </>
          ) : null}
        </p>
      </header>

      {/*
        A ocorrencia e calculada, entao ela pode ter deixado de existir desde que
        alguem abriu a tratativa — foi o que aconteceu se a escala foi corrigida
        ou se a batida que faltava entrou numa carga nova. A tela diz isso em vez
        de sumir: a tratativa e as mensagens continuam sendo fatos.
      */}
      {divergencia ? (
        <section className="space-y-3 rounded-md border p-4">
          <p className="text-sm">{divergencia.descricao}</p>

          {dia ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs">Previsto</dt>
                <dd className="flex items-center gap-1 font-medium">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {dia.regra
                    ? `${dia.regra.entrada}–${dia.regra.saida} · ${formatarMinutos(
                        dia.previstoMinutos,
                      )}`
                    : `Folga · dia ${dia.diaCiclo} do ciclo`}
                </dd>
              </div>

              <div>
                <dt className="text-muted-foreground text-xs">Marcacoes</dt>
                <dd className="font-mono font-medium tabular-nums">
                  {dia.batidas.length > 0
                    ? dia.batidas.map((batida) => batida.hora).join("  ")
                    : "—"}
                </dd>
              </div>

              <div>
                <dt className="text-muted-foreground text-xs">Trabalhado</dt>
                <dd className="font-medium tabular-nums">
                  {dia.trabalhadoMinutos === null ? "—" : formatarMinutos(dia.trabalhadoMinutos)}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>
      ) : (
        <Alert>
          <CircleCheck aria-hidden />
          <AlertTitle>Esta divergencia nao aparece mais na leitura atual</AlertTitle>
          <AlertDescription>
            A apuracao e refeita a cada leitura, entao ela some sozinha quando a causa e corrigida —
            a escala certa foi atribuida, a batida que faltava entrou numa carga nova, ou o
            afastamento foi lancado. O registro abaixo continua valendo como historico do que foi
            feito.
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Tratativa</h2>
          <p className="text-muted-foreground text-sm">
            {ocorrencia.tratadoEm
              ? `Ultima atualizacao em ${formatarDataHora(ocorrencia.tratadoEm)}${
                  ocorrencia.responsavel ? ` por ${ocorrencia.responsavel}` : ""
                }.`
              : "Ninguem registrou nada sobre esta ocorrencia ainda."}
          </p>
        </div>

        <TratativaForm chave={chave} ocorrencia={ocorrencia} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {ocorrencia.destino.via === "responsavel"
              ? "Falar com o responsavel pelo posto"
              : "Falar com o colaborador"}
          </h2>
          {ocorrencia.prazo ? <PrazoBadge prazo={ocorrencia.prazo} /> : null}
        </div>

        {divergencia ? (
          <MensagemForm chave={chave} ocorrencia={ocorrencia} />
        ) : (
          <Alert>
            <TriangleAlert aria-hidden />
            <AlertTitle>Nao ha mais o que perguntar</AlertTitle>
            <AlertDescription>
              A divergencia deixou de existir, entao o portal nao monta mensagem nova sobre ela. O
              que ja foi enviado continua no historico.
            </AlertDescription>
          </Alert>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Atendimento pelo WhatsApp
            {comprovantes.length > 0 ? ` (${comprovantes.length})` : null}
          </h2>
        </div>

        <AtendimentosDaOcorrencia atendimentos={atendimentos} />
        <ComprovantesWhatsapp comprovantes={comprovantes} />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Historico de mensagens
          {ocorrencia.mensagens.length > 0 ? ` (${ocorrencia.mensagens.length})` : null}
        </h2>

        <HistoricoMensagens mensagens={ocorrencia.mensagens} />
      </section>
    </div>
  );
}

/**
 * `05/09/2026 14:32`, com o fuso fixo em Sao Paulo para que servidor e cliente
 * escrevam a mesma coisa — sem isso, a hidratacao divergiria.
 */
function formatarDataHora(instante: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(instante);
}
