import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ListaUsuarios } from "@/features/acessos/components/lista-usuarios";
import { listarUsuarios } from "@/features/acessos/queries";
import { exigirAcesso } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Acessos",
  description: "Usuarios do portal e as areas liberadas para cada um.",
};

export default async function AcessosPage() {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao. A DAL e memoizada, entao nao custa consulta extra.
  await exigirAcesso("acessos");

  const usuarios = await listarUsuarios();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Acessos</h1>
        </div>

        <Button asChild>
          <Link href="/acessos/novo">
            <UserPlus aria-hidden />
            Novo usuario
          </Link>
        </Button>
      </header>

      <ListaUsuarios usuarios={usuarios} />
    </div>
  );
}
