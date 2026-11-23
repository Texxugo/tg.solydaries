/**
 * Quem fez o extra, no formato em que um campo so consegue carregar duas
 * origens.
 *
 * Modulo puro de proposito (nenhum import): e lido pelo formulario (client),
 * pela action e pela DAL, e nenhum dos tres deve arrastar o Drizzle nem o React
 * para o outro lado — mesma regra de `competencias/periodo.ts`.
 *
 * O prefixo e o mesmo que o modal do dia da grade ja usa (`f:` funcionario,
 * `l:` freelancer): sao as duas origens de pessoa do portal, e escrever o par
 * de duas formas diferentes so criaria a chance de uma tela ler a outra errado.
 */

const FUNCIONARIO = "f:";
const FREELANCER = "l:";

export type ColaboradorEscolhido =
  { tipo: "funcionario"; id: string } | { tipo: "freelancer"; id: string };

/** O valor que o campo posta, a partir do id de cada origem. */
export function valorDoFuncionario(id: string) {
  return `${FUNCIONARIO}${id}`;
}

export function valorDoFreelancer(id: string) {
  return `${FREELANCER}${id}`;
}

/** Aceita so o que o campo produz — `null` para qualquer outra coisa. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le o valor postado. `null` quando o texto nao e um dos dois formatos: campo
 * vazio, prefixo desconhecido ou id que nem uuid e — os tres significam "nao
 * escolheu ninguem", e nao um erro a lancar.
 */
export function lerColaborador(valor: string): ColaboradorEscolhido | null {
  const prefixo = valor.slice(0, 2);
  const id = valor.slice(2);

  if (!ID.test(id)) {
    return null;
  }

  if (prefixo === FUNCIONARIO) {
    return { tipo: "funcionario", id };
  }

  if (prefixo === FREELANCER) {
    return { tipo: "freelancer", id };
  }

  return null;
}
