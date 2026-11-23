import type { DivergenciaTipo } from "@/db/schema";
import { diaSeguinte, formatarData } from "@/features/competencias/periodo";
import {
  diaDoCiclo,
  duracaoEmMinutos,
  jornadaLiquidaEmMinutos,
  regraDoDia,
  type Ciclo,
  type ExcecaoDoCiclo,
  type JornadaDoDia,
} from "@/features/escalas/jornada";
import {
  afastamentoNaData,
  rotuloDoAfastamento,
  type PeriodoDeAfastamento,
} from "@/features/funcionarios/afastamentos";
import {
  agruparEmJornadas,
  jornadasPorDia,
  podeContinuarDepoisDe,
  type BatidaDaJornada,
  type Jornada,
} from "./jornadas";
import {
  TOLERANCIA_ENTRADA_MINUTOS,
  TOLERANCIA_INTRAJORNADA_MINUTOS,
  TOLERANCIA_SAIDA_MINUTOS,
} from "./parametros";

/**
 * A apuracao: ler as marcacoes de alguem **contra a escala dela** e dizer, dia
 * a dia, o que fecha e o que nao fecha.
 *
 * Modulo puro de proposito, como `escalas/jornada.ts` e `funcionarios/planilha.ts`:
 * sem banco, sem React, sem `Date` construido a partir de hora. Ele recebe a
 * regra da jornada de um lado e as batidas do outro, e devolve a leitura — e e
 * essa separacao que permite conferir a regra sem subir o portal.
 *
 * Nada do que sai daqui e gravado. A divergencia e **consequencia** da escala,
 * e escala muda: atribuir uma escala a quem estava sem, corrigir o inicio de
 * ciclo de uma turma ou ajustar um dia de excecao muda a leitura de dias que
 * ja passaram, sem que uma unica marcacao precise ser reescrita. Gravar a
 * conclusao criaria a versao velha do fato — o mesmo motivo pelo qual
 * `virada_turno` e coluna gerada e a excecao e deduzida por comparacao.
 */

/** Uma batida como a apuracao a enxerga. */
export type BatidaApurada = {
  /** `HH:MM`. */
  hora: string;
  /** Veio digitada no sistema de ponto, e nao do relogio. */
  incluida: boolean;
};

/** Uma batida dentro da jornada do dia. */
export type BatidaDoDia = BatidaApurada & {
  /** Registrada numa data posterior a da entrada: a jornada virou o dia. */
  diaSeguinte: boolean;
};

/* -------------------------------------------------------------------------- */
/* Divergencias                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `impeditiva` e o que **trava** o fechamento: falta, marcacao faltando,
 * trabalho em dia de folga. Alguem precisa resolver antes de a competencia
 * fechar. `atencao` e o que fecha mas alguem precisa ver: hora extra, debito,
 * intrajornada abaixo do previsto.
 *
 * A separacao existe porque as duas viram trabalho diferente: a impeditiva vira
 * fila (quem esta na lista de pendencias), a de atencao vira conferencia.
 */
export type Gravidade = "impeditiva" | "atencao";

/**
 * Os tipos vem do enum `divergencia_tipo` do banco, e nao de uma uniao escrita
 * aqui — do mesmo jeito que `areas.ts` deriva de `area_portal`.
 *
 * A ocorrencia continua nao sendo gravada; a **tratativa** dela e, e o tipo faz
 * parte da chave. Derivar do enum e o que garante que os dois lados falam da
 * mesma lista: um tipo novo sem valor no enum nao compila, e um valor no enum
 * sem rotulo no `CATALOGO` abaixo tambem nao.
 */
export type TipoDeDivergencia = DivergenciaTipo;

/**
 * Catalogo das divergencias: rotulo e gravidade de cada uma, num lugar so.
 * O `Record<TipoDeDivergencia, ...>` quebra o typecheck se um tipo novo entrar
 * sem rotulo — mesma amarra dos catalogos de `areas.ts` e `modulos.ts`.
 */
