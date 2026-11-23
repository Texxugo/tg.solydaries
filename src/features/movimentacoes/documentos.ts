import "server-only";

import { promisify } from "node:util";
import { constants, gunzip, gzip } from "node:zlib";

import type { documentoCompressaoEnum } from "@/db/schema";

import {
  MAXIMO_DE_DOCUMENTOS,
  TAMANHO_MAXIMO,
  formatarTamanho,
  nomeComExtensao,
  tipoPelaAssinatura,
  type TipoAceito,
} from "./arquivos";

/**
 * Os documentos que chegam no envio da movimentacao: conferencia e compressao
 * do lado do servidor.
 *
 * O navegador ja reduziu as imagens (`compressao.ts`), mas a action e um POST
 * publico: o tipo e conferido de novo pelos primeiros bytes, o tamanho de novo
 * contra o teto, e o nome e limpo. Ninguem precisa do campo de arrastar e
 * soltar para mandar um arquivo para ca.
 */

const comprimir = promisify(gzip);
const descomprimir = promisify(gunzip);

type Compressao = (typeof documentoCompressaoEnum.enumValues)[number];

export type DocumentoParaGravar = {
  nome: string;
  tipoMime: TipoAceito;
  tamanhoOriginal: number;
  tamanho: number;
  compressao: Compressao;
  conteudo: Uint8Array;
};

export type LeituraDosDocumentos =
  { ok: true; documentos: DocumentoParaGravar[] } | { ok: false; mensagem: string };

/**
 * O gzip so fica quando economiza ao menos isto. Abaixo, o ganho nao paga o
 * trabalho de descomprimir a cada download — e JPEG, WebP e quase todo PDF ja
 * chegam comprimidos, entao o caso comum e `nenhuma`.
 */
const GANHO_MINIMO = 0.05;

/** Le e confere os arquivos do campo `documentos`. Arquivo vazio e campo sem escolha. */
export async function lerDocumentosEnviados(formData: FormData): Promise<LeituraDosDocumentos> {
  const arquivos = formData
    .getAll("documentos")
    .filter((valor): valor is File => valor instanceof File && valor.size > 0);

  if (arquivos.length > MAXIMO_DE_DOCUMENTOS) {
    return {
      ok: false,
      mensagem: `Uma movimentacao aceita no maximo ${MAXIMO_DE_DOCUMENTOS} documentos.`,
    };
  }

  const documentos: DocumentoParaGravar[] = [];

  for (const arquivo of arquivos) {
    if (arquivo.size > TAMANHO_MAXIMO) {
      return {
        ok: false,
        mensagem: `${arquivo.name} tem ${formatarTamanho(arquivo.size)}; o limite e ${formatarTamanho(TAMANHO_MAXIMO)}.`,
      };
    }

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const tipo = tipoPelaAssinatura(bytes);

    if (!tipo) {
      return {
        ok: false,
        mensagem: `${arquivo.name} nao e uma imagem JPG, PNG ou WebP, nem um PDF.`,
      };
    }

    const comprimido = new Uint8Array(
      await comprimir(bytes, { level: constants.Z_BEST_COMPRESSION }),
    );
    const vale = comprimido.byteLength <= bytes.byteLength * (1 - GANHO_MINIMO);

    documentos.push({
      nome: nomeLimpo(arquivo.name, tipo),
      tipoMime: tipo,
      tamanhoOriginal: bytes.byteLength,
      tamanho: vale ? comprimido.byteLength : bytes.byteLength,
      compressao: vale ? "gzip" : "nenhuma",
      conteudo: vale ? comprimido : bytes,
    });
  }

  return { ok: true, documentos };
}

/**
 * O nome que fica gravado e volta no download: sem caminho, sem caractere de
 * controle, sem aspas (ele vai para o `Content-Disposition`) e com a extensao
 * do tipo conferido.
 */
function nomeLimpo(nome: string, tipo: TipoAceito) {
  const semCaminho = nome.split(/[\\/]/).pop() ?? "";
  const limpo = semCaminho
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
    .slice(0, 120);

  return nomeComExtensao(limpo, tipo);
}

/** O arquivo como foi enviado, desfazendo o gzip quando houve. */
export async function conteudoDoDocumento(documento: {
  compressao: Compressao;
  conteudo: Uint8Array;
}): Promise<Uint8Array> {
  if (documento.compressao === "gzip") {
    return new Uint8Array(await descomprimir(documento.conteudo));
  }

  return documento.conteudo;
}
