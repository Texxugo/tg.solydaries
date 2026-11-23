import type { Metadata } from "next";
import { CalendarOff, MapPin, Settings2, Tags } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { listarEventosAtivos } from "@/features/eventos/queries";
import { listarPostosDaGrade } from "@/features/postos/queries";
import { LegendaEventos } from "@/features/preenchimento/components/legenda-eventos";
import { ListaPostosDaGrade } from "@/features/preenchimento/components/lista-postos-da-grade";
import { resumoDaCompetencia } from "@/features/preenchimento/queries";
import { AREA_PREENCHIMENTO, SEM_COMPETENCIA } from "@/features/preenchimento/types";

export const metadata: Metadata = {
  title: "Preenchimento de escala",
  description: "A escala da competencia, um posto por grade, dia a dia.",
};

export default async function PreenchimentoPage() {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area.
  await exigirAcesso(AREA_PREENCHIMENTO);

  const [vigor, postos, eventos, resumo] = await Promise.all([
    competenciaEmVigor(),
    listarPostosDaGrade(),
    listarEventosAtivos(),
    resumoDaCompetencia(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      {/*
        Competencia e periodo ficam fora das abas: sao o recorte de tudo o que
        esta abaixo, e quem trocar de aba continua vendo de que mes e a escala.
      */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            Preenchimento de escala
            {vigor ? (
              <Badge variant="secondary">{nomeDaCompetencia(vigor.competencia.dataFim)}</Badge>
            ) : null}
          </h1>
        </div>

        <Button asChild variant="secondary">
          <Link href="/eventos">
            <Settings2 aria-hidden />
            Eventos
          </Link>
        </Button>
      </header>

      {vigor ? (
        <p className="text-muted-foreground text-sm">
          Periodo de {formatarPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim)}
          {resumo
            ? ` — ${resumo.pessoas} ${resumo.pessoas === 1 ? "pessoa escalada" : "pessoas escaladas"} e ${resumo.celulas} ${resumo.celulas === 1 ? "dia preenchido" : "dias preenchidos"}.`
            : "."}
          {vigor.temporaria ? " Competencia encerrada, aberta em consulta." : ""}
        </p>
      ) : (
        <Alert>
          <CalendarOff aria-hidden />
          <AlertTitle>Nenhuma competencia aberta</AlertTitle>
          <AlertDescription>
            {SEM_COMPETENCIA} A grade e datada: ela mostra os dias da competencia em vigor, e sem
            uma aberta nao ha periodo a desenhar.{" "}
            <Link href="/competencias" className="underline underline-offset-4">
              Abrir competencia
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/*
        Abas, e nao cartoes empilhados: mesmo arranjo da tela de funcionarios.
        Quem vem preencher a escala nao precisa rolar a legenda inteira para
        chegar na lista de postos.
      */}
      <Tabs defaultValue="postos">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="postos">
            <MapPin aria-hidden />
            Postos
          </TabsTrigger>
          <TabsTrigger value="siglas">
            <Tags aria-hidden />
            Siglas
          </TabsTrigger>
        </TabsList>

        {/* `forceMount` + `hidden` como no resto do portal: sem ele o Radix
            desmonta a aba escondida; com ele, esta versao do Radix nao marca
            `hidden` sozinha e os dois paineis apareceriam empilhados. */}
        <TabsContent value="postos" forceMount className="data-[state=inactive]:hidden">
          <ListaPostosDaGrade postos={postos} />
        </TabsContent>

        <TabsContent value="siglas" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Siglas aceitas</CardTitle>
            </CardHeader>
            <CardContent>
              <LegendaEventos eventos={eventos} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
