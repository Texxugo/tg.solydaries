/**
 * Leitura de uma jornada: horarios, duracao e o ciclo de trabalho.
 *
 * Modulo puro de proposito (nenhum import): e consumido pela DAL, pelas paginas
 * e pelos componentes client, e nenhum dos tres deve arrastar o Drizzle nem o
 * React para o outro lado — mesma regra de `competencias/periodo.ts` e
 * `acessos/areas.ts`.
 *
 * Horarios entram e saem como string (`HH:MM` do `<input type="time">`,
 * `HH:MM:SS` do `time` do Postgres) e datas como `YYYY-MM-DD`, do jeito que o
 * Postgres devolve um `date`. Nada aqui constroi um `Date` a partir de uma hora
 * solta: hora de escala nao tem dia nem fuso a que pertencer, e converter so
 * criaria a chance de o horario de verao mover a jornada.
 */

const MINUTOS_DO_DIA = 24 * 60;
const MS_DO_DIA = 24 * 60 * 60 * 1000;

/** `true` para `HH:MM` ou `HH:MM:SS` com hora e minuto reais. */
export function ehHoraValida(hora: string) {
  const partes = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hora);

  if (!partes) {
    return false;
  }

  const [, h, m, s] = partes;

  return Number(h) < 24 && Number(m) < 60 && Number(s ?? "0") < 60;
}

/** `HH:MM`, do jeito que o `<input type="time">` mostra e envia. */
export function formatarHora(hora: string) {
  return hora.slice(0, 5);
}

