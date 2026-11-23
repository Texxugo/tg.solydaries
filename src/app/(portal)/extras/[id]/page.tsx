import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarData } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { duracaoEmMinutos, formatarDuracao } from "@/features/escalas/jornada";
import { EditarExtraForm } from "@/features/extras/components/editar-extra-form";
import { listarColaboradores, obterExtra } from "@/features/extras/queries";
import { AREA_EXTRAS } from "@/features/extras/types";
import { listarPostosAtivos } from "@/features/postos/queries";

export const metadata: Metadata = {
  title: "Editar hora extra",
  description: "Colaborador, horario, posto, local e observacao do extra registrado.",
};

export default async function EditarExtraPage({ params }: PageProps<"/extras/[id]">) {
  await exigirAcesso(AREA_EXTRAS);

  const { id } = await params;

  const [vigor, extra, colaboradores, postos] = await Promise.all([
    competenciaEmVigor(),
    obterExtra(id),
    listarColaboradores(),
    listarPostosAtivos(),
  ]);

  // `obterExtra` ja recorta pela competencia em vigor: extra de outro periodo
  // nao abre por aqui, do mesmo jeito que nao aparece na lista.
  if (!vigor || !extra) {
    notFound();
  }

  const duracao = duracaoEmMinutos(extra.horaEntrada, extra.horaSaida);

  /**
   * O posto e o colaborador do proprio extra entram nas listas mesmo quando ja
   * foram desativados.
   *
   * As duas listas so trazem cadastro ativo, que e o certo para um registro
   * novo. Aqui, sem eles, o campo abriria sem opcao correspondente e uma
   * correcao de observacao trocaria em silencio a pessoa ou o posto do extra —
   * as actions aceitam manter o que ja estava gravado justamente por isso.
   */
  const postosDoCampo = postos.some((posto) => posto.id === extra.postoId)
    ? postos
    : [...postos, { id: extra.postoId, codigo: extra.postoCodigo, nome: extra.postoNome }];

  const colaboradoresDoCampo = colaboradores.some(
    (pessoa) => pessoa.valor === extra.colaborador.valor,
  )
    ? colaboradores
    : [...colaboradores, extra.colaborador];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/extras">
            <ArrowLeft aria-hidden />
            Voltar para horas extras
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {extra.colaborador.nome}
            {extra.colaborador.freelancer ? <Badge variant="outline">Freelancer</Badge> : null}
            {extra.daGrade ? <Badge variant="outline">Grade</Badge> : null}
            <Badge variant="secondary">{formatarData(extra.data)}</Badge>
          </CardTitle>
          <CardDescription>
            {extra.horaEntrada} as {extra.horaSaida} ({formatarDuracao(duracao)}) no posto{" "}
            {extra.postoCodigo} — {extra.local}.
            {extra.registradoPor ? ` Registrado por ${extra.registradoPor}.` : null}
            {extra.daGrade
              ? " Veio da grade: regravar aquele dia reescreve este lancamento."
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditarExtraForm
            extra={extra}
            colaboradores={colaboradoresDoCampo}
            postos={postosDoCampo}
            periodo={{ inicio: vigor.competencia.dataInicio, fim: vigor.competencia.dataFim }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
