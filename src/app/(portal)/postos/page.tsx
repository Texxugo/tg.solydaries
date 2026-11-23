import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { BuscaPostos } from "@/features/postos/components/busca-postos";
import { ListaPostos } from "@/features/postos/components/lista-postos";
import { listarPostos } from "@/features/postos/queries";
import { buscaPostosSchema } from "@/features/postos/schema";

export const metadata: Metadata = {
  title: "Postos de trabalho",
  description: "Os postos e as funcoes que a escala de cada competencia precisa cobrir.",
};

export default async function PostosPage({ searchParams }: PageProps<"/postos">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area.
  await exigirAcesso("postos");

  const parametros = await searchParams;
  const busca = buscaPostosSchema.parse(parametros.busca);
  const postos = await listarPostos(busca);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Postos de trabalho</h1>
        </div>

        <Button asChild>
          <Link href="/postos/novo">
            <Plus aria-hidden />
            Novo posto
          </Link>
        </Button>
      </header>

      <div className="space-y-4">
        <BuscaPostos busca={busca} />

        <ListaPostos postos={postos} busca={busca} />
      </div>
    </div>
  );
}
