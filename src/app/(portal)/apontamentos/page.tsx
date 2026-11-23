import type { Metadata } from "next";
import { CalendarOff, FileSpreadsheet, FileText, ScrollText, Upload } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hrefDaExportacao } from "@/features/apontamentos/exportacao/tipos";
import { GerarApontamentos } from "@/features/apontamentos/regras/components/gerar-apontamentos";
import { sugestoesDaCompetencia } from "@/features/apontamentos/regras/queries";
import { FiltrosApontamentos } from "@/features/apontamentos/components/filtros-apontamentos";
import { LimparCompetencia } from "@/features/apontamentos/components/limpar-competencia";
import { ListaApontamentos } from "@/features/apontamentos/components/lista-apontamentos";
import { PaginacaoApontamentos } from "@/features/apontamentos/components/paginacao-apontamentos";
import { listarApontamentos } from "@/features/apontamentos/queries";
import { filtrosApontamentosSchema } from "@/features/apontamentos/schema";
import { AREA_APONTAMENTOS, SEM_COMPETENCIA, temFiltro } from "@/features/apontamentos/types";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { listarEmpresas } from "@/features/funcionarios/queries";

export const metadata: Metadata = {
  title: "Apontamentos",
  description: "Direitos e ocorrencias de cada funcionario para o fechamento da folha.",
};

export default async function ApontamentosPage({ searchParams }: PageProps<"/apontamentos">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao, e so exige sessao, nao esta area.
  await exigirAcesso(AREA_APONTAMENTOS);

  const filtros = filtrosApontamentosSchema.parse(await searchParams);

  const [vigor, pagina, empresas] = await Promise.all([
    competenciaEmVigor(),
    listarApontamentos(filtros),
    listarEmpresas(),
  ]);

  /**
   * Derivada da grade a cada leitura — e ela que marca quem ja tem sugestao
   * pronta e quem esta gravado diferente dela.
   *
   * So das pessoas **desta pagina**, e por isso depois da lista e nao dentro do
   * `Promise.all`: a varredura e por pessoa e por dia do periodo, e derivar a
   * competencia inteira para marcar vinte linhas jogava fora quase tudo o que
   * calculava.
   */
  const sugestoes = await sugestoesDaCompetencia(
    pagina.linhas.map((linha) => linha.funcionario.id),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            Apontamentos
            {vigor ? (
              <Badge variant="secondary">{nomeDaCompetencia(vigor.competencia.dataFim)}</Badge>
            ) : null}
            {vigor?.temporaria ? <Badge variant="outline">Em consulta</Badge> : null}
          </h1>
        </div>

        {vigor ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/apontamentos/regras">
                <ScrollText aria-hidden />
                Regras
              </Link>
            </Button>

            <GerarApontamentos competenciaId={vigor.competencia.id} pendentes={pagina.pendentes} />

            {/* `apontados` ignora o filtro da lista: e a competencia inteira que vai embora. */}
            <LimparCompetencia
              competenciaId={vigor.competencia.id}
              competencia={nomeDaCompetencia(vigor.competencia.dataFim)}
              apontados={pagina.apontados}
              emConsulta={vigor.temporaria}
            />

            <Button asChild variant="outline">
              <Link href="/apontamentos/importar-horas">
                <Upload aria-hidden />
                Importar horas extras
              </Link>
            </Button>

            {/*
              `<a>` de verdade, e nao `Link`: o destino e um arquivo, e o `Link`
              tentaria navegar (e fazer prefetch) de um Route Handler. Levam a
              busca e a empresa da lista, para o arquivo trazer as mesmas pessoas.
              Sem apontado nenhum, nao ha o que baixar.
            */}
            {pagina.apontados > 0 ? (
              <>
                <Button asChild variant="secondary">
                  <a href={hrefDaExportacao("word", filtros)} download>
                    <FileText aria-hidden />
                    Relatorio (Word)
                  </a>
                </Button>
                <Button asChild variant="secondary">
                  <a href={hrefDaExportacao("excel", filtros)} download>
                    <FileSpreadsheet aria-hidden />
                    Planilha (Excel)
                  </a>
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" disabled>
                  <FileText aria-hidden />
                  Relatorio (Word)
                </Button>
                <Button variant="secondary" disabled>
                  <FileSpreadsheet aria-hidden />
                  Planilha (Excel)
                </Button>
              </>
            )}
          </div>
        ) : null}
      </header>

      {vigor ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Periodo de {formatarPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim)} ·{" "}
            {pagina.apontados} {pagina.apontados === 1 ? "apontado" : "apontados"} ·{" "}
            {pagina.pendentes}{" "}
            {pagina.pendentes === 1 ? "ativo sem apontamento" : "ativos sem apontamento"}
          </p>

          <FiltrosApontamentos
            filtros={filtros}
            empresas={empresas}
            apontados={pagina.apontados}
            pendentes={pagina.pendentes}
          />

          <ListaApontamentos
            linhas={pagina.linhas}
            filtrado={temFiltro(filtros)}
            sugestoes={sugestoes}
          />

          <PaginacaoApontamentos
            filtros={filtros}
            pagina={pagina.pagina}
            paginas={pagina.paginas}
            total={pagina.total}
          />
        </div>
      ) : (
        <Alert>
          <CalendarOff aria-hidden />
          <AlertTitle>Sem competencia aberta</AlertTitle>
          <AlertDescription>
            {SEM_COMPETENCIA} Todo apontamento pertence a um periodo da folha.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
