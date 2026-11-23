"use client";

import { CheckCheck, RotateCcw } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resolverSinalizacao } from "@/features/sinalizacoes/actions";
import { estadoInicialResolver } from "@/features/sinalizacoes/types";

/**
 * Resolver (ou reabrir) um dia sinalizado. Um formulario por linha, e nao um
 * para a lista: resolver um dia nao pode depender do que esta marcado nos
 * outros.
 */
export function BotaoResolver({ id, resolvido }: { id: string; resolvido: boolean }) {
  const [estado, enviar, enviando] = useActionState(resolverSinalizacao, estadoInicialResolver);

  useEffect(() => {
    if (estado.status === "success" && estado.mensagem) {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && estado.mensagem) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={enviar}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="acao" value={resolvido ? "reabrir" : "resolver"} />
      <Button
        type="submit"
        size="sm"
        variant={resolvido ? "ghost" : "secondary"}
        disabled={enviando}
      >
        {resolvido ? <RotateCcw aria-hidden /> : <CheckCheck aria-hidden />}
        {resolvido ? "Reabrir" : "Resolver"}
      </Button>
    </form>
  );
}
