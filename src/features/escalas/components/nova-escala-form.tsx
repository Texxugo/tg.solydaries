"use client";

import { CalendarPlus, LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { criarEscala } from "@/features/escalas/actions";
import { CamposEscala } from "@/features/escalas/components/campos-escala";
import { estadoInicialCriarEscala } from "@/features/escalas/types";

/** Cadastro de uma escala: a regra da jornada, do nome as marcacoes esperadas. */
export function NovaEscalaForm() {
  const [estado, formAction, pendente] = useActionState(criarEscala, estadoInicialCriarEscala);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    /**
     * Remontar em vez de `reset()`: o campo de ciclo tem estado proprio (a
     * grade de folgas cresce e encolhe com o tamanho do ciclo), e `reset()` so
     * devolve ao padrao os campos nao controlados — a grade ficaria com as
     * folgas da escala recem-cadastrada. A chave vem da action, e nao de um
     * contador local, porque contar no cliente seria `setState` dentro de
     * efeito. Em erro ela nao muda: o formulario continua com o que foi
     * digitado.
     */
    <form key={estado.chave ?? "nova"} action={formAction} className="space-y-6">
      <CamposEscala valores={estado.valores} erros={estado.erros} />

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <CalendarPlus aria-hidden />}
        {pendente ? "Cadastrando..." : "Cadastrar escala"}
      </Button>
    </form>
  );
}
