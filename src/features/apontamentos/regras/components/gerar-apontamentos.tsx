"use client";

import { LoaderCircle, Wand2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { gerarApontamentos } from "@/features/apontamentos/regras/actions";
import { estadoInicialGerarApontamentos } from "@/features/apontamentos/regras/types";

/**
 * Grava a sugestao das regras para quem ainda nao tem apontamento.
 *
 * O id da competencia viaja escondido: a tela pode ter sido aberta antes de
 * alguem encerrar a consulta em outra aba, e gravar na competencia errada seria
 * pior do que recusar.
 */
export function GerarApontamentos({
  competenciaId,
  pendentes,
}: {
  competenciaId: string;
  /** Quantos ainda nao tem apontamento — o tamanho da fila que isto encurta. */
  pendentes: number;
}) {
  const [estado, formAction, pendente] = useActionState(
    gerarApontamentos,
    estadoInicialGerarApontamentos,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction}>
      <input type="hidden" name="competenciaId" value={competenciaId} />

      <Button type="submit" variant="secondary" disabled={pendente || pendentes === 0}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Wand2 aria-hidden />}
        {pendente ? "Gerando..." : "Gerar pelas regras"}
      </Button>
    </form>
  );
}
