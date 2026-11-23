"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { EmpresaResumo } from "@/features/funcionarios/types";
import { atualizarPosto } from "@/features/postos/actions";
import { CamposPosto } from "@/features/postos/components/campos-posto";
import { estadoInicialAtualizarPosto, type PostoResumo } from "@/features/postos/types";

/**
 * Edicao de um posto ja cadastrado. Nao ha exclusao: o posto explica escalas de
 * competencias encerradas, e apagar reescreveria o passado — desativar tira das
 * escolhas novas sem perder o historico. As duas FKs sao `on delete restrict`.
 */
export function EditarPostoForm({
  posto,
  empresas,
}: {
  posto: PostoResumo;
  empresas: readonly EmpresaResumo[];
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarPosto,
    estadoInicialAtualizarPosto,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  /**
   * Campo nao controlado ignora `defaultValue` novo: sem remontar, a tela
   * exibiria o estado anterior depois do `refresh()` da action.
   */
  const assinatura = [posto.codigo, posto.nome, posto.empresaId, posto.ativo].join("|");

  return (
    <form key={assinatura} action={formAction} className="space-y-6">
      <input type="hidden" name="postoId" value={posto.id} />

      <CamposPosto
        empresas={empresas}
        valores={{
          codigo: posto.codigo,
          nome: posto.nome,
          empresaId: posto.empresaId ?? "",
        }}
        erros={estado.erros}
      />

      <Separator />

      <div className="flex items-start gap-3">
        <Checkbox id="ativo" name="ativo" defaultChecked={posto.ativo} className="mt-0.5" />
        <div className="space-y-0.5">
          <Label htmlFor="ativo">Ativo</Label>
        </div>
      </div>

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Salvando..." : "Salvar alteracoes"}
      </Button>
    </form>
  );
}
