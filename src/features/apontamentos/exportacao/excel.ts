import "server-only";

import ExcelJS from "exceljs";

import { nomeDaCompetencia } from "@/features/competencias/periodo";

import { COLUNAS_DA_PLANILHA, valoresDaLinha, type FormatoDaColuna } from "./planilha";
import type { DadosDaExportacao } from "./tipos";

/**
 * A planilha dos apontamentos: uma linha por funcionario, cabecalho na linha 1.
 *
 * Sem titulo acima do cabecalho e sem linha de total no fim, de proposito: a
 * planilha e lida por quem importa na folha, e qualquer linha que nao seja
 * funcionario teria de ser apagada a mao antes. A competencia vai no nome da
 * aba e do arquivo.
 *
 * Fonte 7 no documento inteiro e cabecalho na vertical, de baixo para cima,
 * branco sobre preto — o layout da folha. Com o cabecalho em pe, as dezessete
 * colunas cabem na largura de uma pagina: cada coluna numerica so precisa caber
 * o valor, e nao o titulo.
 *
 * `server-only`: o `exceljs` e grande e so faz sentido no servidor.
 */

/** Tamanho da fonte do documento inteiro, cabecalho incluido. */
const TAMANHO_DA_FONTE = 7;

const FONTE = { name: "Calibri", size: TAMANHO_DA_FONTE };

/**
 * Como cada formato vira celula. Horas sao gravadas como **fracao de dia** com
 * formato `[h]:mm`, e nao como texto "12:30": assim a folha soma a coluna, e o
 * `[h]` impede o Excel de zerar a contagem a cada 24 horas.
 */
const NUMERO: Record<FormatoDaColuna, string | undefined> = {
  texto: "@",
  inteiro: "0",
  horas: "[h]:mm",
  percentual: "0.00%",
  sim: undefined,
};

function valorDaCelula(formato: FormatoDaColuna, valor: string | number | null) {
  if (valor === null) {
    return null;
  }

  if (formato === "horas") {
    return (valor as number) / (24 * 60);
  }

  if (formato === "percentual") {
    return (valor as number) / 100;
  }

  return valor;
}

/**
 * Altura da linha do cabecalho, em pontos: o titulo mais longo, de pe, precisa
 * caber inteiro. Na fonte 7 cada caractere ocupa perto de 4,5 pt; a folga cobre
 * as margens da celula.
 */
function alturaDoCabecalho() {
  const maior = Math.max(...COLUNAS_DA_PLANILHA.map((coluna) => coluna.titulo.length));
  return Math.ceil(maior * 4.5) + 12;
}

export async function gerarPlanilha(dados: DadosDaExportacao): Promise<Uint8Array> {
  const livro = new ExcelJS.Workbook();
  livro.creator = dados.geradoPor;
  livro.created = dados.geradoEm;
  livro.title = `Apontamentos ${nomeDaCompetencia(dados.competencia.dataFim)}`;

  // Nome de aba nao aceita "/": `Setembro/2026` vira `Setembro 2026`.
  const aba = livro.addWorksheet(nomeDaCompetencia(dados.competencia.dataFim).replace("/", " "), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // O estilo da coluna vale para toda celula criada nela depois — e e assim que
  // a fonte 7 chega as linhas de funcionario sem ser repetida celula a celula.
  aba.columns = COLUNAS_DA_PLANILHA.map((coluna) => ({
    header: coluna.titulo,
    width: coluna.largura,
    style: {
      font: FONTE,
      numFmt: NUMERO[coluna.formato],
      alignment: {
        vertical: "top",
        horizontal: coluna.formato === "texto" ? "left" : "center",
        wrapText: coluna.quebraTexto ?? false,
      },
    },
  }));

  for (const linha of dados.apontamentos) {
    const valores = valoresDaLinha(linha);

    aba.addRow(
      COLUNAS_DA_PLANILHA.map((coluna, indice) => valorDaCelula(coluna.formato, valores[indice])),
    );
  }

  const cabecalho = aba.getRow(1);
  cabecalho.height = alturaDoCabecalho();

  COLUNAS_DA_PLANILHA.forEach((coluna, indice) => {
    const celula = cabecalho.getCell(indice + 1);

    celula.font = { ...FONTE, color: { argb: "FFFFFFFF" } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
    // `textRotation: 90` gira o texto no sentido anti-horario: le-se de baixo
    // para cima. (`"vertical"` empilharia as letras, uma embaixo da outra.)
    // Ancorado embaixo, todo titulo comeca na mesma altura.
    celula.alignment = { textRotation: 90, vertical: "bottom", horizontal: "center" };
    // O formato de texto da coluna nao vale para o titulo.
    celula.numFmt = "@";

    if (coluna.nota) {
      celula.note = coluna.nota;
    }
  });

  aba.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUNAS_DA_PLANILHA.length },
  };

  return new Uint8Array(await livro.xlsx.writeBuffer());
}
