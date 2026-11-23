import type { InsalubridadeGrau } from "@/db/schema";
import { formatarDuracao } from "@/features/escalas/jornada";

/**
 * O vocabulario do apontamento: quais rubricas existem, em que unidade cada uma
 * e medida, como se le o que foi digitado e como se escreve o que foi gravado.
 *
 * Modulo puro de proposito (so `import type` do schema, e `jornada.ts`, que
 * tambem e puro): e consumido pela action, pela DAL, pela lista e pelo
 * formulario client, e nenhum deles deve arrastar o Drizzle nem o React para o
 * outro lado — mesma regra de `areas.ts` e `periodo.ts`.
 *
 * O `Record<Rubrica, ...>` amarra o catalogo ao tipo: rubrica nova sem rotulo,
 * unidade e grupo quebra o typecheck, e e o catalogo que desenha o formulario e
 * o resumo da lista — nenhum dos dois esquece uma coluna em silencio.
 */

/** O apontamento como a aplicacao o enxerga, sem id nem autoria. */
export type ApontamentoDaFolha = {
  vtDias: number;
  vrDias: number;
  cestaBasica: boolean;
  he50Minutos: number;
  he60Minutos: number;
  he100Minutos: number;
  adicionalNoturnoMinutos: number;
  intrajornadaMinutos: number;
  insalubridade: InsalubridadeGrau | null;
  periculosidade: boolean;
  assiduidade: boolean;
  gratificacaoPercentual: number;
  faltasEscala: number;
  faltasFolga: number;
  dsrDescontados: number;
  observacao: string | null;
};

/** Toda coluna que aponta alguma coisa. A observacao e texto, e nao rubrica. */
export type Rubrica = Exclude<keyof ApontamentoDaFolha, "observacao">;

/**
 * A unidade decide o campo, a leitura e a escrita:
 * - `dias`: inteiro, limitado pelo tamanho da competencia;
 * - `horas`: `HH:MM` digitado, minutos gravados;
 * - `sim_nao`: marcado ou nao;
 * - `grau`: o grau da insalubridade, ou nenhum;
 * - `percentual`: ate duas casas, de 0 a 100.
 */
export type UnidadeDaRubrica = "dias" | "horas" | "sim_nao" | "grau" | "percentual";

export type GrupoDeRubricas = "beneficios" | "horas" | "adicionais" | "ocorrencias";

type DescricaoDaRubrica = {
  rotulo: string;
  /** O que cabe num selo da lista: "HE 50%", "VT". */
  curto: string;
  unidade: UnidadeDaRubrica;
  grupo: GrupoDeRubricas;
  ajuda?: string;
};

/**
 * Ordem das chaves = ordem dos passos do preenchimento e dos selos na lista. E a
 * ordem da folha, a mesma das colunas da planilha (`COLUNAS_DA_PLANILHA`):
 * quem aponta le o relatorio da folha de cima a baixo. Insalubridade e desconto
 * de DSR nao tem coluna na planilha e ficam no fim.
 */
const CATALOGO: Record<Rubrica, DescricaoDaRubrica> = {
  vtDias: { rotulo: "Vale-transporte", curto: "VT", unidade: "dias", grupo: "beneficios" },
  vrDias: { rotulo: "Vale-refeicao", curto: "VR", unidade: "dias", grupo: "beneficios" },
  he50Minutos: {
    rotulo: "Horas extras 50%",
    curto: "HE 50%",
    unidade: "horas",
    grupo: "horas",
  },
  he60Minutos: {
    rotulo: "Horas extras 60%",
    curto: "HE 60%",
    unidade: "horas",
    grupo: "horas",
  },
  intrajornadaMinutos: {
    rotulo: "Intrajornada",
    curto: "Intrajornada",
    unidade: "horas",
    grupo: "horas",
    ajuda: "Intervalo nao concedido, a indenizar.",
  },
  he100Minutos: {
    rotulo: "Horas extras 100%",
    curto: "HE 100%",
    unidade: "horas",
    grupo: "horas",
  },
  adicionalNoturnoMinutos: {
    rotulo: "Adicional noturno",
    curto: "Ad. noturno",
    unidade: "horas",
    grupo: "horas",
    ajuda: "Horas trabalhadas entre 22h e 5h.",
  },
  faltasEscala: {
    rotulo: "Faltas em dia de escala",
    curto: "Faltas (escala)",
    unidade: "dias",
    grupo: "ocorrencias",
  },
  faltasFolga: {
    rotulo: "Faltas em dia de folga",
    curto: "Faltas (folga)",
    unidade: "dias",
    grupo: "ocorrencias",
    ajuda: "Folga para a qual a pessoa tinha sido convocada.",
  },
  gratificacaoPercentual: {
    rotulo: "Gratificacao",
    curto: "Gratificacao",
    unidade: "percentual",
    grupo: "adicionais",
  },
  periculosidade: {
    rotulo: "Periculosidade",
    curto: "Periculosidade",
    unidade: "sim_nao",
    grupo: "adicionais",
  },
  cestaBasica: {
    rotulo: "Cesta basica",
    curto: "Cesta basica",
    unidade: "sim_nao",
    grupo: "beneficios",
  },
  assiduidade: {
    rotulo: "Assiduidade",
    curto: "Assiduidade",
    unidade: "sim_nao",
    grupo: "adicionais",
    ajuda: "Faz jus ao premio assiduidade.",
  },
  insalubridade: {
    rotulo: "Insalubridade",
    curto: "Insalubridade",
    unidade: "grau",
    grupo: "adicionais",
  },
  dsrDescontados: {
    rotulo: "Desconto de DSR",
    curto: "DSR descontado",
    unidade: "dias",
    grupo: "ocorrencias",
    ajuda: "Quantos descansos semanais perdem o pagamento.",
  },
};

