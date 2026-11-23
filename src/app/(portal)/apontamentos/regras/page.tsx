import type { Metadata } from "next";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ListaRegras } from "@/features/apontamentos/regras/components/lista-regras";
import { listarRegras } from "@/features/apontamentos/regras/queries";
import { AREA_APONTAMENTOS } from "@/features/apontamentos/types";
import { exigirAcesso } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Regras de apontamento",
  description: "As condicoes que alimentam o apontamento a partir da grade da competencia.",
};

export default async function RegrasPage() {
  await exigirAcesso(AREA_APONTAMENTOS);

  const regras = await listarRegras();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/apontamentos">
            <ArrowLeft aria-hidden />
            Voltar para apontamentos
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Regras de apontamento</h1>
        </div>

        <Button asChild>
          <Link href="/apontamentos/regras/nova">
            <Plus aria-hidden />
            Nova regra
          </Link>
        </Button>
      </header>

      <ListaRegras regras={regras} />
    </div>
  );
}
