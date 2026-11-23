/**
 * Telefone: normalizacao, conferencia e formatacao.
 *
 * Modulo puro, como `cpf.ts` e `situacoes.ts`: e usado pelo Zod (servidor),
 * pelo cliente de envio e pelas telas.
 *
 * O numero e guardado **so em digitos e com DDI**, e nao como foi digitado, por
 * uma razao pratica: e assim que a Z-API o quer. Guardar "(62) 99999-9999" no
 * banco obrigaria cada envio a refazer a limpeza — e um dia alguem esqueceria.
 */

/** So os digitos: a tela manda "(62) 99999-9999", o import manda "62999999999". */
export function digitosDoTelefone(valor: string) {
  return valor.replace(/\D/g, "");
}

/** O DDI que o portal assume quando o numero vem sem nenhum. */
export const DDI_PADRAO = "55";

/**
 * Digitos com DDI.
 *
 * Numero de 10 ou 11 digitos e o brasileiro sem DDI — fixo com DDD, ou celular
 * com o nono digito — e ganha o `55` na frente. Qualquer outro tamanho passa
 * como veio: quem digitou 13 digitos ja informou o DDI, e "corrigir" isso
 * transformaria um numero de fora do Brasil em outro numero.
 */
export function normalizarTelefone(valor: string) {
  const digitos = digitosDoTelefone(valor);

  return digitos.length === 10 || digitos.length === 11 ? `${DDI_PADRAO}${digitos}` : digitos;
}

/**
 * `true` para um numero que da para discar.
 *
 * A conferencia e de tamanho, e nao de formato: o E.164 vai de 8 a 15 digitos
 * com DDI, e nao ha regex que descreva os planos de numeracao de todos os
 * paises sem recusar alguem legitimo. O que esta faixa pega e o que de fato
 * acontece — campo pela metade, DDD esquecido, texto no lugar do numero.
 */
export function ehTelefoneValido(valor: string) {
  const digitos = normalizarTelefone(valor);

  return digitos.length >= 10 && digitos.length <= 15;
}

/**
 * `+55 (62) 99999-9999` — para leitura. O banco guarda so os digitos.
 *
 * A mascara so e aplicada ao numero brasileiro, que e o formato que quem le
 * reconhece de imediato. Para os outros, o `+` seguido dos digitos ja diz o que
 * precisa: nao ha como agrupar um numero cujo plano de numeracao nao se conhece
 * sem arriscar agrupar errado.
 */
export function formatarTelefone(valor: string) {
  const digitos = normalizarTelefone(valor);

  if (!digitos) {
    return "";
  }

  if (digitos.startsWith(DDI_PADRAO) && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = digitos.slice(2, 4);
    const numero = digitos.slice(4);
    const meio = numero.length === 9 ? 5 : 4;

    return `+55 (${ddd}) ${numero.slice(0, meio)}-${numero.slice(meio)}`;
  }

  return `+${digitos}`;
}
