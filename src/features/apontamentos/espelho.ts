import { duracaoEmMinutos } from "@/features/escalas/jornada";
import {
  formatarMinutos,
  type ApuracaoDoFuncionario,
  type DiaApurado,
} from "@/features/ponto/apuracao";

import type { Rubrica } from "./rubricas";

/**
 * O espelho de ponto resumido para quem aponta: os numeros da apuracao que
 * correspondem as rubricas da folha, lado a lado com o formulario.
 *
 * **E referencia, e nao preenchimento.** Nada daqui e gravado nem escrito nos
 * campos: a apuracao diz quanto a pessoa trabalhou alem do previsto, e quem
 * fecha a folha decide se aquilo e 50%, 60% ou 100%, se a falta foi abonada, se
 * o intervalo curto foi autorizado. Mesma relacao entre a grade e o relogio —
 * a leitura cruzada aparece, e ninguem e preenchido por ela.
 *
 * Modulo puro, como `apuracao.ts`, de onde saem todos os numeros: aqui so se
 * soma o que a apuracao ja concluiu dia a dia, e nao se refaz conclusao
 * nenhuma. As horas extras sao a soma do saldo dos dias que a apuracao marcou
 * como `hora_extra`, e nao um saldo recalculado com outra tolerancia.
 */

export type ResumoDoEspelho = {
  diasPrevistos: number;
  diasComRegistro: number;
  diasAfastado: number;
  /** Dias com `sem_marcacao` — o que a apuracao chama de falta. */
  faltas: number;
  /** Dias com divergencia impeditiva ainda aberta no espelho. */
  diasComPendencia: number;
  /** Soma do saldo dos dias marcados como hora extra. */
  horaExtraMinutos: number;
  diasComHoraExtra: number;
  /** Dias de folga em que houve trabalho, e as horas deles. */
  trabalhoEmFolgaDias: number;
  trabalhoEmFolgaMinutos: number;
  /** O que faltou para a intrajornada prevista, nos dias em que ela foi curta. */
  intrajornadaSuprimidaMinutos: number;
  diasComIntrajornadaCurta: number;
  /** Minutos trabalhados entre 22h e 5h, em hora de relogio (sem a hora reduzida). */
  noturnoMinutos: number;
};

/** O intervalo noturno do trabalhador urbano (CLT, art. 73): das 22h as 5h. */
const INICIO_NOTURNO = 22 * 60;
const FIM_NOTURNO = 5 * 60;

