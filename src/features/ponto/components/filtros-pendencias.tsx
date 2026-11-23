import { Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { DIVERGENCIAS } from "@/features/ponto/apuracao";
import { STATUS_DE_TRATATIVA } from "@/features/ponto/tratativas";
import {
  hrefDasPendencias,
  ROTA_PENDENCIAS,
  type FiltrosDeOcorrencias,
  type ResumoDasOcorrencias,
} from "@/features/ponto/types";

/**
 * Busca e filtros do painel de pendencias.
 *
 * Server Component e `<form method="get">`, como os das outras listas: tudo
 * vira parametro na URL, o resultado e compartilhavel, sobrevive ao recarregar
 * e continua funcionando sem JavaScript.
 *
 * Sao quatro filtros porque sao quatro perguntas diferentes que quem trata o
 * ponto faz — de quem, de que empresa, que tipo de problema, e em que pe esta.
 */
export function FiltrosPendencias({
  filtros,
  empresas,
  resumo,
}: {
  filtros: FiltrosDeOcorrencias;
  empresas: readonly { id: string; nome: string; funcionarios: number }[];
  resumo: ResumoDasOcorrencias;
}) {
  const temFiltro = Boolean(
    filtros.busca || filtros.empresaId || filtros.tratativa || filtros.gravidade || filtros.tipo,
  );

  // Quantas ocorrencias existem de cada tipo no periodo inteiro, e nao na
  // pagina: e o numero que diz o tamanho da fila antes de alguem clicar.
  const porTipo = new Map(resumo.porTipo.map((linha) => [linha.tipo, linha.ocorrencias]));

  return (
    <form method="get" action={ROTA_PENDENCIAS} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          name="busca"
          type="search"
          defaultValue={filtros.busca}
          placeholder="Nome, matricula, cargo ou empresa"
        />
      </div>

      <div className="min-w-44 space-y-2">
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

      <div className="min-w-44 space-y-2">
        <Label htmlFor="tipo">Ocorrencia</Label>
        <NativeSelect id="tipo" name="tipo" defaultValue={filtros.tipo ?? ""}>
          <option value="">Todas ({resumo.total})</option>
          {DIVERGENCIAS.filter((divergencia) => porTipo.has(divergencia.tipo)).map(
            (divergencia) => (
              <option key={divergencia.tipo} value={divergencia.tipo}>
                {divergencia.rotulo} ({porTipo.get(divergencia.tipo)})
              </option>
            ),
          )}
        </NativeSelect>
      </div>

      <div className="min-w-36 space-y-2">
        <Label htmlFor="gravidade">Gravidade</Label>
        <NativeSelect id="gravidade" name="gravidade" defaultValue={filtros.gravidade ?? ""}>
          <option value="">As duas</option>
          <option value="impeditiva">Impeditiva ({resumo.impeditivas})</option>
          <option value="atencao">Atencao ({resumo.total - resumo.impeditivas})</option>
        </NativeSelect>
      </div>

      <div className="min-w-40 space-y-2">
        <Label htmlFor="tratativa">Tratativa</Label>
        <NativeSelect id="tratativa" name="tratativa" defaultValue={filtros.tratativa ?? ""}>
          <option value="">Todos os status</option>
          {STATUS_DE_TRATATIVA.map((opcao) => (
            <option key={opcao.status} value={opcao.status}>
              {opcao.rotulo}
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
            href={hrefDasPendencias({
              ...filtros,
              busca: "",
              empresaId: null,
              tratativa: null,
              gravidade: null,
              tipo: null,
              pagina: 1,
            })}
          >
            <X aria-hidden />
            Limpar
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
