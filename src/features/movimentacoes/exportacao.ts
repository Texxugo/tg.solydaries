import "server-only";

import ExcelJS from "exceljs";

import type { CompetenciaResumo } from "@/features/competencias/types";
import { FUSO_DO_PORTAL, diaDaSemana, nomeDaCompetencia } from "@/features/competencias/periodo";

import { formatarTamanho } from "./arquivos";
import {
  ROTULOS_TIPO_DE_MOVIMENTACAO,
  type MovimentacaoResumo,
  type PessoaDaMovimentacao,
} from "./types";

/**
 * A planilha das movimentacoes: uma linha por movimentacao, cabecalho na linha
 * 1, filtro automatico e o cabecalho congelado — para conferir e filtrar no
 * Excel, e nao para importar em lugar nenhum (ao contrario da planilha dos
 * apontamentos, que segue o layout da folha).
 *
 * A data vai como **data de verdade** (numero de serie com formato
 * `dd/mm/aaaa`), para ordenar e filtrar por periodo; o resto e texto.
 *
 * Os documentos vao como nome e tamanho, e nao como anexo: a planilha e o
 * indice, e o arquivo se abre pela tela.
 *
 * `server-only`: o `exceljs` e grande e so faz sentido no servidor.
 */

const COLUNAS = [
  { titulo: "DATA", largura: 11 },
  { titulo: "DIA", largura: 9 },
  { titulo: "TIPO", largura: 15 },
  { titulo: "COLABORADOR(ES)", largura: 34 },
  { titulo: "MATRÍCULA(S)", largura: 14 },
  { titulo: "COBRIU", largura: 28 },
  { titulo: "JUSTIFICATIVA", largura: 60 },
  { titulo: "DOCUMENTOS", largura: 30 },
  { titulo: "REGISTRADO POR", largura: 20 },
  { titulo: "REGISTRADO EM", largura: 16 },
] as const;

/** Dias entre 30/12/1899 (o zero do Excel) e 01/01/1970. */
const EPOCA_DO_EXCEL = 25569;

/** `YYYY-MM-DD` como numero de serie do Excel — sem `Date`, e sem fuso no caminho. */
function serieDaData(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 86_400_000 + EPOCA_DO_EXCEL;
}

const instante = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DO_PORTAL,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function nomes(pessoas: PessoaDaMovimentacao[]) {
  return pessoas.map((pessoa) => pessoa.nome).join("; ");
}

/**
 * Na falta, a coluna de colaborador e quem faltou e "Cobriu" e quem cobriu; nas
 * trocas, todos os envolvidos vao na mesma coluna — eles estao no mesmo pe.
 */
function valoresDaLinha(movimentacao: MovimentacaoResumo) {
  const principais = movimentacao.pessoas.filter((pessoa) => pessoa.papel !== "cobertura");
  const cobertura = movimentacao.pessoas.filter((pessoa) => pessoa.papel === "cobertura");

  return [
    serieDaData(movimentacao.data),
    diaDaSemana(movimentacao.data),
    ROTULOS_TIPO_DE_MOVIMENTACAO[movimentacao.tipo],
    nomes(principais),
    principais.map((pessoa) => pessoa.identificacao ?? "—").join("; "),
    nomes(cobertura),
    movimentacao.justificativa,
    movimentacao.documentos
      .map((documento) => `${documento.nome} (${formatarTamanho(documento.tamanhoOriginal)})`)
      .join("; "),
    movimentacao.registradoPor ?? "",
    instante.format(new Date(movimentacao.criadoEm)),
  ];
}

export async function gerarPlanilhaDeMovimentacoes(dados: {
  competencia: CompetenciaResumo;
  geradoPor: string;
  movimentacoes: MovimentacaoResumo[];
}): Promise<Uint8Array> {
  const livro = new ExcelJS.Workbook();
  livro.creator = dados.geradoPor;
  livro.created = new Date();
  livro.title = `Movimentacoes ${nomeDaCompetencia(dados.competencia.dataFim)}`;

  // Nome de aba nao aceita "/": `Setembro/2026` vira `Setembro 2026`.
  const aba = livro.addWorksheet(nomeDaCompetencia(dados.competencia.dataFim).replace("/", " "), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  aba.columns = COLUNAS.map((coluna, indice) => ({
    header: coluna.titulo,
    width: coluna.largura,
    style: {
      font: { name: "Calibri", size: 10 },
      numFmt: indice === 0 ? "dd/mm/yyyy" : "@",
      alignment: { vertical: "top", wrapText: indice >= 3 },
    },
  }));

  for (const movimentacao of dados.movimentacoes) {
    aba.addRow(valoresDaLinha(movimentacao));
  }

  const cabecalho = aba.getRow(1);
  cabecalho.font = { name: "Calibri", size: 10, bold: true };
  cabecalho.alignment = { vertical: "middle" };
  cabecalho.eachCell((celula) => {
    celula.numFmt = "@";
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });

  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };

  return new Uint8Array(await livro.xlsx.writeBuffer());
}

/** `movimentacoes-2026-09.xlsx` — ano-mes ordena certo numa pasta com varios meses. */
export function nomeDaPlanilha(competencia: CompetenciaResumo) {
  return `movimentacoes-${competencia.dataFim.slice(0, 7)}.xlsx`;
}