const CATALOGO: Record<TipoDeDivergencia, { rotulo: string; gravidade: Gravidade }> = {
  sem_marcacao: { rotulo: "Falta", gravidade: "impeditiva" },
  marcacao_em_afastamento: { rotulo: "Marcacao durante afastamento", gravidade: "atencao" },
  marcacao_impar: { rotulo: "Marcacao incompleta", gravidade: "impeditiva" },
  marcacoes_a_menos: { rotulo: "Marcacoes a menos", gravidade: "impeditiva" },
  marcacoes_a_mais: { rotulo: "Marcacoes a mais", gravidade: "atencao" },
  trabalho_em_folga: { rotulo: "Trabalho em dia de folga", gravidade: "impeditiva" },
  turno_em_aberto: { rotulo: "Turno em aberto", gravidade: "atencao" },
  intrajornada_curta: { rotulo: "Intrajornada abaixo do previsto", gravidade: "atencao" },
  hora_extra: { rotulo: "Hora extra", gravidade: "atencao" },
  debito_de_horas: { rotulo: "Debito de horas", gravidade: "atencao" },
};

export type Divergencia = {
  tipo: TipoDeDivergencia;
  gravidade: Gravidade;
  /** O que houve naquele dia, em portugues, ja com os numeros dentro. */
  descricao: string;
};

/** Todos os tipos, com rotulo e gravidade — o que o filtro do painel desenha. */
export const DIVERGENCIAS = (Object.keys(CATALOGO) as TipoDeDivergencia[]).map((tipo) => ({
  tipo,
  ...CATALOGO[tipo],
}));

/**
 * Mesma lista, no formato de tupla que o `z.enum` exige. Sai daqui, e nao do
 * `divergenciaTipoEnum` do banco, para que `schema.ts` continue podendo ser
 * lido por componentes client sem arrastar o Drizzle junto.
 */
export const IDS_DIVERGENCIA = DIVERGENCIAS.map((atual) => atual.tipo) as [
  TipoDeDivergencia,
  ...TipoDeDivergencia[],
];

export function rotuloDaDivergencia(tipo: TipoDeDivergencia) {
  return CATALOGO[tipo].rotulo;
}

export function gravidadeDaDivergencia(tipo: TipoDeDivergencia) {
  return CATALOGO[tipo].gravidade;
}

function divergencia(tipo: TipoDeDivergencia, descricao: string): Divergencia {
  return { tipo, gravidade: CATALOGO[tipo].gravidade, descricao };
}

/* -------------------------------------------------------------------------- */
/* O dia                                                                      */
/* -------------------------------------------------------------------------- */

export type DiaApurado = {
  /** `YYYY-MM-DD`. */
  data: string;
  /** Em que dia do ciclo a data cai, contando de 1. */
  diaCiclo: number;
  /** A regra que valia: `null` em dia de folga. */
  regra: JornadaDoDia | null;
  /**
   * As batidas das jornadas que **comecaram** naquele dia, em ordem: a jornada
   * que vira a meia-noite traz a saida que o relogio registrou no dia seguinte.
   * Quase sempre e uma jornada so; duas, quando a pessoa entrou duas vezes na
   * mesma data com 8h ou mais entre uma e outra.
   */
  batidas: BatidaDoDia[];
  /**
   * Batidas que caem nesta data mas pertencem a um turno que comecou antes da
   * janela apurada. Nao entram em conta nenhuma e nao geram divergencia — mas
   * aparecem, porque nada some em silencio.
   */
  ignoradas: BatidaApurada[];
  /** Por que as de cima foram ignoradas. `null` quando nao ha nenhuma. */
  motivoIgnoradas: string | null;
  /**
   * O afastamento que cobria a data, ou `null`. Quando ha um, o dia nao entra
   * na auditoria: sem previsto, sem falta e fora das somas — mas continua na
   * lista, com o motivo, porque sumir seria indistinguivel de dia nao coberto
   * pela carga do relogio.
   */
  afastamento: PeriodoDeAfastamento | null;
  /** Minutos de trabalho que a escala previa para o dia. `0` em folga. */
  previstoMinutos: number;
  /**
   * Minutos efetivamente trabalhados. `null` quando alguma jornada do dia tem
   * batida impar — somar um par torto daria um numero que parece certo e nao e.
   * Em dia de folga com trabalho, sao as horas dele.
   */
  trabalhadoMinutos: number | null;
  /** Minutos de intervalo entre os pares, dentro das jornadas. `null` pelo mesmo motivo. */
  intervaloMinutos: number | null;
  /** `trabalhado - previsto`, como o relogio registrou. `null` quando nao ha trabalhado. */
  saldoMinutos: number | null;
  /**
   * O saldo depois de a entrada e a saida **dentro da tolerancia** valerem o
   * horario previsto. E ele que decide `hora_extra` e `debito_de_horas`, e ele
   * que a tela mostra como saldo e que o espelho do apontamento soma. O bruto
   * fica ao lado, menor, porque e o que o relogio registrou.
   */
  saldoToleradoMinutos: number | null;
  divergencias: Divergencia[];
};

