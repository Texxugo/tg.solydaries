import { KeyRound } from "lucide-react";
import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrocarSenhaForm } from "@/features/auth/components/trocar-senha-form";
import { exigirUsuario } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Trocar senha",
  description: "Defina uma nova senha de acesso.",
};

export default async function TrocarSenhaPage() {
  // Unica rota autenticada que aceita senha provisoria — e o destino do
  // redirecionamento que a DAL faz em todas as outras.
  const usuario = await exigirUsuario({ permitirSenhaProvisoria: true });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{usuario.senhaProvisoria ? "Defina sua senha" : "Trocar senha"}</CardTitle>
        <CardDescription>
          {usuario.senhaProvisoria
            ? `Ola, ${usuario.nome}. Sua senha e provisoria: troque-a para liberar o acesso ao portal.`
            : "Escolha uma nova senha para a sua conta."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {usuario.senhaProvisoria ? (
          <p className="bg-muted text-muted-foreground flex gap-2 rounded-md p-3 text-sm">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            Enquanto a senha provisoria estiver ativa, nenhuma outra tela do portal fica disponivel.
          </p>
        ) : null}
        <TrocarSenhaForm />
      </CardContent>
    </Card>
  );
}
