import type { EventoNatureza } from "@/db/schema";
import { duracaoEmMinutos } from "@/features/escalas/jornada";
import { agruparEmJornadas, jornadasPorDia } from "@/features/ponto/jornadas";

import { naturezaDoRealizado, type NaturezaContada } from "./grade";

/**
 * O que o relogio de ponto diz sobre os dias da grade — lido ao lado da
 * escala, e nunca usado para preenche-la.
 *
 * Modulo puro (so `import type` do schema): a DAL atribui as batidas a cada
 * turno, e a grade e o modal decidem o sinal com a celula **atual**, inclusive a
 * que acabou de ser gravada nesta sessao.
 *
 * Duas coisas separam esta leitura da apuracao do ponto, e as duas sao de
 * proposito:
 *
 * - **O sinal compara as batidas com o que a grade diz**, e nao com a escala
 *   cadastrada do funcionario. A apuracao le a marcacao contra o cadastro de
 *   Escalas; a grade tem o proprio previsto (o contrato do posto) e o proprio
 *   realizado. Levar para ca o "falta" da apuracao faria as duas telas se
 *   contradizerem num dia em que a grade mostra folga.
 * - **Nada aqui e gravado.** Como a apuracao, e leitura cruzada a cada
 *   abertura: importar o arquivo seguinte ou corrigir um dia muda o sinal sem
 *   uma linha reescrita.
 */

/** Uma batida como o relogio a registrou. */
export type BatidaDoRelogio = {
  /** `HH:MM`. */
  hora: string;
  /** Digitada no sistema de ponto, e nao batida no relogio. */
  incluida: boolean;
};

/** Uma batida dentro do turno a que pertence. */
export type BatidaDoTurno = BatidaDoRelogio & {
  /**
   * Registrada no dia seguinte: a saida de um turno que vira a meia-noite. O
   * relogio a grava na data em que aconteceu, e a grade a devolve ao turno.
   */
  diaSeguinte: boolean;
};

/** Os dias que os arquivos de ponto cobrem — fora dela, ausencia de batida nao diz nada. */
export type JanelaDoRelogio = { inicio: string; fim: string };

type Turno = { entrada: string; saida: string };

/**
 * As batidas de uma pessoa, uma lista por dia de **turno** — e nao por dia do
 * calendario.
 *
 * O agrupamento e o da apuracao do ponto (`agruparEmJornadas`): as batidas em
 * ordem, 8h ou mais sem batida comeca outra jornada, e a jornada pertence a
 * data da entrada. Sem isso, o 18:00-06:00 de um 12x36 poria o 06:00 no dia de
 * folga, e a grade acusaria "bateu ponto na folga" um dia sim, um dia nao.
 *
 * O primeiro dia da janela segue a mesma regra, e nao um corte pelo horario: a
 * vespera vem junto (a DAL carrega o dia anterior ao inicio), e a jornada que
 * comecou nela fica fora da grade inteira. Sem batida na vespera, a sobra do
 * plantao noturno que chega no dia 21 (as 06:00) e uma jornada sem entrada, e
 * `jornadasPorDia()` a devolve a vespera, como no meio do periodo — contra o
 * turno de `referenciaDoDia` do primeiro dia, porque a vespera nem sempre esta
 * na grade. O corte antigo ("tudo antes da entrada") levava junto a entrada das
 * 17:55 do proprio dia 21. `referenciaDoDia` diz de onde sai o horario (a
 * vigencia da funcao, ou a escala cadastrada quando a linha escreve outra
 * sigla); `null` e "nao se sabe", e entao a cauda nao e reconhecida.
 */
export function atribuirBatidas({
  dias,
  janela,
  batidasPorData,
  referenciaDoDia,
}: {
  dias: readonly string[];
  janela: JanelaDoRelogio | null;
  /** Em ordem de hora dentro de cada data. Pode trazer o dia seguinte ao ultimo. */
  batidasPorData: ReadonlyMap<string, readonly BatidaDoRelogio[]> | undefined;
  referenciaDoDia: (data: string) => Turno | null;
}): Record<string, BatidaDoTurno[]> {
  const turnos: Record<string, BatidaDoTurno[]> = {};

  if (!janela || !batidasPorData) {
    return turnos;
  }

  const naGrade = new Set(dias);
  const turnoDoDia = (data: string) => referenciaDoDia(data < janela.inicio ? janela.inicio : data);

  const porDia = jornadasPorDia(agruparEmJornadas(batidasPorData, { turnoDoDia }), turnoDoDia);

  for (const [data, doDia] of porDia) {
    if (data < janela.inicio || data > janela.fim || !naGrade.has(data)) {
      continue;
    }

    turnos[data] = doDia.flatMap((jornada) =>
      jornada.batidas.map(({ hora, incluida, diaSeguinte }) => ({ hora, incluida, diaSeguinte })),
    );
  }

  return turnos;
}