function emMinutos(hora: string) {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Quantos minutos de um par entrada-saida caem entre 22h e 5h.
 *
 * Minuto a minuto, e nao por intersecao de intervalos: o par pode virar a meia-
 * noite e o intervalo noturno tambem vira, e as quatro combinacoes de "vira ou
 * nao vira" sao exatamente onde uma conta de intersecao erra. Um par tem no
 * maximo 1.440 minutos, e uma competencia algumas dezenas de pares.
 */
export function minutosNoturnos(entrada: string, saida: string) {
  const chave = `${entrada}-${saida}`;
  const conhecido = noturnosPorPar.get(chave);

  if (conhecido !== undefined) {
    return conhecido;
  }

  const inicio = emMinutos(entrada);
  const duracao = duracaoEmMinutos(entrada, saida);
  let noturnos = 0;

  for (let passo = 0; passo < duracao; passo += 1) {
    const relogio = (inicio + passo) % (24 * 60);

    if (relogio >= INICIO_NOTURNO || relogio < FIM_NOTURNO) {
      noturnos += 1;
    }
  }

  // O teto existe para o mapa nao crescer sem fim num processo longo: os pares
  // de uma escala sao poucos e se repetem, e o que passar disso e digitacao
  // avulsa. Esvaziar e mais barato (e mais simples) que expirar entrada a
  // entrada — o custo de recalcular e o loop acima.
  if (noturnosPorPar.size >= LIMITE_DE_PARES) {
    noturnosPorPar.clear();
  }

  noturnosPorPar.set(chave, noturnos);

  return noturnos;
}

/**
 * O resultado depende **so** do par de horarios, e o mesmo par se repete em
 * quase todo dia do periodo: sem isto, uma ficha com trinta dias de 12x36
 * rodava o loop acima trinta vezes para chegar ao mesmo numero.
 *
 * Cache de modulo, e nao estado de requisicao: nao ha nada de uma pessoa aqui —
 * `"18:00-06:00"` da 420 minutos para quem quer que seja.
 */
const noturnosPorPar = new Map<string, number>();

const LIMITE_DE_PARES = 2000;

function temDivergencia(dia: DiaApurado, tipo: DiaApurado["divergencias"][number]["tipo"]) {
  return dia.divergencias.some((atual) => atual.tipo === tipo);
}

export function resumirEspelho(apuracao: ApuracaoDoFuncionario): ResumoDoEspelho {
  let horaExtraMinutos = 0;
  let diasComHoraExtra = 0;
  let trabalhoEmFolgaDias = 0;
  let trabalhoEmFolgaMinutos = 0;
  let intrajornadaSuprimidaMinutos = 0;
  let diasComIntrajornadaCurta = 0;
  let noturnoMinutos = 0;

  for (const dia of apuracao.dias) {
    if (temDivergencia(dia, "hora_extra") && dia.saldoToleradoMinutos !== null) {
      // O saldo tolerado, e nao o bruto: os minutos de ponta que a tolerancia
      // absorveu nao sao hora extra a lancar.
      horaExtraMinutos += dia.saldoToleradoMinutos;
      diasComHoraExtra += 1;
    }

    if (temDivergencia(dia, "trabalho_em_folga")) {
      trabalhoEmFolgaDias += 1;
      trabalhoEmFolgaMinutos += dia.trabalhadoMinutos ?? 0;
    }

    if (temDivergencia(dia, "intrajornada_curta") && dia.regra) {
      diasComIntrajornadaCurta += 1;
      intrajornadaSuprimidaMinutos += Math.max(
        0,
        dia.regra.intrajornadaMinutos - (dia.intervaloMinutos ?? 0),
      );
    }

    // So dia pareado: com batida faltando nao ha como saber qual par e
    // entrada-saida, e contar noturno de um par torto inventaria horas.
    if (dia.trabalhadoMinutos !== null) {
      for (let indice = 0; indice + 1 < dia.batidas.length; indice += 2) {
        noturnoMinutos += minutosNoturnos(dia.batidas[indice].hora, dia.batidas[indice + 1].hora);
      }
    }
  }

  return {
    diasPrevistos: apuracao.diasPrevistos,
    diasComRegistro: apuracao.diasComRegistro,
    diasAfastado: apuracao.diasAfastado,
    faltas: apuracao.faltas,
    diasComPendencia: apuracao.diasComPendencia,
    horaExtraMinutos,
    diasComHoraExtra,
    trabalhoEmFolgaDias,
    trabalhoEmFolgaMinutos,
    intrajornadaSuprimidaMinutos,
    diasComIntrajornadaCurta,
    noturnoMinutos,
  };
}

/**
 * O espelho dito ao lado de cada campo do preenchimento: o numero da apuracao
 * que conversa com aquela rubrica, em texto pronto.
 *
 * Texto montado aqui, no servidor, e nao no modal: o componente client recebe
 * so as frases e nao arrasta `apuracao.ts` para o navegador. Rubrica sem
 * correspondente no ponto (gratificacao, cesta, adicionais) nao tem linha — e
 * decisao de cadastro ou de contrato, e nao de marcacao.
 *
 * Continua sendo referencia: a hora alem do previsto aparece nas tres colunas
 * de hora extra porque e quem fecha a folha que decide em qual delas ela cai.
 */
export function referenciasDoEspelho(resumo: ResumoDoEspelho): Partial<Record<Rubrica, string[]>> {
  const dias = `${resumo.diasPrevistos} ${resumo.diasPrevistos === 1 ? "dia previsto" : "dias previstos"}, ${resumo.diasComRegistro} com marcacao`;
  const alem = `Alem do previsto: ${formatarMinutos(resumo.horaExtraMinutos)} em ${quantos(resumo.diasComHoraExtra)}`;

  return {
    vtDias: [dias],
    vrDias: [dias],
    he50Minutos: [alem],
    he60Minutos: [alem],
    intrajornadaMinutos: [
      `Intrajornada nao cumprida: ${formatarMinutos(resumo.intrajornadaSuprimidaMinutos)} em ${quantos(resumo.diasComIntrajornadaCurta)}`,
    ],
    he100Minutos: [
      alem,
      `Trabalho em folga: ${formatarMinutos(resumo.trabalhoEmFolgaMinutos)} em ${quantos(resumo.trabalhoEmFolgaDias)}`,
    ],
    adicionalNoturnoMinutos: [
      `Entre 22h e 5h: ${formatarMinutos(resumo.noturnoMinutos)} (hora de relogio, sem a reducao)`,
    ],
    faltasEscala: [`Faltas no ponto: ${resumo.faltas}`],
  };
}

function quantos(dias: number) {
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}
