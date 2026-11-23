import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { nomeDaCompetencia } from "@/features/competencias/periodo";
import { EscalasSugeridas } from "@/features/ponto/components/escalas-sugeridas";
import { sugerirEscalasDoPonto } from "@/features/ponto/queries";

export const metadata: Metadata = {
  title: "Escalas sugeridas pelo ponto",
  description: "A escala de quem esta sem uma, lida das batidas ja importadas.",
};

export default async function EscalasSugeridasPage() {
  // As duas areas: a tela mostra batidas de ponto e grava cadastro de pessoal.
  await exigirAcesso("funcionarios");
  await exigirAcesso("ponto");

  const leitura = await sugerirEscalasDoPonto();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/funcionarios?pendentes=1">
            <ArrowLeft aria-hidden />
            Voltar para funcionarios
          </Link>
        </Button>
      </div>

      <header className="max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Escalas sugeridas pelo ponto</h1>
        {leitura.competencia ? (
          <p className="text-muted-foreground text-sm">
            Competencia {nomeDaCompetencia(leitura.competencia.dataFim)}
          </p>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Conferir e aplicar</CardTitle>
          <CardDescription>Nada e gravado sem confirmacao.</CardDescription>
        </CardHeader>
        <CardContent>
          <EscalasSugeridas leitura={leitura} />
        </CardContent>
      </Card>
    </div>
  );
}