/** `true` quando o dia tem alguma divergencia que trava o fechamento. */
export function temPendencia(dia: DiaApurado) {
  return dia.divergencias.some((atual) => atual.gravidade === "impeditiva");
}

/* -------------------------------------------------------------------------- */
/* Horarios                                                                   */
/* -------------------------------------------------------------------------- */

/** As batidas de cada jornada do dia, cada lista em ordem. */
type JornadasDoDia = readonly (readonly BatidaApurada[])[];

/**
 * Soma dos pares (1a-2a, 3a-4a...) e dos intervalos entre eles (2a-3a...),
 * jornada a jornada. O tempo **entre** duas jornadas do mesmo dia nao e
 * intervalo: e descanso, e conta-lo acusaria uma intrajornada de dez horas.
 *
 * `duracaoEmMinutos` atravessa a meia-noite sozinho, entao o turno noturno nao
 * precisa de tratamento a parte aqui: [17:55, 06:11] da 736 minutos, e nao um
 * numero negativo.
 */
function somarJornadas(jornadas: JornadasDoDia) {
  let trabalhado = 0;
  let intervalo = 0;

  for (const batidas of jornadas) {
    for (let indice = 0; indice + 1 < batidas.length; indice += 1) {
      const minutos = duracaoEmMinutos(batidas[indice].hora, batidas[indice + 1].hora);

      if (indice % 2 === 0) {
        trabalhado += minutos;
      } else {
        intervalo += minutos;
      }
    }
  }

  return { trabalhado, intervalo };
}

const MINUTOS_DO_DIA = 24 * 60;

/**
 * Quantos minutos a batida esta depois do horario previsto — negativo quando
 * esta antes.
 *
 * A conta e circular, e nao uma subtracao de minutos do dia: numa escala que
 * vira o dia a saida prevista e 06:00 e a batida pode cair as 05:55 da data
 * seguinte. A volta de 12 horas e o que separa "cinco minutos antes" de "quase
 * um dia depois".
 */
function diferencaDoHorario(batida: string, previsto: string) {
  const bruto = duracaoEmMinutos(previsto, batida);

  return bruto > MINUTOS_DO_DIA / 2 ? bruto - MINUTOS_DO_DIA : bruto;
}

/**
 * As jornadas com as **pontas** do dia dentro da tolerancia valendo o horario
 * previsto: a entrada da primeira jornada contra `regra.entrada`
 * (`TOLERANCIA_ENTRADA_MINUTOS`) e a saida da ultima contra `regra.saida`
 * (`TOLERANCIA_SAIDA_MINUTOS`).
 *
 * So essas duas mudam: as do meio sao o intervalo, que tem a propria regra. E
 * nao e franquia — a ponta fora da margem entra como o relogio registrou,
 * inteira. Entrar 07:20 e vinte minutos de atraso, e nao dez.
 */
