import type { Metadata } from "next";
import { ArrowLeft, Hourglass, PhoneOff, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { FiltrosPendencias } from "@/features/ponto/components/filtros-pendencias";
import { ListaOcorrencias } from "@/features/ponto/components/lista-ocorrencias";
import { PaginacaoPendencias } from "@/features/ponto/components/paginacao-pendencias";
import { listarEmpresasDaConferencia, listarPendencias } from "@/features/ponto/queries";
import {
  buscaPontoSchema,
  filtroEmpresaSchema,
  filtroGravidadeSchema,
  filtroTipoSchema,
  filtroTratativaSchema,
  paginaPontoSchema,
} from "@/features/ponto/schema";
import {
  AREA_PONTO,
  ROTA_CONSOLIDADO,
  ROTA_PONTO,
  type FiltrosDeOcorrencias,
} from "@/features/ponto/types";

export const metadata: Metadata = {
  title: "Pendencias de ponto",
  description:
    "As ocorrencias do periodo, o status de cada tratativa e o contato com quem bate o ponto.",
};

export default async function PendenciasPage({ searchParams }: PageProps<"/ponto/pendencias">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area.
  await exigirAcesso(AREA_PONTO);

  // Os seis parametros sao entrada do usuario como qualquer outra: passam pelo
  // Zod antes de virar filtro e de voltar para a tela.
  const parametros = await searchParams;
  const filtros: FiltrosDeOcorrencias = {
    busca: buscaPontoSchema.parse(parametros.busca),
    empresaId: filtroEmpresaSchema.parse(parametros.empresa),
    tratativa: filtroTratativaSchema.parse(parametros.tratativa),
    gravidade: filtroGravidadeSchema.parse(parametros.gravidade),
    tipo: filtroTipoSchema.parse(parametros.tipo),
    pagina: paginaPontoSchema.parse(parametros.pagina),
  };

  const [painel, empresas] = await Promise.all([
    listarPendencias(filtros),
    listarEmpresasDaConferencia(),
  ]);

  const { competencia, janela, resumo } = painel;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROTA_PONTO}>
            <ArrowLeft aria-hidden />
            Voltar para a analise de ponto
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Pendencias de ponto
          {competencia ? (
            <Badge variant="secondary">{nomeDaCompetencia(competencia.dataFim)}</Badge>
          ) : null}
        </h1>

        {janela ? (
          <Button asChild variant="outline" size="sm">
            <Link href={ROTA_CONSOLIDADO}>
              <Send aria-hidden />
              Enviar aos responsaveis
            </Link>
          </Button>
        ) : null}
      </header>

      {!competencia ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Nenhuma competencia aberta</AlertTitle>
          <AlertDescription>
            Todo dado do portal pertence a um periodo. Abra a competencia em{" "}
            <Link href="/competencias" className="underline">
              Competencias
            </Link>{" "}
            antes de conferir as pendencias.
          </AlertDescription>
        </Alert>
      ) : !janela ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Nenhuma marcacao importada nesta competencia</AlertTitle>
          <AlertDescription>
            Sem saber que periodo o relogio cobre, nao ha como dizer se um dia sem marcacao e falta
            ou e dia que ninguem importou — entao o portal nao apura nada, e nao ha ocorrencia a
            tratar. Comece pela{" "}
            <Link href="/ponto/importar" className="underline">
              importacao das marcacoes
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Numero rotulo="Abertas" valor={resumo.abertas} alerta={resumo.abertas > 0} />
              <Numero rotulo="Em tratativa" valor={resumo.emTratativa} />
              <Numero rotulo="Encerradas" valor={resumo.encerradas} />
              <Numero
                rotulo="Impeditivas"
                valor={resumo.impeditivas}
                alerta={resumo.impeditivas > 0}
              />
            </div>

            <p className="text-muted-foreground text-sm">
              Periodo apurado: {formatarPeriodo(janela.inicio, janela.fim)} · {resumo.total}{" "}
              {resumo.total === 1 ? "ocorrencia" : "ocorrencias"}
            </p>

            {resumo.semTelefone > 0 ? (
              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                <PhoneOff className="size-4" aria-hidden />
                {resumo.semTelefone}{" "}
                {resumo.semTelefone === 1
                  ? "ocorrencia nao tem a quem avisar"
                  : "ocorrencias nao tem a quem avisar"}{" "}
                — falta o telefone do colaborador ou, quando ele esta no grupo de um posto, o do
                responsavel (ou o responsavel foi desativado). O numero nao vem da folha, entao ele
                precisa ser informado em{" "}
                <Link href="/funcionarios" className="underline">
                  Funcionarios
                </Link>{" "}
                antes de dar para avisar por mensagem.
              </p>
            ) : null}

            {resumo.prazosVencidos > 0 ? (
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <Hourglass className="size-4" aria-hidden />
                {resumo.prazosVencidos}{" "}
                {resumo.prazosVencidos === 1
                  ? "ocorrencia esta com o prazo de retorno do responsavel vencido."
                  : "ocorrencias estao com o prazo de retorno do responsavel vencido."}
              </p>
            ) : null}
          </section>

          <div className="space-y-4">
            <FiltrosPendencias filtros={filtros} empresas={empresas} resumo={resumo} />

            <ListaOcorrencias itens={painel.itens} />

            <PaginacaoPendencias
              filtros={filtros}
              pagina={painel.pagina}
              paginas={painel.paginas}
              total={painel.total}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
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
