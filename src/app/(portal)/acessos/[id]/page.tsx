import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditarUsuarioForm } from "@/features/acessos/components/editar-usuario-form";
import { RedefinirSenhaForm } from "@/features/acessos/components/redefinir-senha-form";
import { obterUsuario } from "@/features/acessos/queries";
import { exigirAcesso } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Gerenciar acessos",
  description: "Areas liberadas, situacao e senha do usuario.",
};

export default async function EditarAcessosPage({ params }: PageProps<"/acessos/[id]">) {
  const autor = await exigirAcesso("acessos");

  const { id } = await params;
  const usuario = await obterUsuario(id);

  if (!usuario) {
    notFound();
  }

  const autorEhAdministrador = autor.perfil === "administrador";
  const ehOProprioUsuario = usuario.id === autor.id;
  // Quem nao e administrador gerencia areas, mas nao mexe em um administrador.
  const somenteLeitura = !autorEhAdministrador && usuario.perfil === "administrador";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/acessos">
            <ArrowLeft aria-hidden />
            Voltar para acessos
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {usuario.nome}
            {usuario.perfil === "administrador" ? (
              <Badge variant="secondary">Administrador</Badge>
            ) : null}
            {usuario.ativo ? null : <Badge variant="destructive">Inativo</Badge>}
          </CardTitle>
          <CardDescription>
            Login <span className="font-medium">{usuario.login}</span>
            {ehOProprioUsuario ? " — esta e a sua conta." : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {somenteLeitura ? (
            <p className="text-muted-foreground text-sm">
              Somente um administrador pode alterar outro administrador.
            </p>
          ) : (
            <EditarUsuarioForm
              usuario={usuario}
              autorEhAdministrador={autorEhAdministrador}
              ehOProprioUsuario={ehOProprioUsuario}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
          <CardDescription>
            {usuario.senhaProvisoria
              ? "Este usuario ainda esta com senha provisoria e sera levado a troca no proximo acesso."
              : "Gerar uma senha provisoria encerra as sessoes abertas e exige nova troca no proximo acesso."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ehOProprioUsuario ? (
            <p className="text-muted-foreground text-sm">
              Para trocar a propria senha use a{" "}
              <Link href="/trocar-senha" className="underline underline-offset-4">
                tela de troca de senha
              </Link>
              .
            </p>
          ) : somenteLeitura ? (
            <p className="text-muted-foreground text-sm">
              Somente um administrador pode redefinir a senha de outro administrador.
            </p>
          ) : (
            <RedefinirSenhaForm usuarioId={usuario.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
