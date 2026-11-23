import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NovoUsuarioForm } from "@/features/acessos/components/novo-usuario-form";
import { exigirAcesso } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Novo usuario",
  description: "Cadastro de usuario e definicao das areas liberadas.",
};

export default async function NovoUsuarioPage() {
  const autor = await exigirAcesso("acessos");

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
          <CardTitle>Novo usuario</CardTitle>
          <CardDescription>
            O portal gera uma senha provisoria e a exibe uma unica vez apos o cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NovoUsuarioForm podeConcederAdministrador={autor.perfil === "administrador"} />
        </CardContent>
      </Card>
    </div>
  );
}
