/**
 * Reconhecimento de erros do PostgreSQL.
 *
 * O `pg` expoe o SQLSTATE em `error.code`, mas o Drizzle embrulha a falha em um
 * `DrizzleQueryError` e deixa o erro original em `cause` — e dentro de uma
 * transacao pode haver mais de uma camada. Por isso a checagem percorre a
 * corrente de causas em vez de olhar so o topo: olhar so o topo faz a action
 * cair no erro generico e o usuario perder a mensagem que explicaria o
 * problema.
 */

/** Profundidade suficiente para o embrulho do Drizzle, com folga. */
const LIMITE_DE_CAUSAS = 5;

/**
 * Percorre a corrente de causas ate achar o erro que o `pg` levantou, e devolve
 * o campo pedido dele. E sempre o mesmo erro que interessa, entao procurar por
 * `code` e por `constraint` e a mesma caminhada.
 */
function campoDoErro(erro: unknown, campo: "code" | "constraint"): string | null {
  let atual: unknown = erro;

  for (let nivel = 0; nivel < LIMITE_DE_CAUSAS && atual; nivel += 1) {
    if (typeof atual === "object" && atual !== null) {
      if ("code" in atual && typeof atual.code === "string") {
        const valor = (atual as Record<string, unknown>)[campo];

        return typeof valor === "string" ? valor : null;
      }

      atual = "cause" in atual ? atual.cause : null;
      continue;
    }

    return null;
  }

  return null;
}

function codigoDoErro(erro: unknown): string | null {
  return campoDoErro(erro, "code");
}

/**
 * `23505` — unique_violation. Cobre indice unico e PK, e e o jeito de tratar
 * corrida: entre o SELECT que confere e o INSERT que grava, outra requisicao
 * pode ter gravado o mesmo valor.
 */
export function ehViolacaoDeUnicidade(erro: unknown) {
  return codigoDoErro(erro) === "23505";
}

/**
 * O nome do indice ou da restricao que o banco recusou — `funcionarios_cpf_unico`,
 * `funcionarios_matricula_unica`.
 *
 * Serve a tabela que tem mais de um indice unico: sem saber **qual** deles
 * falhou, a action so poderia dizer "ja existe" sem dizer o que ja existe, e a
 * mensagem cairia no campo errado do formulario.
 *
 * `null` quando o erro nao veio do Postgres ou nao nomeia restricao alguma —
 * quem chama trata isso como "nao sei qual foi" e cai na mensagem generica.
 */
export function restricaoViolada(erro: unknown) {
  return campoDoErro(erro, "constraint");
}
