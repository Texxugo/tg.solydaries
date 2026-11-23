import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditarRegraForm } from "@/features/apontamentos/regras/components/editar-regra-form";
import { rotuloDoEfeito } from "@/features/apontamentos/regras/descricao";
import { listarOpcoes, obterRegra } from "@/features/apontamentos/regras/queries";
import { AREA_APONTAMENTOS } from "@/features/apontamentos/types";
import { exigirAcesso } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Regra de apontamento",
  description: "Escopo, gatilho e efeito de uma regra.",
};

export default async function RegraPage({ params }: PageProps<"/apontamentos/regras/[id]">) {
  await exigirAcesso(AREA_APONTAMENTOS);

  const { id } = await params;

  const [regra, opcoes] = await Promise.all([obterRegra(id), listarOpcoes()]);

  if (!regra) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/apontamentos/regras">
            <ArrowLeft aria-hidden />
            Voltar para as regras
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {regra.nome}
            {regra.ativa ? null : <Badge variant="outline">Inativa</Badge>}
          </CardTitle>
          <CardDescription>{rotuloDoEfeito(regra)}</CardDescription>
        </CardHeader>
        <CardContent>
          <EditarRegraForm regra={regra} opcoes={opcoes} />
        </CardContent>
      </Card>
    </div>
  );
}
