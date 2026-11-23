import { diasDoPeriodo } from "@/features/preenchimento/grade";
import {
  atribuirBatidas,
  type BatidaDoRelogio,
  type JanelaDoRelogio,
} from "@/features/preenchimento/relogio";

/**
 * A escala de cada funcionario lida a partir do ponto que ja foi importado.
 *
 * O cadastro guarda escala e inicio de ciclo, e a folha nao traz nenhum dos
 * dois — mas o relogio traz: **quais dias a pessoa trabalha** (o ciclo e onde
 * ele comeca) e **em que horario**. Esta e a leitura que transforma isso em
 * sugestao, para o cadastro de centenas de pessoas nao ser feito um a um.
 *
 * Ela **nao inventa escala**: escolhe entre as ja cadastradas a que melhor
 * explica as batidas. Inferir o ciclo do zero criaria um catalogo paralelo,
 * cheio de variacoes de uma escala so (a que tem uma falta no meio do mes), e
 * o portal ja trata escala como cadastro — quem cria e quem opera.
 *
 * Modulo puro, como `apuracao.ts`: recebe batidas e escalas, devolve
 * sugestoes. Nada aqui grava — a gravacao e um gesto de quem confere.
 *
 * A atribuicao das batidas ao turno vem de `preenchimento/relogio.ts`, e nao
 * de uma copia local: numa jornada que vira o dia, a saida cai na data
 * seguinte, e sem devolve-la ao turno o 12x36 noturno parece trabalhar todos os
 * dias. E a mesma regra da apuracao, e uma segunda versao dela divergiria no
 * primeiro caso de borda.
 */

/** Uma escala do catalogo, como a inferencia a testa. */
export type EscalaCandidata = {
  id: string;
  nome: string;
  diasCiclo: number;
  /** Posicoes de folga dentro do ciclo, contando de 1. */
  folgas: readonly number[];
  /** `HH:MM`. */
  entrada: string;
  saida: string;
  marcacoesEsperadas: number;
};

/** O que o relogio registrou de uma pessoa, por data. */
export type PontoDoFuncionario = {
  funcionarioId: string;
  /** Em ordem de hora dentro de cada data. */
  batidasPorData: ReadonlyMap<string, readonly BatidaDoRelogio[]>;
};

export type SugestaoDeEscala = {
  funcionarioId: string;
  escalaId: string;
  escalaNome: string;
  /** `YYYY-MM-DD`: a data que cai na posicao 1 do ciclo. */
  inicioCiclo: string;
  /** Dias do recorte conferidos — do primeiro ao ultimo com batida. */
  diasConferidos: number;
  acertos: number;
  /** `acertos / diasConferidos`, arredondado. */
  percentual: number;
  /** Distancia entre a entrada observada e a da escala, em minutos. */
  minutosDeDiferenca: number;
  /** Datas em que a escala previu o contrario do que o relogio mostra. */
  diasDivergentes: string[];
  /** Quantas batidas o turno costuma ter, contra o que a escala espera. */
  marcacoesObservadas: number;
  /**
   * Se a tela pode marca-la de saida. Sugestao fraca continua aparecendo — com
   * o motivo a vista —, porque "o ponto nao explica esta pessoa" tambem e
   * resposta, e some-la esconderia quem mais precisa de atencao.
   */
  confiavel: boolean;
};

/** Quem o ponto nao explica, e por que. */
export type SemSugestao = {
  funcionarioId: string;
  motivo: "poucos_dias" | "nenhuma_escala_explica";
  diasComBatida: number;
};

export type LeituraDoPonto = {
  sugestoes: SugestaoDeEscala[];
  semSugestao: SemSugestao[];
};

/**
 * Dias com batida abaixo disso nao sustentam um ciclo: com quatro dias, metade
 * das escalas do catalogo acerta por acaso.
 */
export const DIAS_MINIMOS = 6;

/** A partir daqui a tela marca a sugestao de saida. */
export const PERCENTUAL_CONFIAVEL = 90;

