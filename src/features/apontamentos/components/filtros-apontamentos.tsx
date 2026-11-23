import { Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ROTA_APONTAMENTOS,
  temFiltro,
  type FiltrosDeApontamentos,
} from "@/features/apontamentos/types";
import type { EmpresaResumo } from "@/features/funcionarios/types";

/**
 * Busca e filtros da lista.
 *
 * Server Component e `<form method="get">`, como em funcionarios: tudo vira
 * parametro na URL — o recorte e compartilhavel, sobrevive ao recarregar e
 * funciona sem JavaScript.
 */
export function FiltrosApontamentos({
  filtros,
  empresas,
  apontados,
  pendentes,
}: {
  filtros: FiltrosDeApontamentos;
  empresas: readonly EmpresaResumo[];
  apontados: number;
  pendentes: number;
}) {
  return (
    <form method="get" action={ROTA_APONTAMENTOS} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          name="busca"
          type="search"
          defaultValue={filtros.busca}
          placeholder="Nome, CPF, matricula ou cargo"
        />
      </div>

      <div className="min-w-48 space-y-2">
        <Label htmlFor="empresa">Empresa</Label>
        <NativeSelect id="empresa" name="empresa" defaultValue={filtros.empresaId ?? ""}>
          <option value="">Todas as empresas</option>
          {empresas.map((empresa) => (
            <option key={empresa.id} value={empresa.id}>
              {empresa.nome}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="min-w-44 space-y-2">
        <Label htmlFor="status">Apontamento</Label>
        {/* As contagens sao da competencia inteira, e nao do recorte: e o
            andamento do fechamento. */}
        <NativeSelect id="status" name="status" defaultValue={filtros.status ?? ""}>
          <option value="">Todos</option>
          <option value="pendentes">Sem apontamento ({pendentes})</option>
          <option value="apontados">Apontados ({apontados})</option>
        </NativeSelect>
      </div>

      <div className="min-w-44 space-y-2">
        <Label htmlFor="inativos">Cadastro</Label>
        <NativeSelect id="inativos" name="inativos" defaultValue={filtros.inativos ? "1" : ""}>
          <option value="">Ativos e ja apontados</option>
          <option value="1">Incluir inativos</option>
        </NativeSelect>
      </div>

      <Button type="submit" variant="secondary">
        <Search aria-hidden />
        Filtrar
      </Button>

      {temFiltro(filtros) ? (
        <Button asChild variant="ghost">
          <Link href={ROTA_APONTAMENTOS}>
            <X aria-hidden />
            Limpar
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
