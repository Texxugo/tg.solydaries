import { Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROTA_POSTOS } from "@/features/postos/types";

/**
 * Busca da lista de postos. Mesmo arranjo de `BuscaEscalas`: Server Component e
 * `<form method="get">`, com o termo em `?busca=` — resultado compartilhavel,
 * que sobrevive ao recarregar e funciona sem JavaScript.
 */
export function BuscaPostos({ busca }: { busca: string }) {
  return (
    <form method="get" action={ROTA_POSTOS} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          name="busca"
          type="search"
          defaultValue={busca}
          placeholder="Codigo, nome do posto ou da funcao"
        />
      </div>

      <Button type="submit" variant="secondary">
        <Search aria-hidden />
        Buscar
      </Button>

      {busca ? (
        <Button asChild variant="ghost">
          <Link href={ROTA_POSTOS}>
            <X aria-hidden />
            Limpar
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
