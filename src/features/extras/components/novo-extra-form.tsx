"use client";

import { LoaderCircle, TimerReset } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { registrarExtra } from "@/features/extras/actions";
import { CamposExtra } from "@/features/extras/components/campos-extra";
import { estadoInicialRegistrarExtra, type ColaboradorDisponivel } from "@/features/extras/types";
import type { PostoParaEscolha } from "@/features/postos/types";

/** Registro de um extra: quem fez, quando, onde e o que explica o dia. */
export function NovoExtraForm({
  colaboradores,
  postos,
  periodo,
  /** O dia que o formulario ja abre preenchido — hoje, preso ao periodo. */
  dataPadrao,
}: {
  colaboradores: readonly ColaboradorDisponivel[];
  postos: readonly PostoParaEscolha[];
  periodo: { inicio: string; fim: string };
  dataPadrao: string;
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarExtra,
    estadoInicialRegistrarExtra,
  );

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
     * Remontar em vez de `reset()`: a chave vem da action, e nao de um contador
     * local, porque contar no cliente seria `setState` dentro de efeito. Em erro
     * ela nao muda — o formulario continua com o que foi digitado.
     */
    <form key={estado.chave ?? "novo"} action={formAction} className="space-y-6">
      <CamposExtra
        colaboradores={colaboradores}
        postos={postos}
        periodo={periodo}
        valores={estado.valores ?? { data: dataPadrao }}
        erros={estado.erros}
      />

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <TimerReset aria-hidden />}
        {pendente ? "Registrando..." : "Registrar extra"}
      </Button>
    </form>
  );
}