export const GRUPOS_DE_RUBRICAS: Record<GrupoDeRubricas, { rotulo: string; descricao: string }> = {
  beneficios: { rotulo: "Beneficios", descricao: "Vales e cesta basica da competencia." },
  horas: {
    rotulo: "Horas",
    descricao: "Em horas e minutos (12:30), somadas no periodo inteiro.",
  },
  adicionais: { rotulo: "Adicionais", descricao: "Adicionais, premio e gratificacao." },
  ocorrencias: {
    rotulo: "Ocorrencias",
    descricao: "O que desconta: faltas e descansos semanais perdidos.",
  },
};

export type DescricaoCompleta = DescricaoDaRubrica & { id: Rubrica };

export const RUBRICAS: readonly DescricaoCompleta[] = (Object.keys(CATALOGO) as Rubrica[]).map(
  (id) => ({ id, ...CATALOGO[id] }),
);

export function rubricasDoGrupo(grupo: GrupoDeRubricas) {
  return RUBRICAS.filter((rubrica) => rubrica.grupo === grupo);
}

/**
 * Os graus, na ordem do enum `insalubridade_grau`. O `satisfies` confere que
 * cada valor existe no enum; o `Record` dos rotulos confere que nenhum ficou de
 * fora. Sai daqui, e nao do enum do Drizzle, para que `schema.ts` continue
 * podendo ser lido por componente client — mesma escolha de `IDS_DIVERGENCIA`.
 */
export const IDS_GRAU_INSALUBRIDADE = [
  "minimo",
  "medio",
  "maximo",
] as const satisfies readonly InsalubridadeGrau[];

export const ROTULOS_GRAU_INSALUBRIDADE: Record<InsalubridadeGrau, string> = {
  minimo: "Grau minimo (10%)",
  medio: "Grau medio (20%)",
  maximo: "Grau maximo (40%)",
};

/** 744 horas = 31 dias inteiros. Mesmo teto do `check apontamentos_minutos_validos`. */
export const MAXIMO_DE_MINUTOS = 744 * 60;

/** Mesmo teto dos `check` de dias: nenhuma competencia do portal passa de 31. */
export const MAXIMO_DE_DIAS = 31;

export const APONTAMENTO_VAZIO: ApontamentoDaFolha = {
  vtDias: 0,
  vrDias: 0,
  cestaBasica: false,
  he50Minutos: 0,
  he60Minutos: 0,
  he100Minutos: 0,
  adicionalNoturnoMinutos: 0,
  intrajornadaMinutos: 0,
  insalubridade: null,
  periculosidade: false,
  assiduidade: false,
  gratificacaoPercentual: 0,
  faltasEscala: 0,
  faltasFolga: 0,
  dsrDescontados: 0,
  observacao: null,
};

/**
 * Horas digitadas -> minutos. Aceita `12:30`, `0:45` e horas inteiras (`12`);
 * vazio e zero. `null` para o que nao e hora.
 *
 * **Nao aceita decimal** ("1,5", "1.30") de proposito: na folha "1,30" e lido
 * ora como uma hora e meia, ora como uma hora e trinta, e escolher uma das duas
 * gravaria a outra para metade de quem digita. Com dois pontos nao ha duvida.
 */
