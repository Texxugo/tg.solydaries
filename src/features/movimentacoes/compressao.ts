import {
  LADO_MAXIMO_DA_IMAGEM,
  QUALIDADE_DA_IMAGEM,
  TAMANHO_MAXIMO,
  TAMANHO_MAXIMO_DA_IMAGEM_ORIGINAL,
  formatarTamanho,
  nomeComExtensao,
  tipoPelaAssinatura,
} from "./arquivos";

/**
 * A reducao do documento **no navegador**, antes do envio.
 *
 * E aqui, e nao no servidor, por dois motivos: a foto de celular (5 a 12 MB)
 * nao precisaria atravessar a rede inteira so para ser jogada fora, e reduzir
 * imagem no servidor exigiria uma biblioteca nativa (`sharp`), com o install
 * script que o npm 12 bloqueia. O canvas do navegador ja decodifica, redimensiona
 * e codifica WebP.
 *
 * O servidor **nao confia** nesta etapa: ele confere de novo o tipo pelos
 * primeiros bytes e o tamanho, e recusa o que passar do teto. O que este modulo
 * faz e economizar espaco; quem garante o limite e a action.
 *
 * So roda no cliente (usa `document` e `createImageBitmap`).
 */

export type ArquivoPreparado = {
  /** O que vai no envio: a imagem reduzida, ou o PDF como veio. */
  arquivo: File;
  /** O tamanho do arquivo que a pessoa soltou, para a tela mostrar o ganho. */
  tamanhoAntes: number;
};

/** Recusa com a mensagem que o campo mostra ao lado do arquivo. */
export class ArquivoRecusado extends Error {}

export async function prepararArquivo(original: File): Promise<ArquivoPreparado> {
  const cabeca = new Uint8Array(await original.slice(0, 16).arrayBuffer());
  const tipo = tipoPelaAssinatura(cabeca);

  if (tipo === "application/pdf") {
    if (original.size > TAMANHO_MAXIMO) {
      throw new ArquivoRecusado(
        `PDF de ${formatarTamanho(original.size)} passa do limite de ${formatarTamanho(TAMANHO_MAXIMO)}. Envie uma foto ou print do documento — imagem e reduzida automaticamente.`,
      );
    }

    // PDF nao se reduz no navegador; o servidor tenta o gzip e fica com o menor.
    return { arquivo: original, tamanhoAntes: original.size };
  }

  // Imagem que a assinatura nao reconhece (HEIC, GIF, BMP) ainda pode ser
  // aberta pelo navegador e virar WebP — por isso o `image/*` tambem passa.
  if (!tipo && !original.type.startsWith("image/")) {
    throw new ArquivoRecusado("Envie uma imagem (foto, print) ou um PDF.");
  }

  if (original.size > TAMANHO_MAXIMO_DA_IMAGEM_ORIGINAL) {
    throw new ArquivoRecusado(
      `Imagem de ${formatarTamanho(original.size)} e grande demais para ser reduzida aqui.`,
    );
  }

  const reduzida = await reduzirImagem(original);

  // Imagem que ja era pequena e comprimida (um print em JPEG) pode sair maior
  // do que entrou: nesse caso o original vale mais.
  if (tipo && original.size <= reduzida.size && original.size <= TAMANHO_MAXIMO) {
    return { arquivo: original, tamanhoAntes: original.size };
  }

  if (reduzida.size > TAMANHO_MAXIMO) {
    throw new ArquivoRecusado(
      `Mesmo reduzida, a imagem ficou com ${formatarTamanho(reduzida.size)} — o limite e ${formatarTamanho(TAMANHO_MAXIMO)}.`,
    );
  }

  return { arquivo: reduzida, tamanhoAntes: original.size };
}

/**
 * Redimensiona para `LADO_MAXIMO_DA_IMAGEM` no maior lado e codifica em WebP.
 * Se a primeira tentativa ainda passar do teto, uma segunda, menor e com menos
 * qualidade — antes de recusar.
 */
async function reduzirImagem(original: File): Promise<File> {
  let imagem: ImageBitmap;

  try {
    // `from-image` respeita a orientacao EXIF: a foto tirada com o celular de
    // pe nao chega deitada.
    imagem = await createImageBitmap(original, { imageOrientation: "from-image" });
  } catch {
    throw new ArquivoRecusado(
      "O navegador nao conseguiu abrir esta imagem (HEIC?). Salve como JPG ou envie um print.",
    );
  }

  try {
    const primeira = await codificar(imagem, LADO_MAXIMO_DA_IMAGEM, QUALIDADE_DA_IMAGEM);

    const blob =
      primeira.size > TAMANHO_MAXIMO
        ? await codificar(imagem, Math.round(LADO_MAXIMO_DA_IMAGEM * 0.75), 0.55)
        : primeira;

    const tipo = blob.type === "image/webp" ? "image/webp" : "image/jpeg";

    return new File([blob], nomeComExtensao(original.name, tipo), {
      type: tipo,
      lastModified: original.lastModified,
    });
  } finally {
    imagem.close();
  }
}

async function codificar(imagem: ImageBitmap, ladoMaximo: number, qualidade: number) {
  const escala = Math.min(1, ladoMaximo / Math.max(imagem.width, imagem.height));
  const largura = Math.max(1, Math.round(imagem.width * escala));
  const altura = Math.max(1, Math.round(imagem.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;

  const contexto = canvas.getContext("2d");

  if (!contexto) {
    throw new ArquivoRecusado("O navegador nao permitiu reduzir a imagem.");
  }

  // Fundo branco: PNG com transparencia viraria preto no JPEG de reserva.
  contexto.fillStyle = "#fff";
  contexto.fillRect(0, 0, largura, altura);
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(imagem, 0, 0, largura, altura);

  const webp = await paraBlob(canvas, "image/webp", qualidade);

  // Navegador sem codificador WebP devolve PNG em silencio — maior que o
  // original. JPEG e o que todos codificam.
  if (webp.type === "image/webp") {
    return webp;
  }

  return paraBlob(canvas, "image/jpeg", qualidade);
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number) {
  return new Promise<Blob>((resolver, rejeitar) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolver(blob) : rejeitar(new ArquivoRecusado("Nao foi possivel reduzir a imagem.")),
      tipo,
      qualidade,
    );
  });
}
