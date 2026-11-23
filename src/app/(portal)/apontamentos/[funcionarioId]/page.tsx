import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { podeAcessar } from "@/features/acessos/areas";
import { ApontamentoForm } from "@/features/apontamentos/components/apontamento-form";
import { EspelhoDoPonto } from "@/features/apontamentos/components/espelho-do-ponto";
import { referenciasDoEspelho, resumirEspelho } from "@/features/apontamentos/espelho";
import { formatarInstante } from "@/features/apontamentos/components/formatar-instante";
import { obterApontamento } from "@/features/apontamentos/queries";
import { sugestaoDoFuncionario } from "@/features/apontamentos/regras/queries";
import { AREA_APONTAMENTOS } from "@/features/apontamentos/types";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { rotuloDaSituacao, SITUACAO_TRABALHANDO } from "@/features/funcionarios/situacoes";
import { obterApuracao } from "@/features/ponto/queries";
import { diasDoPeriodo } from "@/features/preenchimento/grade";

export const metadata: Metadata = {
  title: "Apontamento",
  description: "Direitos e ocorrencias do funcionario na competencia, com o espelho de ponto.",
};

export default async function ApontamentoPage({
  params,
}: PageProps<"/apontamentos/[funcionarioId]">) {
  const usuario = await exigirAcesso(AREA_APONTAMENTOS);

  const { funcionarioId } = await params;

  const [vigor, linha, espelho, sugestao] = await Promise.all([
    competenciaEmVigor(),
    obterApontamento(funcionarioId),
    // O resumo do espelho e parte do trabalho de apontar, e por isso aparece a
    // quem tem esta area; o dia a dia continua sendo da area de ponto.
    obterApuracao(funcionarioId),
    // O que as regras leem da grade desta pessoa. `null` sem regra ativa, sem
    // competencia ou para quem nao esta escalado em posto nenhum.
    sugestaoDoFuncionario(funcionarioId),
  ]);

  // `obterApontamento` ja devolve `null` sem competencia: nao ha periodo a que
  // o apontamento pertenca, e a lista mostra o aviso.
  if (!vigor || !linha) {
    notFound();
  }

  const { funcionario, apontamento } = linha;
  const { competencia } = vigor;

  // Sem escala a apuracao nao sabe o que era dia de trabalho, e os numeros do
  // espelho seriam zeros que parecem resposta: o modal fica sem referencia.
  const referencias =
    espelho && espelho.resumo.escala ? referenciasDoEspelho(resumirEspelho(espelho.apuracao)) : {};

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/apontamentos">
            <ArrowLeft aria-hidden />
            Voltar para apontamentos
          </Link>
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {funcionario.nome}
          <Badge variant="secondary">{nomeDaCompetencia(competencia.dataFim)}</Badge>
          {funcionario.ativo ? null : <Badge variant="outline">Inativo</Badge>}
          {funcionario.situacao !== SITUACAO_TRABALHANDO ? (
            <Badge variant="outline">{rotuloDaSituacao(funcionario.situacao)}</Badge>
          ) : null}
        </h1>
        <p className="text-muted-foreground text-sm">
          {funcionario.empresaNome} · matricula {funcionario.matricula}
          {funcionario.cargo ? ` · ${funcionario.cargo}` : null}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Apontamento</CardTitle>
            <CardDescription>
              Periodo de {formatarPeriodo(competencia.dataInicio, competencia.dataFim)}.
              {apontamento
                ? ` Ultima alteracao em ${formatarInstante(apontamento.atualizadoEm)}${
                    apontamento.atualizadoPor ? ` por ${apontamento.atualizadoPor}` : ""
                  }.`
                : " Ainda sem apontamento nesta competencia."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApontamentoForm
              funcionarioId={funcionario.id}
              nome={funcionario.nome}
              apontamento={apontamento}
              diasNoPeriodo={diasDoPeriodo(competencia.dataInicio, competencia.dataFim).length}
              competenciaId={competencia.id}
              sugestao={sugestao}
              referencias={referencias}
            />
          </CardContent>
        </Card>

        <div className="lg:sticky lg:top-6">
          <EspelhoDoPonto
            detalhe={espelho}
            funcionarioId={funcionario.id}
            podeAbrirPonto={podeAcessar(usuario, "ponto")}
          />
        </div>
      </div>
    </div>
  );
}