export function lerHoras(texto: string): number | null {
  const valor = texto.trim();

  if (valor === "") {
    return 0;
  }

  const partes = /^(\d{1,3})(?::([0-5]\d))?$/.exec(valor);

  if (!partes) {
    return null;
  }

  return Number(partes[1]) * 60 + Number(partes[2] ?? "0");
}

/** Minutos -> o que o campo mostra (`12:30`). Zero e campo vazio, e nao `0:00`. */
export function horasParaCampo(minutos: number) {
  if (minutos === 0) {
    return "";
  }

  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;
}

/**
 * Percentual digitado -> numero. Aceita virgula ou ponto e ate duas casas
 * (`12,5`, `12.50`); vazio e zero. `null` para o resto.
 *
 * Aqui a virgula nao e ambigua como nas horas: percentual nao tem minutos.
 */
export function lerPercentual(texto: string): number | null {
  const valor = texto.trim().replace("%", "").trim();

  if (valor === "") {
    return 0;
  }

  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(valor)) {
    return null;
  }

  return Number(valor.replace(",", "."));
}

/** `12,5` — com virgula, como quem digitou espera ver de volta. Zero e vazio. */
export function percentualParaCampo(percentual: number) {
  return percentual === 0 ? "" : String(percentual).replace(".", ",");
}

/**
 * `true` quando o apontamento nao aponta nada — nenhuma rubrica e nenhuma
 * observacao. E o que decide se a linha e gravada ou apagada, com a mesma regra
 * do `check apontamentos_nao_vazio`.
 */
export function apontamentoVazio(apontamento: ApontamentoDaFolha) {
  return (
    RUBRICAS.every((rubrica) => valorDaRubrica(apontamento, rubrica.id) === null) &&
    !apontamento.observacao?.trim()
  );
}

/**
 * O valor de uma rubrica para leitura (`22 dias`, `12h30`, `Grau medio (20%)`),
 * ou `null` quando ela nao aponta nada — zero, desmarcada ou sem grau.
 */
export function valorDaRubrica(apontamento: ApontamentoDaFolha, rubrica: Rubrica): string | null {
  const { unidade } = CATALOGO[rubrica];
  const valor = apontamento[rubrica];

  switch (unidade) {
    case "dias":
      return typeof valor === "number" && valor > 0
        ? `${valor} ${valor === 1 ? "dia" : "dias"}`
        : null;
    case "horas":
      return typeof valor === "number" && valor > 0 ? formatarDuracao(valor) : null;
    case "percentual":
      return typeof valor === "number" && valor > 0 ? `${percentualParaCampo(valor)}%` : null;
    case "sim_nao":
      return valor === true ? "Sim" : null;
    case "grau":
      return typeof valor === "string"
        ? ROTULOS_GRAU_INSALUBRIDADE[valor as InsalubridadeGrau]
        : null;
  }
}

/**
 * O que o apontamento diz, rubrica a rubrica, so com o que nao e zero — os selos
 * da lista. Marcacoes sim/nao dispensam o "Sim": o selo "Periculosidade" ja diz.
 */
export function resumoDoApontamento(apontamento: ApontamentoDaFolha) {
  return RUBRICAS.flatMap((rubrica) => {
    const valor = valorDaRubrica(apontamento, rubrica.id);

    if (valor === null) {
      return [];
    }

    return [
      {
        id: rubrica.id,
        grupo: rubrica.grupo,
        texto:
          rubrica.unidade === "sim_nao"
            ? rubrica.curto
            : rubrica.unidade === "grau"
              ? `${rubrica.curto} ${ROTULOS_GRAU_INSALUBRIDADE[apontamento.insalubridade!].toLowerCase()}`
              : `${rubrica.curto} ${valor}`,
      },
    ];
  });
}

/**
 * `true` quando dois apontamentos dizem a mesma coisa em **todas** as rubricas.
 *
 * A observacao fica de fora de proposito: ela e do humano que fechou a folha, e
 * nenhuma regra a escreve — compara-la faria toda ficha com bilhete aparecer
 * como divergente da sugestao.
 */
export function mesmasRubricas(a: ApontamentoDaFolha, b: ApontamentoDaFolha) {
  return RUBRICAS.every((rubrica) => a[rubrica.id] === b[rubrica.id]);
}
