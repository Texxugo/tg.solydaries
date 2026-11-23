"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trocarSenha } from "@/features/auth/actions";
import { estadoInicialTrocarSenha } from "@/features/auth/types";

const campos = [
  { nome: "senhaAtual", rotulo: "Senha atual", autoComplete: "current-password" },
  { nome: "novaSenha", rotulo: "Nova senha", autoComplete: "new-password" },
  { nome: "confirmacao", rotulo: "Confirme a nova senha", autoComplete: "new-password" },
] as const;

export function TrocarSenhaForm() {
  const [estado, formAction, pendente] = useActionState(trocarSenha, estadoInicialTrocarSenha);

  useEffect(() => {
    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction} className="space-y-4">
      {campos.map((campo) => {
        const erro = estado.erros?.[campo.nome];

        return (
          <div key={campo.nome} className="space-y-2">
            <Label htmlFor={campo.nome}>{campo.rotulo}</Label>
            <Input
              id={campo.nome}
              name={campo.nome}
              type="password"
              autoComplete={campo.autoComplete}
              aria-invalid={Boolean(erro)}
              aria-describedby={
                erro
                  ? `${campo.nome}-erro`
                  : campo.nome === "novaSenha"
                    ? "regras-senha"
                    : undefined
              }
            />
            {campo.nome === "novaSenha" && !erro ? (
              <p id="regras-senha" className="text-muted-foreground text-sm">
                Minimo de 10 caracteres, com pelo menos uma letra e um numero.
              </p>
            ) : null}
            {erro ? (
              <p id={`${campo.nome}-erro`} className="text-destructive text-sm">
                {erro[0]}
              </p>
            ) : null}
          </div>
        );
      })}

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
