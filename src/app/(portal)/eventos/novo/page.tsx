import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { NovoEventoForm } from "@/features/eventos/components/novo-evento-form";

export const metadata: Metadata = {
  title: "Novo evento",
  description: "Cadastro de uma sigla da grade: o que ela quer dizer e como o dia e contado.",
};

export default async function NovoEventoPage() {
  await exigirAcesso("eventos");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/eventos">
            <ArrowLeft aria-hidden />
            Voltar para eventos
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo evento</CardTitle>
        </CardHeader>
        <CardContent>
          <NovoEventoForm />
        </CardContent>
      </Card>
    </div>
  );
}
