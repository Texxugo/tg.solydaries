"use client";

import { LoaderCircle, RotateCcwKey } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { redefinirSenha } from "@/features/acessos/actions";
import { SenhaProvisoria } from "@/features/acessos/components/senha-provisoria";
import { estadoInicialRedefinirSenha } from "@/features/acessos/types";

/**
 * Gera uma nova senha provisoria para outro usuario. Fica em um `<form>`
 * proprio (form nao aninha) e encerra as sessoes abertas do alvo.
 */
export function RedefinirSenhaForm({ usuarioId }: { usuarioId: string }) {
  const [estado, formAction, pendente] = useActionState(
    redefinirSenha,
    estadoInicialRedefinirSenha,
  );

  useEffect(() => {
    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <div className="space-y-4">
      {estado.status === "success" && estado.credenciais ? (
        <SenhaProvisoria credenciais={estado.credenciais} />
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="usuarioId" value={usuarioId} />
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : <RotateCcwKey aria-hidden />}
          {pendente ? "Gerando..." : "Gerar senha provisoria"}
        </Button>
      </form>
    </div>
  );
}
