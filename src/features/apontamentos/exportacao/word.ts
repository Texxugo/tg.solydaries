import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";

import { formatarInstante } from "../components/formatar-instante";
import { agruparPorEmpresa, textoDasRubricas, totaisPorRubrica } from "./relatorio";
import type { ApontamentoExportado, DadosDaExportacao } from "./tipos";

/**
 * O relatorio dos apontamentos da competencia, em Word.
 *
 * E o formato de **leitura**, e por isso nao repete a planilha: primeiro os
 * totais da competencia, depois cada empresa, e dentro dela cada pessoa com as
 * rubricas que tem **em texto corrido**, e a observacao. Traz tudo o que o
 * apontamento guarda — inclusive insalubridade, DSR e as horas de 50% e 60%
 * separadas, que o layout da planilha junta ou deixa de fora.
 *
 * **Todo o texto e preto, e so o nome do colaborador vai em negrito.** Os
 * estilos de titulo do Word vem com cor de tema e, em alguns leitores, negrito:
 * por isso a cor e o negrito sao fixados nos estilos **e** em cada trecho —
 * o trecho vence o estilo em qualquer leitor.
 *
 * A4 retrato, margens de 2 cm. As larguras vao em DXA (vinte avos de ponto), e
 * nao em percentual: o LibreOffice ignora largura percentual de tabela e
 * espreme as colunas.
 */

/** A4 (11.906) menos duas margens de 2 cm (1.134 cada). */
const LARGURA_UTIL = 11906 - 2 * 1134;

const PRETO = "000000";
const FUNDO_CABECALHO = "F2F2F2";

const BORDA = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };

/**
 * Um trecho de texto sempre preto e, salvo o nome do colaborador, sem negrito.
 * `bold: false` explicito, e nao ausente: o trecho dentro de um titulo herdaria
 * o negrito do estilo.
 */
function trecho(texto: string, opcoes: { negrito?: boolean; tamanho?: number } = {}) {
  return new TextRun({
    text: texto,
    color: PRETO,
    bold: opcoes.negrito ?? false,
    size: opcoes.tamanho,
  });
}

function paragrafo(texto: string, opcoes: { tamanho?: number; depois?: number } = {}) {
  return new Paragraph({
    spacing: { after: opcoes.depois ?? 120 },
    children: [trecho(texto, { tamanho: opcoes.tamanho })],
  });
}

function celula(
  texto: string,
  largura: number,
  opcoes: {
    fundo?: string;
    alinhamento?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {},
) {
  return new TableCell({
    width: { size: largura, type: WidthType.DXA },
    borders: BORDAS,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    shading: opcoes.fundo
      ? { type: ShadingType.CLEAR, color: "auto", fill: opcoes.fundo }
      : undefined,
    children: [new Paragraph({ alignment: opcoes.alinhamento, children: [trecho(texto)] })],
  });
}

/** A tabela do resumo. O cabecalho se distingue pelo fundo, e nao pelo negrito. */
function tabela(colunas: number[], cabecalho: string[], linhas: string[][]) {
  const alinhamento = (indice: number) =>
    indice === colunas.length - 1 ? AlignmentType.RIGHT : undefined;

  return new Table({
    width: { size: LARGURA_UTIL, type: WidthType.DXA },
    columnWidths: colunas,
    rows: [
      new TableRow({
        tableHeader: true,
        children: cabecalho.map((texto, indice) =>
          celula(texto, colunas[indice], {
            fundo: FUNDO_CABECALHO,
            alinhamento: alinhamento(indice),
          }),
        ),
      }),
      ...linhas.map(
        (linha) =>
          new TableRow({
            cantSplit: true,
            children: linha.map((texto, indice) =>
              celula(texto, colunas[indice], { alinhamento: alinhamento(indice) }),
            ),
          }),
      ),
    ],
  });
}

function blocoDaPessoa(pessoa: ApontamentoExportado) {
  const { apontamento } = pessoa;
  const identificacao = [
    `Matricula ${pessoa.matricula}`,
    pessoa.cargo,
    pessoa.postos.length > 0 ? `Posto ${pessoa.postos.join(" / ")}` : null,
    pessoa.ativo ? null : "Inativo",
  ]
    .filter(Boolean)
    .join(" · ");

  const rubricas = textoDasRubricas(apontamento);

  const blocos: Paragraph[] = [
    // Titulo de nivel 3 para o painel de navegacao do Word; o negrito e a unica
    // enfase do documento, e e so aqui.
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      keepNext: true,
      spacing: { before: 240, after: 40 },
      children: [trecho(pessoa.nome, { negrito: true })],
    }),
    new Paragraph({
      keepNext: true,
      spacing: { after: 60 },
      children: [trecho(identificacao, { tamanho: 18 })],
    }),
  ];

  if (rubricas) {
    blocos.push(paragrafo(rubricas, { depois: 60 }));
  }

  if (apontamento.observacao) {
    blocos.push(paragrafo(`Observacoes: ${apontamento.observacao}`, { depois: 60 }));
  }

  blocos.push(
    paragrafo(
      `Ultima alteracao em ${formatarInstante(apontamento.atualizadoEm)}` +
        (apontamento.atualizadoPor ? ` por ${apontamento.atualizadoPor}` : "") +
        ".",
      { tamanho: 16, depois: 160 },
    ),
  );

  return blocos;
}

