import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { BuscaEscalas } from "@/features/escalas/components/busca-escalas";
import { ListaEscalas } from "@/features/escalas/components/lista-escalas";
import { PaginacaoEscalas } from "@/features/escalas/components/paginacao-escalas";
import { listarEscalas } from "@/features/escalas/queries";
import { buscaEscalasSchema, paginaEscalasSchema } from "@/features/escalas/schema";

export const metadata: Metadata = {
  title: "Escalas",
  description: "Regras de jornada: horarios, ciclo, intrajornada e marcacoes esperadas.",
};

export default async function EscalasPage({ searchParams }: PageProps<"/escalas">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area. A DAL e memoizada,
  // entao nao custa consulta extra.
  await exigirAcesso("escalas");

  // `?busca=` e `?pagina=` sao entrada do usuario como qualquer outra: passam
  // pelo Zod antes de virar filtro e de voltar para a tela.
  const parametros = await searchParams;
  const busca = buscaEscalasSchema.parse(parametros.busca);
  const { escalas, total, pagina, paginas } = await listarEscalas(
    busca,
    paginaEscalasSchema.parse(parametros.pagina),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Escalas</h1>
        </div>

        <Button asChild>
          <Link href="/escalas/nova">
            <CalendarPlus aria-hidden />
            Nova escala
          </Link>
        </Button>
      </header>

      <div className="space-y-4">
        <BuscaEscalas busca={busca} />

        <ListaEscalas escalas={escalas} busca={busca} />

        <PaginacaoEscalas busca={busca} pagina={pagina} paginas={paginas} total={total} />
      </div>
    </div>
  );
}
