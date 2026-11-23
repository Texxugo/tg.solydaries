import type { Metadata } from "next";
import { ArrowLeft, MapPin, UserCheck, Workflow } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exigirAcesso } from "@/features/auth/queries";
import {
  diaSeguinte,
  formatarPeriodo,
  hojeNoPortal,
  nomeDaCompetencia,
} from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { listarEventosAtivos } from "@/features/eventos/queries";
import { listarEmpresas } from "@/features/funcionarios/queries";
import { EditarPostoForm } from "@/features/postos/components/editar-posto-form";
import { FuncoesDoPosto } from "@/features/postos/components/funcoes-do-posto";
import { ResponsavelDoPosto } from "@/features/postos/components/responsavel-do-posto";
import { obterGrupoDeContato, obterPosto } from "@/features/postos/queries";
import type { PeriodoDaPrevia } from "@/features/postos/types";
import { diasDoPeriodo } from "@/features/preenchimento/grade";

export const metadata: Metadata = {
  title: "Editar posto",
  description:
    "Dados do posto, as funcoes que a grade desenha como faixas e o responsavel pelo grupo de contato, em abas separadas.",
};

export default async function EditarPostoPage({ params }: PageProps<"/postos/[id]">) {
  await exigirAcesso("postos");

  const { id } = await params;
  const posto = await obterPosto(id);

  if (!posto) {
    notFound();
  }

  const [empresas, eventos, grupo, vigor] = await Promise.all([
    listarEmpresas(),
    listarEventosAtivos(),
    obterGrupoDeContato(posto.id),
    competenciaEmVigor(),
  ]);

  const eventosDeTrabalho = eventos.filter((evento) => evento.natureza === "trabalho");
  const periodo = periodoDaPrevia(vigor?.competencia ?? null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/postos">
            <ArrowLeft aria-hidden />
            Voltar para postos
          </Link>
        </Button>
      </div>

      {/*
        Codigo, nome e empresa ficam fora das abas: sao a identificacao da tela,
        e quem trocar de aba continua vendo de que posto sao as funcoes.
      */}
      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="text-muted-foreground font-mono text-sm">{posto.codigo}</span>
          {posto.nome}
          {posto.ativo ? null : <Badge variant="destructive">Inativo</Badge>}
        </h1>
        <p className="text-muted-foreground text-sm">
          {posto.empresaNome ? `Atendido por ${posto.empresaNome}.` : "Sem empresa definida."}
        </p>
      </header>

      {/*
        Abas, como na tela de funcionarios: os dados do posto se mexem uma vez,
        no cadastro, e as funcoes sao remexidas o tempo todo — sao tarefas de
        momentos diferentes, e quem veio criar um turno nao precisa passar pelo
        cadastro para chegar nele.
      */}
      <Tabs defaultValue="dados">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="dados">
            <MapPin aria-hidden />
            Dados
          </TabsTrigger>
          <TabsTrigger value="funcoes">
            <Workflow aria-hidden />
            Funcoes
            <Badge variant="secondary">{posto.funcoes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="responsavel">
            <UserCheck aria-hidden />
            Responsavel
            <Badge variant="secondary">{grupo.membros.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/*
          `forceMount` nas tres, como em funcionarios: sem ele o Radix desmonta a
          aba escondida, e a funcao que estivesse sendo cadastrada se perderia so
          por dar uma olhada no cadastro do posto. O `TabsContent` daqui ja
          esconde a inativa por CSS.
        */}
        <TabsContent value="dados" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Dados do posto</CardTitle>
            </CardHeader>
            <CardContent>
              <EditarPostoForm posto={posto} empresas={empresas} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funcoes" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Funcoes</CardTitle>
            </CardHeader>
            <CardContent>
              <FuncoesDoPosto posto={posto} catalogos={{ eventosDeTrabalho }} periodo={periodo} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="responsavel" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Responsavel e grupo de contato</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsavelDoPosto postoId={posto.id} grupo={grupo} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Os dias em que a aba Funcoes desenha cada turma: a competencia em vigor —
 * onde a grade usa o contrato, e cujo primeiro dia ancora a vigencia "desde
 * sempre" —, ou os proximos 30 dias quando nao ha competencia aberta.
 */
function periodoDaPrevia(
  competencia: { dataInicio: string; dataFim: string } | null,
): PeriodoDaPrevia {
  if (competencia) {
    return {
      dias: diasDoPeriodo(competencia.dataInicio, competencia.dataFim),
      primeiroDia: competencia.dataInicio,
      rotulo: `${nomeDaCompetencia(competencia.dataFim)} (${formatarPeriodo(competencia.dataInicio, competencia.dataFim)})`,
    };
  }

  const dias = [hojeNoPortal()];

  while (dias.length < 30) {
    dias.push(diaSeguinte(dias[dias.length - 1]));
  }

  return { dias, primeiroDia: dias[0], rotulo: "os proximos 30 dias (sem competencia aberta)" };
}
