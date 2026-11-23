/**
 * O horario como se digita no lancamento: "07", "0730", "7:30", "730".
 *
 * Modulo puro (nenhum import de runtime): e lido pelo formulario, que
 * normaliza o campo ao sair dele, e pela action, que confere de novo — POST
 * publico nao confia no que o navegador mandou.
 */

/**
 * `HH:MM` para o que se reconhece como hora, `null` para o resto.
 *
 * - 1 ou 2 digitos: hora cheia ("7" e "07" -> 07:00)
 * - 3 digitos: H + MM ("730" -> 07:30)
 * - 4 digitos: HH + MM ("0730" -> 07:30, "1915" -> 19:15)
 * - com separador `:`, `h` ou `.`: "7:30", "19h", "19h15", "7.30"
 *
 * Hora acima de 23 e minuto acima de 59 sao recusados — "24" nao e meia-noite
 * de amanha, e um "2400" digitado e mais provavel ser engano do que intencao.
 */
export function interpretarHora(texto: string): string | null {
  const limpo = texto.trim().toLowerCase().replace(/\s+/g, "");

  if (!limpo) {
    return null;
  }

  let hora: number;
  let minuto: number;

  const separado = /^(\d{1,2})[:h.](\d{2})?$/.exec(limpo);

  if (separado) {
    hora = Number(separado[1]);
    minuto = Number(separado[2] ?? "0");
  } else if (/^\d{1,4}$/.test(limpo)) {
    if (limpo.length <= 2) {
      hora = Number(limpo);
      minuto = 0;
    } else {
      hora = Number(limpo.slice(0, -2));
      minuto = Number(limpo.slice(-2));
    }
  } else {
    return null;
  }

  if (hora > 23 || minuto > 59) {
    return null;
  }

  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function emMinutos(hora: string) {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * O intervalo do turno em minutos contados da meia-noite **da data do
 * lancamento**: 19:00 -> 07:00 vira [1140, 1860). E o que a conferencia de
 * conflito compara — um turno que vira o dia invade o dia seguinte, e so
 * contando os minutos depois de 24h e que ele encosta no turno das 06:00 de
 * amanha.
 */
export function intervaloDoTurno(entrada: string, saida: string) {
  const inicio = emMinutos(entrada);
  let fim = emMinutos(saida);

  if (fim <= inicio) {
    fim += 24 * 60;
  }

  return { inicio, fim };
}
