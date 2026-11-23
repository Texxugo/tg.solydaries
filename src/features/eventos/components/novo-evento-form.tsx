"use client";

import { LoaderCircle, TagsIcon } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { criarEvento } from "@/features/eventos/actions";
import { CamposEvento } from "@/features/eventos/components/campos-evento";
import { estadoInicialCriarEvento } from "@/features/eventos/types";

/** Cadastro de um evento: a sigla que a grade vai aceitar em cada dia. */
export function NovoEventoForm() {
  const [estado, formAction, pendente] = useActionState(criarEvento, estadoInicialCriarEvento);

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
      <CamposEvento valores={estado.valores} erros={estado.erros} />

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <TagsIcon aria-hidden />}
        {pendente ? "Cadastrando..." : "Cadastrar evento"}
      </Button>
    </form>
  );
}
