/**
 * `12/09/2026 14:05`, no fuso do portal — e nao no do servidor, que em
 * container costuma ser UTC e escreveria a alteracao das 21h no dia seguinte.
 */
const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatarInstante(instante: Date) {
  return FORMATO.format(instante).replace(",", "");
}
