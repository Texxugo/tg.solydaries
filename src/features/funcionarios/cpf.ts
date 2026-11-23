/**
 * CPF: normalizacao, digitos verificadores e formatacao.
 *
 * Modulo puro, como `situacoes.ts`: e usado pelo Zod (servidor), pela leitura
 * da planilha e pelas telas.
 *
 * O CPF e a identidade do funcionario no portal — e por ele que a reimportacao
 * reconhece quem ja existe. Por isso ele e conferido de verdade, e nao so
 * contado: um digito trocado na digitacao viraria uma pessoa nova, e a pessoa
 * certa apareceria duplicada na lista.
 */

/** So os digitos: a planilha manda "01331820537", a tela manda "013.318.205-37". */
export function digitosDoCpf(valor: string) {
  return valor.replace(/\D/g, "");
}

/**
 * Onze digitos, completando a esquerda. A planilha guarda o CPF como numero
 * quando ele nao tem zero a esquerda para preservar — e quem tem, chega com
 * dez digitos.
 */
export function normalizarCpf(valor: string) {
  const digitos = digitosDoCpf(valor);

  return digitos.length > 0 && digitos.length <= 11 ? digitos.padStart(11, "0") : digitos;
}

/**
 * Soma ponderada do algoritmo oficial: os pesos descem a partir de
 * `quantidade + 1`, e o digito e `(soma * 10) % 11`, com 10 valendo 0.
 */
function digitoVerificador(digitos: string, quantidade: number) {
  let soma = 0;

  for (let posicao = 0; posicao < quantidade; posicao += 1) {
    soma += Number(digitos[posicao]) * (quantidade + 1 - posicao);
  }

  return ((soma * 10) % 11) % 10;
}

/**
 * `true` para CPF com os dois digitos verificadores corretos.
 *
 * Os repetidos (`111.111.111-11` e afins) sao recusados a parte: eles passam na
 * conta dos verificadores, mas nao sao CPF de ninguem — e sao exatamente o que
 * alguem digita para "preencher o campo".
 */
export function ehCpfValido(valor: string) {
  const digitos = normalizarCpf(valor);

  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  return (
    digitoVerificador(digitos, 9) === Number(digitos[9]) &&
    digitoVerificador(digitos, 10) === Number(digitos[10])
  );
}

/** `123.456.789-09` — para leitura. O banco guarda so os digitos. */
export function formatarCpf(valor: string) {
  const digitos = normalizarCpf(valor);

  if (digitos.length !== 11) {
    return valor;
  }

  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}
