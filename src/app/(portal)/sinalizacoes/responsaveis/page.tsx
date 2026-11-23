import type { Metadata } from "next";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { podeAcessar } from "@/features/acessos/areas";
import { exigirAcesso } from "@/features/auth/queries";
import { nomeDaCompetencia } from "@/features/competencias/periodo";
import { zapiConfigurada } from "@/features/ponto/zapi";
import { EnvioAoResponsavel } from "@/features/sinalizacoes/components/envio-ao-responsavel";
import { listarResponsaveisDosSinalizados } from "@/features/sinalizacoes/queries";
import {
  AREA_SINALIZACOES,
  ROTA_SINALIZACOES,
  SEM_COMPETENCIA,
} from "@/features/sinalizacoes/types";

export const metadata: Metadata = {
  title: "Envio dos dias sinalizados",
  description:
    "Uma mensagem por responsavel de posto, com os dias sinalizados que ainda nao foram enviados.",
};

export default async function EnvioDosSinalizadosPage() {
  const usuario = await exigirAcesso(AREA_SINALIZACOES);

  const { competencia, responsaveis, semResponsavel } = await listarResponsaveisDosSinalizados();
  const envioDisponivel = zapiConfigurada();
  // O link do posto leva a aba Responsavel, que e da area de postos.
  const abrePostos = podeAcessar(usuario, "postos");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROTA_SINALIZACOES}>
            <ArrowLeft aria-hidden />
            Voltar para os dias sinalizados
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
      </header>

      {!competencia ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Nenhuma competencia aberta</AlertTitle>
          <AlertDescription>{SEM_COMPETENCIA}</AlertDescription>
        </Alert>
      ) : !envioDisponivel ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Envio de mensagens indisponivel</AlertTitle>
          <AlertDescription>
            As credenciais da Z-API nao estao configuradas neste ambiente.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-6">
          {responsaveis.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
              Nenhum responsavel de posto tem dia sinalizado pendente.
            </p>
          ) : (
            <ul className="space-y-3">
              {responsaveis.map((responsavel) => (
                <li key={responsavel.id}>
                  <EnvioAoResponsavel responsavel={responsavel} />
                </li>
              ))}
            </ul>
          )}

          {semResponsavel.length > 0 ? (
            <Alert>
              <TriangleAlert aria-hidden />
              <AlertTitle>Postos sem responsavel</AlertTitle>
              <AlertDescription>
                <p>Estes postos tem dia sinalizado pendente e ninguem a quem enviar:</p>
                <ul className="list-disc pl-5">
                  {semResponsavel.map((posto) => (
                    <li key={posto.id}>
                      {abrePostos ? (
                        <Link href={`/postos/${posto.id}`} className="underline underline-offset-4">
                          {posto.codigo} {posto.nome}
                        </Link>
                      ) : (
                        `${posto.codigo} ${posto.nome}`
                      )}{" "}
                      — {posto.pendentes === 1 ? "1 dia" : `${posto.pendentes} dias`}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
    </div>
  );
}