function emMinutos(hora: string) {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * A jornada virou o dia quando a saida e anterior a entrada (22h as 6h). E a
 * mesma conta da coluna gerada `escalas.virada_turno` — aqui para a tela poder
 * mostrar o efeito antes de gravar.
 */
export function temViradaDeTurno(entrada: string, saida: string) {
  return emMinutos(saida) < emMinutos(entrada);
}

/**
 * Minutos entre entrada e saida, atravessando a meia-noite quando preciso. A
 * soma de um dia antes do resto trata a virada sem `if`: 22h -> 6h da
 * (360 - 1320 + 1440) = 480.
 */
export function duracaoEmMinutos(entrada: string, saida: string) {
  return (emMinutos(saida) - emMinutos(entrada) + MINUTOS_DO_DIA) % MINUTOS_DO_DIA;
}

/** O que sobra de trabalho depois de descontada a intrajornada. */
export function jornadaLiquidaEmMinutos(entrada: string, saida: string, intrajornada: number) {
  return duracaoEmMinutos(entrada, saida) - intrajornada;
}

/** `8h`, `7h30` ou `45min` — duracao para leitura, nunca para calculo. */
export function formatarDuracao(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas === 0) {
    return `${resto}min`;
  }

  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/**
 * O ciclo de trabalho: um numero de dias que se repete e as posicoes de folga
 * dentro dele. O 5x2 e um ciclo de 7 com folga nos dias 6 e 7; o 12x36 e um
 * ciclo de 2 com folga no dia 2 (as 12 horas ja estao nos horarios da jornada).
 *
 * Posicoes, e nao "N trabalhados seguidos de M de folga", porque ha escala em
 * que a folga anda: o 6x1 que folga domingo numa semana e sabado na outra e um
 * ciclo de 14 dias com folga nos dias 7 e 13. Nenhum par de numeros descreve
 * isso — os dois dias de folga nao sao vizinhos.
 *
 * O ciclo diz o padrao; **quando** ele comeca a valer e de cada funcionario.
 * Por isso as funcoes abaixo recebem a data de inicio de fora.
 */
export type Ciclo = { diasCiclo: number; folgas: readonly number[] };

/** Quantos dias ate o padrao se repetir. Um 5x2 fecha em 7, um 12x36 em 2. */
export function diasDoCiclo({ diasCiclo }: Ciclo) {
  return diasCiclo;
}

/** As posicoes de trabalho, em ordem — o que sobra depois das folgas. */
export function diasTrabalhadosDoCiclo({ diasCiclo, folgas }: Ciclo) {
  return Array.from({ length: diasCiclo }, (_, indice) => indice + 1).filter(
    (dia) => !folgas.includes(dia),
  );
}

/** Quantos dias do ciclo sao de trabalho. */
export function totalTrabalhadoNoCiclo({ diasCiclo, folgas }: Ciclo) {
  return diasCiclo - folgas.length;
}

/**
 * `true` quando as folgas fecham o ciclo sem buraco — o 5x2 e o 6x1 classicos.
 * E o que separa o ciclo que cabe no apelido "TxF" daquele em que a folga anda.
 */
export function ehCicloRegular({ diasCiclo, folgas }: Ciclo) {
  return folgas.every((dia, indice) => dia === diasCiclo - folgas.length + indice + 1);
}

/**
 * `5x2`, `1x1` — como o ciclo e chamado no dia a dia. So o ciclo regular tem
 * esse nome: um 14 dias com folga no 7 e no 13 nao e "12x2", porque os doze
 * dias de trabalho nao sao seguidos. Nesse caso o rotulo diz o tamanho, e o
 * apelido de mercado ("6x1 alternado") vive em `escalas.nome`.
 */
export function rotuloDoCiclo(ciclo: Ciclo) {
  return ehCicloRegular(ciclo)
    ? `${totalTrabalhadoNoCiclo(ciclo)}x${ciclo.folgas.length}`
    : `${ciclo.diasCiclo} dias`;
}

function emDias(data: string) {
  // Data de calendario tratada inteira em UTC: montar em UTC e dividir por um
  // dia nao tem fuso nem horario de verao para errar.
  return Date.parse(`${data}T00:00:00Z`) / MS_DO_DIA;
}

/**
 * Em que dia do ciclo a data cai, contando de 1 — o "dia 5 do ciclo" da tela e
 * o mesmo numero gravado em `escala_excecoes.dia_ciclo`.
 *
 * A dupla operacao de resto mantem o resultado positivo para datas anteriores
 * ao inicio do ciclo: o padrao vale para tras tambem, e o resto negativo do
 * JavaScript transformaria folga em trabalho na vespera da virada.
 */
export function diaDoCiclo(data: string, inicioCiclo: string, ciclo: Ciclo) {
  const tamanho = diasDoCiclo(ciclo);
  const decorridos = emDias(data) - emDias(inicioCiclo);

  return (((decorridos % tamanho) + tamanho) % tamanho) + 1;
}

/**
 * Se a escala preve trabalho naquela data, dado o inicio do ciclo daquele
 * funcionario. E a pergunta que a interpretacao da jornada faz para cada dia
 * antes de olhar qualquer marcacao: dia de folga com batida e uma coisa, dia
 * de trabalho sem batida e outra.
 */
export function ehDiaTrabalhado(data: string, inicioCiclo: string, ciclo: Ciclo) {
  return !ciclo.folgas.includes(diaDoCiclo(data, inicioCiclo, ciclo));
}

/**
 * A jornada de um dia: o padrao da escala ou o de um dia de excecao. Os dois
 * tem exatamente a mesma forma de proposito — a excecao descreve o dia inteiro,
 * e nao "o que mudou", para que interpretar nao dependa de saber o que foi
 * herdado.
 */
export type JornadaDoDia = {
  entrada: string;
  saida: string;
  intrajornadaMinutos: number;
  marcacoesEsperadas: number;
  horasExtrasMinutos: number;
};

/** Dia do ciclo que nao segue o padrao (o 5o dia do 5x2 que sai mais cedo). */
export type ExcecaoDoCiclo = JornadaDoDia & { diaCiclo: number };

/**
 * `true` quando o dia nao tem nada de proprio a dizer. E o que decide se a
 * excecao vira linha no banco: excecao e o que difere do padrao, e nao um
 * campo que alguem marca — mesma logica de `virada_turno`.
 */
export function mesmaJornada(a: JornadaDoDia, b: JornadaDoDia) {
  return (
    a.entrada === b.entrada &&
    a.saida === b.saida &&
    a.intrajornadaMinutos === b.intrajornadaMinutos &&
    a.marcacoesEsperadas === b.marcacoesEsperadas &&
    a.horasExtrasMinutos === b.horasExtrasMinutos
  );
}

/**
 * A regra que vale para uma data: `null` em dia de folga, senao a jornada
 * daquele dia — a excecao do dia do ciclo, se houver, ou o padrao da escala.
 *
 * E a funcao que a interpretacao da marcacao vai chamar para cada dia da
 * competencia, e por isso ela mora aqui, num modulo sem banco nem React: quem
 * carrega escala, excecoes e a data de inicio do ciclo e quem chama.
 */
export function regraDoDia(
  data: string,
  inicioCiclo: string,
  escala: Ciclo & JornadaDoDia,
  excecoes: readonly ExcecaoDoCiclo[] = [],
): JornadaDoDia | null {
  const dia = diaDoCiclo(data, inicioCiclo, escala);

  if (escala.folgas.includes(dia)) {
    return null;
  }

  return excecoes.find((excecao) => excecao.diaCiclo === dia) ?? escala;
}

/**
 * O ciclo em palavras, para a tela explicar o que gravou. O ciclo regular se
 * descreve pela contagem ("5 dias de trabalho e 2 de folga"); aquele em que a
 * folga anda so se descreve dizendo onde ela cai.
 */
export function descricaoDoCiclo(ciclo: Ciclo) {
  const trabalhados = totalTrabalhadoNoCiclo(ciclo);
  const trabalho = `${trabalhados} ${trabalhados === 1 ? "dia" : "dias"} de trabalho`;

  if (ciclo.folgas.length === 0) {
    return `${trabalho}, sem folga no ciclo`;
  }

  if (ehCicloRegular(ciclo)) {
    return `${trabalho} e ${ciclo.folgas.length} de folga`;
  }

  return `${ciclo.diasCiclo} dias, com folga ${listarDias(ciclo.folgas)}`;
}

/** `no dia 7`, `nos dias 7 e 13`, `nos dias 3, 7 e 13`. */
export function listarDias(dias: readonly number[]) {
  if (dias.length === 0) {
    return "em nenhum dia";
  }

  if (dias.length === 1) {
    return `no dia ${dias[0]}`;
  }

  return `nos dias ${dias.slice(0, -1).join(", ")} e ${dias[dias.length - 1]}`;
}
