/**
 * Nome e formatacao de uma competencia.
 *
 * Modulo puro de proposito (nenhum import): e consumido pela DAL, pelas paginas
 * e pelos componentes client, e nenhum dos tres deve arrastar o Drizzle nem o
 * React para o outro lado — mesma regra de `features/acessos/areas.ts`.
 *
 * As datas entram e saem como string `YYYY-MM-DD`, do jeito que o Postgres
 * devolve um `date`. Nada aqui constroi um `Date`: `new Date("2026-08-21")` e
 * lido como UTC e, em fuso negativo, imprime 20/08. Recortar a string nao tem
 * fuso nenhum para errar.
 */

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function partes(data: string) {
  const [ano, mes, dia] = data.split("-");
  return { ano, mes, dia };
}

/**
 * O nome da competencia e o mes da data final: 21/07 a 21/08 = "Agosto/2026".
 * O ano entra junto porque o portal vai acumular varios agostos.
 */
export function nomeDaCompetencia(dataFim: string) {
  const { ano, mes } = partes(dataFim);
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

/** So o mes, para quando o ano ja esta claro no contexto. */
export function mesDaCompetencia(dataFim: string) {
  return MESES[Number(partes(dataFim).mes) - 1];
}

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"] as const;

/**
 * `Seg`, `Ter` — o dia da semana de uma data de calendario.
 *
 * O `Date` e seguro aqui porque a conta e feita inteira em UTC, como em
 * `diaSeguinte()`: em fuso negativo, `new Date("2026-08-21")` lido no fuso local
 * cairia no dia 20 e devolveria o dia da semana errado.
 *
 * Nao e o que decide jornada — isso e do ciclo da escala, e nao do calendario.
 * Serve para quem le uma lista de dias se localizar nela.
 */
export function diaDaSemana(data: string) {
  return DIAS_DA_SEMANA[new Date(`${data}T00:00:00Z`).getUTCDay()];
}

export function formatarData(data: string) {
  const { ano, mes, dia } = partes(data);
  return `${dia}/${mes}/${ano}`;
}

export function formatarPeriodo(dataInicio: string, dataFim: string) {
  return `${formatarData(dataInicio)} a ${formatarData(dataFim)}`;
}

/**
 * Dia seguinte a `data`, em `YYYY-MM-DD`. Serve para sugerir o inicio da
 * proxima competencia (uma competencia comeca onde a anterior parou) sem deixar
 * buracos nem sobreposicao no calendario.
 *
 * Aqui o `Date` e seguro porque a conta e feita inteira em UTC: monta em UTC,
 * soma um dia, recorta em UTC.
 */
export function diaSeguinte(data: string) {
  const referencia = new Date(`${data}T00:00:00Z`);
  referencia.setUTCDate(referencia.getUTCDate() + 1);
  return referencia.toISOString().slice(0, 10);
}

/** Dia anterior a `data`, em `YYYY-MM-DD` — a mesma conta de `diaSeguinte()`, para tras. */
export function diaAnterior(data: string) {
  const referencia = new Date(`${data}T00:00:00Z`);
  referencia.setUTCDate(referencia.getUTCDate() - 1);
  return referencia.toISOString().slice(0, 10);
}

/**
 * O fuso em que o portal decide que dia e hoje. Constante, e nao o fuso do
 * servidor: em container o servidor costuma rodar em UTC, e a virada do dia
 * aconteceria as 21h para quem esta usando o portal.
 */
export const FUSO_DO_PORTAL = "America/Sao_Paulo";

/**
 * Hoje, em `YYYY-MM-DD`, no fuso do portal.
 *
 * `toISOString().slice(0, 10)` daria a data em UTC, que a partir das 21h ja e a
 * de amanha — e "hoje e dia de trabalho?" respondida com o dia errado erra
 * justamente no turno da noite, que e onde a escala mais importa.
 *
 * `en-CA` porque e o locale que formata data como `AAAA-MM-DD`, o mesmo formato
 * em que as datas trafegam no portal inteiro.
 */
export function hojeNoPortal() {
  return dataNoPortal(new Date());
}

/**
 * A hora cheia (0 a 23) de um instante no fuso do portal — pela mesma razao de
 * `hojeNoPortal()`: o servidor em UTC diria "boa noite" as 15h de Sao Paulo.
 */
export function horaNoPortal(instante: Date = new Date()) {
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_DO_PORTAL,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(instante);

  return Number(hora);
}

/** O dia de um instante, em `YYYY-MM-DD`, no fuso do portal — pela mesma razao de `hojeNoPortal()`. */
export function dataNoPortal(instante: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_DO_PORTAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** `true` para uma data real no formato `YYYY-MM-DD` (rejeita 31/02). */
export function ehDataValida(data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return false;
  }

  const referencia = new Date(`${data}T00:00:00Z`);

  return !Number.isNaN(referencia.getTime()) && referencia.toISOString().slice(0, 10) === data;
}
