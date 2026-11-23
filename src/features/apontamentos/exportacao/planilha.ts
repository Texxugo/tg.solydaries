import type { ApontamentoExportado } from "./tipos";

/**
 * As colunas da planilha de apontamentos, na ordem e com os cabecalhos pedidos
 * pela folha.
 *
 * Modulo puro: diz **o que** vai em cada coluna, e `excel.ts` so diz **como**
 * a celula e desenhada. Separados, a ordem e o conteudo podem ser conferidos
 * sem abrir arquivo nenhum.
 *
 * A planilha nao tem uma coluna por rubrica: ela segue o layout do fechamento.
 * Tres colunas juntam rubricas que o portal guarda separadas:
 * - **H.EXTRA (50%)/(60%)** = HE 50% + HE 60% (o cabecalho ja diz);
 * - **FALTAS** = faltas em dia de escala + em dia de folga;
 * - **VA** = cesta basica.
 * As duas ultimas levam nota no cabecalho — sem ela, quem confere a planilha
 * contra a tela procuraria o numero em outro lugar.
 *
 * Insalubridade e desconto de DSR nao tem coluna no layout, e continuam no
 * relatorio em Word.
 */

/**
 * - `texto` e `inteiro`: como vieram;
 * - `horas`: minutos, que `excel.ts` grava como duracao (`[h]:mm`) para a folha
 *   poder somar;
 * - `percentual`: 12,5 = 12,5%;
 * - `sim`: marcacao — "Sim" ou vazio.
 */
export type FormatoDaColuna = "texto" | "inteiro" | "horas" | "percentual" | "sim";

export type ColunaDaPlanilha = {
  titulo: string;
  formato: FormatoDaColuna;
  /**
   * Largura em caracteres, como o Excel mede. Com o cabecalho na vertical, a
   * coluna so precisa caber o **valor**: por isso as numericas sao estreitas.
   */
  largura: number;
  /** Texto longo quebra dentro da celula em vez de invadir a vizinha. */
  quebraTexto?: boolean;
  /** O que a coluna junta, quando o cabecalho nao diz. Vira nota no cabecalho. */
  nota?: string;
  /** `null` e celula vazia: zero e "nao" ficam em branco, como o campo da tela. */
  valor: (linha: ApontamentoExportado) => string | number | boolean | null;
};

/** Zero e celula vazia — a planilha fica legivel, e `SOMA` ignora o vazio. */
function seHouver(numero: number) {
  return numero > 0 ? numero : null;
}

export const COLUNAS_DA_PLANILHA: readonly ColunaDaPlanilha[] = [
  { titulo: "CÓDIGO", formato: "texto", largura: 7, valor: (l) => l.matricula },
  { titulo: "COLABORADOR", formato: "texto", largura: 32, valor: (l) => l.nome },
  { titulo: "EMPRESA", formato: "texto", largura: 28, valor: (l) => l.empresa },
  {
    titulo: "POSTO DE TRABALHO",
    formato: "texto",
    largura: 24,
    nota: "Postos em que a pessoa esta na grade desta competencia.",
    valor: (l) => l.postos.join(" / ") || null,
  },
  { titulo: "CARGO", formato: "texto", largura: 18, valor: (l) => l.cargo },
  { titulo: "VT", formato: "inteiro", largura: 4, valor: (l) => seHouver(l.apontamento.vtDias) },
  { titulo: "VR", formato: "inteiro", largura: 4, valor: (l) => seHouver(l.apontamento.vrDias) },
  {
    titulo: "H.EXTRA (50%)/(60%)",
    formato: "horas",
    largura: 7,
    valor: (l) => seHouver(l.apontamento.he50Minutos + l.apontamento.he60Minutos),
  },
  {
    titulo: "INTRAJORNADA",
    formato: "horas",
    largura: 7,
    valor: (l) => seHouver(l.apontamento.intrajornadaMinutos),
  },
  {
    titulo: "H.EXTRA (100%)",
    formato: "horas",
    largura: 7,
    valor: (l) => seHouver(l.apontamento.he100Minutos),
  },
  {
    titulo: "ADN",
    formato: "horas",
    largura: 7,
    nota: "Adicional noturno.",
    valor: (l) => seHouver(l.apontamento.adicionalNoturnoMinutos),
  },
  {
    titulo: "FALTAS",
    formato: "inteiro",
    largura: 4,
    nota: "Faltas em dia de escala e em dia de folga somadas.",
    valor: (l) => seHouver(l.apontamento.faltasEscala + l.apontamento.faltasFolga),
  },
  {
    titulo: "GRAT",
    formato: "percentual",
    largura: 7,
    nota: "Gratificacao.",
    valor: (l) => seHouver(l.apontamento.gratificacaoPercentual),
  },
  {
    titulo: "PERICULOSIDADE",
    formato: "sim",
    largura: 5,
    valor: (l) => l.apontamento.periculosidade,
  },
  {
    titulo: "VA",
    formato: "sim",
    largura: 5,
    nota: "Cesta basica.",
    valor: (l) => l.apontamento.cestaBasica,
  },
  { titulo: "ASSIDUIDADE", formato: "sim", largura: 5, valor: (l) => l.apontamento.assiduidade },
  {
    titulo: "OBSERVAÇÕES",
    formato: "texto",
    largura: 45,
    quebraTexto: true,
    valor: (l) => l.apontamento.observacao,
  },
];

/** Os valores de uma linha, na ordem das colunas, ja com "Sim" nas marcacoes. */
export function valoresDaLinha(linha: ApontamentoExportado) {
  return COLUNAS_DA_PLANILHA.map((coluna) => {
    const valor = coluna.valor(linha);

    if (coluna.formato === "sim") {
      return valor ? "Sim" : null;
    }

    return valor === "" ? null : (valor as string | number | null);
  });
}
