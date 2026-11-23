import { formatarDuracao } from "@/features/escalas/jornada";

import {
  GRUPOS_DE_RUBRICAS,
  percentualParaCampo,
  ROTULOS_GRAU_INSALUBRIDADE,
  RUBRICAS,
  type ApontamentoDaFolha,
  type DescricaoCompleta,
  type GrupoDeRubricas,
} from "../rubricas";
import type { ApontamentoExportado } from "./tipos";

/**
 * O que o relatorio em Word organiza antes de desenhar: os totais da
 * competencia por rubrica, as pessoas agrupadas por empresa e o texto corrido
 * das rubricas de cada uma.
 *
 * Modulo puro, como `planilha.ts`: `word.ts` so transforma isto em paragrafos.
 */

export type TotalDaRubrica = {
  rubrica: DescricaoCompleta;
  /** Quantas pessoas tem esta rubrica apontada. */
  pessoas: number;
  /** O total legivel: `264 dias`, `40h30`, `2 grau medio (20%)`; vazio quando somar nao faz sentido. */
  total: string;
};

/** `true` quando a rubrica aponta alguma coisa: nao e zero, nem "nao", nem sem grau. */
function apontada(apontamento: ApontamentoDaFolha, rubrica: DescricaoCompleta) {
  const valor = apontamento[rubrica.id];
  return valor !== null && valor !== false && valor !== 0;
}

/**
 * Uma linha por rubrica que alguem tem. Dias e horas somam; grau conta por grau;
 * marcacao e percentual so contam pessoas — somar percentuais de gratificacao
 * de pessoas diferentes nao diz nada.
 */
export function totaisPorRubrica(apontamentos: readonly ApontamentoDaFolha[]): TotalDaRubrica[] {
  return RUBRICAS.flatMap((rubrica) => {
    const comValor = apontamentos.filter((apontamento) => apontada(apontamento, rubrica));

    if (comValor.length === 0) {
      return [];
    }

    const valores = comValor.map((apontamento) => apontamento[rubrica.id]);
    let total = "";

    if (rubrica.unidade === "dias") {
      const soma = (valores as number[]).reduce((acumulado, valor) => acumulado + valor, 0);
      total = `${soma} ${soma === 1 ? "dia" : "dias"}`;
    } else if (rubrica.unidade === "horas") {
      total = formatarDuracao(
        (valores as number[]).reduce((acumulado, valor) => acumulado + valor, 0),
      );
    } else if (rubrica.unidade === "grau") {
      const graus = Object.entries(ROTULOS_GRAU_INSALUBRIDADE).flatMap(([grau, rotulo]) => {
        const quantidade = valores.filter((valor) => valor === grau).length;
        return quantidade > 0 ? [`${quantidade} ${rotulo.toLowerCase()}`] : [];
      });
      total = graus.join(" · ");
    }

    return [{ rubrica, pessoas: comValor.length, total }];
  });
}

/** `Vale-transporte` -> `vale-transporte`, sem estragar sigla no meio (`Desconto de DSR`). */
function minusculaInicial(texto: string) {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

/** `a`, `a e b`, `a, b e c` — a enumeracao como se escreve. */
function enumerar(itens: readonly string[]) {
  return itens.length <= 1
    ? (itens[0] ?? "")
    : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Uma rubrica dentro da frase: o nome, e a quantidade entre parenteses.
 * Marcacao sim/nao e so o nome — "periculosidade" ja diz que tem.
 */
function rubricaNaFrase(apontamento: ApontamentoDaFolha, rubrica: DescricaoCompleta) {
  const nome = minusculaInicial(rubrica.rotulo);
  const valor = apontamento[rubrica.id];

  switch (rubrica.unidade) {
    case "dias":
      return `${nome} (${valor} ${valor === 1 ? "dia" : "dias"})`;
    case "horas":
      return `${nome} (${formatarDuracao(valor as number)})`;
    case "percentual":
      return `${nome} (${percentualParaCampo(valor as number)}%)`;
    case "sim_nao":
      return nome;
    case "grau":
      // `Grau medio (20%)` -> `grau medio, 20%`: parenteses dentro de parenteses
      // atrapalhariam a leitura.
      return `${nome} (${minusculaInicial(
        ROTULOS_GRAU_INSALUBRIDADE[apontamento.insalubridade!].replace(" (", ", ").replace(")", ""),
      )})`;
  }
}

/**
 * As rubricas de uma pessoa em texto corrido: uma frase por grupo, so com o que
 * ela tem, na ordem do catalogo —
 * "Beneficios: vale-transporte (22 dias), vale-refeicao (22 dias) e cesta basica."
 *
 * Texto, e nao tabela: o relatorio e lido de cima a baixo por quem confere a
 * folha, e uma tabela por pessoa repetia o mesmo cabecalho trezentas vezes.
 * Vazio quando a pessoa so tem observacao.
 */
export function textoDasRubricas(apontamento: ApontamentoDaFolha) {
  return (Object.keys(GRUPOS_DE_RUBRICAS) as GrupoDeRubricas[])
    .flatMap((grupo) => {
      const itens = RUBRICAS.filter(
        (rubrica) => rubrica.grupo === grupo && apontada(apontamento, rubrica),
      ).map((rubrica) => rubricaNaFrase(apontamento, rubrica));

      return itens.length > 0 ? [`${GRUPOS_DE_RUBRICAS[grupo].rotulo}: ${enumerar(itens)}.`] : [];
    })
    .join(" ");
}

/**
 * As pessoas agrupadas por empresa, em ordem alfabetica de empresa e, dentro
 * dela, na ordem em que vieram (a DAL ja entrega por nome).
 */
export function agruparPorEmpresa(apontamentos: readonly ApontamentoExportado[]) {
  const grupos = new Map<string, ApontamentoExportado[]>();

  for (const linha of apontamentos) {
    const doGrupo = grupos.get(linha.empresa) ?? [];
    doGrupo.push(linha);
    grupos.set(linha.empresa, doGrupo);
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([empresa, pessoas]) => ({ empresa, pessoas }));
}
