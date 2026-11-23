import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  APONTAMENTOS_POR_PAGINA,
  hrefDosApontamentos,
  type FiltrosDeApontamentos,
} from "@/features/apontamentos/types";

/**
 * Navegacao entre paginas. Links de verdade, com todos os filtros em cada um —
 * sem isso, virar a pagina descartaria o recorte sem avisar.
 */
export function PaginacaoApontamentos({
  filtros,
  pagina,
  paginas,
  total,
}: {
  filtros: FiltrosDeApontamentos;
  pagina: number;
  paginas: number;
  total: number;
}) {
  if (total === 0) {
    return null;
  }

  const primeiro = (pagina - 1) * APONTAMENTOS_POR_PAGINA + 1;
  const ultimo = Math.min(pagina * APONTAMENTOS_POR_PAGINA, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {total === 1 ? "1 funcionario" : `Mostrando ${primeiro}–${ultimo} de ${total} funcionarios`}
        {paginas > 1 ? ` · pagina ${pagina} de ${paginas}` : null}
      </p>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          <Passo
            href={hrefDosApontamentos({ ...filtros, pagina: pagina - 1 })}
            disponivel={pagina > 1}
          >
            <ChevronLeft aria-hidden />
            Anterior
          </Passo>
          <Passo
            href={hrefDosApontamentos({ ...filtros, pagina: pagina + 1 })}
            disponivel={pagina < paginas}
          >
            Proxima
            <ChevronRight aria-hidden />
          </Passo>
        </div>
      ) : null}
    </div>
  );
}

/** Na ponta da lista o passo nao existe: botao desabilitado, e nao link para lugar nenhum. */
function Passo({
  href,
  disponivel,
  children,
}: {
  href: string;
  disponivel: boolean;
  children: React.ReactNode;
}) {
  if (!disponivel) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
