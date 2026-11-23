import { Search, Wand2, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  hrefDosFuncionarios,
  ROTA_FUNCIONARIOS,
  type EmpresaResumo,
  type FiltrosDeFuncionarios,
} from "@/features/funcionarios/types";
import { ROTA_SUGESTOES } from "@/features/ponto/types";

/**
 * Busca e filtros da lista.
 *
 * Server Component e `<form method="get">`: tudo vira parametro na URL, o que
 * torna o resultado compartilhavel, sobrevive ao recarregar e continua
 * funcionando sem JavaScript — o recorte acontece no `select`, nao no navegador.
 *
 * O filtro de pendencias e um `<button type="submit" name="pendentes">` em vez
 * de um checkbox: e um atalho de um clique ("me mostre quem falta"), e checkbox
 * exigiria marcar e depois enviar.
 */
export function FiltrosFuncionarios({
  filtros,
  empresas,
  semEscala,
}: {
  filtros: FiltrosDeFuncionarios;
  empresas: readonly EmpresaResumo[];
  /** Quantos estao sem escala no cadastro inteiro — o tamanho da fila. */
  semEscala: number;
}) {
  const temFiltro = Boolean(filtros.busca || filtros.empresaId || filtros.pendentes);

  return (
    <form method="get" action={ROTA_FUNCIONARIOS} className="flex flex-wrap items-end gap-2">
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

      <Button type="submit" variant="secondary">
        <Search aria-hidden />
        Buscar
      </Button>

      {filtros.pendentes ? (
        <>
          {/* Ligado, o botao vira o caminho de volta — e um link porque desligar
              um filtro nao depende de nada que esteja digitado no formulario. */}
          <Button asChild variant="secondary">
            <Link href={hrefDosFuncionarios({ ...filtros, pendentes: false, pagina: 1 })}>
              Mostrar todos
            </Link>
          </Button>
          {/* O filtro em vigor viaja escondido para que "Buscar" nao o descarte. */}
          <input type="hidden" name="pendentes" value="1" />
        </>
      ) : (
        /*
          Envia o formulario com `pendentes=1` sem precisar de um campo a parte:
          o `value` do botao que submete e o que entra no FormData. Assim o
          atalho preserva a busca e a empresa ja digitadas.
        */
        <Button
          type="submit"
          name="pendentes"
          value="1"
          variant="outline"
          disabled={semEscala === 0}
        >
          {semEscala === 0 ? "Ninguem sem escala" : `Sem escala (${semEscala})`}
        </Button>
      )}

      {/*
        O atalho para a inferencia fica ao lado da fila que ele resolve, e so
        aparece quando ha fila: sem ninguem sem escala, nao ha o que sugerir.
      */}
      {semEscala > 0 ? (
        <Button asChild variant="ghost">
          <Link href={ROTA_SUGESTOES}>
            <Wand2 aria-hidden />
            Sugerir pelo ponto
          </Link>
        </Button>
      ) : null}

      {temFiltro ? (
        <Button asChild variant="ghost">
          <Link href={ROTA_FUNCIONARIOS}>
            <X aria-hidden />
            Limpar
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
