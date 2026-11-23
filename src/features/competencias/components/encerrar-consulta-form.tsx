"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { encerrarConsulta } from "@/features/competencias/actions";
import { estadoInicialConsulta } from "@/features/competencias/types";

/** Encerra a consulta: a sessao volta a trabalhar na competencia aberta. */
export function EncerrarConsultaForm({ competenciaId }: { competenciaId: string }) {
  const [estado, formAction, pendente] = useActionState(encerrarConsulta, estadoInicialConsulta);

  useEffect(() => {
    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction}>
      <input type="hidden" name="competenciaId" value={competenciaId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <LogOut aria-hidden />}
        {pendente ? "Encerrando..." : "Voltar a competencia ativa"}
      </Button>
    </form>
  );
}
