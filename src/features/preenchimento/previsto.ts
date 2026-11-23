import type { EventoCor, FuncaoTurma } from "@/db/schema";
import { formatarData } from "@/features/competencias/periodo";
import {
  duracaoEmMinutos,
  ehDiaTrabalhado,
  rotuloDoCiclo,
  type Ciclo,
} from "@/features/escalas/jornada";

import type { PrevistoDoDia } from "./types";

/**
 * O previsto da grade: o que o **contrato do posto** exige em cada dia.
 *
 * Modulo puro (so `import type` do schema, apagado na compilacao), consumido
 * pela DAL e pelas telas.
 *
 * O ciclo e o horario sao da **funcao**, e nao da escala cadastrada de quem
 * cobre o posto: se a Portaria Remota e 4x2 por contrato, o previsto dela e 4x2
 * seja quem for que a cubra neste mes. A pessoa alocada muda; a exigencia do
 * posto, nao — e e por isso que o modulo de Escalas nao aparece aqui.
 *
 * Duas coisas se somam a isso:
 *
 * - **vigencia**: a exigencia muda no meio do periodo ("12x36 ate 27/08, 4x2 a
 *   partir de 28/08"), entao a funcao guarda uma configuracao por data de
 *   inicio, e nao uma so;
 * - **turma**: o mesmo posto tem escala e contraescala, cada uma com o proprio
 *   ciclo e as proprias vigencias, e cada pessoa segue uma das duas.
 *
 * A conta em si (`ehDiaTrabalhado`) continua vindo de `escalas/jornada.ts`: e
 * um modulo puro, e "de quantos em quantos dias o padrao se repete" e a mesma
 * aritmetica nos dois lugares. O vinculo que caiu e com o **cadastro** de
 * escalas, e nao com a matematica de ciclo.
 */

/** Uma configuracao de ciclo valendo a partir de uma data. */
export type VigenciaDoCiclo = {
  id: string;
  turma: FuncaoTurma;
  /** `null` = vale desde sempre, ate a proxima vigencia desta turma comecar. */
  vigenciaInicio: string | null;
  diasCiclo: number;
  /** Posicoes de folga dentro do ciclo, contando de 1. */
  folgas: readonly number[];
  /** `HH:MM` — o horario que o previsto carrega. */
  entrada: string;
  saida: string;
  /** Onde a posicao 1 cai. `null` = no inicio da vigencia. */
  inicioCiclo: string | null;
};

/**
 * A ordem em que as vigencias de uma turma se leem: a inicial primeiro, depois
 * por data de inicio.
 *
 * A comparacao trata `null` como "antes de tudo" — e o que "desde sempre"
 * significa. Ordenar aqui, e nao so no SQL, e o que permite `vigenciaDoDia()`
 * confiar na ordem venha a lista de onde vier.
 */
export function ordenarVigencias(vigencias: readonly VigenciaDoCiclo[]): VigenciaDoCiclo[] {
  return [...vigencias].sort((a, b) =>
    (a.vigenciaInicio ?? "").localeCompare(b.vigenciaInicio ?? ""),
  );
}

/**
 * Qual configuracao vale naquele dia — a ultima que ja tinha comecado.
 *
 * `null` quando nenhuma comecou ainda: o dia fica sem previsto, e nao herda a
 * configuracao seguinte. Uma escala que passa a valer em 28/08 nao diz nada
 * sobre o dia 21 — inventar que dizia seria escrever no passado do posto.
 */
export function vigenciaDoDia(
  data: string,
  vigencias: readonly VigenciaDoCiclo[],
): VigenciaDoCiclo | null {
  let vigente: VigenciaDoCiclo | null = null;

  for (const vigencia of ordenarVigencias(vigencias)) {
    if (vigencia.vigenciaInicio === null || vigencia.vigenciaInicio <= data) {
      vigente = vigencia;
    }
  }

  return vigente;
}

/**
 * Onde a **posicao 1** do ciclo cai, para uma vigencia.
 *
 * Tres origens, nesta ordem: a ancora declarada, o inicio da vigencia e — so
 * quando a vigencia e a inicial, sem data — o primeiro dia do periodo. A ancora
 * explicita existe porque a troca de contrato costuma cair no meio da semana: um
 * 5x2 que passa a valer numa quarta continua ancorando na segunda.
 */
export function ancoraDaVigencia(vigencia: VigenciaDoCiclo, primeiroDiaDoPeriodo: string) {
  return vigencia.inicioCiclo ?? vigencia.vigenciaInicio ?? primeiroDiaDoPeriodo;
}

/**
 * Se o contrato preve trabalho naquele dia, dada a ancora do ciclo.
 *
 * O padrao vale **para tras** tambem: o dia anterior a ancora e a ultima
 * posicao do ciclo, e nao um dia sem regra. E o que faz um 5x2 ancorado na
 * segunda ja mostrar o sabado e o domingo anteriores como folga.
 */