function comPontasToleradas(jornadas: JornadasDoDia, regra: JornadaDoDia): JornadasDoDia {
  const primeira = jornadas[0];
  const ultima = jornadas.at(-1);

  if (!primeira || !ultima || (jornadas.length === 1 && primeira.length < 2)) {
    return jornadas;
  }

  const toleradas = jornadas.map((batidas) => [...batidas]);
  const inicio = toleradas[0];
  const fim = toleradas[toleradas.length - 1];
  const dentroDaMargem = (batida: string, previsto: string, margem: number) =>
    Math.abs(diferencaDoHorario(batida, previsto)) <= margem;

  if (dentroDaMargem(inicio[0].hora, regra.entrada, TOLERANCIA_ENTRADA_MINUTOS)) {
    inicio[0] = { ...inicio[0], hora: regra.entrada };
  }

  if (dentroDaMargem(fim[fim.length - 1].hora, regra.saida, TOLERANCIA_SAIDA_MINUTOS)) {
    fim[fim.length - 1] = { ...fim[fim.length - 1], hora: regra.saida };
  }

  return toleradas;
}

/* -------------------------------------------------------------------------- */
/* A apuracao                                                                 */
/* -------------------------------------------------------------------------- */

/** A escala de alguem: o padrao do dia mais o ciclo em que ele se repete. */
export type EscalaApurada = Ciclo & JornadaDoDia;

export type EntradaDaApuracao = {
  /**
   * A janela apurada, inclusive nas duas pontas — a intersecao entre o que o
   * arquivo de ponto cobre e a competencia. Nunca a competencia inteira: o
   * relatorio costuma parar antes do fim dela, e cada dia nao coberto viraria
   * uma falta.
   */
  janela: { inicio: string; fim: string };
  /** O dia 1 do ciclo **desta pessoa** — e ele que separa as turmas. */
  inicioCiclo: string;
  escala: EscalaApurada;
  excecoes: readonly ExcecaoDoCiclo[];
  /**
   * As batidas por data (`YYYY-MM-DD`), cada lista em ordem de hora. Pode
   * conter datas fora da janela: a saida de um turno noturno da vespera cai no
   * primeiro dia apurado, e e justamente ela que a regra do primeiro dia trata.
   */
  batidasPorData: ReadonlyMap<string, readonly BatidaApurada[]>;
  /**
   * Ferias, atestado e INSS desta pessoa que tocam a janela. Cruzados por
   * **data**, e nao por competencia: um INSS atravessa meses, e prende-lo a um
   * periodo o faria sumir justo enquanto ainda vale.
   */
  afastamentos: readonly PeriodoDeAfastamento[];
};

export type ApuracaoDoFuncionario = {
  dias: DiaApurado[];
  /** Dias da janela que a escala previa como trabalhados. */
  diasPrevistos: number;
  /** Dias previstos em que houve alguma batida. */
  diasComRegistro: number;
  faltas: number;
  previstoMinutos: number;
  trabalhadoMinutos: number;
  /** `trabalhado - previsto` no periodo inteiro, como o relogio registrou. */
  saldoMinutos: number;
  /** O mesmo saldo com as pontas toleradas de cada dia — o que a tela mostra. */
  saldoToleradoMinutos: number;
  diasComPendencia: number;
  diasComAtencao: number;
  /** Dias da janela cobertos por ferias, atestado ou INSS. */
  diasAfastado: number;
  /** Quantas batidas foram digitadas a mao no sistema de ponto. */
  batidasIncluidas: number;
};

/**
 * O horario de referencia de uma data, mesmo em dia de folga: sem escala
 * nenhuma para o dia, vale o padrao.
 *
 * Vale antes da janela, onde nao se sabe o que a pessoa fez: e o turno contra o
 * qual a cauda do plantao da vespera e reconhecida no primeiro dia.
 */
function horarioDeReferencia(regra: JornadaDoDia | null, escala: EscalaApurada) {
  return regra ?? { entrada: escala.entrada, saida: escala.saida };
}

/**
 * Le a janela inteira de uma pessoa.
 *
 * O ponto delicado e saber **a que jornada cada batida pertence**. O relogio
 * registra a batida na data em que ela aconteceu, entao o plantao noturno de
 * 22/08 aparece partido entre os dias 22 e 23, e no 12x36 com troca interna o
 * dia 23 traz a saida de um plantao e a entrada do proximo. Lidos dia a dia,
 * viram marcacoes incompletas onde havia jornadas perfeitamente normais.
 *
 * Por isso as batidas sao agrupadas antes de qualquer pergunta, pelo intervalo
 * entre elas (`agruparEmJornadas`): 8h ou mais sem batida comeca outra
 * jornada, e a jornada pertence a data da entrada. A escala nao participa do
 * agrupamento — ela diz o que cada dia deveria ter, e nao onde o plantao
 * terminou. Uma jornada que comecou num dia de folga e trabalho em folga, e o
 * dia de trabalho que ficou sem nenhuma jornada e falta: e assim que a troca
 * interna aparece, cada metade no dia em que aconteceu.
 */
