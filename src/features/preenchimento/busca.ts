"use server";

import { exigirAcesso } from "@/features/auth/queries";

import { procurarPessoas } from "./procura";
import type { PessoaEncontrada } from "./types";

/**
 * A busca de quem pode ter coberto um dia — a unica leitura do modulo que o
 * **cliente** chama.
 *
 * Arquivo proprio, e nao `queries.ts` nem `actions.ts`: as leituras de
 * `queries.ts` sao `server-only` e so um Server Component as alcanca, e
 * `actions.ts` e o arquivo das escritas. Esta aqui e nem uma coisa nem outra —
 * e um endpoint de leitura, e o `"use server"` e o que o torna chamavel do
 * campo de busca. Como todo endpoint, ela refaz a checagem de acesso: o
 * cadastro inteiro de funcionarios esta do outro lado.
 *
 * **Existe porque a lista nao cabe mais no modal.** Antes as trezentas e tantas
 * pessoas iam junto com a grade e viravam `<option>` a cada abertura; era o
 * grosso do travamento ao abrir o dia. Agora nao vai nenhuma: o campo pergunta
 * quando alguem digita, e sempre com teto (`PESSOAS_POR_BUSCA`).
 */
export async function buscarPessoas(termo: string): Promise<PessoaEncontrada[]> {
  await exigirAcesso("preenchimento");

  return procurarPessoas(termo);
}
