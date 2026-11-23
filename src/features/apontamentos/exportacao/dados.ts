import "server-only";

import { and, asc, eq, isNotNull } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import {
  apontamentos,
  empresas,
  funcionarios,
  funcoesPosto,
  postos,
  preenchimentoLinhas,
  usuarios,
} from "@/db/schema";
import { competenciaEmVigor } from "@/features/competencias/queries";

import { recorteDaBusca } from "../queries";
import type { FiltrosDeApontamentos } from "../types";
import type { ApontamentoExportado } from "./tipos";

/**
 * Os apontamentos da competencia em vigor, com o que as exportacoes mostram de
 * cada pessoa.
 *
 * Parte de `apontamentos`, ao contrario da lista: o arquivo e dos **apontados**
 * — quem esta sem apontamento nao tem linha a exportar, e uma planilha com
 * trezentas linhas vazias so atrapalharia a importacao na folha. Inativos com
 * apontamento entram: quem saiu no meio do periodo ainda tem o que receber.
 *
 * Sem paginacao: o arquivo e o recorte inteiro, e o tamanho e limitado pelo
 * cadastro.
 */
export async function listarApontamentosParaExportar(
  filtros: Pick<FiltrosDeApontamentos, "busca" | "empresaId">,
): Promise<ApontamentoExportado[]> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return [];
  }

  const competenciaId = vigor.competencia.id;

  const [linhas, escalados] = await Promise.all([
    db
      .select({
        funcionarioId: funcionarios.id,
        matricula: funcionarios.matricula,
        nome: funcionarios.nome,
        empresa: empresas.nome,
        cargo: funcionarios.cargo,
        ativo: funcionarios.ativo,
        vtDias: apontamentos.vtDias,
        vrDias: apontamentos.vrDias,
        cestaBasica: apontamentos.cestaBasica,
        he50Minutos: apontamentos.he50Minutos,
        he60Minutos: apontamentos.he60Minutos,
        he100Minutos: apontamentos.he100Minutos,
        adicionalNoturnoMinutos: apontamentos.adicionalNoturnoMinutos,
        intrajornadaMinutos: apontamentos.intrajornadaMinutos,
        insalubridade: apontamentos.insalubridade,
        periculosidade: apontamentos.periculosidade,
        assiduidade: apontamentos.assiduidade,
        gratificacaoPercentual: apontamentos.gratificacaoPercentual,
        faltasEscala: apontamentos.faltasEscala,
        faltasFolga: apontamentos.faltasFolga,
        dsrDescontados: apontamentos.dsrDescontados,
        observacao: apontamentos.observacao,
        atualizadoEm: apontamentos.atualizadoEm,
        atualizadoPor: usuarios.nome,
      })
      .from(apontamentos)
      .innerJoin(funcionarios, eq(funcionarios.id, apontamentos.funcionarioId))
      .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
      .leftJoin(usuarios, eq(usuarios.id, apontamentos.atualizadoPorId))
      .where(and(eq(apontamentos.competenciaId, competenciaId), recorteDaBusca(filtros)))
      // O CPF desempata homonimos: o arquivo sai na mesma ordem toda vez.
      .orderBy(asc(funcionarios.nome), asc(funcionarios.cpf)),
    /**
     * O posto de cada pessoa sai da grade da competencia, e nao do cadastro —
     * o funcionario nao tem posto: ele e escalado numa funcao de um posto a
     * cada periodo, e pode estar em mais de um (troca de posto no meio do mes).
     * A competencia inteira numa consulta so, e nao uma por pessoa.
     */
    db
      .selectDistinct({
        funcionarioId: preenchimentoLinhas.funcionarioId,
        codigo: postos.codigo,
        nome: postos.nome,
      })
      .from(preenchimentoLinhas)
      .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
      .innerJoin(postos, eq(postos.id, funcoesPosto.postoId))
      .where(
        and(
          eq(preenchimentoLinhas.competenciaId, competenciaId),
          isNotNull(preenchimentoLinhas.funcionarioId),
        ),
      )
      .orderBy(asc(postos.codigo)),
  ]);

  const postosPorPessoa = new Map<string, string[]>();

  for (const escalado of escalados) {
    if (!escalado.funcionarioId) {
      continue;
    }

    const daPessoa = postosPorPessoa.get(escalado.funcionarioId) ?? [];
    daPessoa.push(`${escalado.codigo} - ${escalado.nome}`);
    postosPorPessoa.set(escalado.funcionarioId, daPessoa);
  }

  return linhas.map(
    ({ funcionarioId, matricula, nome, empresa, cargo, ativo, atualizadoPor, ...apontamento }) => ({
      matricula,
      nome,
      empresa,
      cargo,
      ativo,
      postos: postosPorPessoa.get(funcionarioId) ?? [],
      apontamento: { ...apontamento, atualizadoPor },
    }),
  );
}
