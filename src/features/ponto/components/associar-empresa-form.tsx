"use client";

import { Link2, LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { associarEmpresa } from "@/features/ponto/actions";
import {
  estadoInicialAssociarEmpresa,
  type CodigoDesconhecido,
  type EmpresaParaAssociar,
} from "@/features/ponto/types";

/**
 * Associa os codigos do relogio que o arquivo trouxe e o portal ainda nao
 * conhece.
 *
 * Aparece dentro da previa porque e ali que a falta aparece — mas grava
 * **cadastro**, e nao carga: uma vez associado, o codigo vale para todas as
 * importacoes seguintes, e por isso cada linha tem a sua action e o seu botao.
 * Feita a associacao, o caminho e conferir o arquivo de novo: a previa e
 * recalculada do zero, e o bloco daquele codigo passa a entrar.
 *
 * Um `<form>` por codigo, e nao um formulario so com varias linhas: cada
 * associacao e independente, e um envio unico faria a recusa de uma (codigo ja
 * usado por outra empresa) derrubar as outras.
 */
export function AssociarEmpresas({
  codigos,
  empresas,
}: {
  codigos: readonly CodigoDesconhecido[];
  empresas: readonly EmpresaParaAssociar[];
}) {
  if (codigos.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {codigos.map((codigo) => (
        <LinhaDeAssociacao key={codigo.codigo} codigo={codigo} empresas={empresas} />
      ))}
    </div>
  );
}

function LinhaDeAssociacao({
  codigo,
  empresas,
}: {
  codigo: CodigoDesconhecido;
  empresas: readonly EmpresaParaAssociar[];
}) {
  const [estado, formAction, pendente] = useActionState(
    associarEmpresa,
    estadoInicialAssociarEmpresa,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
      <input type="hidden" name="codigo" value={codigo.codigo} />

      <div className="min-w-56 flex-1 space-y-1">
        <p className="text-sm font-medium">
          Codigo {codigo.codigo} · {codigo.linhas} {codigo.linhas === 1 ? "linha" : "linhas"}
        </p>
        <p className="text-muted-foreground text-xs">
          {codigo.exemplos.length > 0
            ? `Aparece com ${codigo.exemplos.join(", ")}.`
            : "Sem exemplos no arquivo."}
        </p>
      </div>

      <div className="min-w-56 space-y-1">
        <label className="text-sm font-medium" htmlFor={`empresa-${codigo.codigo}`}>
          Empresa
        </label>
        <NativeSelect id={`empresa-${codigo.codigo}`} name="empresaId" defaultValue="" required>
          <option value="" disabled>
            Escolha a empresa
          </option>
          {empresas.map((empresa) => (
            <option key={empresa.id} value={empresa.id}>
              {empresa.nome}
              {/* O codigo atual aparece ao lado do nome para que ninguem
                  reassocie por engano uma empresa que ja tem o dela. */}
              {empresa.codigo ? ` (codigo ${empresa.codigo})` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>

      <Button type="submit" variant="secondary" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Link2 aria-hidden />}
        Associar
      </Button>
    </form>
  );
}
