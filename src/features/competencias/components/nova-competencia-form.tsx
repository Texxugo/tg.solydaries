"use client";

import { CalendarPlus, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { abrirCompetencia } from "@/features/competencias/actions";
import { estadoInicialAbrirCompetencia } from "@/features/competencias/types";

/**
 * Abre a proxima competencia. O inicio ja vem sugerido com o dia seguinte ao
 * fim da ultima (`sugestaoInicio`), para que o calendario siga sem buraco.
 */
export function NovaCompetenciaForm({ sugestaoInicio }: { sugestaoInicio?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, formAction, pendente] = useActionState(
    abrirCompetencia,
    estadoInicialAbrirCompetencia,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
      formRef.current?.reset();
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dataInicio">Inicio do periodo</Label>
          <Input
            id="dataInicio"
            name="dataInicio"
            type="date"
            defaultValue={estado.valores?.dataInicio ?? sugestaoInicio}
            aria-invalid={Boolean(estado.erros?.dataInicio)}
            aria-describedby={estado.erros?.dataInicio ? "dataInicio-erro" : undefined}
          />
          {estado.erros?.dataInicio ? (
            <p id="dataInicio-erro" className="text-destructive text-sm">
              {estado.erros.dataInicio[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dataFim">Fim do periodo</Label>
          <Input
            id="dataFim"
            name="dataFim"
            type="date"
            defaultValue={estado.valores?.dataFim}
            aria-invalid={Boolean(estado.erros?.dataFim)}
            aria-describedby={estado.erros?.dataFim ? "dataFim-erro" : "dataFim-ajuda"}
          />
          {estado.erros?.dataFim ? (
            <p id="dataFim-erro" className="text-destructive text-sm">
              {estado.erros.dataFim[0]}
            </p>
          ) : (
            <p id="dataFim-ajuda" className="text-muted-foreground text-sm">
              O mes desta data da nome a competencia.
            </p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <CalendarPlus aria-hidden />}
        {pendente ? "Abrindo..." : "Abrir competencia"}
      </Button>
    </form>
  );
}
