import { Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROTA_ESCALAS } from "@/features/escalas/types";

/**
 * Busca da lista de escalas.
 *
 * Server Component e `<form method="get">`: o termo vira `?busca=` na URL, o
 * que torna o resultado compartilhavel, sobrevive ao recarregar e continua
 * funcionando sem JavaScript — o filtro acontece no `select`, nao no navegador.
 *
 * Filtrar enquanto se digita exigiria um Client Component e um `replace()` a
 * cada tecla; com o Enter, a mesma tela responde com uma consulta so.
 */
export function BuscaEscalas({ busca }: { busca: string }) {
  return (
    <form method="get" action={ROTA_ESCALAS} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          name="busca"
          type="search"
          defaultValue={busca}
          placeholder="Nome, descricao ou ciclo (5x2)"
        />
      </div>

      <Button type="submit" variant="secondary">
        <Search aria-hidden />
        Buscar
      </Button>

      {busca ? (
        <Button asChild variant="ghost">
          <Link href={ROTA_ESCALAS}>
            <X aria-hidden />
            Limpar
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
