"use client";

import { Eye, LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { consultarCompetencia } from "@/features/competencias/actions";
import { estadoInicialConsulta } from "@/features/competencias/types";

/**
 * Passa a sessao a trabalhar numa competencia encerrada. Um `<form>` por linha da
 * tabela (form nao aninha) e o id vai em campo escondido — a action reconfere
 * que a competencia existe e ja esta encerrada.
 */
export function ConsultarCompetenciaForm({
  competenciaId,
  nome,
}: {
  competenciaId: string;
  nome: string;
}) {
  const [estado, formAction, pendente] = useActionState(
    consultarCompetencia,
    estadoInicialConsulta,
  );

  useEffect(() => {
    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction}>
      <input type="hidden" name="competenciaId" value={competenciaId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Eye aria-hidden />}
        Consultar<span className="sr-only"> a competencia de {nome}</span>
      </Button>
    </form>
  );
}
