import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NovaRegraForm } from "@/features/apontamentos/regras/components/nova-regra-form";
import { listarOpcoes } from "@/features/apontamentos/regras/queries";
import { AREA_APONTAMENTOS } from "@/features/apontamentos/types";
import { exigirAcesso } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Nova regra de apontamento",
  description: "Escopo, gatilho e efeito de uma regra.",
};

export default async function NovaRegraPage() {
  await exigirAcesso(AREA_APONTAMENTOS);

  const opcoes = await listarOpcoes();

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
          <CardTitle>Nova regra</CardTitle>
        </CardHeader>
        <CardContent>
          <NovaRegraForm opcoes={opcoes} />
        </CardContent>
      </Card>
    </div>
  );
}
