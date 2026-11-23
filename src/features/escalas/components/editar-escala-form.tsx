"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { atualizarEscala } from "@/features/escalas/actions";
import { CamposEscala } from "@/features/escalas/components/campos-escala";
import { estadoInicialAtualizarEscala, type EscalaResumo } from "@/features/escalas/types";

/**
 * Edicao de uma escala ja cadastrada. Nao ha exclusao: escala explica jornadas
 * ja interpretadas, e apagar reescreveria o passado — desativar tira das
 * escolhas novas sem perder o historico.
 */
export function EditarEscalaForm({ escala }: { escala: EscalaResumo }) {
  const [estado, formAction, pendente] = useActionState(
    atualizarEscala,
    estadoInicialAtualizarEscala,
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
   * Os campos sao nao controlados: mudar `defaultValue` nao mexe em um campo ja
   * montado, e depois do `refresh()` da action o formulario ficaria exibindo o
   * estado anterior mesmo com a gravacao concluida. A chave derivada dos dados
   * do servidor remonta o formulario quando (e so quando) eles mudam.
   */
  const assinatura = [
    escala.nome,
    escala.descricao,
    escala.entrada,
    escala.saida,
    escala.diasCiclo,
    escala.folgas.join(","),
    escala.intrajornadaMinutos,
    escala.marcacoesEsperadas,
    escala.horasExtrasMinutos,
    escala.ativa,
  ].join("|");

  return (
    <form key={assinatura} action={formAction} className="space-y-6">
      <input type="hidden" name="escalaId" value={escala.id} />

      <CamposEscala
        valores={{
          nome: escala.nome,
          descricao: escala.descricao ?? "",
          entrada: escala.entrada,
          saida: escala.saida,
          diasCiclo: String(escala.diasCiclo),
          folgas: escala.folgas,
          intrajornadaMinutos: String(escala.intrajornadaMinutos),
          marcacoesEsperadas: String(escala.marcacoesEsperadas),
          horasExtrasMinutos: String(escala.horasExtrasMinutos),
        }}
        erros={estado.erros}
      />

      <Separator />

      <div className="flex items-start gap-3">
        <Checkbox id="ativa" name="ativa" defaultChecked={escala.ativa} className="mt-0.5" />
        <div className="space-y-0.5">
          <Label htmlFor="ativa">Ativa</Label>
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
