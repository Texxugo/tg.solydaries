import type { Metadata } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, Search } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirAcesso } from "@/features/auth/queries";
import {
  diaAnterior,
  diaSeguinte,
  ehDataValida,
  formatarData,
  hojeNoPortal,
} from "@/features/competencias/periodo";
import { GradeDaSemana } from "@/features/efetivos/components/grade-da-semana";
import { listarLancamentos, listarPostosDoLancamento } from "@/features/efetivos/queries";
import { diasDaSemana, montarSemana, segundaDaSemana } from "@/features/efetivos/semana";
import { AREA_EFETIVOS, ROTA_EFETIVOS, ROTA_SEMANA_EFETIVOS } from "@/features/efetivos/types";

export const metadata: Metadata = {
  title: "Efetivos da semana",
  description: "O efetivo de cada posto, dia a dia, de segunda a domingo.",
};

function hrefDaSemana(semana: string, postoId: string | null, rota = ROTA_SEMANA_EFETIVOS) {
  const parametros = new URLSearchParams({ semana });

  if (postoId) {
    parametros.set("posto", postoId);
  }

  return `${rota}?${parametros}`;
}

export default async function SemanaDosEfetivosPage({
  searchParams,
}: PageProps<"/efetivos/semana">) {
  await exigirAcesso(AREA_EFETIVOS);

  // Filtros na URL, como em extras e movimentacoes: data torta e "esta semana",
  // posto torto e "todos".
  const parametros = await searchParams;
  const hoje = hojeNoPortal();
  const pedida = typeof parametros.semana === "string" ? parametros.semana : "";
  const segunda = segundaDaSemana(ehDataValida(pedida) ? pedida : hoje);
  const dias = diasDaSemana(segunda);
  const domingo = dias[6];

  const postos = await listarPostosDoLancamento();
  const postoPedido = z.uuid().safeParse(parametros.posto).data ?? null;
  const postoId = postos.some((posto) => posto.id === postoPedido) ? postoPedido : null;

  const semana = montarSemana(
    await listarLancamentos({ de: segunda, ate: domingo, postoId }),
    dias,
  );
  const comLancamento = new Set(semana.map((item) => item.posto.id));
  const semNada = postos.filter(
    (posto) => !comLancamento.has(posto.id) && (!postoId || posto.id === postoId),
  );

  const anterior = segundaDaSemana(diaAnterior(segunda));
  const seguinte = diaSeguinte(domingo);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROTA_EFETIVOS}>
            <ArrowLeft aria-hidden />
            Voltar para o lancamento
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Efetivos da semana</h1>
          <p className="text-muted-foreground text-sm">
            {formatarData(segunda)} a {formatarData(domingo)}
          </p>
        </div>

        <Button asChild variant="outline">
          {/* Route Handler: o download e um GET, e o link baixa sem JavaScript. */}
          <a href={hrefDaSemana(segunda, postoId, `${ROTA_SEMANA_EFETIVOS}/exportar`)} download>
            <FileSpreadsheet aria-hidden />
            Exportar Excel
          </a>
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Semana anterior">
            <Link href={hrefDaSemana(anterior, postoId)}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={hrefDaSemana(segundaDaSemana(hoje), postoId)}>Esta semana</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Proxima semana">
            <Link href={hrefDaSemana(seguinte, postoId)}>
              <ChevronRight />
            </Link>
          </Button>
        </div>

        {/* GET comum: os filtros vao para a URL sem JavaScript nenhum. */}
        <form action={ROTA_SEMANA_EFETIVOS} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="semana-data">Semana de</Label>
            <Input id="semana-data" type="date" name="semana" defaultValue={segunda} />
          </div>
          <div className="w-64 space-y-1.5">
            <Label htmlFor="semana-posto">Posto</Label>
            <NativeSelect id="semana-posto" name="posto" defaultValue={postoId ?? ""}>
              <option value="">Todos os postos</option>
              {postos.map((posto) => (
                <option key={posto.id} value={posto.id}>
                  {posto.codigo} — {posto.nome}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="secondary">
            <Search aria-hidden />
            Ver
          </Button>
        </form>
      </div>

      {semana.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          Nenhum lancamento nesta semana{postoId ? " neste posto" : ""}.
        </p>
      ) : (
        <div className="space-y-8">
          {semana.map((item) => (
            <GradeDaSemana key={item.posto.id} semana={item} dias={dias} hoje={hoje} />
          ))}
        </div>
      )}

      {semNada.length > 0 && semana.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          Sem nenhum lancamento na semana: {semNada.map((posto) => posto.codigo).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
