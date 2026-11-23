import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { listarEmpresas } from "@/features/funcionarios/queries";
import { NovoPostoForm } from "@/features/postos/components/novo-posto-form";

export const metadata: Metadata = {
  title: "Novo posto",
  description: "Cadastro de um posto de trabalho: codigo, nome e empresa.",
};

export default async function NovoPostoPage() {
  await exigirAcesso("postos");

  const empresas = await listarEmpresas();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/postos">
            <ArrowLeft aria-hidden />
            Voltar para postos
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo posto</CardTitle>
        </CardHeader>
        <CardContent>
          <NovoPostoForm empresas={empresas} />
        </CardContent>
      </Card>
    </div>
  );
}
