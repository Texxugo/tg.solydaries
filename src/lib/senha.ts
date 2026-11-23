import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hashing de senha com scrypt da lib padrao do Node.
 *
 * Escolha consciente no lugar de bcrypt/argon2: ambos exigem build nativo via
 * install script, e o npm 12 deste projeto bloqueia install scripts por padrao
 * (ver `allowScripts` no package.json). scrypt e um KDF com custo de memoria,
 * recomendado pelo OWASP, e vem embutido no runtime.
 *
 * Este modulo nao importa nada da aplicacao de proposito: o script de seed
 * (`scripts/seed-usuarios.mts`) roda fora do Next e o importa direto, para que
 * o formato do hash — e a geracao da senha provisoria — tenham uma unica fonte
 * de verdade.
 */
const scrypt = promisify(scryptCallback) as (
  senha: string,
  salt: Buffer,
  tamanhoChave: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// N=2^14 com r=8 exige ~16 MiB por hash; maxmem explicito evita depender do
// limite padrao do Node caso os parametros mudem.
const PARAMETROS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const TAMANHO_CHAVE = 64;
const TAMANHO_SALT = 16;
const ALGORITMO = "scrypt";

// Sem I/l/1/O/0: a senha provisoria e transcrita a mao com frequencia.
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const DIGITOS = "23456789";

/**
 * Senha provisoria aleatoria, exibida uma unica vez a quem cadastrou o usuario.
 *
 * Sempre com letra e digito, para satisfazer a politica de senha do portal
 * (`senhaSchema`) — o usuario troca por uma propria no primeiro acesso.
 */
export function gerarSenhaProvisoria(tamanho = 14): string {
  const fonte = LETRAS + DIGITOS;
  const caracteres = Array.from({ length: tamanho }, () => fonte[randomInt(fonte.length)]);

  caracteres[0] = LETRAS[randomInt(LETRAS.length)];
  caracteres[1] = DIGITOS[randomInt(DIGITOS.length)];

  return caracteres.join("");
}

/** Normaliza para que acentos digitados de formas diferentes gerem o mesmo hash. */
function normalizar(senha: string) {
  return senha.normalize("NFKC");
}

/** Formato: `scrypt$N$r$p$saltBase64$hashBase64`. */
export async function criarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const chave = await scrypt(normalizar(senha), salt, TAMANHO_CHAVE, PARAMETROS);

  return [
    ALGORITMO,
    PARAMETROS.N,
    PARAMETROS.r,
    PARAMETROS.p,
    salt.toString("base64"),
    chave.toString("base64"),
  ].join("$");
}

/**
 * Comparacao em tempo constante. Retorna `false` (em vez de lancar) para hash
 * malformado: quem chama trata sempre como credencial invalida.
 */
export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  const partes = hashArmazenado.split("$");

  if (partes.length !== 6 || partes[0] !== ALGORITMO) {
    return false;
  }

  const [, n, r, p, saltBase64, chaveBase64] = partes;
  const parametros = { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMETROS.maxmem };

  if (
    !Number.isInteger(parametros.N) ||
    !Number.isInteger(parametros.r) ||
    !Number.isInteger(parametros.p)
  ) {
    return false;
  }

  const salt = Buffer.from(saltBase64, "base64");
  const chaveEsperada = Buffer.from(chaveBase64, "base64");

  if (salt.length === 0 || chaveEsperada.length === 0) {
    return false;
  }

  try {
    const chave = await scrypt(normalizar(senha), salt, chaveEsperada.length, parametros);
    return timingSafeEqual(chave, chaveEsperada);
  } catch {
    return false;
  }
}
