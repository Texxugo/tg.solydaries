import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ESCALAS_POR_PAGINA, ROTA_ESCALAS, type PaginaDeEscalas } from "@/features/escalas/types";

/**
 * Navegacao entre paginas da lista.
 *
 * Links de verdade, e nao botoes com estado: a pagina mora na URL (`?pagina=`),
 * junto do termo de busca, entao voltar, recarregar e compartilhar continuam
 * levando a mesma tela — e a navegacao funciona sem JavaScript.
 *
 * O termo de busca viaja junto em cada link; sem isso, virar a pagina
 * silenciosamente descartaria o filtro.
 */
export function PaginacaoEscalas({
  busca,
  pagina,
  paginas,
  total,
}: Omit<PaginaDeEscalas, "escalas"> & { busca: string }) {
  if (total === 0) {
    return null;
  }

  const primeiro = (pagina - 1) * ESCALAS_POR_PAGINA + 1;
  const ultimo = Math.min(pagina * ESCALAS_POR_PAGINA, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {total === 1 ? (
          "1 escala"
        ) : (
          <>
            Mostrando {primeiro}–{ultimo} de {total} escalas
          </>
        )}
        {paginas > 1 ? ` · pagina ${pagina} de ${paginas}` : null}
      </p>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          <Botao href={hrefDaPagina(busca, pagina - 1)} disponivel={pagina > 1} rotulo="Anterior">
            <ChevronLeft aria-hidden />
            Anterior
          </Botao>

          <Botao
            href={hrefDaPagina(busca, pagina + 1)}
            disponivel={pagina < paginas}
            rotulo="Proxima"
          >
            Proxima
            <ChevronRight aria-hidden />
          </Botao>
        </div>
      ) : null}
    </div>
  );
}

/** `?pagina=1` fica de fora: a primeira pagina e a URL limpa. */
function hrefDaPagina(busca: string, pagina: number) {
  const parametros = new URLSearchParams();

  if (busca) {
    parametros.set("busca", busca);
  }

  if (pagina > 1) {
    parametros.set("pagina", String(pagina));
  }

  const consulta = parametros.toString();

  return consulta ? `${ROTA_ESCALAS}?${consulta}` : ROTA_ESCALAS;
}

/**
 * Nas pontas da lista o passo nao existe — vira botao desabilitado, e nao um
 * link para uma pagina que nao ha.
 */
function Botao({
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
