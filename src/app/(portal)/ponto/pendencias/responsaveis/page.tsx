import type { Metadata } from "next";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { EnvioConsolidado } from "@/features/ponto/components/envio-consolidado";
import { zapiConfigurada } from "@/features/ponto/zapi";
import { listarResponsaveisComPendencias } from "@/features/ponto/queries";
import { AREA_PONTO, ROTA_PENDENCIAS } from "@/features/ponto/types";

export const metadata: Metadata = {
  title: "Envio aos responsaveis",
  description:
    "Uma mensagem por responsavel, com as pendencias do grupo que ainda nao foram enviadas.",
};

export default async function EnvioAosResponsaveisPage() {
  await exigirAcesso(AREA_PONTO);

  const { competencia, janela, responsaveis } = await listarResponsaveisComPendencias();
  const envioDisponivel = zapiConfigurada();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROTA_PENDENCIAS}>
            <ArrowLeft aria-hidden />
            Voltar para as pendencias
          </Link>
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Envio aos responsaveis
          {competencia ? (
            <Badge variant="secondary">{nomeDaCompetencia(competencia.dataFim)}</Badge>
          ) : null}
        </h1>
        {janela ? (
          <p className="text-muted-foreground text-sm">
            Periodo apurado: {formatarPeriodo(janela.inicio, janela.fim)}
          </p>
        ) : null}
      </header>

      {!competencia || !janela ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Nao ha periodo apurado</AlertTitle>
          <AlertDescription>
            Sem competencia aberta e marcacoes importadas nao ha ocorrencia a enviar.
          </AlertDescription>
        </Alert>
      ) : !envioDisponivel ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Envio de mensagens indisponivel</AlertTitle>
          <AlertDescription>
            As credenciais da Z-API nao estao configuradas neste ambiente.
          </AlertDescription>
        </Alert>
      ) : responsaveis.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          Nenhum responsavel tem pendencia no grupo. Os grupos se montam em Postos de trabalho, na
          aba Responsavel.
        </p>
      ) : (
        <ul className="space-y-3">
          {responsaveis.map((responsavel) => (
            <li key={responsavel.id}>
              <EnvioConsolidado responsavel={responsavel} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
