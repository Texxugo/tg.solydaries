import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { ImportarPontoForm } from "@/features/ponto/components/importar-ponto-form";
import { listarEmpresasParaAssociar } from "@/features/ponto/queries";
import { AREA_PONTO } from "@/features/ponto/types";

export const metadata: Metadata = {
  title: "Importar marcacoes",
  description: "Carga do relatorio de marcacoes exportado do relogio de ponto.",
};

export default async function ImportarPontoPage() {
  await exigirAcesso(AREA_PONTO);

  const empresas = await listarEmpresasParaAssociar();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/ponto">
            <ArrowLeft aria-hidden />
            Voltar para a analise de ponto
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Importar marcacoes</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportarPontoForm empresas={empresas} />
        </CardContent>
      </Card>
    </div>
  );
}
