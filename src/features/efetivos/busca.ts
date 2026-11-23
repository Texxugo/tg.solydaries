"use server";

import { exigirAcesso } from "@/features/auth/queries";
import { procurarPessoas } from "@/features/preenchimento/procura";
import type { PessoaEncontrada } from "@/features/preenchimento/types";

import { AREA_EFETIVOS } from "./types";

/**
 * A busca de pessoa do lancamento, com o acesso desta area.
 *
 * A consulta e a mesma das outras buscas de pessoa (`procurarPessoas()`):
 * funcionarios e freelancers ativos, por nome, matricula ou codigo. Quem lanca
 * efetivo nao precisa ter a area de preenchimento para achar ninguem.
 */
export async function buscarPessoasDoEfetivo(termo: string): Promise<PessoaEncontrada[]> {
  await exigirAcesso(AREA_EFETIVOS);

  return procurarPessoas(termo);
}