export function apurarPeriodo({
  janela,
  inicioCiclo,
  escala,
  excecoes,
  batidasPorData,
  afastamentos,
}: EntradaDaApuracao): ApuracaoDoFuncionario {
  const ignoradasDoInicio: BatidaApurada[] = [];
  let motivoDoInicio: string | null = null;

  /**
   * O turno previsto so ajuda a reconhecer o plantao noturno que chegou sem a
   * entrada; o agrupamento em si e pelo intervalo entre as batidas.
   *
   * A regra do primeiro dia apurado e essa mesma, e nao um corte pelo horario.
   * O plantao do dia 20 sai as 06:11 do dia 21, que e o primeiro dia da janela.
   * Quando a vespera vem junto (`batidasDaCompetencia()` carrega o dia anterior
   * ao inicio), o agrupamento junta as duas pontas e a jornada do dia 20 fica
   * fora, inteira. Quando a pessoa nao tem batida no dia 20 (folgou, ou o
   * arquivo anterior nao foi importado), a sobra das 06:11 e uma jornada sem
   * entrada que cabe na cauda do turno da vespera — e `jornadasPorDia()` a
   * devolve para la, como faz no meio do periodo. Para isso, antes da janela o
   * turno e o de referencia (o padrao, mesmo que a escala diga folga): ninguem
   * sabe o que a pessoa fez no dia 20, e a cauda so e reconhecida se houver um
   * turno que vire o dia.
   *
   * O corte antigo ("tudo antes do horario de entrada do dia 21") levava junto a
   * entrada das 17:55 de quem chega alguns minutos antes do plantao das 18:00.
   *
   * O que fica fora nao some: vai para `ignoradas`, com o motivo, e a tela o
   * mostra.
   */
  const turnoDoDia = (data: string) => {
    const regra = regraDoDia(data, inicioCiclo, escala, excecoes);

    return data < janela.inicio ? horarioDeReferencia(regra, escala) : regra;
  };
  const jornadas = agruparEmJornadas(batidasPorData, { turnoDoDia });
  const porData = new Map<string, Jornada<BatidaApurada>[]>();

  // Cada jornada na data da entrada — e a que chegou sem entrada, de volta ao
  // plantao noturno da vespera (`jornadasPorDia`).
  const distribuidas = jornadasPorDia(jornadas, turnoDoDia);

  for (const [data, doDia] of distribuidas) {
    if (data < janela.inicio) {
      const naJanela = doDia
        .flatMap((jornada) => jornada.batidas)
        .filter((batida) => batida.data >= janela.inicio);

      if (naJanela.length > 0) {
        ignoradasDoInicio.push(...naJanela.map(({ hora, incluida }) => ({ hora, incluida })));
        motivoDoInicio ??= `Fecham o turno iniciado em ${formatarData(data)}, antes do periodo apurado.`;
      }

      continue;
    }

    if (data > janela.fim) {
      continue;
    }

    porData.set(data, doDia);
  }

  // A ultima jornada pode ainda nao ter terminado: a saida do plantao que
  // entrou no ultimo dia cai depois do que o arquivo cobriu.
  const ultima = jornadas.at(-1);
  const emAberto =
    ultima && ultima.data >= janela.inicio && podeContinuarDepoisDe(ultima, janela.fim)
      ? ultima
      : null;

  const dias: DiaApurado[] = [];

  for (let data = janela.inicio; data <= janela.fim; data = diaSeguinte(data)) {
    const doDia = porData.get(data) ?? [];
    const primeiroDia = data === janela.inicio;

    dias.push(
      apurarDia({
        data,
        diaCiclo: diaDoCiclo(data, inicioCiclo, escala),
        regra: regraDoDia(data, inicioCiclo, escala, excecoes),
        jornadas: doDia,
        ignoradas: primeiroDia ? ignoradasDoInicio : [],
        motivoIgnoradas: primeiroDia ? motivoDoInicio : null,
        emAberto: emAberto !== null && doDia.includes(emAberto) ? emAberto : null,
        afastamento: afastamentoNaData(data, afastamentos),
      }),
    );
  }

  return totalizar(dias);
}

