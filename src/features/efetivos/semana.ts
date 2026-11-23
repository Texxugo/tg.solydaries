/**
 * A semana do efetivo: de segunda a domingo, por posto, uma linha por pessoa e
 * uma coluna por dia.
 *
 * Modulo puro (so `import type` e funcoes puras): a tela e a planilha montam a
 * grade pela mesma funcao, e as duas nunca divergem no que poem numa celula.
 */

import { diaSeguinte } from "@/features/competencias/periodo";

import type { ExcecaoDoLancamento, LancamentoDoPeriodo, PostoDoLancamento } from "./types";

/** A segunda-feira da semana de `data` (`YYYY-MM-DD`), em UTC — sem fuso no caminho. */
export function segundaDaSemana(data: string) {
  const referencia = new Date(`${data}T00:00:00Z`);
  // getUTCDay: 0 = domingo. Domingo pertence a semana que comecou 6 dias antes.
  const recuo = (referencia.getUTCDay() + 6) % 7;
  referencia.setUTCDate(referencia.getUTCDate() - recuo);
  return referencia.toISOString().slice(0, 10);
}

/** Os sete dias a partir da segunda. */
export function diasDaSemana(segunda: string) {
  const dias = [segunda];

  while (dias.length < 7) {
    dias.push(diaSeguinte(dias[dias.length - 1]));
  }

  return dias;
}

/** O que uma celula da grade diz sobre a pessoa num dia. */
export type RegistroDoDia =
  | {
      tipo: "presente";
      entrada: string;
      saida: string;
      viraODia: boolean;
      local: string;
      excecao: ExcecaoDoLancamento | null;
    }
  | {
      tipo: "falta";
      entrada: string;
      saida: string;
      local: string;
      /** `null` e falta sem cobertura: o posto ficou descoberto. */
      cobertoPor: string | null;
      observacao: string | null;
    };

export type LinhaDaSemana = {
  pessoa: string;
  nome: string;
  identificacao: string | null;
  freelancer: boolean;
  /** Um array por dia (sete), porque a pessoa pode ter dois turnos no dia. */
  dias: RegistroDoDia[][];
};

export type PostoDaSemana = {
  posto: PostoDoLancamento;
  linhas: LinhaDaSemana[];
  /** Quantos registros presentes por dia — o efetivo que o posto teve. */
  presentes: number[];
  /** Faltas sem cobertura por dia — os turnos que ficaram descobertos. */
  descobertos: number[];
};

/** O que a excecao diz, curto, para caber na celula. */
export function resumoDaExcecao(excecao: ExcecaoDoLancamento) {
  const detalhes = [
    excecao.comportamento === "cobertura" && excecao.contraparte
      ? `faltou ${excecao.contraparte.nome}`
      : null,
    excecao.comportamento === "troca" && excecao.contraparte
      ? `trocou com ${excecao.contraparte.nome}`
      : null,
    excecao.comportamento === "troca" && excecao.postoOrigem
      ? `veio de ${excecao.postoOrigem.codigo}`
      : null,
    excecao.observacao,
  ].filter(Boolean);

  return detalhes.length > 0 ? `${excecao.tipo}: ${detalhes.join(" · ")}` : excecao.tipo;
}

/**
 * Monta a grade da semana a partir dos lancamentos.
 *
 * Cada lancamento vira o registro da pessoa da linha — presente, ou falta na
 * falta sem cobertura — e, na cobertura, tambem a **falta** de quem faltou, na
 * linha dela. E assim que a falta coberta aparece sem ser um lancamento.
 *
 * As pessoas de cada posto saem na ordem do primeiro horario de entrada da
 * semana, e depois pelo nome: a equipe do dia antes da da noite.
 */