export function preveTrabalho(data: string, ancora: string, ciclo: VigenciaDoCiclo) {
  return ehDiaTrabalhado(data, ancora, ciclo as Ciclo);
}

/**
 * Como o ciclo se chama.
 *
 * Um ciclo de 2 dias com uma folga e o que `escalas` chama de "1x1" — e o que a
 * operacao chama de **12x36**, porque o que ela conta ali sao horas, e nao dias.
 * Os dois numeros saem da propria jornada (12 trabalhadas, 36 ate a proxima
 * entrada), entao nao e apelido inventado: e a mesma escala dita na unidade em
 * que ela e contratada. Fora desse formato, o rotulo continua sendo o de dias.
 *
 * Em `escalas` esse apelido vive no campo `nome`; aqui nao ha nome a preencher,
 * e obrigar a digitar "12x36" ao lado de um ciclo que ja diz isso seria pedir a
 * mesma informacao duas vezes.
 */
function rotuloDoPadrao(vigencia: VigenciaDoCiclo) {
  const horas = duracaoEmMinutos(vigencia.entrada, vigencia.saida) / 60;
  const umDiaSim = vigencia.diasCiclo === 2 && vigencia.folgas.length === 1;

  return umDiaSim && Number.isInteger(horas)
    ? `${horas}x${48 - horas}`
    : rotuloDoCiclo(vigencia as Ciclo);
}

/** "4x2 · 06:00-18:00" — uma vigencia em uma linha. */
export function rotuloDaVigencia(vigencia: VigenciaDoCiclo) {
  return `${rotuloDoPadrao(vigencia)} · ${vigencia.entrada}-${vigencia.saida}`;
}

/**
 * O contrato de uma turma inteiro, numa linha:
 * `12x36 · 06:00-18:00 → 4x2 · 06:00-18:00 desde 28/08`.
 *
 * Uma vigencia so sai sem data — dizer "desde sempre" ao lado de toda funcao que
 * nunca trocou de escala seria ruido em quase toda a tela.
 */
export function rotuloDasVigencias(vigencias: readonly VigenciaDoCiclo[]) {
  const ordenadas = ordenarVigencias(vigencias);

  if (ordenadas.length === 0) {
    return null;
  }

  return ordenadas
    .map((vigencia) =>
      vigencia.vigenciaInicio
        ? `${rotuloDaVigencia(vigencia)} desde ${formatarData(vigencia.vigenciaInicio)}`
        : rotuloDaVigencia(vigencia),
    )
    .join(" → ");
}

/**
 * As posicoes de folga como o formulario as manda: "2", "6 7", "7,13".
 *
 * Aceita virgula, espaco e ponto-e-virgula porque quem digita "6,7" e quem
 * digita "6 7" quis a mesma coisa, e recusar por causa do separador seria
 * cobrar um formato que a tela nao explicou. Fora do ciclo, repetida ou nao
 * numerica e recusa — cada uma tem consequencia direta no previsto do mes.
 */
export function lerFolgas(texto: string, diasCiclo: number): number[] | null {
  const partes = texto
    .split(/[\s,;]+/)
    .map((parte) => parte.trim())
    .filter(Boolean);

  const folgas = new Set<number>();

  for (const parte of partes) {
    if (!/^\d{1,2}$/.test(parte)) {
      return null;
    }

    const dia = Number(parte);

    if (dia < 1 || dia > diasCiclo) {
      return null;
    }

    folgas.add(dia);
  }

  // Ciclo sem nenhum dia de trabalho nao e escala de coisa nenhuma: o previsto
  // sairia com folga nos trinta e um dias. Mesmo `check` do banco.
  if (folgas.size >= diasCiclo) {
    return null;
  }

  return [...folgas].sort((a, b) => a - b);
}

/** O inverso de `lerFolgas`, para o campo voltar preenchido: `6 7`. */
export function formatarFolgas(folgas: readonly number[]) {
  return folgas.join(" ");
}

/** O que o contrato de uma turma diz de um dia, sem sigla: so trabalho ou folga. */
export type DiaDaTurma = {
  data: string;
  /** A vigencia que vale no dia. `null` antes da primeira: o dia fica sem previsto. */
  vigencia: VigenciaDoCiclo | null;
  trabalho: boolean;
};

/**
 * Os dias de uma turma num intervalo — a mesma conta de `derivarPrevisto()`,
 * sem as siglas. E o que o cadastro do posto desenha para o contrato se ler em
 * dias ("trabalha 21, 23, 25...") e nao so em "12x36 desde 21/09".
 */
export function diasDaTurma(
  vigenciasDaTurma: readonly VigenciaDoCiclo[],
  dias: readonly string[],
  primeiroDia: string,
): DiaDaTurma[] {
  return dias.map((data) => {
    const vigencia = vigenciaDoDia(data, vigenciasDaTurma);

    return {
      data,
      vigencia,
      trabalho: vigencia
        ? preveTrabalho(data, ancoraDaVigencia(vigencia, primeiroDia), vigencia)
        : false,
    };
  });
}

