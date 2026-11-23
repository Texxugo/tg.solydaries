import type { Metadata } from "next";
import { ArrowLeft, CalendarOff, Table2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, hojeNoPortal, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { listarEventosAtivos } from "@/features/eventos/queries";
import { listarBlocos } from "@/features/postos/queries";
import { GradePosto } from "@/features/preenchimento/components/grade-posto";
import { IncluirPessoa } from "@/features/preenchimento/components/incluir-pessoa";
import { LegendaEventos } from "@/features/preenchimento/components/legenda-eventos";
import { PessoasDoPosto } from "@/features/preenchimento/components/pessoas-do-posto";
import { listarDisponiveis, listarFreelancers, obterGrade } from "@/features/preenchimento/queries";
import { diaDaUrlSchema } from "@/features/preenchimento/schema";
import {
  AREA_PREENCHIMENTO,
  ROTA_PREENCHIMENTO,
  SEM_COMPETENCIA,
} from "@/features/preenchimento/types";

export const metadata: Metadata = {
  title: "Grade do posto",
  description: "Os dias da competencia para um posto inteiro: previsto e realizado, por funcao.",
};

export default async function GradeDoPostoPage({
  params,
  searchParams,
}: PageProps<"/preenchimento/[postoId]">) {
  await exigirAcesso(AREA_PREENCHIMENTO);

  const { postoId } = await params;

  // `?dia=<linha>:<data>` abre a tela com aquele dia no modal — e assim que
  // "Abrir na grade" dos dias sinalizados chega direto no dia. Valor torto e
  // so "nenhum dia aberto".
  const diaInicial = diaDaUrlSchema.catch(null).parse((await searchParams).dia);

  /*
    Uma leitura so para a grade e para o cabecalho: `obterGrade()` ja faz o join
    com `postos`, e uma consulta a parte para o codigo e o nome seria paga de
    novo a cada dia gravado — `refresh()` redesenha a tela inteira.

    `disponiveis` e `freelancers` sao **so da aba Incluir**. O modal do dia nao
    recebe pessoa nenhuma: o campo "quem cobriu" pergunta ao servidor conforme
    se digita (`CampoPessoa`), porque mandar trezentos nomes para virar
    `<option>` a cada abertura era o grosso do travamento ao abrir o dia. Os
    blocos de destino continuam vindo — sao poucos, e nao crescem com a folha.
  */
  const [vigor, grade, eventos, disponiveis, freelancers, blocos] = await Promise.all([
    competenciaEmVigor(),
    obterGrade(postoId),
    listarEventosAtivos(),
    listarDisponiveis(),
    listarFreelancers(),
    listarBlocos(),
  ]);

  if (!grade) {
    notFound();
  }

  const { posto } = grade;
  const funcoes = grade.grupos.map((grupo) => ({ id: grupo.funcaoId, nome: grupo.funcaoNome }));

  const voltar = (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={ROTA_PREENCHIMENTO}>
          <ArrowLeft aria-hidden />
          Voltar para os postos
        </Link>
      </Button>
    </div>
  );

  /*
    O posto, a competencia e o periodo ficam fora das abas: sao a identificacao
    da tela, e quem trocar de aba continua vendo de que posto e a escala.
  */
  const cabecalho = (
    <header className="space-y-1">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
        <span className="text-muted-foreground font-mono text-sm">{posto.codigo}</span>
        {posto.nome}
        {vigor ? (
          <Badge variant="secondary">{nomeDaCompetencia(vigor.competencia.dataFim)}</Badge>
        ) : null}
        {vigor?.temporaria ? <Badge variant="outline">Em consulta</Badge> : null}
      </h1>
      <p className="text-muted-foreground text-sm">
        {grade.grupos.length === 0
          ? "Sem funcao ativa: nao ha turno em que escalar ninguem."
          : grade.grupos
              .map((grupo) =>
                grupo.rotuloDoCiclo
                  ? `${grupo.funcaoNome} (${grupo.rotuloDoCiclo})`
                  : grupo.funcaoNome,
              )
              .join(" · ")}
      </p>
    </header>
  );

  if (!vigor) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        {voltar}
        {cabecalho}

        <Alert>
          <CalendarOff aria-hidden />
          <AlertTitle>Nenhuma competencia aberta</AlertTitle>
          <AlertDescription>
            {SEM_COMPETENCIA}{" "}
            <Link href="/competencias" className="underline underline-offset-4">
              Abrir competencia
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const semFuncao = grade.grupos.length === 0;
  const semNinguem = grade.grupos.every((grupo) => grupo.linhas.length === 0);

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-6 px-6 py-10">
      {voltar}
      {cabecalho}

      <p className="text-muted-foreground text-sm">
        Periodo de {formatarPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim)} —{" "}
        {grade.dias.length} dias.
      </p>

      {/*
        Abas, como na tela de funcionarios: montar a escala, incluir gente e
        cuidar de quem ja esta nela sao tarefas de momentos diferentes, e a
        grade e larga demais para dividir a rolagem com as outras duas.
      */}
      <Tabs defaultValue="grade">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="grade">
            <Table2 aria-hidden />
            Grade
          </TabsTrigger>
          <TabsTrigger value="incluir">
            <UserPlus aria-hidden />
            Incluir
          </TabsTrigger>
          <TabsTrigger value="pessoas">
            <Users aria-hidden />
            Pessoas
          </TabsTrigger>
        </TabsList>

        {/*
          `forceMount` nas tres: sem ele o Radix desmonta a aba escondida, e a
          grade perderia tudo o que estivesse digitado e nao salvo so por dar
          uma olhada em outra. Desmontada ela ficaria sem `hidden` nesta versao
          do Radix, entao a classe vai junto — mesmo par da tela de
          funcionarios.
        */}
        <TabsContent value="grade" forceMount className="space-y-3 data-[state=inactive]:hidden">
          <LegendaEventos eventos={eventos} />

          {semFuncao || semNinguem ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                {semFuncao ? (
                  <>
                    Este posto nao tem funcao ativa nenhuma, e e a funcao que vira faixa da grade.
                    Cadastre uma em <strong>Postos de trabalho</strong>.
                  </>
                ) : (
                  <>
                    Ninguem escalado neste posto ainda. Use a aba <strong>Incluir</strong> para a
                    grade ganhar linhas.
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <GradePosto
              grade={grade}
              eventos={eventos}
              blocos={blocos}
              hoje={hojeNoPortal()}
              diaInicial={diaInicial}
            />
          )}
        </TabsContent>

        <TabsContent value="incluir" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Incluir na escala</CardTitle>
            </CardHeader>
            <CardContent>
              <IncluirPessoa
                competenciaId={vigor.competencia.id}
                funcoes={funcoes}
                disponiveis={disponiveis}
                freelancers={freelancers}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pessoas" forceMount className="data-[state=inactive]:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Pessoas no posto</CardTitle>
            </CardHeader>
            <CardContent>
              <PessoasDoPosto
                grupos={grade.grupos}
                dias={grade.dias}
                competenciaId={vigor.competencia.id}
                eventosDeTrabalho={eventos.filter((evento) => evento.natureza === "trabalho")}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
