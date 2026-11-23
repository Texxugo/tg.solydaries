import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { DiasDoCicloForm } from "@/features/escalas/components/dias-do-ciclo-form";
import { EditarEscalaForm } from "@/features/escalas/components/editar-escala-form";
import {
  descricaoDoCiclo,
  formatarDuracao,
  jornadaLiquidaEmMinutos,
  rotuloDoCiclo,
} from "@/features/escalas/jornada";
import { obterEscala } from "@/features/escalas/queries";

export const metadata: Metadata = {
  title: "Editar escala",
  description: "Horarios, ciclo de trabalho, intervalo, extras previstas e marcacoes esperadas.",
};

export default async function EditarEscalaPage({ params }: PageProps<"/escalas/[id]">) {
  await exigirAcesso("escalas");

  const { id } = await params;
  const escala = await obterEscala(id);

  if (!escala) {
    notFound();
  }

  const liquida = jornadaLiquidaEmMinutos(escala.entrada, escala.saida, escala.intrajornadaMinutos);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/escalas">
            <ArrowLeft aria-hidden />
            Voltar para escalas
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {escala.nome}
            <Badge variant="secondary">Ciclo {rotuloDoCiclo(escala)}</Badge>
            {escala.viradaTurno ? <Badge variant="outline">Vira o turno</Badge> : null}
            {escala.ativa ? null : <Badge variant="destructive">Inativa</Badge>}
          </CardTitle>
          <CardDescription>
            {escala.entrada} as {escala.saida}, {descricaoDoCiclo(escala)} —{" "}
            {formatarDuracao(liquida)} de jornada e {escala.marcacoesEsperadas} marcacoes por dia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditarEscalaForm escala={escala} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dias do ciclo</CardTitle>
        </CardHeader>
        <CardContent>
          <DiasDoCicloForm escala={escala} />
        </CardContent>
      </Card>
    </div>
  );
}
