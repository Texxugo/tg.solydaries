import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { NovaEscalaForm } from "@/features/escalas/components/nova-escala-form";

export const metadata: Metadata = {
  title: "Nova escala",
  description: "Cadastro da regra de jornada: horarios, ciclo, intervalo e marcacoes.",
};

export default async function NovaEscalaPage() {
  await exigirAcesso("escalas");

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
          <CardTitle>Nova escala</CardTitle>
        </CardHeader>
        <CardContent>
          <NovaEscalaForm />
        </CardContent>
      </Card>
    </div>
  );
}
