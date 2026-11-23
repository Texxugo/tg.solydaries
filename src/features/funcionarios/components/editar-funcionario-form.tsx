"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { atualizarFuncionario } from "@/features/funcionarios/actions";
import { CamposFuncionario } from "@/features/funcionarios/components/campos-funcionario";
import { formatarCpf } from "@/features/funcionarios/cpf";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import {
  estadoInicialAtualizarFuncionario,
  type EmpresaResumo,
  type FuncionarioResumo,
} from "@/features/funcionarios/types";

/**
 * Edicao dos **dados** de um funcionario ja cadastrado: o que a folha conhece.
 * A jornada (escala e inicio de ciclo) tem formulario e botao proprios, ao lado
 * deste — os dados vem da folha e a jornada nasce no portal, e salvar uma
 * correcao de cargo nao deveria reenviar a escala.
 *
 * Nao ha exclusao: a pessoa explica jornadas ja interpretadas, e apagar
 * reescreveria o passado — desativar tira das telas de trabalho sem perder o
 * historico, como nas escalas.
 */
export function EditarFuncionarioForm({
  funcionario,
  empresas,
}: {
  funcionario: FuncionarioResumo;
  empresas: readonly EmpresaResumo[];
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarFuncionario,
    estadoInicialAtualizarFuncionario,
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
    funcionario.empresaId,
    funcionario.matricula,
    funcionario.nome,
    funcionario.cpf,
    funcionario.cargo,
    funcionario.telefone,
    funcionario.admissao,
    funcionario.situacao,
    funcionario.ativo,
  ].join("|");

  return (
    <form key={assinatura} action={formAction} className="space-y-6">
      <input type="hidden" name="funcionarioId" value={funcionario.id} />

      <CamposFuncionario
        empresas={empresas}
        valores={{
          empresaId: funcionario.empresaId,
          matricula: funcionario.matricula,
          nome: funcionario.nome,
          // Mascarado na leitura porque e assim que se confere um CPF; a action
          // normaliza de volta para os onze digitos que a coluna guarda.
          cpf: formatarCpf(funcionario.cpf),
          cargo: funcionario.cargo ?? "",
          // Mascarado na leitura, como o CPF: a action normaliza de volta para os
          // digitos com DDI que a coluna guarda.
          telefone: funcionario.telefone ? formatarTelefone(funcionario.telefone) : "",
          admissao: funcionario.admissao ?? "",
          situacao: String(funcionario.situacao),
        }}
        erros={estado.erros}
      />

      <Separator />

      <div className="flex items-start gap-3">
        <Checkbox id="ativo" name="ativo" defaultChecked={funcionario.ativo} className="mt-0.5" />
        <div className="space-y-0.5">
          <Label htmlFor="ativo">Ativo no portal</Label>
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