/** Os estilos de titulo sem cor de tema nem negrito. */
const TITULO_SEM_ENFASE = { run: { color: PRETO, bold: false } };

export async function gerarRelatorio(dados: DadosDaExportacao): Promise<Uint8Array> {
  const competencia = nomeDaCompetencia(dados.competencia.dataFim);
  const recorte = [
    dados.recorte.empresa ? `empresa ${dados.recorte.empresa}` : null,
    dados.recorte.busca ? `busca "${dados.recorte.busca}"` : null,
  ].filter(Boolean);

  const conteudo: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [trecho(`Apontamentos — ${competencia}`, { tamanho: 40 })],
    }),
    paragrafo(
      `Periodo de ${formatarPeriodo(dados.competencia.dataInicio, dados.competencia.dataFim)}` +
        (dados.temporaria ? " (competencia encerrada, em consulta)" : ""),
      { tamanho: 18, depois: 40 },
    ),
    paragrafo(
      `Gerado em ${formatarInstante(dados.geradoEm)} por ${dados.geradoPor}` +
        (recorte.length > 0 ? ` · Recorte: ${recorte.join(", ")}` : ""),
      { tamanho: 18, depois: 240 },
    ),
  ];

  if (dados.apontamentos.length === 0) {
    conteudo.push(
      paragrafo(
        recorte.length > 0
          ? "Nenhum apontamento nesta competencia atende ao recorte escolhido."
          : "Nenhum apontamento registrado nesta competencia.",
      ),
    );
  } else {
    const totais = totaisPorRubrica(dados.apontamentos.map((linha) => linha.apontamento));

    conteudo.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [trecho("Resumo da competencia", { tamanho: 28 })],
      }),
      paragrafo(
        `${dados.apontamentos.length} ${
          dados.apontamentos.length === 1 ? "funcionario apontado" : "funcionarios apontados"
        }. Dias e horas somados; marcacoes e gratificacao contam pessoas.`,
        { tamanho: 18 },
      ),
      tabela(
        [4638, 1800, 3200],
        ["Rubrica", "Funcionarios", "Total"],
        totais.map((total) => [total.rubrica.rotulo, String(total.pessoas), total.total || "—"]),
      ),
    );

    for (const { empresa, pessoas } of agruparPorEmpresa(dados.apontamentos)) {
      conteudo.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
          children: [trecho(empresa, { tamanho: 28 })],
        }),
        paragrafo(
          `${pessoas.length} ${pessoas.length === 1 ? "funcionario apontado" : "funcionarios apontados"}`,
          { tamanho: 18 },
        ),
        ...pessoas.flatMap(blocoDaPessoa),
      );
    }
  }

  const documento = new Document({
    creator: dados.geradoPor,
    title: `Apontamentos ${competencia}`,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20, color: PRETO } },
        // Todos os niveis, e nao so os usados: quem editar o arquivo e aplicar
        // "Titulo 2" no Word nao pode ver o azul do tema voltar.
        title: TITULO_SEM_ENFASE,
        heading1: TITULO_SEM_ENFASE,
        heading2: TITULO_SEM_ENFASE,
        heading3: TITULO_SEM_ENFASE,
        heading4: TITULO_SEM_ENFASE,
        heading5: TITULO_SEM_ENFASE,
        heading6: TITULO_SEM_ENFASE,
        hyperlink: { run: { color: PRETO } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    color: PRETO,
                    bold: false,
                    size: 16,
                    children: [
                      `Portal TG · Apontamentos ${competencia} · Pagina `,
                      PageNumber.CURRENT,
                      " de ",
                      PageNumber.TOTAL_PAGES,
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children: conteudo,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(documento));
}
