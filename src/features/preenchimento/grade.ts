import type { EventoNatureza } from "@/db/schema";

/**
 * Leitura da grade: os dias da competencia, a chave de uma celula e o que se
 * soma no fim da linha.
 *
 * Modulo puro de proposito (so `import type` do schema, apagado na compilacao):
 * e consumido pela DAL, pela pagina e pelos componentes do lado do cliente, e
 * nenhum dos tres deve arrastar o Drizzle nem o React para o outro lado — mesma
 * regra de `escalas/jornada.ts` e `competencias/periodo.ts`.
 *
 * Datas entram e saem como `YYYY-MM-DD` e horas como `HH:MM`, do jeito que o
 * Postgres devolve `date` e `time`. Nada aqui constroi um `Date` a partir de uma
 * hora solta: hora de escala nao tem dia a que pertencer.
 */

const MS_DO_DIA = 24 * 60 * 60 * 1000;

/**
 * Os dias da competencia, do primeiro ao ultimo — as colunas da grade.
 *
 * A conta e feita inteira em UTC, pelo mesmo motivo de `diaSeguinte()` em
 * `periodo.ts`: em fuso negativo, `new Date("2026-08-21")` lido no fuso local
 * cairia no dia 20 e a grade comecaria um dia antes do periodo.
 *
 * O teto existe porque o resultado vira uma coluna de tabela por dia: uma
 * competencia digitada errado (2026 a 2027) travaria a tela em vez de mostrar o
 * erro na de competencias.
 */
export function diasDoPeriodo(dataInicio: string, dataFim: string, maximo = 62): string[] {
  const inicio = Date.parse(`${dataInicio}T00:00:00Z`);
  const fim = Date.parse(`${dataFim}T00:00:00Z`);

  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) {
    return [];
  }

  const total = Math.min(Math.round((fim - inicio) / MS_DO_DIA) + 1, maximo);

  return Array.from({ length: total }, (_, indice) =>
    new Date(inicio + indice * MS_DO_DIA).toISOString().slice(0, 10),
  );
}

/** `21` — o numero do dia, que e o que o cabecalho da grade mostra. */
export function diaDoMes(data: string) {
  return String(Number(data.slice(8, 10)));
}

/** `true` no sabado e no domingo, para a coluna do fim de semana se destacar. */
export function ehFimDeSemana(data: string) {
  const dia = new Date(`${data}T00:00:00Z`).getUTCDay();

  return dia === 0 || dia === 6;
}

/** A chave de um dia do realizado: e por ela que o mapa das celulas indexa. */
export function chaveDaCelula(linhaId: string, data: string) {
  return `${linhaId}:${data}`;
}

/** A natureza com que um dia conta: a `troca` sempre vira trabalho ou folga. */
export type NaturezaContada = Exclude<EventoNatureza, "troca">;

/**
 * Como o dia do realizado conta, sabendo o que o previsto dizia.
 *
 * A `troca` (TI) **inverte o previsto**: na folga prevista a pessoa trabalhou
 * cobrindo o colega, e no dia de trabalho previsto ela folgou porque o colega a
 * cobriu. A mesma sigla nos dois dias, e o previsto decide — por isso a natureza
 * nao e gravada na celula. Sem previsto (funcao sem vigencia) nao ha o que
 * inverter, e o dia conta como `outro`: chamar de trabalho ou de folga seria
 * adivinhar.
 */
export function naturezaDoRealizado(
  natureza: EventoNatureza | null,
  prevista: EventoNatureza | null,
): NaturezaContada | null {
  if (natureza !== "troca") {
    return natureza;
  }

  if (prevista === "trabalho") {
    return "folga";
  }

  return prevista === "folga" ? "trabalho" : "outro";
}

/**
 * Os dias que uma TE apontou como trabalhados — a folga em que a pessoa
 * trabalhou no lugar do dia em que folgou.
 *
 * O dia apontado nao tem celula propria (a coluna mora na celula da TE), entao
 * quem conta precisa perguntar a esta lista antes de olhar a celula do dia.
 */
export function diasTrabalhadosPorTroca(
  celulas: Iterable<{ dataTrabalhada: string | null } | null | undefined>,
): Set<string> {
  const dias = new Set<string>();

  for (const celula of celulas) {
    if (celula?.dataTrabalhada) {
      dias.add(celula.dataTrabalhada);
    }
  }

  return dias;
}

/**
 * Como um dia conta, juntando as duas leituras: o dia apontado por uma TE e
 * trabalho, seja o que for que a celula dele diga (a action so deixa ali um
 * bilhete ou a intrajornada); os demais contam pela propria celula, com a
 * troca resolvida pelo previsto.
 */
export function naturezaContadaDoDia(
  natureza: EventoNatureza | null,
  prevista: EventoNatureza | null,
  trabalhadoPorTroca: boolean,
): NaturezaContada | null {
  return trabalhadoPorTroca ? "trabalho" : naturezaDoRealizado(natureza, prevista);
}

/**
 * Quem e a contraparte de um dia, no formato que o `<select>` do modal usa.
 *
 * Um campo so, com o tipo embutido (`f:` funcionario, `l:` freelancer), em vez
 * de dois selects que a tela teria de combinar: as duas listas nunca sao
 * escolhidas ao mesmo tempo, e o `check preenchimento_dias_uma_pessoa` diz
 * exatamente isso no banco.
 */
export function valorDaPessoa(funcionarioId: string | null, freelancerId: string | null) {
  if (funcionarioId) {
    return `f:${funcionarioId}`;
  }

  return freelancerId ? `l:${freelancerId}` : "";
}

export type PessoaEscolhida = { funcionarioId: string | null; freelancerId: string | null };

/** O inverso de `valorDaPessoa`. `null` para valor que nao e de pessoa. */
export function lerPessoaEscolhida(valor: string): PessoaEscolhida | null {
  const limpo = valor.trim();

  if (!limpo) {
    return { funcionarioId: null, freelancerId: null };
  }

  const tipo = limpo.slice(0, 2);
  const id = limpo.slice(2);

  if (tipo === "f:") {
    return { funcionarioId: id, freelancerId: null };
  }

  if (tipo === "l:") {
    return { funcionarioId: null, freelancerId: id };
  }

  return null;
}
