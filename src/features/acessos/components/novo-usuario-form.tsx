"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { criarUsuario } from "@/features/acessos/actions";
import { CampoAreas } from "@/features/acessos/components/campo-areas";
import { SenhaProvisoria } from "@/features/acessos/components/senha-provisoria";
import { estadoInicialCriarUsuario } from "@/features/acessos/types";

/**
 * Cadastro de usuario. A senha nao e digitada aqui: o portal gera uma senha
 * provisoria e a devolve no estado, exibida uma unica vez apos o sucesso.
 */
export function NovoUsuarioForm({
  podeConcederAdministrador,
}: {
  podeConcederAdministrador: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, formAction, pendente] = useActionState(criarUsuario, estadoInicialCriarUsuario);

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
    <div className="space-y-6">
      {estado.status === "success" && estado.credenciais ? (
        <SenhaProvisoria credenciais={estado.credenciais} />
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            name="nome"
            defaultValue={estado.valores?.nome}
            placeholder="Maria Silva"
            aria-invalid={Boolean(estado.erros?.nome)}
            aria-describedby={estado.erros?.nome ? "nome-erro" : undefined}
          />
          {estado.erros?.nome ? (
            <p id="nome-erro" className="text-destructive text-sm">
              {estado.erros.nome[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="login">Login</Label>
          <Input
            id="login"
            name="login"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={estado.valores?.login}
            placeholder="maria.silva"
            aria-invalid={Boolean(estado.erros?.login)}
            aria-describedby={estado.erros?.login ? "login-erro" : "login-ajuda"}
          />
          {estado.erros?.login ? (
            <p id="login-erro" className="text-destructive text-sm">
              {estado.erros.login[0]}
            </p>
          ) : (
            <p id="login-ajuda" className="text-muted-foreground text-sm">
              Letras, numeros, ponto, hifen ou underline. Nao pode ser alterado depois.
            </p>
          )}
        </div>

        <Separator />

        <CampoAreas erro={estado.erros?.areas?.[0]} />

        {podeConcederAdministrador ? (
          <>
            <Separator />
            <div className="flex items-start gap-3">
              <Checkbox id="administrador" name="administrador" className="mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="administrador">Administrador</Label>
                <p className="text-muted-foreground text-sm">
                  Enxerga todas as areas, exibe o badge ao lado do nome e pode promover outros
                  administradores.
                </p>
              </div>
            </div>
          </>
        ) : null}

        {estado.status === "error" && !estado.erros ? (
          <p role="alert" className="text-destructive text-sm">
            {estado.mensagem}
          </p>
        ) : null}

        <Button type="submit" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : null}
          {pendente ? "Cadastrando..." : "Cadastrar usuario"}
        </Button>
      </form>
    </div>
  );
}
