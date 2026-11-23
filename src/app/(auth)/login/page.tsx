import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { lerLoginLembrado } from "@/features/auth/login-lembrado";
import { obterUsuarioAtual } from "@/features/auth/queries";
import { ROTA_TROCA_SENHA } from "@/features/auth/types";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesso ao Portal TG.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const usuario = await obterUsuarioAtual();

  // Ja autenticado: nao faz sentido mostrar o formulario de novo.
  if (usuario) {
    redirect(usuario.senhaProvisoria ? ROTA_TROCA_SENHA : "/");
  }

  const [{ redirecionar }, loginLembrado] = await Promise.all([searchParams, lerLoginLembrado()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Use suas credenciais do portal.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          redirecionar={typeof redirecionar === "string" ? redirecionar : undefined}
          loginLembrado={loginLembrado}
        />
      </CardContent>
    </Card>
  );
}
