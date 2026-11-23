"use client";

import { LoaderCircle, UserPlus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { EscalaParaAtribuicao } from "@/features/escalas/types";
import { criarFuncionario } from "@/features/funcionarios/actions";
import { CamposFuncionario } from "@/features/funcionarios/components/campos-funcionario";
import { CamposJornada } from "@/features/funcionarios/components/campos-jornada";
import { estadoInicialCriarFuncionario, type EmpresaResumo } from "@/features/funcionarios/types";

/** Cadastro manual de um funcionario — o caminho de quem entra fora da folha. */
export function NovoFuncionarioForm({
  empresas,
  escalas,
}: {
  empresas: readonly EmpresaResumo[];
  escalas: readonly EscalaParaAtribuicao[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, formAction, pendente] = useActionState(
    criarFuncionario,
    estadoInicialCriarFuncionario,
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
    <form ref={formRef} action={formAction} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Dados do funcionario</h2>
        </div>

        <CamposFuncionario empresas={empresas} valores={estado.valores} erros={estado.erros} />
      </section>

      {/*
        Na edicao as duas secoes viram formularios independentes; no cadastro nao
        da: nao ha a quem atribuir jornada antes de a pessoa existir. Vao juntas
        no envio, mas separadas na tela — e a jornada continua opcional.
      */}
      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Jornada</h2>
          <p className="text-muted-foreground text-sm">Opcional.</p>
        </div>

        <CamposJornada escalas={escalas} valores={estado.valores} erros={estado.erros} />
      </section>

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <UserPlus aria-hidden />}
        {pendente ? "Cadastrando..." : "Cadastrar funcionario"}
      </Button>
    </form>
  );
}
