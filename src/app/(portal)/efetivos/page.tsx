import type { Metadata } from "next";
import { CalendarRange, Settings2 } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { ehDataValida, hojeNoPortal } from "@/features/competencias/periodo";
import { LancamentoEfetivo } from "@/features/efetivos/components/lancamento-efetivo";
import { PainelDoDia } from "@/features/efetivos/components/painel-do-dia";
import {
  listarLancamentosDoDia,
  listarLocaisDoPosto,
  listarPostosDoLancamento,
  listarTiposDoLancamento,
  obterPainelDoDia,
} from "@/features/efetivos/queries";
import {
  AREA_EFETIVOS,
  ROTA_CADASTROS_EFETIVOS,
  ROTA_SEMANA_EFETIVOS,
} from "@/features/efetivos/types";

export const metadata: Metadata = {
  title: "Efetivos",
  description: "O lancamento diario do efetivo de cada posto.",
};

export default async function EfetivosPage({ searchParams }: PageProps<"/efetivos">) {
  // Repetida mesmo com o layout: layout nao roda em toda navegacao, e so exige
  // sessao, nao esta area.
  await exigirAcesso(AREA_EFETIVOS);

  // Data e posto vem da URL e sao entrada do usuario: data torta e "hoje", e
  // posto torto (ou desativado) e "nenhum".
  const parametros = await searchParams;
  const dataPedida = typeof parametros.data === "string" ? parametros.data : "";
  const data = ehDataValida(dataPedida) ? dataPedida : hojeNoPortal();
  const postoPedido = z.uuid().safeParse(parametros.posto).data ?? null;

  const postos = await listarPostosDoLancamento();
  const postoId = postos.some((posto) => posto.id === postoPedido) ? postoPedido : null;

  const [locais, lancamentos, painel] = await Promise.all([
    listarLocaisDoPosto(postoId),
    postoId ? listarLancamentosDoDia(data, postoId) : Promise.resolve([]),
    obterPainelDoDia(data),
  ]);

  // Os ativos, mais o de algum lancamento do dia que tenha sido desativado
  // depois: a edicao daquela linha precisa encontra-lo na lista.
  const tipos = await listarTiposDoLancamento(
    lancamentos.flatMap((lancamento) => (lancamento.excecao ? [lancamento.excecao.tipoId] : [])),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Efetivos</h1>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            {/* A semana da data escolhida, e nao a de hoje: quem lanca o dia 10
                e abre a semana quer ver a do dia 10. */}
            <Link href={`${ROTA_SEMANA_EFETIVOS}?semana=${data}`}>
              <CalendarRange aria-hidden />
              Consulta semanal
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={ROTA_CADASTROS_EFETIVOS}>
              <Settings2 aria-hidden />
              Locais e tipos de excecao
            </Link>
          </Button>
        </div>
      </header>

      <PainelDoDia data={data} painel={painel} totalDePostos={postos.length} />

      <LancamentoEfetivo
        data={data}
        postoId={postoId}
        postos={postos}
        locais={locais}
        tipos={tipos}
        lancamentos={lancamentos}
      />
    </div>
  );
}
