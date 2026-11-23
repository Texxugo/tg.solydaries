import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { exigirAcesso } from "@/features/auth/queries";
import { ListaCompetencias } from "@/features/competencias/components/lista-competencias";
import { NovaCompetenciaForm } from "@/features/competencias/components/nova-competencia-form";
import { diaSeguinte, formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor, listarCompetencias } from "@/features/competencias/queries";

export const metadata: Metadata = {
  title: "Competencias",
  description: "Periodos do portal: a competencia ativa e a consulta as anteriores.",
};

export default async function CompetenciasPage() {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area. A DAL e memoizada,
  // entao nao custa consulta extra.
  await exigirAcesso("competencias");

  const [competencias, vigor] = await Promise.all([listarCompetencias(), competenciaEmVigor()]);

  const aberta = competencias.find((competencia) => competencia.status === "aberta") ?? null;
  // A lista ja vem da mais recente para a mais antiga: a primeira e a que
  // terminou por ultimo, e a proxima competencia comeca no dia seguinte.
  const ultima = competencias[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-6 py-10">
      <header className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Competencias</h1>
      </header>

      <Card>
        <CardHeader>
          <CardDescription>Competencia ativa</CardDescription>
          <CardTitle className="text-xl">
            {aberta ? nomeDaCompetencia(aberta.dataFim) : "Nenhuma"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {!aberta
            ? "Sem competencia aberta o portal nao grava dados."
            : vigor?.temporaria
              ? `Periodo de ${formatarPeriodo(aberta.dataInicio, aberta.dataFim)}. Voce esta consultando ${nomeDaCompetencia(vigor.competencia.dataFim)}: seus lancamentos vao para ela.`
              : `Periodo de ${formatarPeriodo(aberta.dataInicio, aberta.dataFim)}.`}
        </CardContent>
      </Card>

      <Separator />

      <section aria-labelledby="nova-competencia" className="space-y-4">
        <div className="space-y-1">
          <h2 id="nova-competencia" className="text-lg font-medium">
            Abrir nova competencia
          </h2>
          <p className="text-muted-foreground text-sm">
            {aberta
              ? `Abrir a proxima encerra ${nomeDaCompetencia(aberta.dataFim)}.`
              : "Nenhuma competencia aberta ainda."}
          </p>
        </div>

        <NovaCompetenciaForm sugestaoInicio={ultima ? diaSeguinte(ultima.dataFim) : undefined} />
      </section>

      <Separator />

      <section aria-labelledby="historico" className="space-y-4">
        <div className="space-y-1">
          <h2 id="historico" className="text-lg font-medium">
            Historico
          </h2>
        </div>

        <ListaCompetencias
          competencias={competencias}
          idEmConsulta={vigor?.temporaria ? vigor.competencia.id : null}
        />
      </section>
    </div>
  );
}
