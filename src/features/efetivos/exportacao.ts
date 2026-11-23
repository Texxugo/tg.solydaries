import "server-only";

import ExcelJS from "exceljs";

import { FUSO_DO_PORTAL, diaDaSemana, formatarData } from "@/features/competencias/periodo";

import { resumoDaExcecao, type PostoDaSemana, type RegistroDoDia } from "./semana";
import type { LancamentoDoPeriodo } from "./types";

/**
 * A planilha da semana, em duas abas:
 *
 * - **Semana**: a mesma grade da tela (`montarSemana()`), um bloco por posto,
 *   uma linha por pessoa e uma coluna por dia — e o que se le para preencher a
 *   planilha de escala. Falta descoberta em vermelho, falta coberta em ambar e
 *   excecao em lilas, como na tela.
 * - **Lancamentos**: uma linha por lancamento, com filtro automatico — para
 *   filtrar e conferir no Excel (por pessoa, por tipo de excecao, por quem
 *   lancou).
 *
 * As datas da aba Lancamentos vao como **data de verdade** (numero de serie com
 * formato `dd/mm/aaaa`), como na planilha das movimentacoes.
 *
 * `server-only`: o `exceljs` e grande e so faz sentido no servidor.
 */

const FONTE = { name: "Calibri", size: 10 } as const;
const CINZA = "FFE5E7EB";
const VERMELHO = "FFFEE2E2";
const AMBAR = "FFFEF3C7";
const LILAS = "FFEDE9FE";

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

function preencher(celula: ExcelJS.Cell, cor: string) {
  celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
}

/** O texto de uma celula da grade: os registros do dia, um por linha. */
function textoDoDia(registros: RegistroDoDia[]) {
  return registros
    .map((registro) =>
      registro.tipo === "falta"
        ? [
            registro.cobertoPor ? "FALTA" : "FALTA - DESCOBERTO",
            `${registro.entrada}-${registro.saida} ${registro.local}`,
            registro.cobertoPor ? `coberto por ${registro.cobertoPor}` : null,
            registro.observacao,
          ]
            .filter(Boolean)
            .join("\n")
        : [
            `${registro.entrada}-${registro.saida} ${registro.local}`,
            registro.excecao ? resumoDaExcecao(registro.excecao) : null,
          ]
            .filter(Boolean)
            .join("\n"),
    )
    .join("\n\n");
}

/** A cor da celula: a do registro mais grave do dia. */
function corDoDia(registros: RegistroDoDia[]) {
  if (registros.some((registro) => registro.tipo === "falta" && !registro.cobertoPor)) {
    return VERMELHO;
  }

  if (registros.some((registro) => registro.tipo === "falta")) {
    return AMBAR;
  }

  if (registros.some((registro) => registro.tipo === "presente" && registro.excecao)) {
    return LILAS;
  }

  return null;
}

function abaDaSemana(livro: ExcelJS.Workbook, semana: PostoDaSemana[], dias: string[]) {
  const aba = livro.addWorksheet("Semana", {
    views: [{ state: "frozen", xSplit: 2 }],
  });

  aba.columns = [{ width: 32 }, { width: 12 }, ...dias.map(() => ({ width: 24 }))];

  for (const { posto, linhas, presentes, descobertos } of semana) {
    const titulo = aba.addRow([`${posto.codigo} — ${posto.nome}`]);
    titulo.font = { ...FONTE, size: 12, bold: true };
    aba.mergeCells(titulo.number, 1, titulo.number, 2 + dias.length);

    const cabecalho = aba.addRow([
      "FUNCIONARIO",
      "MATRICULA",
      ...dias.map((dia) => `${diaDaSemana(dia).toUpperCase()} ${formatarData(dia).slice(0, 5)}`),
    ]);
    cabecalho.font = { ...FONTE, bold: true };
    cabecalho.eachCell((celula) => preencher(celula, CINZA));

    for (const linha of linhas) {
      const nome = linha.freelancer ? `${linha.nome} (freelancer)` : linha.nome;
      const row = aba.addRow([nome, linha.identificacao ?? "", ...linha.dias.map(textoDoDia)]);
      row.font = FONTE;
      row.alignment = { vertical: "top", wrapText: true };

      linha.dias.forEach((registros, indice) => {
        const cor = corDoDia(registros);

        if (cor) {
          preencher(row.getCell(3 + indice), cor);
        }
      });
    }

    const rodape = aba.addRow([
      "EFETIVO DO DIA",
      "",
      ...dias.map((_, indice) =>
        descobertos[indice] > 0
          ? `${presentes[indice]} (${descobertos[indice]} descoberto${descobertos[indice] > 1 ? "s" : ""})`
          : String(presentes[indice]),
      ),
    ]);
    rodape.font = { ...FONTE, bold: true };
    rodape.eachCell((celula) => preencher(celula, CINZA));

    aba.addRow([]);
  }

  return aba;
}

