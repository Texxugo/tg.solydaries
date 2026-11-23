"use server";

import { exigirAcesso } from "@/features/auth/queries";
import { procurarPessoas } from "@/features/preenchimento/procura";
import type { PessoaEncontrada } from "@/features/preenchimento/types";

import { AREA_MOVIMENTACOES } from "./types";

/**
 * A busca dos campos de pessoa do modal da movimentacao: funcionarios e
 * freelancers ativos, com a checagem de acesso **desta** area.
 *
 * Mesma consulta de `buscarPessoas()` (preenchimento), por `procurarPessoas()`;
 * so a area exigida muda — quem registra movimentacoes nao precisa ter acesso
 * a grade para escolher quem faltou.
 */
export async function buscarPessoasDaMovimentacao(termo: string): Promise<PessoaEncontrada[]> {
  await exigirAcesso(AREA_MOVIMENTACOES);

  return procurarPessoas(termo);
}
