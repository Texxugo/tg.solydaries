import { Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  IDS_ORIGEM_DO_EXTRA,
  IDS_TIPO_DE_COLABORADOR,
  ROTA_EXTRAS,
  ROTULOS_ORIGEM_DO_EXTRA,
  ROTULOS_TIPO_DE_COLABORADOR,
  temFiltro,
  type FiltrosDeExtras,
} from "@/features/extras/types";
import type { PostoParaEscolha } from "@/features/postos/types";

/**
 * Busca e filtros da lista de extras.
 *
 * Server Component e `<form method="get">`, como a busca de antes e os filtros
 * de funcionarios: tudo vira parametro na URL, o que torna o recorte
 * compartilhavel, sobrevive ao recarregar e funciona sem JavaScript — o filtro
 * acontece no `select`, e nao no navegador.
 *
 * A pagina **nao** viaja no formulario: filtrar de novo volta para a primeira,
 * porque a pagina 3 do recorte anterior nao diz nada sobre o novo.
 *
 * O texto livre continua casando com tudo o que a linha mostra; os filtros sao
 * o recorte que texto nao expressa bem — um intervalo de datas, "so os
 * freelancers", "so o que veio da grade".
 */
export function FiltrosExtras({
  filtros,
  postos,
  periodo,
}: {
  filtros: FiltrosDeExtras;
  /** Os postos que tem extra na competencia — os que o filtro pode encontrar. */
  postos: readonly PostoParaEscolha[];
  periodo: { inicio: string; fim: string };
}) {
  return (
    <form method="get" action={ROTA_EXTRAS} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          name="busca"
          type="search"
          defaultValue={filtros.busca}
          placeholder="Colaborador, matricula, posto, local, observacao ou data"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2">
          <Label htmlFor="filtro-posto">Posto</Label>
          <NativeSelect id="filtro-posto" name="posto" defaultValue={filtros.postoId ?? ""}>
            <option value="">Todos os postos</option>
            {postos.map((posto) => (
              <option key={posto.id} value={posto.id}>
                {posto.codigo} — {posto.nome}
              </option>
            ))}
          </NativeSelect>
        </div>

        {/*
          `min` e `max` sao a competencia: a lista nunca mostra extra fora dela,
          entao escolher 30/10 so traria uma tela vazia. Nao e validacao — data
          postada na mao fora do periodo apenas nao encontra nada.
        */}
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
          <Label htmlFor="filtro-tipo">Colaborador</Label>
          <NativeSelect id="filtro-tipo" name="tipo" defaultValue={filtros.tipo ?? ""}>
            <option value="">Todos</option>
            {IDS_TIPO_DE_COLABORADOR.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULOS_TIPO_DE_COLABORADOR[tipo]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="filtro-origem">Origem</Label>
          <NativeSelect id="filtro-origem" name="origem" defaultValue={filtros.origem ?? ""}>
            <option value="">Todas</option>
            {IDS_ORIGEM_DO_EXTRA.map((origem) => (
              <option key={origem} value={origem}>
                {ROTULOS_ORIGEM_DO_EXTRA[origem]}
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

        {/* Um link, e nao `reset()`: limpar e voltar para a URL sem filtro, e o
            formulario nao tem como apagar o que ja esta na URL. */}
        {temFiltro(filtros) ? (
          <Button asChild variant="ghost">
            <Link href={ROTA_EXTRAS}>
              <X aria-hidden />
              Limpar filtros
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
