import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { listarEscalasAtivas } from "@/features/escalas/queries";
import { NovoFuncionarioForm } from "@/features/funcionarios/components/novo-funcionario-form";
import { listarEmpresas } from "@/features/funcionarios/queries";
import { AREA_FUNCIONARIOS } from "@/features/funcionarios/types";

export const metadata: Metadata = {
  title: "Novo funcionario",
  description: "Cadastro manual de um funcionario, com escala e inicio de ciclo.",
};

export default async function NovoFuncionarioPage() {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const [empresas, escalas] = await Promise.all([listarEmpresas(), listarEscalasAtivas()]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/funcionarios">
            <ArrowLeft aria-hidden />
            Voltar para funcionarios
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo funcionario</CardTitle>
        </CardHeader>
        <CardContent>
          {empresas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma empresa cadastrada ainda. A importacao do relatorio da folha cria as empresas
              que o arquivo citar — e o caminho mais curto para comecar.
            </p>
          ) : (
            <NovoFuncionarioForm empresas={empresas} escalas={escalas} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