type EntradaDoDia = {
  data: string;
  diaCiclo: number;
  regra: JornadaDoDia | null;
  /** As jornadas que comecaram neste dia, em ordem. */
  jornadas: readonly Jornada<BatidaApurada>[];
  ignoradas: BatidaApurada[];
  motivoIgnoradas: string | null;
  /** A jornada do dia que ainda pode receber a saida na proxima carga, ou `null`. */
  emAberto: Jornada<BatidaApurada> | null;
  afastamento: PeriodoDeAfastamento | null;
};

/** A batida como o dia a mostra: sem a data de registro, com a marca de virada. */
function batidaDoDia({ hora, incluida, diaSeguinte }: BatidaDaJornada<BatidaApurada>): BatidaDoDia {
  return { hora, incluida, diaSeguinte };
}

/** A jornada com batida impar, dita com os numeros dela. */
function divergenciaImpar(jornada: Jornada<BatidaApurada>, jornadasNoDia: number) {
  const onde = jornadasNoDia === 1 ? "no dia" : `na jornada iniciada as ${jornada.batidas[0].hora}`;

  return divergencia(
    "marcacao_impar",
    `${contar(jornada.batidas.length, "marcacao", "marcacoes")} ${onde}: toda entrada precisa ` +
      "da saida correspondente, entao falta (ou sobra) uma batida.",
  );
}

/**
 * A leitura de um dia. A ordem das perguntas e a mesma que quem confere o ponto
 * faz na mao: era dia de trabalho? bateu? bateu quantas vezes? fecha a conta?
 *
 * O numero de batidas vem antes de qualquer calculo de horas de proposito — e o
 * que denuncia marcacao faltando, e somar horas de um dia mal pareado produz um
 * numero que parece certo e nao e. Por isso jornada impar e inconsistencia, e
 * nunca hora extra.
 */
