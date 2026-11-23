import {
  DURACAO_MAXIMA_DA_JORNADA_MINUTOS,
  INTERVALO_NOVA_JORNADA_MINUTOS,
  MARGEM_DO_TURNO_SEM_ENTRADA_MINUTOS,
  TOLERANCIA_ENTRADA_MINUTOS,
} from "./parametros";

/**
 * As batidas de uma pessoa agrupadas em **jornadas** — e nao em datas.
 *
 * O relogio registra cada batida na data em que ela aconteceu, entao a data nao
 * diz a que jornada a batida pertence: o plantao noturno de 22/08 aparece
 * partido entre os dias 22 e 23, e no 12x36 com troca interna o dia 23 traz a
 * saida de um plantao e a entrada do proximo — tres batidas numa data, de duas
 * jornadas diferentes.
 *
 * O que separa uma jornada da outra e o **intervalo** entre as batidas: todas
 * em ordem de data e hora, e `INTERVALO_NOVA_JORNADA_MINUTOS` (8h) ou mais sem
 * batida depois de uma saida comeca outra. Intervalos menores (refeicao,
 * descanso) ficam na mesma jornada, e a jornada pertence a data da **entrada**,
 * mesmo que atravesse a meia-noite. Depois de uma entrada, o tempo ate a
 * proxima batida e trabalho, limitado por `DURACAO_MAXIMA_DA_JORNADA_MINUTOS`.
 *
 * O criterio nao depende da escala de proposito. A versao anterior usava o
 * horario de entrada da escala como corte, e por isso errava justo quando a
 * pessoa trabalhava fora dela — que e o caso da troca. E por nao depender da
 * escala, a apuracao, a grade e a sugestao de escalas agrupam igual.
 *
 * Modulo puro: datas contadas inteiras em UTC, como `diaSeguinte()`, e nenhum
 * `Date` construido a partir de hora.
 */

export type BatidaDaJornada<B> = B & {
  /** A data em que o relogio registrou a batida. */
  data: string;
  /** Registrada numa data posterior a da entrada: a jornada virou o dia. */
  diaSeguinte: boolean;
};

export type Jornada<B> = {
  /** A data da entrada — e a ela que a jornada pertence. */
  data: string;
  batidas: BatidaDaJornada<B>[];
};

const MINUTOS_DO_DIA = 24 * 60;

function diaEmMinutos(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return (Date.UTC(ano, mes - 1, dia) / 86_400_000) * MINUTOS_DO_DIA;
}

function horaEmMinutos(hora: string) {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

/** O instante da batida em minutos corridos — so para comparar e subtrair. */
export function instanteDaBatida(data: string, hora: string) {
  return diaEmMinutos(data) + horaEmMinutos(hora);
}

/** O turno que a escala previa para um dia: so os horarios importam aqui. */
export type TurnoPrevisto = { entrada: string; saida: string };

/** O turno previsto de um dia, ou `null` (folga, ou nao se sabe). */
export type TurnoDoDia = (data: string) => TurnoPrevisto | null;

function diaAnterior(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia - 1)).toISOString().slice(0, 10);
}

/**
 * Onde cabe o fim do plantao noturno da vespera, em instantes: da entrada
 * prevista (menos a tolerancia) ate a saida prevista do dia `data` mais
 * `MARGEM_DO_TURNO_SEM_ENTRADA_MINUTOS`. `null` quando a vespera nao tem turno
 * que vire o dia — ai nao ha cauda a reconhecer.
 */
function caudaDaVespera(data: string, turnoDoDia: TurnoDoDia | undefined) {
  const vespera = diaAnterior(data);
  const turno = turnoDoDia?.(vespera) ?? null;

  if (!turno || !(turno.saida < turno.entrada)) {
    return null;
  }

  return {
    vespera,
    inicio: instanteDaBatida(vespera, turno.entrada) - TOLERANCIA_ENTRADA_MINUTOS,
    fim: instanteDaBatida(data, turno.saida) + MARGEM_DO_TURNO_SEM_ENTRADA_MINUTOS,
  };
}

/**
 * Agrupa as batidas em jornadas, em ordem. `batidasPorData` nao precisa vir
 * ordenada: a ordem e refeita aqui, pelo instante de cada batida.
 *
 * `turnoDoDia` e opcional, e so serve para nao confundir a saida de um plantao
 * sem entrada com a entrada de outro (ver `novaJornada` abaixo).
 */
