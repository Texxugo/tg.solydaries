"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { atualizarRegra, excluirRegra } from "@/features/apontamentos/regras/actions";
import { CamposRegra } from "@/features/apontamentos/regras/components/campos-regra";
import { valoresDaRegra } from "@/features/apontamentos/regras/descricao";
import {
  estadoInicialExcluirRegra,
  estadoInicialRegra,
  type OpcoesDasRegras,
  type RegraResumo,
} from "@/features/apontamentos/regras/types";

/** Edicao de uma regra, com a exclusao ao lado. */
export function EditarRegraForm({
  regra,
  opcoes,
}: {
  regra: RegraResumo;
  opcoes: OpcoesDasRegras;
}) {
  const [estado, formAction, pendente] = useActionState(atualizarRegra, estadoInicialRegra);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  const gravados = valoresDaRegra(regra);

  /**
   * Campos nao controlados: a chave remonta o formulario quando os dados do
   * servidor mudam (depois do `refresh()`) e a cada recusa — nesta, para que o
   * que foi digitado volte, e nao o que estava gravado.
   */
  const chave = `${Object.values(gravados).join("|")}#${
    estado.status === "error" ? estado.tentativa : ""
  }`;

  return (
    <div className="space-y-6">
      <form key={chave} action={formAction} className="space-y-6">
        <input type="hidden" name="regraId" value={regra.id} />

        <CamposRegra
          opcoes={opcoes}
          valores={estado.status === "error" && estado.valores ? estado.valores : gravados}
          erros={estado.erros}
        />

        {estado.status === "error" && !estado.erros ? (
          <p role="alert" className="text-destructive text-sm">
            {estado.mensagem}
          </p>
        ) : null}

        <Button type="submit" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : null}
          {pendente ? "Salvando..." : "Salvar regra"}
        </Button>
      </form>

      <Separator />

      <ExcluirRegra regraId={regra.id} />
    </div>
  );
}

/** Formulario proprio: `<form>` aninhado nao existe em HTML. */
function ExcluirRegra({ regraId }: { regraId: string }) {
  const [estado, formAction, pendente] = useActionState(excluirRegra, estadoInicialExcluirRegra);

  // So o erro chega aqui: a exclusao bem-sucedida termina em `redirect()`.
  useEffect(() => {
    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="regraId" value={regraId} />

      <Button type="submit" variant="destructive" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Trash2 aria-hidden />}
        {pendente ? "Excluindo..." : "Excluir regra"}
      </Button>
    </form>
  );
}