const COLUNAS_DA_LISTA = [
  { titulo: "DATA", largura: 11 },
  { titulo: "DIA", largura: 6 },
  { titulo: "POSTO", largura: 10 },
  { titulo: "FUNCIONARIO", largura: 32 },
  { titulo: "MATRICULA", largura: 11 },
  { titulo: "FREELANCER", largura: 11 },
  { titulo: "LOCAL", largura: 14 },
  { titulo: "ENTRADA", largura: 9 },
  { titulo: "SAIDA", largura: 9 },
  { titulo: "VIRA O DIA", largura: 10 },
  { titulo: "EXCECAO", largura: 20 },
  { titulo: "QUEM FALTOU / TROCOU COM", largura: 28 },
  { titulo: "VEIO DO POSTO", largura: 13 },
  { titulo: "OBSERVACAO", largura: 30 },
  { titulo: "LANCADO POR", largura: 20 },
  { titulo: "LANCADO EM", largura: 16 },
] as const;

function abaDosLancamentos(livro: ExcelJS.Workbook, lancamentos: LancamentoDoPeriodo[]) {
  const aba = livro.addWorksheet("Lancamentos", { views: [{ state: "frozen", ySplit: 1 }] });

  aba.columns = COLUNAS_DA_LISTA.map((coluna, indice) => ({
    header: coluna.titulo,
    width: coluna.largura,
    style: {
      font: FONTE,
      numFmt: indice === 0 ? "dd/mm/yyyy" : "@",
      alignment: { vertical: "top" },
    },
  }));

  for (const lancamento of lancamentos) {
    const excecao = lancamento.excecao;

    aba.addRow([
      serieDaData(lancamento.data),
      diaDaSemana(lancamento.data),
      lancamento.posto.codigo,
      lancamento.nome,
      lancamento.identificacao ?? "",
      lancamento.freelancer ? "SIM" : "",
      lancamento.local,
      lancamento.entrada,
      lancamento.saida,
      lancamento.viraODia ? "SIM" : "",
      excecao?.tipo ?? "",
      excecao?.contraparte?.nome ?? "",
      excecao?.postoOrigem?.codigo ?? "",
      excecao?.observacao ?? "",
      lancamento.criado.nome ?? "",
      // "12/11/2026 11:35", sem a virgula que o pt-BR poe: o mesmo da tela.
      instante.format(new Date(lancamento.criado.em)).replace(",", ""),
    ]);
  }

  const cabecalho = aba.getRow(1);
  cabecalho.font = { ...FONTE, bold: true };
  cabecalho.eachCell((celula) => {
    celula.numFmt = "@";
    preencher(celula, CINZA);
  });

  aba.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUNAS_DA_LISTA.length },
  };
}

export async function gerarPlanilhaDaSemana(dados: {
  geradoPor: string;
  dias: string[];
  semana: PostoDaSemana[];
  lancamentos: LancamentoDoPeriodo[];
}): Promise<Uint8Array> {
  const livro = new ExcelJS.Workbook();
  livro.creator = dados.geradoPor;
  livro.created = new Date();
  livro.title = `Efetivos ${formatarData(dados.dias[0])} a ${formatarData(dados.dias[6])}`;

  abaDaSemana(livro, dados.semana, dados.dias);
  abaDosLancamentos(livro, dados.lancamentos);

  return new Uint8Array(await livro.xlsx.writeBuffer());
}

/** `efetivos-2026-11-09.xlsx` — a segunda da semana; ordena certo numa pasta. */
export function nomeDaPlanilhaDaSemana(segunda: string, codigoDoPosto?: string) {
  return `efetivos-${segunda}${codigoDoPosto ? `-${codigoDoPosto}` : ""}.xlsx`;
}
