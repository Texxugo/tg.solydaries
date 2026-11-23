import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatarDuracao } from "@/features/escalas/jornada";
import {
  EXTRAS_POR_PAGINA,
  hrefDosExtras,
  temFiltro,
  type FiltrosDeExtras,
  type PaginaDeExtras,
} from "@/features/extras/types";

/**
 * Navegacao entre paginas da lista, com o total do periodo ao lado.
 *
 * Links de verdade, e nao botoes com estado: a pagina mora na URL (`?pagina=`),
 * junto do termo de busca, entao voltar, recarregar e compartilhar continuam
 * levando a mesma tela — e a navegacao funciona sem JavaScript. O termo viaja
 * junto em cada link; sem isso, virar a pagina descartaria o filtro sem avisar.
 *
 * O total de horas e o do filtro inteiro, e nao o desta pagina: quem confere
 * quer saber quanto o periodo tem, e um numero que mudasse ao virar a pagina
 * responderia outra coisa.
 */
export function PaginacaoExtras({
  filtros,
  pagina,
  paginas,
  total,
  minutos,
}: Omit<PaginaDeExtras, "extras"> & { filtros: FiltrosDeExtras }) {
  if (total === 0) {
    return null;
  }

  const primeiro = (pagina - 1) * EXTRAS_POR_PAGINA + 1;
  const ultimo = Math.min(pagina * EXTRAS_POR_PAGINA, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {total === 1 ? (
          "1 extra"
        ) : (
          <>
            Mostrando {primeiro}–{ultimo} de {total} extras
          </>
        )}
        {/* Com filtro, o total ja nao e o do periodo — dizer que era faria o
            recorte parecer a competencia inteira. */}
        {` · ${formatarDuracao(minutos)} ${temFiltro(filtros) ? "neste recorte" : "no periodo"}`}
        {paginas > 1 ? ` · pagina ${pagina} de ${paginas}` : null}
      </p>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          <Botao
            href={hrefDosExtras({ ...filtros, pagina: pagina - 1 })}
            disponivel={pagina > 1}
            rotulo="Anterior"
          >
            <ChevronLeft aria-hidden />
            Anterior
          </Botao>

          <Botao
            href={hrefDosExtras({ ...filtros, pagina: pagina + 1 })}
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