export function agruparEmJornadas<B extends { hora: string }>(
  batidasPorData: ReadonlyMap<string, readonly B[]>,
  {
    turnoDoDia,
    intervaloMinimo = INTERVALO_NOVA_JORNADA_MINUTOS,
    duracaoMaxima = DURACAO_MAXIMA_DA_JORNADA_MINUTOS,
  }: { turnoDoDia?: TurnoDoDia; intervaloMinimo?: number; duracaoMaxima?: number } = {},
): Jornada<B>[] {
  const linha = [...batidasPorData]
    .flatMap(([data, doDia]) =>
      doDia.map((batida) => ({ batida, data, instante: instanteDaBatida(data, batida.hora) })),
    )
    .sort((a, b) => a.instante - b.instante);

  const jornadas: Jornada<B>[] = [];
  let atual: Jornada<B> | null = null;
  let inicio = 0;
  let anterior = 0;
  /** Fim da cauda da vespera, quando a jornada atual comecou dentro dela. */
  let fimDaCauda: number | null = null;

  for (const { batida, data, instante } of linha) {
    const intervalo = instante - anterior;
    const fechouPar = atual !== null && atual.batidas.length % 2 === 0;
    const passaDoTeto = instante - inicio > duracaoMaxima;

    /*
      Uma jornada nova comeca quando:

      - a anterior **fechou um par** (a ultima batida foi uma saida) e veio o
        descanso de 8h, ou a jornada passaria do teto — duas jornadas com um
        descanso curto entre elas (saiu 22:27, voltou 05:57) continuam sendo
        duas;
      - a anterior ficou com uma entrada aberta, veio um intervalo de 8h e a
        jornada passaria do teto: e a saida esquecida. Abaixo do teto, o
        intervalo e trabalho — as doze horas entre a entrada e a saida do 12x36;
      - a jornada atual comecou dentro da cauda do plantao noturno da vespera
        (que ficou sem jornada propria) e a batida chega depois dela, com 8h de
        intervalo: a primeira batida era a saida de um plantao sem entrada, e
        nao a entrada deste. Sem isso, a saida solta inverteria o par de tudo o
        que viesse depois.
    */
    const novaJornada =
      !atual ||
      (fechouPar && (intervalo >= intervaloMinimo || passaDoTeto)) ||
      (intervalo >= intervaloMinimo &&
        (passaDoTeto || (fimDaCauda !== null && instante > fimDaCauda)));

    if (novaJornada) {
      const cauda = caudaDaVespera(data, turnoDoDia);
      const vesperaSemJornada = cauda !== null && !jornadas.some((j) => j.data === cauda.vespera);

      atual = { data, batidas: [] };
      jornadas.push(atual);
      inicio = instante;
      fimDaCauda = vesperaSemJornada && instante <= cauda.fim ? cauda.fim : null;
    }

    atual!.batidas.push({ ...batida, data, diaSeguinte: data !== atual!.data });
    anterior = instante;
  }

  return jornadas;
}

/**
 * As jornadas por dia: cada uma na data da entrada, com uma excecao — a
 * jornada **sem a entrada** de um turno que vira o dia.
 *
 * Quando o plantao noturno chega so com o que veio depois da meia-noite
 * (02:06 03:05 06:01), a primeira batida nao e a entrada, e a data dela nao e a
 * do plantao. Se a jornada cabe inteira no turno previsto da vespera (da
 * entrada, menos a tolerancia, ate a saida mais
 * `MARGEM_DO_TURNO_SEM_ENTRADA_MINUTOS`) e a vespera ficou sem jornada
 * propria, ela volta para a vespera — e la aparece como o que e: um turno com
 * batida faltando, e nao uma falta seguida de trabalho em folga.
 *
 * `turnoDoDia` diz o turno previsto, ou `null` quando nao ha (folga, ou nao se
 * sabe). So o turno que vira o dia participa: nos outros a jornada sem entrada
 * ja cai na data certa.
 */
export function jornadasPorDia<B extends { hora: string }>(
  jornadas: readonly Jornada<B>[],
  turnoDoDia: TurnoDoDia,
): Map<string, Jornada<B>[]> {
  const porData = new Map<string, Jornada<B>[]>();

  for (const jornada of jornadas) {
    const cauda = caudaDaVespera(jornada.data, turnoDoDia);
    const primeira = jornada.batidas[0];
    const ultima = jornada.batidas.at(-1)!;
    const data =
      cauda &&
      !porData.has(cauda.vespera) &&
      instanteDaBatida(primeira.data, primeira.hora) >= cauda.inicio &&
      instanteDaBatida(ultima.data, ultima.hora) <= cauda.fim
        ? cauda.vespera
        : jornada.data;

    const ajustada: Jornada<B> =
      data === jornada.data
        ? jornada
        : {
            data,
            batidas: jornada.batidas.map((batida) => ({ ...batida, diaSeguinte: true })),
          };

    porData.set(data, [...(porData.get(data) ?? []), ajustada]);
  }

  return porData;
}

/**
 * A jornada ainda pode receber batida depois do fim do que foi importado: a
 * ultima batida dela esta a menos de um intervalo de jornada do fim da janela.
 *
 * E o plantao noturno que entra no ultimo dia: a saida cai depois da meia-noite,
 * fora do arquivo, e a jornada esta **em aberto**, e nao incompleta. Ja a
 * entrada 06:00 sem saida no ultimo dia nao tem desculpa — as 18 horas seguintes
 * estavam no arquivo e nao trouxeram batida nenhuma.
 */
export function podeContinuarDepoisDe<B extends { hora: string }>(
  jornada: Jornada<B>,
  fimDaJanela: string,
  {
    intervaloMinimo = INTERVALO_NOVA_JORNADA_MINUTOS,
    duracaoMaxima = DURACAO_MAXIMA_DA_JORNADA_MINUTOS,
  }: { intervaloMinimo?: number; duracaoMaxima?: number } = {},
) {
  const primeira = jornada.batidas[0];
  const ultima = jornada.batidas.at(-1);

  if (!primeira || !ultima) {
    return false;
  }

  // As mesmas duas perguntas do agrupamento, feitas a uma batida que ainda nao
  // chegou: ela caberia no teto da jornada? E, se a ultima foi uma saida,
  // chegaria antes de o intervalo virar descanso?
  const fim = diaEmMinutos(fimDaJanela) + MINUTOS_DO_DIA;
  const cabeNoTeto = fim - instanteDaBatida(primeira.data, primeira.hora) < duracaoMaxima;
  const semDescanso =
    jornada.batidas.length % 2 !== 0 ||
    fim - instanteDaBatida(ultima.data, ultima.hora) < intervaloMinimo;

  return cabeNoTeto && semDescanso;
}
