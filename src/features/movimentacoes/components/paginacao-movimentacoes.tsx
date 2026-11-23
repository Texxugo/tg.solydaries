import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  IDS_TIPO_DE_MOVIMENTACAO,
  MOVIMENTACOES_POR_PAGINA,
  PLURAIS_TIPO_DE_MOVIMENTACAO,
  ROTULOS_TIPO_DE_MOVIMENTACAO,
  hrefDasMovimentacoes,
  type FiltrosDeMovimentacoes,
  type PaginaDeMovimentacoes,
} from "@/features/movimentacoes/types";

/**
 * Navegacao entre paginas, com a contagem por tipo do recorte inteiro — e nao
 * da pagina: quem confere quer saber quantas faltas o periodo teve. Links de
 * verdade, com todos os filtros em cada um.
 */
export function PaginacaoMovimentacoes({
  filtros,
  pagina,
  paginas,
  total,
  porTipo,
}: Omit<PaginaDeMovimentacoes, "movimentacoes"> & { filtros: FiltrosDeMovimentacoes }) {
  if (total === 0) {
    return null;
  }

  const primeiro = (pagina - 1) * MOVIMENTACOES_POR_PAGINA + 1;
  const ultimo = Math.min(pagina * MOVIMENTACOES_POR_PAGINA, total);

  const contagens = IDS_TIPO_DE_MOVIMENTACAO.filter((tipo) => porTipo[tipo] > 0)
    .map((tipo) =>
      porTipo[tipo] === 1
        ? `1 ${ROTULOS_TIPO_DE_MOVIMENTACAO[tipo].toLowerCase()}`
        : `${porTipo[tipo]} ${PLURAIS_TIPO_DE_MOVIMENTACAO[tipo]}`,
    )
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {total === 1 ? "1 movimentacao" : `Mostrando ${primeiro}–${ultimo} de ${total}`}
        {` (${contagens})`}
        {paginas > 1 ? ` · pagina ${pagina} de ${paginas}` : null}
      </p>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          <Passo
            href={hrefDasMovimentacoes({ ...filtros, pagina: pagina - 1 })}
            disponivel={pagina > 1}
            rotulo="Anterior"
          >
            <ChevronLeft aria-hidden />
            Anterior
          </Passo>
          <Passo
            href={hrefDasMovimentacoes({ ...filtros, pagina: pagina + 1 })}
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

/** Nas pontas o passo nao existe — botao desabilitado, e nao link para pagina nenhuma. */
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