function apurarDia({
  data,
  diaCiclo,
  regra,
  jornadas,
  ignoradas,
  motivoIgnoradas,
  emAberto,
  afastamento,
}: EntradaDoDia): DiaApurado {
  const batidas = jornadas.flatMap((jornada) => jornada.batidas.map(batidaDoDia));
  const listas = jornadas.map((jornada) => jornada.batidas);
  const impar = jornadas.find((jornada) => jornada.batidas.length % 2 !== 0) ?? null;
  const divergencias: Divergencia[] = [];
  const vazio = {
    data,
    diaCiclo,
    regra,
    batidas,
    ignoradas,
    motivoIgnoradas,
    afastamento,
    previstoMinutos: 0,
    trabalhadoMinutos: null,
    intervaloMinutos: null,
    saldoMinutos: null,
    saldoToleradoMinutos: null,
  };

  /**
   * Dia coberto por ferias, atestado ou INSS: sai da auditoria antes de
   * qualquer pergunta sobre batida. Nao ha previsto (a escala previa, mas o
   * afastamento desfez), nao ha falta e nao entra em soma nenhuma — e o dia
   * continua na lista, com o motivo, porque quem confere precisa distinguir
   * "coberto por atestado" de "a carga nao trouxe este dia".
   *
   * A excecao e a batida: se o relogio registrou marcacao num dia coberto, ha
   * contradicao entre o cadastro e o relogio — data errada no afastamento, ou
   * alguem trabalhando quando nao devia. Vira atencao, e nao pendencia: nao
   * trava o fechamento, mas ninguem descobre depois.
   */
  if (afastamento) {
    if (batidas.length > 0) {
      divergencias.push(
        divergencia(
          "marcacao_em_afastamento",
          `Periodo de ${rotuloDoAfastamento(afastamento.tipo).toLowerCase()}, e o relogio ` +
            `registrou ${contar(batidas.length, "marcacao", "marcacoes")}.`,
        ),
      );
    }

    return { ...vazio, divergencias };
  }

  /**
   * Dia de folga: o que se espera e nenhuma jornada. Quando ha uma — a troca
   * interna, a dobra —, as horas dela sao contadas, porque e delas que o espelho
   * tira o trabalho em folga. Sem tolerancia: nao ha horario previsto a que a
   * ponta se compare.
   */
  if (!regra) {
    if (batidas.length === 0) {
      return { ...vazio, divergencias };
    }

    divergencias.push(
      divergencia(
        "trabalho_em_folga",
        `Dia ${diaCiclo} do ciclo e folga, e o relogio registrou ` +
          `${contar(batidas.length, "marcacao", "marcacoes")}.`,
      ),
    );

    if (impar) {
      divergencias.push(
        emAberto === impar
          ? divergencia(
              "turno_em_aberto",
              "A jornada continua depois do periodo apurado. Ela fecha na proxima carga de marcacoes.",
            )
          : divergenciaImpar(impar, jornadas.length),
      );

      return { ...vazio, divergencias };
    }

    const { trabalhado, intervalo } = somarJornadas(listas);

    return {
      ...vazio,
      trabalhadoMinutos: trabalhado,
      intervaloMinutos: intervalo,
      saldoMinutos: trabalhado,
      saldoToleradoMinutos: trabalhado,
      divergencias,
    };
  }

  const previstoMinutos = jornadaLiquidaEmMinutos(
    regra.entrada,
    regra.saida,
    regra.intrajornadaMinutos,
  );

  if (batidas.length === 0) {
    divergencias.push(
      divergencia("sem_marcacao", "Dia de trabalho sem nenhuma marcacao no relogio."),
    );

    return { ...vazio, previstoMinutos, divergencias };
  }

  /**
   * Jornada que entrou no fim da janela: a saida cai depois do que o arquivo
   * cobriu, entao ela **nao existe ainda** — e isso e diferente de faltar.
   * Chamar de marcacao incompleta o que so depende do proximo arquivo mandaria
   * alguem procurar um problema que nao existe.
   */
  if (emAberto && emAberto.batidas.length < regra.marcacoesEsperadas) {
    divergencias.push(
      divergencia(
        "turno_em_aberto",
        "O turno atravessa a meia-noite e a saida cai fora do periodo apurado. " +
          "Ele fecha na proxima carga de marcacoes.",
      ),
    );

    return { ...vazio, previstoMinutos, divergencias };
  }

  if (impar) {
    divergencias.push(divergenciaImpar(impar, jornadas.length));

    return { ...vazio, previstoMinutos, divergencias };
  }

  if (batidas.length < regra.marcacoesEsperadas) {
    divergencias.push(
      divergencia(
        "marcacoes_a_menos",
        `A escala preve ${regra.marcacoesEsperadas} marcacoes no dia e o relogio registrou ` +
          `${batidas.length}.`,
      ),
    );
  }

  if (batidas.length > regra.marcacoesEsperadas) {
    divergencias.push(
      divergencia(
        "marcacoes_a_mais",
        `A escala preve ${regra.marcacoesEsperadas} marcacoes no dia e o relogio registrou ` +
          `${batidas.length}.`,
      ),
    );
  }

  const { trabalhado, intervalo } = somarJornadas(listas);
  const saldoMinutos = trabalhado - previstoMinutos;

  // As pontas dentro da tolerancia valem o horario previsto: a diferenca que
  // sobra e a que de fato passou (ou faltou) do turno.
  const { trabalhado: trabalhadoTolerado } = somarJornadas(comPontasToleradas(listas, regra));
  const saldoToleradoMinutos = trabalhadoTolerado - previstoMinutos;

  // Intrajornada so e conferida quando a escala manda marca-la: numa jornada de
  // duas batidas o intervalo nao passa pelo relogio, e cobrar o que nao foi
  // pedido acusaria o portal inteiro todo dia.
  if (
    regra.intrajornadaMinutos > 0 &&
    regra.marcacoesEsperadas >= 4 &&
    batidas.length >= 4 &&
    intervalo < regra.intrajornadaMinutos - TOLERANCIA_INTRAJORNADA_MINUTOS
  ) {
    divergencias.push(
      divergencia(
        "intrajornada_curta",
        `Intervalo de ${formatarMinutos(intervalo)} para ` +
          `${formatarMinutos(regra.intrajornadaMinutos)} previstos.`,
      ),
    );
  }

  if (saldoToleradoMinutos > 0) {
    divergencias.push(
      divergencia(
        "hora_extra",
        `${formatarMinutos(saldoToleradoMinutos)} alem das ` +
          `${formatarMinutos(previstoMinutos)} previstas.`,
      ),
    );
  }

  if (saldoToleradoMinutos < 0) {
    divergencias.push(
      divergencia(
        "debito_de_horas",
        `${formatarMinutos(-saldoToleradoMinutos)} a menos que as ` +
          `${formatarMinutos(previstoMinutos)} previstas.`,
      ),
    );
  }

  return {
    data,
    diaCiclo,
    regra,
    batidas,
    ignoradas,
    motivoIgnoradas,
    afastamento,
    previstoMinutos,
    trabalhadoMinutos: trabalhado,
    intervaloMinutos: intervalo,
    saldoMinutos,
    saldoToleradoMinutos,
    divergencias,
  };
}