/**
 * Minutos trabalhados num turno: a soma dos pares entrada/saida, virada da
 * meia-noite incluida. `null` quando as batidas nao se pareiam — somar um dia
 * mal pareado daria um numero que parece certo e nao e.
 */
export function minutosTrabalhados(batidas: readonly BatidaDoRelogio[]) {
  if (batidas.length === 0 || batidas.length % 2 !== 0) {
    return null;
  }

  let total = 0;

  for (let indice = 0; indice < batidas.length; indice += 2) {
    total += duracaoEmMinutos(batidas[indice].hora, batidas[indice + 1].hora);
  }

  return total;
}

/**
 * Quando a grade e o relogio discordam num dia.
 *
 * - `batida_sem_registro`: houve batida e o realizado esta em branco — a pessoa
 *   trabalhou e o dia ainda nao foi preenchido;
 * - `trabalho_sem_batida`: o realizado diz trabalho e o relogio nao tem batida —
 *   falta nao lancada, cobertura nao registrada ou ponto esquecido;
 * - `batida_em_ausencia`: o realizado diz folga, falta ou afastamento e houve
 *   batida — um dos dois esta errado.
 */
export type SinalDoRelogio = "batida_sem_registro" | "trabalho_sem_batida" | "batida_em_ausencia";

const ROTULOS: Record<SinalDoRelogio, string> = {
  batida_sem_registro: "O relogio tem batida e o dia esta em branco",
  trabalho_sem_batida: "O dia diz trabalho e o relogio nao tem batida",
  batida_em_ausencia: "O dia diz folga, falta ou afastamento e o relogio tem batida",
};

export function rotuloDoSinal(sinal: SinalDoRelogio) {
  return ROTULOS[sinal];
}

/**
 * O sinal de um dia, ou `null` quando a grade e o relogio nao discordam — ou
 * quando o relogio nao tem o que dizer.
 *
 * Fora da janela importada nao ha sinal nenhum: depois do ultimo arquivo, "sem
 * batida" e "ainda nao importado", e nao ausencia. Mesma regra da
 * `janelaApurada()` do ponto.
 *
 * Dia com contraparte nao acusa trabalho sem batida: a substituicao ou a troca
 * de turno dizem que **outra** pessoa cobriu o turno, e o dono da linha pode nao
 * ter batido ponto nenhum. A troca interna e o contrario — o colega nomeado e com
 * quem se trocou, e quem trabalhou foi o dono da linha —, e por isso
 * `celulaParaSinal()` nao a conta como contraparte. E celula sem sigla (so
 * horario ou bilhete) nao diz o que o dia foi, entao tambem nao contradiz nada.
 */
export function sinalDoDia({
  data,
  janela,
  batidas,
  celula,
}: {
  data: string;
  janela: JanelaDoRelogio | null;
  batidas: readonly BatidaDoRelogio[];
  celula: CelulaParaSinal | null;
}): SinalDoRelogio | null {
  if (!janela || data < janela.inicio || data > janela.fim) {
    return null;
  }

  const bateu = batidas.length > 0;

  if (!celula) {
    return bateu ? "batida_sem_registro" : null;
  }

  if (celula.natureza === "trabalho") {
    return !bateu && !celula.temContraparte ? "trabalho_sem_batida" : null;
  }

  if (
    celula.natureza === "folga" ||
    celula.natureza === "falta" ||
    celula.natureza === "afastamento"
  ) {
    return bateu ? "batida_em_ausencia" : null;
  }

  return null;
}

export type CelulaParaSinal = { natureza: NaturezaContada | null; temContraparte: boolean };

/**
 * A celula como o sinal a le: com a natureza que o dia conta (a troca resolvida
 * pelo previsto) e a contraparte que de fato cobriu o turno. A grade e o modal
 * chamam esta mesma funcao, senao o ponto da celula e o do modal divergiriam.
 */
export function celulaParaSinal(
  natureza: EventoNatureza | null,
  prevista: EventoNatureza | null,
  temPessoa: boolean,
): CelulaParaSinal {
  return {
    natureza: naturezaDoRealizado(natureza, prevista),
    temContraparte: temPessoa && natureza !== "troca",
  };
}

/** O que o modal do dia sabe do relogio. */
export type RelogioDoDia =
  | { situacao: "sem_carga" }
  | { situacao: "freelancer" }
  | { situacao: "fora_da_janela"; janela: JanelaDoRelogio }
  | { situacao: "apurado"; janela: JanelaDoRelogio; batidas: readonly BatidaDoTurno[] };
