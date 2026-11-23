import "server-only";

import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { freelancers, funcionarios } from "@/db/schema";

import { PESSOAS_POR_BUSCA, TERMO_MINIMO, type PessoaEncontrada } from "./types";

/**
 * A consulta por tras das buscas de pessoa (funcionarios e freelancers ativos),
 * **sem** checagem de acesso.
 *
 * Fica separada das Server Actions que a expoem porque cada uma exige a area da
 * propria tela: `buscarPessoas()` a do preenchimento, e a busca das
 * movimentacoes a dela. A consulta e a mesma, e duas copias divergiriam no
 * primeiro ajuste de teto ou de ordenacao. `server-only`: nunca e chamavel do
 * cliente sem passar por uma delas.
 */
export async function procurarPessoas(termo: string): Promise<PessoaEncontrada[]> {
  const limpo = termo.trim();

  /*
    Termo curto nao vai ao banco.

    Uma letra casaria com quase todo o cadastro para devolver vinte nomes
    arbitrarios — o teto esconderia o resultado em vez de recorta-lo. Quem
    digitou uma letra ainda esta digitando.
  */
  if (limpo.length < TERMO_MINIMO) {
    return [];
  }

  // Mesmo escape de `listarEscalas`: sem ele, buscar "%" traria a tabela
  // inteira, que e exatamente o que este caminho existe para evitar.
  const padrao = `%${limpo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`;

  /*
    Duas consultas, e nao um `union` em SQL: as duas tabelas nao tem as mesmas
    colunas nem a mesma nocao de identificacao (matricula contra codigo), e
    unifica-las no banco custaria um `cast` a cada lado para o Drizzle devolver
    o mesmo tipo. Sao duas idas de indice, e saem juntas.

    O teto vale para **cada** origem e de novo para o total: sem o primeiro, um
    cadastro grande de freelancers empurraria os funcionarios para fora do
    recorte final.
  */
  const [daFolha, avulsos] = await Promise.all([
    db
      .select({
        id: funcionarios.id,
        nome: funcionarios.nome,
        identificacao: funcionarios.matricula,
      })
      .from(funcionarios)
      .where(
        and(
          eq(funcionarios.ativo, true),
          or(ilike(funcionarios.nome, padrao), ilike(funcionarios.matricula, padrao)),
        ),
      )
      .orderBy(asc(sql`lower(${funcionarios.nome})`))
      .limit(PESSOAS_POR_BUSCA),

    db
      .select({ id: freelancers.id, nome: freelancers.nome, identificacao: freelancers.codigo })
      .from(freelancers)
      .where(
        and(
          eq(freelancers.ativo, true),
          or(ilike(freelancers.nome, padrao), ilike(freelancers.codigo, padrao)),
        ),
      )
      .orderBy(asc(sql`lower(${freelancers.nome})`))
      .limit(PESSOAS_POR_BUSCA),
  ]);

  /*
    As duas origens voltam numa lista so, ordenada pelo nome: quem procura
    "joao" nao sabe (nem precisa saber) de que tabela ele vem. O tipo vai
    embutido no `valor` (`f:` e `l:`), que e o que o formulario grava — mesmo
    par de prefixos do campo de colaborador das horas extras.
  */
  return [
    ...daFolha.map((pessoa) => ({
      valor: `f:${pessoa.id}`,
      nome: pessoa.nome,
      identificacao: pessoa.identificacao,
      freelancer: false,
    })),
    ...avulsos.map((pessoa) => ({
      valor: `l:${pessoa.id}`,
      nome: pessoa.nome,
      identificacao: pessoa.identificacao,
      freelancer: true,
    })),
  ]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, PESSOAS_POR_BUSCA);
}
