import type { Metadata } from "next";
import { ArrowLeft, CalendarClock, CalendarOff, IdCard } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarData, hojeNoPortal } from "@/features/competencias/periodo";
import { listarEscalasAtivas } from "@/features/escalas/queries";
import { formatarCpf } from "@/features/funcionarios/cpf";
import { AfastamentosForm } from "@/features/funcionarios/components/afastamentos-form";
import { EditarFuncionarioForm } from "@/features/funcionarios/components/editar-funcionario-form";
import { JornadaFuncionarioForm } from "@/features/funcionarios/components/jornada-funcionario-form";
import {
  listarAfastamentos,
  listarEmpresas,
  obterFuncionario,
} from "@/features/funcionarios/queries";
import { estaTrabalhando, rotuloDaSituacao } from "@/features/funcionarios/situacoes";
import { AREA_FUNCIONARIOS } from "@/features/funcionarios/types";

export const metadata: Metadata = {
  title: "Editar funcionario",
  description: "Dados da folha, jornada e afastamentos, em abas separadas.",
};

export default async function EditarFuncionarioPage({ params }: PageProps<"/funcionarios/[id]">) {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const { id } = await params;
  const [funcionario, empresas, escalas, afastamentos] = await Promise.all([
    obterFuncionario(id),
    listarEmpresas(),
    listarEscalasAtivas(),
    listarAfastamentos(id),
  ]);

  if (!funcionario) {
    notFound();
  }

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

      {/*
        Nome, CPF e empresa ficam fora das abas: sao identificacao, e nao
        pertencem a nenhuma das duas. Quem trocar de aba continua vendo de quem
        e a tela.
      */}
      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {funcionario.nome}
          {funcionario.ativo ? null : <Badge variant="destructive">Inativo</Badge>}
          {estaTrabalhando(funcionario.situacao) ? null : (
            <Badge variant="secondary">{rotuloDaSituacao(funcionario.situacao)}</Badge>
          )}
        </h1>
        <p className="text-muted-foreground text-sm">
          {formatarCpf(funcionario.cpf)} · {funcionario.empresaNome} · matricula{" "}
          {funcionario.matricula}
          {funcionario.admissao ? ` · admitido em ${formatarData(funcionario.admissao)}` : null}
        </p>
      </header>

      {/*
        Abas, e nao dois cartoes empilhados: sao duas tarefas diferentes, feitas
        em momentos diferentes, e quem veio ajustar a escala nao precisa rolar o
        cadastro inteiro.
      */}
      <Tabs defaultValue="dados">
        {/*
          Rotulos curtos: a aba so precisa distinguir as duas, e o titulo dentro
          de cada cartao ja diz o nome inteiro. "Dados do funcionario" media 185px
          e empurrava a lista para fora do conteudo em janela estreita ou com o
          menu lateral aberto.
        */}
        {/* Estreito, as duas dividem a largura toda (os gatilhos ja sao `flex-1`)
            em vez de transbordar; com espaco, voltam a ocupar so o necessario. */}
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="dados">
            <IdCard aria-hidden />
            Dados
          </TabsTrigger>
          <TabsTrigger value="jornada">
            <CalendarClock aria-hidden />
            Jornada
          </TabsTrigger>
          <TabsTrigger value="afastamentos">
            <CalendarOff aria-hidden />
            Afastamentos
          </TabsTrigger>
        </TabsList>

        {/*
          `forceMount` nas duas: sem ele o Radix desmonta a aba escondida, e o
          que estivesse digitado e ainda nao salvo se perderia so por dar uma
          olhada na outra. Desmontada, ela fica com `hidden` — os dois `<form>`
          convivem no DOM sem se misturar, porque cada campo pertence ao seu.
        */}
        <TabsContent value="dados" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Dados do funcionario</CardTitle>
              <CardDescription>
                A proxima importacao da folha sobrescreve o que for corrigido aqui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EditarFuncionarioForm funcionario={funcionario} empresas={empresas} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jornada" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Jornada</CardTitle>
            </CardHeader>
            <CardContent>
              <JornadaFuncionarioForm
                funcionario={funcionario}
                escalas={escalas}
                // Calculado no servidor: no cliente, o primeiro render poderia
                // cair em outro dia e a hidratacao acusaria a diferenca.
                hoje={hojeNoPortal()}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="afastamentos" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Afastamentos</CardTitle>
            </CardHeader>
            <CardContent>
              <AfastamentosForm
                funcionarioId={funcionario.id}
                afastamentos={afastamentos}
                hoje={hojeNoPortal()}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
