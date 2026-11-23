import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  hrefDasPendencias,
  OCORRENCIAS_POR_PAGINA,
  type FiltrosDeOcorrencias,
} from "@/features/ponto/types";

/**
 * Navegacao entre paginas do painel de pendencias.
 *
 * Links de verdade, e nao botoes com estado, pelo mesmo motivo da conferencia: a
 * pagina mora na URL junto dos filtros, entao voltar, recarregar e compartilhar
 * continuam levando a mesma tela — e a navegacao funciona sem JavaScript.
 */
export function PaginacaoPendencias({
  filtros,
  pagina,
  paginas,
  total,
}: {
  filtros: FiltrosDeOcorrencias;
  pagina: number;
  paginas: number;
  total: number;
}) {
  if (total === 0) {
    return null;
  }

  const primeiro = (pagina - 1) * OCORRENCIAS_POR_PAGINA + 1;
  const ultimo = Math.min(pagina * OCORRENCIAS_POR_PAGINA, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {total === 1 ? (
          "1 ocorrencia"
        ) : (
          <>
            Mostrando {primeiro}–{ultimo} de {total} ocorrencias
          </>
        )}
        {paginas > 1 ? ` · pagina ${pagina} de ${paginas}` : null}
      </p>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          <Passo
            href={hrefDasPendencias({ ...filtros, pagina: pagina - 1 })}
            disponivel={pagina > 1}
            rotulo="Anterior"
          >
            <ChevronLeft aria-hidden />
            Anterior
          </Passo>

          <Passo
            href={hrefDasPendencias({ ...filtros, pagina: pagina + 1 })}
            disponivel={pagina < paginas}
            rotulo="Proxima"
          >
            Proxima
            <ChevronRight aria-hidden />
          </Passo>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Nas pontas da lista o passo nao existe — vira botao desabilitado, e nao um
 * link para uma pagina que nao ha.
 */
function Passo({
  href,
  disponivel,
  rotulo,
  children,
}: {
  href: string;
  disponivel: boolean;
  rotulo: string;
  children: React.ReactNode;
}) {
  if (!disponivel) {
    return (
      <Button variant="outline" size="sm" disabled aria-label={rotulo}>
        {children}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href} aria-label={rotulo}>
        {children}
      </Link>
    </Button>
  );
}
