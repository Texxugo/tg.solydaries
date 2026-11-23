/**
 * Conflito de horario: a mesma pessoa em dois lugares ao mesmo tempo.
 *
 * Modulo puro (so `import type` e funcoes puras): e usado pela action, que
 * pede confirmacao antes de gravar, e pelo painel do dia, que mostra os
 * conflitos ja confirmados.
 *
 * O turno que vira o dia (19:00 -> 07:00) invade a manha seguinte. Por isso a
 * comparacao e em minutos **absolutos**, contados da meia-noite de uma data de
 * referencia: o turno de ontem 19:00-07:00 e [-300, 420) visto de hoje, e
 * encosta no 06:00-18:00 de hoje.
 */

import { formatarData } from "@/features/competencias/periodo";

import { intervaloDoTurno } from "./horario";

/**
 * Um turno de alguem num posto. Cada lancamento vira um turno da pessoa da
 * linha — e, na cobertura, tambem um turno **ausente** de quem faltou. Ausente
 * nao ocupa a pessoa, mas contradiz quem a lanca presente no mesmo horario.
 */
export type Turno = {
  lancamentoId: string;
  /** `f:<uuid>` ou `l:<uuid>`. */
  pessoa: string;
  nome: string;
  data: string;
  entrada: string;
  saida: string;
  postoId: string;
  posto: string;
  local: string;
  presente: boolean;
  /** No turno ausente de uma cobertura: quem cobriu. */
  cobertoPor?: string | null;
};

const MINUTOS_DO_DIA = 24 * 60;

/** Dias de `de` ate `ate` (negativo se `ate` vem antes). Datas `YYYY-MM-DD`, em UTC. */
function diasEntre(de: string, ate: string) {
  return Math.round(
    (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / (MINUTOS_DO_DIA * 60_000),
  );
}

function intervaloAbsoluto(turno: Pick<Turno, "data" | "entrada" | "saida">, referencia: string) {
  const { inicio, fim } = intervaloDoTurno(turno.entrada, turno.saida);
  const deslocamento = diasEntre(referencia, turno.data) * MINUTOS_DO_DIA;

  return { inicio: inicio + deslocamento, fim: fim + deslocamento };
}

/** Os dois turnos se sobrepoem? Encostar (um sai 07:00, outro entra 07:00) nao e conflito. */
export function seSobrepoem(
  a: Pick<Turno, "data" | "entrada" | "saida">,
  b: Pick<Turno, "data" | "entrada" | "saida">,
) {
  const x = intervaloAbsoluto(a, a.data);
  const y = intervaloAbsoluto(b, a.data);

  return x.inicio < y.fim && y.inicio < x.fim;
}

/**
 * E conflito quando ao menos um dos dois e presenca: dois presentes e a pessoa
 * em dois lugares; presente e ausente e a pessoa trabalhando onde consta como
 * falta. Dois ausentes nao se atrapalham.
 */
export function ehConflito(a: Turno, b: Turno) {
  return (
    a.pessoa === b.pessoa &&
    a.lancamentoId !== b.lancamentoId &&
    (a.presente || b.presente) &&
    seSobrepoem(a, b)
  );
}

/** O turno existente, numa frase: "TST01 · Portaria · 19:00-07:00 de 11/11". */
export function descreverTurno(turno: Turno) {
  const onde = `${turno.posto} · ${turno.local} · ${turno.entrada}-${turno.saida} de ${formatarData(turno.data).slice(0, 5)}`;

  return turno.presente
    ? `lancado em ${onde}`
    : `consta como falta em ${onde}${turno.cobertoPor ? ` (coberto por ${turno.cobertoPor})` : ""}`;
}

/**
 * Os conflitos do dia: pares da mesma pessoa que se sobrepoem com ao menos um
 * turno **nesta data** (o turno de ontem a noite so conta se encostar em
 * alguem de hoje). Uma mensagem por par.
 */
export function conflitosDoDia(turnos: Turno[], data: string) {
  const porPessoa = new Map<string, Turno[]>();

  for (const turno of turnos) {
    porPessoa.set(turno.pessoa, [...(porPessoa.get(turno.pessoa) ?? []), turno]);
  }

  const conflitos: { pessoa: string; nome: string; descricao: string }[] = [];

  for (const [pessoa, deles] of porPessoa) {
    for (let i = 0; i < deles.length; i += 1) {
      for (let j = i + 1; j < deles.length; j += 1) {
        const [a, b] = [deles[i], deles[j]];

        if ((a.data === data || b.data === data) && ehConflito(a, b)) {
          conflitos.push({
            pessoa,
            nome: a.nome,
            descricao: `${descreverTurno(a)} e ${descreverTurno(b)}`,
          });
        }
      }
    }
  }

  return conflitos;
}
