import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { BuscaEventos } from "@/features/eventos/components/busca-eventos";
import { ListaEventos } from "@/features/eventos/components/lista-eventos";
import { listarEventos } from "@/features/eventos/queries";
import { buscaEventosSchema } from "@/features/eventos/schema";

export const metadata: Metadata = {
  title: "Eventos",
  description: "As siglas que a grade de preenchimento aceita em cada dia.",
};

export default async function EventosPage({ searchParams }: PageProps<"/eventos">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area. A DAL e memoizada,
  // entao nao custa consulta extra.
  await exigirAcesso("eventos");

  const parametros = await searchParams;
  const busca = buscaEventosSchema.parse(parametros.busca);
  const eventos = await listarEventos(busca);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        </div>

        <Button asChild>
          <Link href="/eventos/novo">
            <Plus aria-hidden />
            Novo evento
          </Link>
        </Button>
      </header>

      <div className="space-y-4">
        <BuscaEventos busca={busca} />

        <ListaEventos eventos={eventos} busca={busca} />
      </div>
    </div>
  );
}