/** Uma sigla que o previsto escreve, ja com a cor da celula. */
export type SiglaDoPrevisto = { codigo: string; cor: EventoCor };

/** As duas siglas que o previsto de uma funcao escreve. */
export type SiglasDoPrevisto = { trabalho: SiglaDoPrevisto; folga: SiglaDoPrevisto };

/**
 * As siglas do previsto de uma linha, e se ele carrega o horario da vigencia.
 *
 * A sigla propria da linha troca so a letra dos dias de trabalho: ciclo e
 * folgas continuam os da vigencia, e e assim que o noturno e o diurno do mesmo
 * turno se alternam juntos na mesma grade.
 *
 * O horario nao acompanha. A vigencia descreve o turno da **funcao** — o
 * 06:00-18:00 de uma portaria diurna —, e escreve-lo ao lado do `N` de quem
 * cobre a noite seria um previsto que se contradiz. Escolher a mesma sigla da
 * funcao nao e excecao: o horario volta.
 */
export function siglasDaLinha(
  daFuncao: SiglasDoPrevisto | null,
  propria: SiglaDoPrevisto | null,
): { siglas: SiglasDoPrevisto | null; horarioDaVigencia: boolean } {
  return {
    siglas: propria && daFuncao ? { ...daFuncao, trabalho: propria } : daFuncao,
    horarioDaVigencia: !propria || propria.codigo === daFuncao?.trabalho.codigo,
  };
}

/**
 * O previsto de uma linha, dia a dia — calculado, nunca gravado.
 *
 * Recebe so as vigencias da turma que a pessoa segue: escala e contraescala tem
 * ciclos proprios, e misturar as duas daria um previsto que ninguem cumpre.
 *
 * **A configuracao e consultada por dia**, e nao uma vez para o periodo: a
 * escala muda no meio da competencia, e e assim que "12x36 ate 27/08, 4x2 a
 * partir de 28/08" aparece na mesma faixa sem que nada seja reescrito.
 *
 * Dia anterior a primeira vigencia fica **sem** previsto, e nao herda a
 * seguinte: uma escala que passa a valer em 28/08 nao diz nada sobre o dia 21.
 * Sem as siglas cadastradas o resultado tambem e vazio, e a tela diz o que falta.
 *
 * Mora aqui, e nao na DAL, porque a aba Pessoas desenha o previsto da escolha
 * **antes** de gravar: uma segunda conta na tela divergiria desta no primeiro
 * detalhe, e a previa mostraria um mes que a grade nao vai mostrar.
 */
export function derivarPrevisto(
  vigenciasDaTurma: readonly VigenciaDoCiclo[],
  contexto: {
    dias: readonly string[];
    siglas: SiglasDoPrevisto | null;
    primeiroDia: string;
    /** `false` quando a linha escreve outra sigla: o horario da vigencia nao e o dela. */
    horarioDaVigencia: boolean;
    /**
     * O horario proprio da linha (o 18:00-06:00 do `N`), que vale quando o da
     * vigencia nao vale. `null` deixa o previsto sem horario, como antes.
     */
    horarioDaLinha?: { entrada: string; saida: string } | null;
  },
): Record<string, PrevistoDoDia> {
  const { dias, siglas, primeiroDia, horarioDaVigencia, horarioDaLinha = null } = contexto;

  if (vigenciasDaTurma.length === 0 || !siglas) {
    return {};
  }

  const previsto: Record<string, PrevistoDoDia> = {};

  for (const data of dias) {
    const vigencia = vigenciaDoDia(data, vigenciasDaTurma);

    if (!vigencia) {
      continue;
    }

    previsto[data] = preveTrabalho(data, ancoraDaVigencia(vigencia, primeiroDia), vigencia)
      ? {
          eventoCodigo: siglas.trabalho.codigo,
          eventoCor: siglas.trabalho.cor,
          natureza: "trabalho",
          entrada: horarioDaVigencia ? vigencia.entrada : (horarioDaLinha?.entrada ?? null),
          saida: horarioDaVigencia ? vigencia.saida : (horarioDaLinha?.saida ?? null),
        }
      : {
          eventoCodigo: siglas.folga.codigo,
          eventoCor: siglas.folga.cor,
          natureza: "folga",
          entrada: null,
          saida: null,
        };
  }

  return previsto;
}

/** Como cada turma se chama na tela. */
export const TURMAS: readonly { id: FuncaoTurma; rotulo: string }[] = [
  { id: "escala", rotulo: "Escala" },
  { id: "contraescala", rotulo: "Contraescala" },
];

export function rotuloDaTurma(turma: FuncaoTurma) {
  return TURMAS.find((atual) => atual.id === turma)?.rotulo ?? turma;
}
