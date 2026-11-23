import { Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  hrefDoPonto,
  ROTA_PONTO,
  rotuloDoStatus,
  type FiltrosDePonto,
  type ResumoDaConferencia,
  type StatusDaApuracao,
} from "@/features/ponto/types";

/**
 * Busca e filtros da conferencia.
 *
 * Server Component e `<form method="get">`: tudo vira parametro na URL, o que
 * torna o resultado compartilhavel, sobrevive ao recarregar e continua
 * funcionando sem JavaScript. Mesma escolha das listas de escalas e
 * funcionarios.
 */
export function FiltrosPonto({
  filtros,
  empresas,
  resumo,
}: {
  filtros: FiltrosDePonto;
  empresas: readonly { id: string; nome: string; funcionarios: number }[];
  resumo: ResumoDaConferencia;
}) {
  const temFiltro = Boolean(filtros.busca || filtros.empresaId || filtros.status);

  // O numero ao lado do status e o do periodo inteiro, e nao o da pagina: e ele
  // que diz o tamanho da fila antes de alguem clicar.
  const quantidade: Record<StatusDaApuracao, number> = {
    com_pendencia: resumo.comPendencia,
    atencao: resumo.comAtencao,
    sem_escala: resumo.semEscala,
    conforme: resumo.conformes,
  };

  return (
    <form method="get" action={ROTA_PONTO} className="flex flex-wrap items-end gap-2">
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
              {empresa.nome} ({empresa.funcionarios})
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="min-w-48 space-y-2">
        <Label htmlFor="status">Situacao da apuracao</Label>
        <NativeSelect id="status" name="status" defaultValue={filtros.status ?? ""}>
          <option value="">Todos ({resumo.funcionarios})</option>
          {(Object.keys(quantidade) as StatusDaApuracao[]).map((status) => (
            <option key={status} value={status}>
              {rotuloDoStatus(status)} ({quantidade[status]})
            </option>
          ))}
        </NativeSelect>
      </div>

      <Button type="submit" variant="secondary">
        <Search aria-hidden />
        Buscar
      </Button>

      {temFiltro ? (
        <Button asChild variant="ghost">
          <Link
            href={hrefDoPonto({ ...filtros, busca: "", empresaId: null, status: null, pagina: 1 })}
          >
            <X aria-hidden />
            Limpar
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
