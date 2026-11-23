import type { Metadata } from "next";
import { FileText, ListChecks, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import { rotuloDaDivergencia } from "@/features/ponto/apuracao";
import { FiltrosPonto } from "@/features/ponto/components/filtros-ponto";
import { ListaConferencia } from "@/features/ponto/components/lista-conferencia";
import { PaginacaoPonto } from "@/features/ponto/components/paginacao-ponto";
import { conferirCompetencia, listarEmpresasDaConferencia } from "@/features/ponto/queries";
import {
  buscaPontoSchema,
  filtroEmpresaSchema,
  filtroStatusSchema,
  paginaPontoSchema,
} from "@/features/ponto/schema";
import { AREA_PONTO, ROTA_PENDENCIAS, type FiltrosDePonto } from "@/features/ponto/types";

export const metadata: Metadata = {
  title: "Analise de ponto",
  description: "Marcacoes do relogio lidas contra a escala de cada funcionario.",
};

export default async function PontoPage({ searchParams }: PageProps<"/ponto">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area. A DAL e memoizada,
  // entao nao custa consulta extra.
  await exigirAcesso(AREA_PONTO);

  // Os quatro parametros sao entrada do usuario como qualquer outra: passam pelo
  // Zod antes de virar filtro e de voltar para a tela.
  const parametros = await searchParams;
  const filtros: FiltrosDePonto = {
    busca: buscaPontoSchema.parse(parametros.busca),
    empresaId: filtroEmpresaSchema.parse(parametros.empresa),
    status: filtroStatusSchema.parse(parametros.status),
    pagina: paginaPontoSchema.parse(parametros.pagina),
  };

  const [conferencia, empresas] = await Promise.all([
    conferirCompetencia(filtros),
    listarEmpresasDaConferencia(),
  ]);

  const { competencia, janela, resumo } = conferencia;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            Analise de ponto
            {competencia ? (
              <Badge variant="secondary">{nomeDaCompetencia(competencia.dataFim)}</Badge>
            ) : null}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* O painel vem primeiro por ser o destino do dia a dia: importar e
              mensal, tratar pendencia e diario. */}
          <Button asChild>
            <Link href={ROTA_PENDENCIAS}>
              <ListChecks aria-hidden />
              Pendencias
            </Link>
          </Button>

          <Button asChild variant="secondary">
            <Link href="/ponto/importar">
              <FileText aria-hidden />
              Importar marcacoes
            </Link>
          </Button>
        </div>
      </header>

      {!competencia ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Nenhuma competencia aberta</AlertTitle>
          <AlertDescription>
            Todo dado do portal pertence a um periodo. Abra a competencia em{" "}
            <Link href="/competencias" className="underline">
              Competencias
            </Link>{" "}
            antes de importar as marcacoes.
          </AlertDescription>
        </Alert>
      ) : !janela ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Nenhuma marcacao importada nesta competencia</AlertTitle>
          <AlertDescription>
            A competencia de {formatarPeriodo(competencia.dataInicio, competencia.dataFim)} ainda
            nao recebeu carga nenhuma. Sem saber que periodo o relogio cobre, nao ha como dizer se
            um dia sem marcacao e falta ou e dia que ninguem importou — entao o portal nao apura
            nada.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Numero
                rotulo="Com pendencia"
                valor={resumo.comPendencia}
                alerta={resumo.comPendencia > 0}
              />
              <Numero rotulo="Conferir" valor={resumo.comAtencao} />
              <Numero rotulo="Sem escala" valor={resumo.semEscala} alerta={resumo.semEscala > 0} />
              <Numero rotulo="Conformes" valor={resumo.conformes} />
            </div>

            <p className="text-muted-foreground text-sm">
              Periodo apurado: {formatarPeriodo(janela.inicio, janela.fim)} ·{" "}
              {janela.cargas === 1 ? "1 carga" : `${janela.cargas} cargas`}
              {janela.diasNaoCobertos > 0
                ? ` · faltam ${janela.diasNaoCobertos} ${
                    janela.diasNaoCobertos === 1 ? "dia" : "dias"
                  } para o fim da competencia`
                : null}
            </p>

            {resumo.porTipo.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {resumo.porTipo.map((linha) => (
                  <Badge
                    key={linha.tipo}
                    variant={linha.gravidade === "impeditiva" ? "destructive" : "secondary"}
                  >
                    {rotuloDaDivergencia(linha.tipo)}: {linha.dias}
                  </Badge>
                ))}
              </div>
            ) : null}
          </section>

          <div className="space-y-4">
            <FiltrosPonto filtros={filtros} empresas={empresas} resumo={resumo} />

            <ListaConferencia itens={conferencia.itens} />

            <PaginacaoPonto
              filtros={filtros}
              pagina={conferencia.pagina}
              paginas={conferencia.paginas}
              total={conferencia.total}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div
        className={alerta ? "text-destructive text-2xl font-semibold" : "text-2xl font-semibold"}
      >
        {valor}
      </div>
      <p className="text-muted-foreground text-sm">{rotulo}</p>
    </div>
  );
}
