"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { criarRegra } from "@/features/apontamentos/regras/actions";
import { CamposRegra } from "@/features/apontamentos/regras/components/campos-regra";
import { estadoInicialRegra, type OpcoesDasRegras } from "@/features/apontamentos/regras/types";

/** Cadastro de uma regra. Gravou, a action leva para a tela dela. */
export function NovaRegraForm({ opcoes }: { opcoes: OpcoesDasRegras }) {
  const [estado, formAction, pendente] = useActionState(criarRegra, estadoInicialRegra);

  useEffect(() => {
    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form key={estado.tentativa ?? "novo"} action={formAction} className="space-y-6">
      <CamposRegra opcoes={opcoes} valores={estado.valores} erros={estado.erros} />

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Salvando..." : "Cadastrar regra"}
      </Button>
    </form>
  );
}
