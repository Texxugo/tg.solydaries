"use server";

import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { funcionarios } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import {
  PESSOAS_POR_BUSCA,
  TERMO_MINIMO,
  type PessoaEncontrada,
} from "@/features/preenchimento/types";

import { AREA_POSTOS } from "./types";

/**
 * A busca de funcionario da aba Responsavel do posto — o responsavel e os
 * membros do grupo de contato.
 *
 * Irma de `buscarPessoas()` (em `preenchimento/busca.ts`), e nao a mesma: aquela
 * exige a area de preenchimento e traz freelancers, e o grupo de contato e so de
 * quem esta na folha. Mesmo teto, mesmo termo minimo e mesmo formato de
 * resposta, para servir ao mesmo `CampoPessoa`.
 */
export async function buscarFuncionarios(termo: string): Promise<PessoaEncontrada[]> {
  await exigirAcesso(AREA_POSTOS);

  const limpo = termo.trim();

  if (limpo.length < TERMO_MINIMO) {
    return [];
  }

  // Mesmo escape de `buscarPessoas()`: sem ele, buscar "%" traria a tabela inteira.
  const padrao = `%${limpo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`;

  const encontrados = await db
    .select({ id: funcionarios.id, nome: funcionarios.nome, matricula: funcionarios.matricula })
    .from(funcionarios)
    .where(
      and(
        eq(funcionarios.ativo, true),
        or(ilike(funcionarios.nome, padrao), ilike(funcionarios.matricula, padrao)),
      ),
    )
    .orderBy(asc(sql`lower(${funcionarios.nome})`))
    .limit(PESSOAS_POR_BUSCA);

  return encontrados.map((pessoa) => ({
    valor: `f:${pessoa.id}`,
    nome: pessoa.nome,
    identificacao: pessoa.matricula,
    freelancer: false,
  }));
}
