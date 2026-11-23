"use client";

import { LoaderCircle, MapPin } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { EmpresaResumo } from "@/features/funcionarios/types";
import { criarPosto } from "@/features/postos/actions";
import { CamposPosto } from "@/features/postos/components/campos-posto";
import { estadoInicialCriarPosto } from "@/features/postos/types";

/**
 * Cadastro de um posto. As funcoes vem depois, na tela do proprio posto: nao ha
 * a que anexa-las antes de o posto existir — mesma razao pela qual a jornada do
 * funcionario e definida no cadastro e a escala do mes so na grade.
 */
export function NovoPostoForm({ empresas }: { empresas: readonly EmpresaResumo[] }) {
  const [estado, formAction, pendente] = useActionState(criarPosto, estadoInicialCriarPosto);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction} className="space-y-6">
      <CamposPosto empresas={empresas} valores={estado.valores} erros={estado.erros} />

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <MapPin aria-hidden />}
        {pendente ? "Cadastrando..." : "Cadastrar posto"}
      </Button>
    </form>
  );
}