export function montarSemana(lancamentos: LancamentoDoPeriodo[], dias: string[]) {
  const indiceDoDia = new Map(dias.map((dia, indice) => [dia, indice]));
  const postos = new Map<
    string,
    { posto: PostoDoLancamento; pessoas: Map<string, LinhaDaSemana & { primeiraEntrada: string }> }
  >();

  function linhaDe(
    posto: PostoDoLancamento,
    pessoa: { valor: string; nome: string; identificacao: string | null; freelancer: boolean },
  ) {
    const doPosto = postos.get(posto.id) ?? { posto, pessoas: new Map() };
    postos.set(posto.id, doPosto);

    const existente = doPosto.pessoas.get(pessoa.valor);

    if (existente) {
      // A contraparte nao traz matricula; a linha propria da pessoa, sim.
      existente.identificacao ??= pessoa.identificacao;
      return existente;
    }

    const nova = {
      pessoa: pessoa.valor,
      nome: pessoa.nome,
      identificacao: pessoa.identificacao,
      freelancer: pessoa.freelancer,
      dias: dias.map(() => [] as RegistroDoDia[]),
      primeiraEntrada: "99:99",
    };
    doPosto.pessoas.set(pessoa.valor, nova);
    return nova;
  }

  for (const lancamento of lancamentos) {
    const dia = indiceDoDia.get(lancamento.data);

    if (dia === undefined) {
      continue;
    }

    const excecao = lancamento.excecao;
    const linha = linhaDe(lancamento.posto, {
      valor: lancamento.pessoa,
      nome: lancamento.nome,
      identificacao: lancamento.identificacao,
      freelancer: lancamento.freelancer,
    });

    linha.dias[dia].push(
      excecao?.comportamento === "falta_sem_cobertura"
        ? {
            tipo: "falta",
            entrada: lancamento.entrada,
            saida: lancamento.saida,
            local: lancamento.local,
            cobertoPor: null,
            observacao: excecao.observacao,
          }
        : {
            tipo: "presente",
            entrada: lancamento.entrada,
            saida: lancamento.saida,
            viraODia: lancamento.viraODia,
            local: lancamento.local,
            excecao,
          },
    );
    linha.primeiraEntrada =
      lancamento.entrada < linha.primeiraEntrada ? lancamento.entrada : linha.primeiraEntrada;

    if (excecao?.comportamento === "cobertura" && excecao.contraparte) {
      const faltou = linhaDe(lancamento.posto, {
        valor: excecao.contraparte.valor,
        nome: excecao.contraparte.nome,
        identificacao: null,
        freelancer: excecao.contraparte.valor.startsWith("l:"),
      });

      faltou.dias[dia].push({
        tipo: "falta",
        entrada: lancamento.entrada,
        saida: lancamento.saida,
        local: lancamento.local,
        cobertoPor: lancamento.nome,
        observacao: null,
      });
      faltou.primeiraEntrada =
        lancamento.entrada < faltou.primeiraEntrada ? lancamento.entrada : faltou.primeiraEntrada;
    }
  }

  return [...postos.values()]
    .sort((a, b) => a.posto.codigo.localeCompare(b.posto.codigo))
    .map(({ posto, pessoas }): PostoDaSemana => {
      const linhas = [...pessoas.values()]
        .sort(
          (a, b) =>
            a.primeiraEntrada.localeCompare(b.primeiraEntrada) || a.nome.localeCompare(b.nome),
        )
        .map((linha): LinhaDaSemana => ({
          pessoa: linha.pessoa,
          nome: linha.nome,
          identificacao: linha.identificacao,
          freelancer: linha.freelancer,
          dias: linha.dias,
        }));

      return {
        posto,
        linhas,
        presentes: dias.map((_, indice) =>
          linhas.reduce(
            (total, linha) =>
              total + linha.dias[indice].filter((registro) => registro.tipo === "presente").length,
            0,
          ),
        ),
        descobertos: dias.map((_, indice) =>
          linhas.reduce(
            (total, linha) =>
              total +
              linha.dias[indice].filter(
                (registro) => registro.tipo === "falta" && !registro.cobertoPor,
              ).length,
            0,
          ),
        ),
      };
    });
}