/**
 * Tolerancia entre a entrada observada e a da escala. Trinta minutos aceitam
 * quem bate 17:55 numa escala de 18:00 e ainda separam o turno da manha do da
 * tarde.
 */
export const MINUTOS_CONFIAVEIS = 30;

const MINUTOS_DO_DIA = 24 * 60;

function emMinutos(hora: string) {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/** Distancia entre dois horarios pelo caminho mais curto: 23:50 e 00:10 distam 20. */
function distanciaEmMinutos(a: string, b: string) {
  const bruta = Math.abs(emMinutos(a) - emMinutos(b));

  return Math.min(bruta, MINUTOS_DO_DIA - bruta);
}

/**
 * Mediana, e nao media: um dia em que a pessoa entrou as 03:00 para cobrir
 * alguem nao pode arrastar o horario tipico dela.
 */
function mediana(valores: number[]) {
  const ordenados = [...valores].sort((a, b) => a - b);

  return ordenados[Math.floor(ordenados.length / 2)];
}

function medianaDeHora(horas: string[]) {
  const ordenadas = [...horas].sort();

  return ordenadas[Math.floor(ordenadas.length / 2)];
}

/** `YYYY-MM-DD` mais `dias`, com a conta inteira em UTC (como `diaSeguinte`). */
function deslocarDias(data: string, dias: number) {
  const referencia = new Date(`${data}T00:00:00Z`);
  referencia.setUTCDate(referencia.getUTCDate() + dias);

  return referencia.toISOString().slice(0, 10);
}

type Tentativa = {
  escala: EscalaCandidata;
  deslocamento: number;
  acertos: number;
  diasDivergentes: string[];
  minutosDeDiferenca: number;
  marcacoesObservadas: number;
};

/**
 * Uma escala contra os dias de uma pessoa, em todas as posicoes possiveis do
 * ciclo.
 *
 * O ciclo diz o padrao, e a ancora diz onde ele comeca: sao `dias_ciclo`
 * deslocamentos a testar, e nao um. Sem isso, um 12x36 so seria reconhecido em
 * quem por acaso trabalhou no primeiro dia da janela.
 */
function testarEscala(
  escala: EscalaCandidata,
  dias: readonly string[],
  janela: JanelaDoRelogio,
  batidasPorData: ReadonlyMap<string, readonly BatidaDoRelogio[]>,
): Tentativa | null {
  const turnos = atribuirBatidas({
    dias,
    janela,
    batidasPorData,
    referenciaDoDia: () => ({ entrada: escala.entrada, saida: escala.saida }),
  });

  const trabalhou = dias.map((data) => turnos[data] !== undefined);

  if (!trabalhou.some(Boolean)) {
    return null;
  }

  const primeiras = dias.flatMap((data) => {
    const turno = turnos[data];

    return turno && turno.length > 0 ? [turno[0].hora] : [];
  });

  const contagens = dias.flatMap((data) => (turnos[data] ? [turnos[data].length] : []));

  const folgas = new Set(escala.folgas);
  let melhor: Tentativa | null = null;

  for (let deslocamento = 0; deslocamento < escala.diasCiclo; deslocamento += 1) {
    const divergentes: string[] = [];

    dias.forEach((data, indice) => {
      const posicao =
        ((((indice - deslocamento) % escala.diasCiclo) + escala.diasCiclo) % escala.diasCiclo) + 1;

      if (trabalhou[indice] === folgas.has(posicao)) {
        divergentes.push(data);
      }
    });

    const acertos = dias.length - divergentes.length;

    if (!melhor || acertos > melhor.acertos) {
      melhor = {
        escala,
        deslocamento,
        acertos,
        diasDivergentes: divergentes,
        minutosDeDiferenca: distanciaEmMinutos(medianaDeHora(primeiras), escala.entrada),
        marcacoesObservadas: mediana(contagens),
      };
    }
  }

  return melhor;
}

/**
 * Qual das duas tentativas explica melhor a pessoa.
 *
 * A ordem e hierarquica, e nao uma nota unica: primeiro os dias (e o padrao de
 * trabalho que identifica a escala), depois o horario (e ele que separa o
 * 12x36 diurno do noturno, que tem exatamente o mesmo ciclo) e por fim a
 * quantidade de marcacoes (que separa a escala com intervalo marcado da que
 * nao o marca). Somar tudo num numero so deixaria um horario de dez horas de
 * diferenca ser compensado por um dia a mais de acerto.
 */
function melhorQue(candidata: Tentativa, atual: Tentativa) {
  if (candidata.acertos !== atual.acertos) {
    return candidata.acertos > atual.acertos;
  }

  if (candidata.minutosDeDiferenca !== atual.minutosDeDiferenca) {
    return candidata.minutosDeDiferenca < atual.minutosDeDiferenca;
  }

  const distanciaDaCandidata = Math.abs(
    candidata.marcacoesObservadas - candidata.escala.marcacoesEsperadas,
  );
  const distanciaAtual = Math.abs(atual.marcacoesObservadas - atual.escala.marcacoesEsperadas);

  if (distanciaDaCandidata !== distanciaAtual) {
    return distanciaDaCandidata < distanciaAtual;
  }

  // Empate real: o ciclo mais curto explica o mesmo com menos suposicao.
  return candidata.escala.diasCiclo < atual.escala.diasCiclo;
}

/**
 * A escala que o ponto sugere para cada pessoa.
 *
 * O recorte e por pessoa — do primeiro ao ultimo dia com batida —, e nao a
 * janela inteira: quem foi admitido ou desligado no meio do periodo tem dias
 * vazios que nao sao folga, e conta-los como tal faria o ciclo errado ganhar.
 */
export function sugerirEscalas({
  pontos,
  escalas,
  janela,
}: {
  pontos: readonly PontoDoFuncionario[];
  escalas: readonly EscalaCandidata[];
  janela: JanelaDoRelogio;
}): LeituraDoPonto {
  const sugestoes: SugestaoDeEscala[] = [];
  const semSugestao: SemSugestao[] = [];

  for (const ponto of pontos) {
    const datas = [...ponto.batidasPorData.keys()]
      .filter((data) => data >= janela.inicio && data <= janela.fim)
      .sort();

    if (datas.length < DIAS_MINIMOS) {
      semSugestao.push({
        funcionarioId: ponto.funcionarioId,
        motivo: "poucos_dias",
        diasComBatida: datas.length,
      });

      continue;
    }

    const dias = diasDoPeriodo(datas[0], datas[datas.length - 1]);
    let melhor: Tentativa | null = null;

    for (const escala of escalas) {
      const tentativa = testarEscala(escala, dias, janela, ponto.batidasPorData);

      if (tentativa && (!melhor || melhorQue(tentativa, melhor))) {
        melhor = tentativa;
      }
    }

    if (!melhor) {
      semSugestao.push({
        funcionarioId: ponto.funcionarioId,
        motivo: "nenhuma_escala_explica",
        diasComBatida: datas.length,
      });

      continue;
    }

    const percentual = Math.round((100 * melhor.acertos) / dias.length);

    sugestoes.push({
      funcionarioId: ponto.funcionarioId,
      escalaId: melhor.escala.id,
      escalaNome: melhor.escala.nome,
      inicioCiclo: deslocarDias(dias[0], melhor.deslocamento),
      diasConferidos: dias.length,
      acertos: melhor.acertos,
      percentual,
      minutosDeDiferenca: melhor.minutosDeDiferenca,
      diasDivergentes: melhor.diasDivergentes,
      marcacoesObservadas: melhor.marcacoesObservadas,
      confiavel:
        percentual >= PERCENTUAL_CONFIAVEL && melhor.minutosDeDiferenca <= MINUTOS_CONFIAVEIS,
    });
  }

  return { sugestoes, semSugestao };
}
