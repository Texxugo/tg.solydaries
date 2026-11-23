import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { ImportarFuncionariosForm } from "@/features/funcionarios/components/importar-funcionarios-form";
import { AREA_FUNCIONARIOS } from "@/features/funcionarios/types";

export const metadata: Metadata = {
  title: "Importar funcionarios",
  description: "Carga do relatorio Relacao de Empregados exportado da folha.",
};

export default async function ImportarFuncionariosPage() {
  await exigirAcesso(AREA_FUNCIONARIOS);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/funcionarios">
            <ArrowLeft aria-hidden />
            Voltar para funcionarios
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Importar funcionarios</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportarFuncionariosForm />
        </CardContent>
      </Card>
    </div>
  );
}
