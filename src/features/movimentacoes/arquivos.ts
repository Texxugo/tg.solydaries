/**
 * As regras dos documentos anexados — que arquivo entra, de que tamanho, e como
 * se reconhece o tipo pelos primeiros bytes.
 *
 * Modulo puro (nenhum import): e lido pelo campo de arrastar e soltar (client),
 * que recusa cedo, e pela action (servidor), que recusa de verdade. As duas
 * pontas precisam do mesmo numero — um teto diferente em cada lado faria o
 * navegador aceitar o que o servidor vai recusar.
 */

/** Quantos documentos uma movimentacao pode ter: o atestado, o print, o verso. */
export const MAXIMO_DE_DOCUMENTOS = 4;

/**
 * Teto de cada documento **depois** da compressao do navegador, em bytes.
 *
 * Imagem reduzida fica muito abaixo (200 a 600 KB numa foto de atestado); o
 * teto existe pelo PDF, que o navegador nao reduz. E os quatro somados (8 MB)
 * precisam caber no limite do corpo da Server Action (`next.config.ts`) e no
 * que o `proxy.ts` bufferiza (10 MB por padrao).
 */
export const TAMANHO_MAXIMO = 2 * 1024 * 1024;

/**
 * Teto da imagem **antes** da compressao. Foto de celular passa de 10 MB; a
 * reducao no navegador e justamente o que a faz caber em `TAMANHO_MAXIMO`, mas
 * decodificar um arquivo muito maior que isso so travaria a aba.
 */
export const TAMANHO_MAXIMO_DA_IMAGEM_ORIGINAL = 40 * 1024 * 1024;

/** O maior lado da imagem reduzida: o texto de um atestado continua legivel. */
export const LADO_MAXIMO_DA_IMAGEM = 1800;

/** Qualidade do WebP/JPEG gerado no navegador (0 a 1). */
export const QUALIDADE_DA_IMAGEM = 0.72;

/** Os tipos que o portal guarda — e com que extensao o download os devolve. */
export const TIPOS_ACEITOS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type TipoAceito = keyof typeof TIPOS_ACEITOS;

/** O `accept` do seletor de arquivos: imagens em geral (HEIC incluso, se o navegador abrir) e PDF. */
export const ACCEPT_DO_CAMPO = "image/*,application/pdf";

/**
 * O tipo do arquivo pelos primeiros bytes — a "assinatura" —, e nunca pela
 * extensao nem pelo `type` que o navegador declarou: os dois sao do cliente, e
 * um `.exe` renomeado para `.pdf` chegaria dizendo `application/pdf`.
 *
 * `null` para qualquer coisa fora de `TIPOS_ACEITOS`.
 */
export function tipoPelaAssinatura(bytes: Uint8Array): TipoAceito | null {
  const comeca = (...assinatura: number[]) =>
    assinatura.every((byte, indice) => bytes[indice] === byte);

  // %PDF-
  if (comeca(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    return "application/pdf";
  }

  if (comeca(0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }

  if (comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }

  // RIFF....WEBP: o tamanho do bloco fica entre as duas marcas.
  if (
    comeca(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/** `1,4 MB`, `380 KB` — como a tela e a planilha escrevem um tamanho. */
export function formatarTamanho(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/**
 * O nome com a extensao do tipo de verdade: a foto `IMG_2031.HEIC` que o
 * navegador converteu em WebP volta como `IMG_2031.webp`, e nao com uma
 * extensao que mente sobre o conteudo.
 */
export function nomeComExtensao(nome: string, tipo: TipoAceito) {
  const base = nome.replace(/\.[^./\\]{1,8}$/, "") || "documento";
  return `${base}.${TIPOS_ACEITOS[tipo]}`;
}
