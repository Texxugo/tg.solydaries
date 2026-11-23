"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { atualizarEvento } from "@/features/eventos/actions";
import { CamposEvento } from "@/features/eventos/components/campos-evento";
import { estadoInicialAtualizarEvento, type EventoResumo } from "@/features/eventos/types";

/**
 * Edicao de um evento ja cadastrado. Nao ha exclusao: o evento explica dias ja
 * preenchidos em competencias encerradas, e apagar deixaria essas celulas sem
 * significado — desativar tira das escolhas novas sem perder o passado.
 */
export function EditarEventoForm({ evento }: { evento: EventoResumo }) {
  const [estado, formAction, pendente] = useActionState(
    atualizarEvento,
    estadoInicialAtualizarEvento,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  /**
   * Campo nao controlado ignora `defaultValue` novo: sem remontar, a tela
   * exibiria o estado anterior depois do `refresh()` da action. A chave sai dos
   * dados do servidor, e por isso muda quando (e so quando) eles mudam.
   */
  const assinatura = [
    evento.codigo,
    evento.rotulo,
    evento.descricao,
    evento.natureza,
    evento.cor,
    evento.exigeHorario,
    evento.exigePessoa,
    evento.exigeDestino,
    evento.exigeDiaTrabalhado,
    evento.padrao,
    evento.ativo,
  ].join("|");

  return (
    <form key={assinatura} action={formAction} className="space-y-6">
      <input type="hidden" name="eventoId" value={evento.id} />

      <CamposEvento
        valores={{
          codigo: evento.codigo,
          rotulo: evento.rotulo,
          descricao: evento.descricao ?? "",
          natureza: evento.natureza,
          cor: evento.cor,
          exigeHorario: evento.exigeHorario,
          exigePessoa: evento.exigePessoa,
          exigeDestino: evento.exigeDestino,
          exigeDiaTrabalhado: evento.exigeDiaTrabalhado,
          padrao: evento.padrao,
        }}
        erros={estado.erros}
      />

      <Separator />

      <div className="flex items-start gap-3">
        <Checkbox id="ativo" name="ativo" defaultChecked={evento.ativo} className="mt-0.5" />
        <div className="space-y-0.5">
          <Label htmlFor="ativo">Ativo</Label>
        </div>
      </div>

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Salvando..." : "Salvar alteracoes"}
      </Button>
    </form>
  );
}