/** `1 marcacao` / `3 marcacoes` — o plural na mensagem, sem `if` no meio dela. */
function contar(quantidade: number, singular: string, plural: string) {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

/**
 * `8h`, `7h30`, `45min` — igual a `formatarDuracao` de `jornada.ts`, mas para
 * uma quantidade que pode passar de um dia (o saldo do periodo inteiro).
 */
export function formatarMinutos(minutos: number) {
  const sinal = minutos < 0 ? "-" : "";
  const total = Math.abs(minutos);
  const horas = Math.floor(total / 60);
  const resto = total % 60;

  if (horas === 0) {
    return `${sinal}${resto}min`;
  }

  return resto === 0 ? `${sinal}${horas}h` : `${sinal}${horas}h${String(resto).padStart(2, "0")}`;
}

function totalizar(dias: readonly DiaApurado[]): ApuracaoDoFuncionario {
  let diasPrevistos = 0;
  let diasComRegistro = 0;
  let faltas = 0;
  let previstoMinutos = 0;
  let trabalhadoMinutos = 0;
  let trabalhadoToleradoMinutos = 0;
  let diasComPendencia = 0;
  let diasComAtencao = 0;
  let diasAfastado = 0;
  let batidasIncluidas = 0;

  for (const dia of dias) {
    previstoMinutos += dia.previstoMinutos;
    trabalhadoMinutos += dia.trabalhadoMinutos ?? 0;
    // O tolerado do dia e o saldo tolerado de volta em horas: e o que sobra da
    // jornada depois de as pontas dentro da margem valerem o previsto.
    trabalhadoToleradoMinutos +=
      dia.saldoToleradoMinutos === null ? 0 : dia.saldoToleradoMinutos + dia.previstoMinutos;
    batidasIncluidas += dia.batidas.filter((batida) => batida.incluida).length;

    if (dia.afastamento) {
      diasAfastado += 1;
    } else if (dia.regra) {
      // Dia coberto nao conta como previsto: a escala previa, o afastamento
      // desfez, e some-lo cobraria uma jornada que nao era devida.
      diasPrevistos += 1;

      if (dia.batidas.length > 0) {
        diasComRegistro += 1;
      }
    }

    if (dia.divergencias.some((atual) => atual.tipo === "sem_marcacao")) {
      faltas += 1;
    }

    if (temPendencia(dia)) {
      diasComPendencia += 1;
    } else if (dia.divergencias.length > 0) {
      diasComAtencao += 1;
    }
  }

  return {
    dias: [...dias],
    diasPrevistos,
    diasComRegistro,
    faltas,
    previstoMinutos,
    trabalhadoMinutos,
    saldoMinutos: trabalhadoMinutos - previstoMinutos,
    saldoToleradoMinutos: trabalhadoToleradoMinutos - previstoMinutos,
    diasComPendencia,
    diasComAtencao,
    diasAfastado,
    batidasIncluidas,
  };
}
