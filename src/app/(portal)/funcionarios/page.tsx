import type { Metadata } from "next";
import { FileSpreadsheet, UserPlus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/features/auth/queries";
import { hojeNoPortal } from "@/features/competencias/periodo";
import { listarEscalasAtivas } from "@/features/escalas/queries";
import { AtribuirEscalaEmLote } from "@/features/funcionarios/components/atribuir-escala-form";
import { FiltrosFuncionarios } from "@/features/funcionarios/components/filtros-funcionarios";
import { PaginacaoFuncionarios } from "@/features/funcionarios/components/paginacao-funcionarios";
import { listarEmpresas, listarFuncionarios } from "@/features/funcionarios/queries";
import {
  buscaFuncionariosSchema,
  filtroEmpresaSchema,
  filtroPendentesSchema,
  paginaFuncionariosSchema,
} from "@/features/funcionarios/schema";
import { AREA_FUNCIONARIOS, type FiltrosDeFuncionarios } from "@/features/funcionarios/types";

export const metadata: Metadata = {
  title: "Funcionarios",
  description: "Cadastro de funcionarios, com a escala e o inicio de ciclo de cada um.",
};

export default async function FuncionariosPage({ searchParams }: PageProps<"/funcionarios">) {
  // Repetida mesmo com a guarda no layout de `(portal)`: layout nao roda em toda
  // navegacao — e o layout so exige sessao, nao esta area. A DAL e memoizada,
  // entao nao custa consulta extra.
  await exigirAcesso(AREA_FUNCIONARIOS);

  // Os quatro parametros sao entrada do usuario como qualquer outra: passam pelo
  // Zod antes de virar filtro e de voltar para a tela.
  const parametros = await searchParams;
  const filtros: FiltrosDeFuncionarios = {
    busca: buscaFuncionariosSchema.parse(parametros.busca),
    empresaId: filtroEmpresaSchema.parse(parametros.empresa),
    pendentes: filtroPendentesSchema.parse(parametros.pendentes),
    pagina: paginaFuncionariosSchema.parse(parametros.pagina),
  };

  const [pagina, empresas, escalas] = await Promise.all([
    listarFuncionarios(filtros),
    listarEmpresas(),
    listarEscalasAtivas(),
  ]);

  // Calculado no servidor e passado para baixo: no cliente, o primeiro render
  // poderia cair em outro dia e a hidratacao acusaria a diferenca.
  const hoje = hojeNoPortal();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Funcionarios</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/funcionarios/importar">
              <FileSpreadsheet aria-hidden />
              Importar planilha
            </Link>
          </Button>

          <Button asChild>
            <Link href="/funcionarios/novo">
              <UserPlus aria-hidden />
              Novo funcionario
            </Link>
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        <FiltrosFuncionarios filtros={filtros} empresas={empresas} semEscala={pagina.semEscala} />

        {/*
          A `key` remonta a selecao a cada mudanca de filtro ou de pagina: so o
          checkbox renderizado chega no FormData, e uma selecao que sobrevivesse
          a virada de pagina prometeria atribuir a quem nem esta na tela.
        */}
        <AtribuirEscalaEmLote
          key={`${filtros.busca}|${filtros.empresaId}|${filtros.pendentes}|${pagina.pagina}`}
          funcionarios={pagina.funcionarios}
          escalas={escalas}
          hoje={hoje}
          filtros={filtros}
        />

        <PaginacaoFuncionarios
          filtros={filtros}
          pagina={pagina.pagina}
          paginas={pagina.paginas}
          total={pagina.total}
        />
      </div>
    </div>
  );
}
