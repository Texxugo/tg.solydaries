import { Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  IDS_FILTRO_DOCUMENTO,
  IDS_TIPO_DE_MOVIMENTACAO,
  ROTA_MOVIMENTACOES,
  ROTULOS_FILTRO_DOCUMENTO,
  ROTULOS_TIPO_DE_MOVIMENTACAO,
  temFiltro,
  type FiltrosDeMovimentacoes,
} from "@/features/movimentacoes/types";

/**
 * Busca e filtros da lista. `<form method="get">`, como em extras: o recorte
 * mora na URL, sobrevive ao recarregar, se compartilha e funciona sem
 * JavaScript. A pagina nao viaja no formulario — filtrar de novo volta para a
 * primeira.
 */
export function FiltrosMovimentacoes({
  filtros,
  periodo,
}: {
  filtros: FiltrosDeMovimentacoes;
  periodo: { inicio: string; fim: string };
}) {
  return (
    <form method="get" action={ROTA_MOVIMENTACOES} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          name="busca"
          type="search"
          defaultValue={filtros.busca}
          placeholder="Nome, matricula, justificativa ou data"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="filtro-tipo">Tipo</Label>
          <NativeSelect id="filtro-tipo" name="tipo" defaultValue={filtros.tipo ?? ""}>
            <option value="">Todos</option>
            {IDS_TIPO_DE_MOVIMENTACAO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULOS_TIPO_DE_MOVIMENTACAO[tipo]}
              </option>
            ))}
          </NativeSelect>
        </div>

        {/* `min`/`max` sao a competencia: fora dela a lista nunca mostra nada. */}
        <div className="space-y-2">
          <Label htmlFor="filtro-de">De</Label>
          <Input
            id="filtro-de"
            name="de"
            type="date"
            min={periodo.inicio}
            max={periodo.fim}
            defaultValue={filtros.de ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="filtro-ate">Ate</Label>
          <Input
            id="filtro-ate"
            name="ate"
            type="date"
            min={periodo.inicio}
            max={periodo.fim}
            defaultValue={filtros.ate ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="filtro-documento">Documento</Label>
          <NativeSelect
            id="filtro-documento"
            name="documento"
            defaultValue={filtros.documento ?? ""}
          >
            <option value="">Todos</option>
            {IDS_FILTRO_DOCUMENTO.map((documento) => (
              <option key={documento} value={documento}>
                {ROTULOS_FILTRO_DOCUMENTO[documento]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary">
          <Search aria-hidden />
          Filtrar
        </Button>

        {temFiltro(filtros) ? (
          <Button asChild variant="ghost">
            <Link href={ROTA_MOVIMENTACOES}>
              <X aria-hidden />
              Limpar filtros
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
