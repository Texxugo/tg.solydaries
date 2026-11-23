"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrar } from "@/features/auth/actions";
import { estadoInicialLogin } from "@/features/auth/types";

type LoginFormProps = {
  redirecionar?: string;
  /** Login gravado no cookie de "lembrar", quando existe. */
  loginLembrado?: string;
};

export function LoginForm({ redirecionar, loginLembrado }: LoginFormProps) {
  const [estado, formAction, pendente] = useActionState(entrar, estadoInicialLogin);

  useEffect(() => {
    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction} className="space-y-4">
      {redirecionar ? <input type="hidden" name="redirecionar" value={redirecionar} /> : null}

      <div className="space-y-2">
        <Label htmlFor="login">Usuario</Label>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={!loginLembrado}
          defaultValue={estado.login ?? loginLembrado}
          placeholder="nome.sobrenome"
          aria-invalid={Boolean(estado.erros?.login)}
          aria-describedby={estado.erros?.login ? "login-erro" : undefined}
        />
        {estado.erros?.login ? (
          <p id="login-erro" className="text-destructive text-sm">
            {estado.erros.login[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          // Com o usuario ja preenchido, o cursor comeca onde falta digitar.
          autoFocus={Boolean(loginLembrado)}
          aria-invalid={Boolean(estado.erros?.senha)}
          aria-describedby={estado.erros?.senha ? "senha-erro" : undefined}
        />
        {estado.erros?.senha ? (
          <p id="senha-erro" className="text-destructive text-sm">
            {estado.erros.senha[0]}
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="lembrar"
          name="lembrar"
          defaultChecked={estado.lembrar ?? Boolean(loginLembrado)}
          className="mt-0.5"
        />
        <Label htmlFor="lembrar" className="font-normal">
          Lembrar meu usuario
        </Label>
      </div>

      {/* Erro geral tambem em texto: o toast some e nao e lido por leitor de tela em todo cenario. */}
      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
