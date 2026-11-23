import { ehCpfValido, normalizarCpf } from "./cpf";
import { SITUACAO_TRABALHANDO } from "./situacoes";

/**
 * Leitura do relatorio "Relacao de Empregados" da folha: de celulas soltas para
 * funcionarios conferidos.
 *
 * Modulo puro (so importa os outros dois modulos puros da feature): quem abre o
 * arquivo e `xlsx.ts`, que e `server-only` por causa do `node:zlib`. A separacao
 * e a mesma de `escalas/jornada.ts` — a regra de leitura nao precisa do sistema
 * de arquivos para ser lida nem para ser conferida.
 *
 * O relatorio nao e uma tabela limpa: ele repete o cabecalho a cada pagina,
 * intercala blocos de empresas diferentes, fecha cada bloco com um total e
 * termina com a legenda das situacoes. Por isso a leitura e uma varredura com
 * estado — qual empresa e qual cabecalho valem a partir daqui — e nao um
 * `slice` a partir de uma linha fixa.
 */

/* -------------------------------------------------------------------------- */
/* Celulas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Uma celula e o intervalo de colunas que ela ocupa, e nao uma letra so: no
 * relatorio quase tudo e mesclado, e mesclagens de larguras diferentes sao o
 * que faz o cabecalho "Admissao" comecar na coluna X enquanto o valor comeca na
 * W. Guardar o intervalo e o que permite reconhecer que os dois sao a mesma
 * coluna (ver `valorDaBanda`).
 */
export type CelulaDaPlanilha = {
  /** Primeira coluna ocupada, contando de 0 (`A` = 0). */
  de: number;
  /** Ultima coluna ocupada. Igual a `de` quando a celula nao e mesclada. */
  ate: number;
  valor: string;
};

/** Uma linha da planilha, com as celulas em ordem de coluna. */
export type LinhaDaPlanilha = {
  /** Numero da linha como o Excel a mostra, contando de 1 — vai nas mensagens de erro. */
  numero: number;
  celulas: CelulaDaPlanilha[];
};

/** `"A"` -> 0, `"AC"` -> 28. Base 26 com as letras valendo 1 a 26. */
export function indiceDaColuna(letras: string) {
  let indice = 0;

  for (const letra of letras) {
    indice = indice * 26 + (letra.charCodeAt(0) - 64);
  }

  return indice - 1;
}

/**
 * Texto comparavel: sem acento, sem caixa, sem espaco sobrando. O cabecalho vem
 * do sistema da folha e ja apareceu como "Situação" e como "SITUACAO" —
 * comparar o texto cru faria a importacao depender de qual exportacao gerou o
 * arquivo.
 */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Cabecalho                                                                  */
/* -------------------------------------------------------------------------- */

/** As colunas que o portal aproveita. C.Custo e Hor. sao lidas e descartadas. */
type Campo = "matricula" | "nome" | "cargo" | "admissao" | "situacao" | "cpf";

/**
 * Como reconhecer cada coluna pelo texto do cabecalho. Testadas em ordem, a
 * primeira que casar vence — por isso "cpf" vem antes de qualquer regra mais
 * larga.
 */
const RECONHECIMENTO: readonly { campo: Campo; combina: (texto: string) => boolean }[] = [
  { campo: "cpf", combina: (texto) => texto.includes("c.p.f") || texto.includes("cpf") },
  { campo: "matricula", combina: (texto) => texto === "codigo" || texto === "matricula" },
  { campo: "nome", combina: (texto) => texto === "nome" },
  { campo: "cargo", combina: (texto) => texto === "cargo" || texto === "funcao" },
  { campo: "admissao", combina: (texto) => texto.startsWith("admissao") },
  { campo: "situacao", combina: (texto) => texto.startsWith("situacao") },
];

/** Onde cada campo comeca e termina, herdado da mesclagem do cabecalho. */
type Bandas = Partial<Record<Campo, { de: number; ate: number }>>;

/** Sem estas tres nao ha o que importar: sao a identidade da pessoa. */
const CAMPOS_OBRIGATORIOS: readonly Campo[] = ["matricula", "nome", "cpf"];

/**
 * As bandas de um cabecalho, ou `null` se a linha nao for um. Uma linha so vale
 * como cabecalho quando traz **todas** as colunas obrigatorias: assim uma linha
 * de dados com a palavra "Nome" no meio nao reposiciona a leitura inteira.
 */
function lerCabecalho(linha: LinhaDaPlanilha): Bandas | null {
  const bandas: Bandas = {};

  for (const celula of linha.celulas) {
    const texto = normalizar(celula.valor);
    const reconhecido = RECONHECIMENTO.find(({ combina }) => combina(texto));

    if (reconhecido && !bandas[reconhecido.campo]) {
      bandas[reconhecido.campo] = { de: celula.de, ate: celula.ate };
    }
  }

  return CAMPOS_OBRIGATORIOS.every((campo) => bandas[campo]) ? bandas : null;
}

/**
 * O valor da linha de dados que pertence a uma coluna do cabecalho.
 *
 * O criterio e **sobreposicao de intervalos**, e nao igualdade de coluna: a
 * celula de dados que ocupa W-Y responde pelo cabecalho que ocupa X-Y, porque
 * as duas cobrem X e Y. Casar pela letra inicial diria que sao colunas
 * diferentes, e a admissao do relatorio sairia vazia — que e exatamente o tipo
 * de erro que passa despercebido, ja que a coluna e opcional.
 */
function valorDaBanda(linha: LinhaDaPlanilha, banda: { de: number; ate: number } | undefined) {
  if (!banda) {
    return "";
  }

  const celula = linha.celulas.find((atual) => atual.de <= banda.ate && atual.ate >= banda.de);

  return celula ? celula.valor.trim() : "";
}

/* -------------------------------------------------------------------------- */
/* Datas                                                                      */
/* -------------------------------------------------------------------------- */

const MS_DO_DIA = 24 * 60 * 60 * 1000;

/**
 * O dia zero do Excel. 1899-12-30, e nao 12-31, porque a planilha trata 1900
 * como ano bissexto (um bug herdado do Lotus 1-2-3 e mantido de proposito): o
 * dia inexistente 29/02/1900 ocupa um numero de serie, e a base recuada um dia
 * e o que faz as datas reais baterem.
 */
const BASE_EXCEL = Date.UTC(1899, 11, 30);

/** 1900-01-01 ate 9999-12-31: qualquer serial fora disso e outra coisa. */
const SERIAL_MINIMO = 1;
const SERIAL_MAXIMO = 2958465;

/** `YYYY-MM-DD` a partir de um instante — a data trafega como string no portal. */
function comoData(instante: number) {
  return new Date(instante).toISOString().slice(0, 10);
}

/**
 * A data de uma celula, como `YYYY-MM-DD`. `null` quando a celula esta vazia;
 * `undefined` quando ha algo ali que nao e data — quem chama distingue "nao
 * informado" de "informado errado".
 *
 * Aceita as duas formas em que a coluna chega: o numero de serie do Excel
 * (quando a celula esta formatada como data) e o texto `dd/mm/aaaa` (quando a
 * exportacao mandou a data ja escrita).
 *
 * Tudo em UTC, pelo mesmo motivo de `periodo.ts`: data de calendario nao tem
 * hora, e montar em fuso local faria 21/08 virar 20/08 em fuso negativo.
 */
export function dataDaCelula(valor: string): string | null | undefined {
  const texto = valor.trim();

  if (texto === "") {
    return null;
  }

  const serial = Number(texto);

  if (Number.isFinite(serial)) {
    if (serial < SERIAL_MINIMO || serial > SERIAL_MAXIMO) {
      return undefined;
    }

    // `Math.floor`: a parte fracionaria do serial e a hora, e admissao e dia.
    return comoData(BASE_EXCEL + Math.floor(serial) * MS_DO_DIA);
  }

  const escrita = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(texto);

  if (!escrita) {
    return undefined;
  }

  const [, dia, mes, ano] = escrita.map(Number);
  const instante = Date.UTC(ano, mes - 1, dia);

  // `Date.UTC` aceita 31/02 e devolve 03/03: sem esta conferencia, uma data
  // impossivel entraria no banco como outra data, silenciosamente.
  return comoData(instante) ===
    `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    ? comoData(instante)
    : undefined;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/** Um funcionario como o relatorio o descreve, ja conferido. */
export type LinhaDoRelatorio = {
  /** Linha na planilha, para a tela poder apontar onde conferir. */
  linha: number;
  empresa: string;
  matricula: string;
  nome: string;
  /** Onze digitos, sem mascara. */
  cpf: string;
  cargo: string | null;
  admissao: string | null;
  /**
   * O codigo da folha, ou `null` quando **o arquivo nao tem a coluna**.
   *
   * `null` nao e "trabalhando": o modelo de uma empresa so nao traz Situacao
   * nenhuma, e assumir 1 ali apagaria as ferias e o INSS que o outro relatorio
   * ja tinha informado — inventando um dado que o arquivo nao contem. Quem
   * grava trata os dois casos diferente: no cadastro novo vale o padrao, na
   * atualizacao o campo simplesmente nao entra.
   */
  situacao: number | null;
};

/** Linha que o portal nao aceitou, com o motivo — nenhuma some sem explicacao. */
export type LinhaRecusada = {
  linha: number;
  /** O que der para identificar a pessoa: o nome, ou o CPF, ou a matricula. */
  identificacao: string;
  motivo: string;
};

export type LeituraDoRelatorio = {
  /** `false` quando nenhuma linha do arquivo tinha cara de cabecalho. */
  cabecalhoEncontrado: boolean;
  funcionarios: LinhaDoRelatorio[];
  recusadas: LinhaRecusada[];
};

/**
 * Cabecalho de pagina do modelo com varias empresas: a linha que traz "Pagina:"
 * e, na primeira coluna, a razao social daquele bloco. E o que separa os blocos
 * — o mesmo codigo 1335 aparece em duas empresas e sao duas pessoas.
 */
function empresaDaPagina(linha: LinhaDaPlanilha) {
  const temPagina = linha.celulas.some((celula) => normalizar(celula.valor).startsWith("pagina"));

  if (!temPagina) {
    return null;
  }

  const primeira = linha.celulas[0];

  // A primeira celula precisa ser mesmo a da esquerda: em uma pagina sem o nome
  // da empresa, "Pagina:" seria lido como razao social.
  return primeira && primeira.de === 0 && primeira.valor.trim() !== ""
    ? primeira.valor.trim()
    : null;
}

/**
 * Titulo do modelo de uma empresa so, que traz a razao social no proprio texto:
 * "RELACAO DE EMPREGADOS ATIVOS - PREVSERV PORTARIA E LIMPEZA LTDA". Ali a
 * linha de "Pagina:" nao tem coluna A nenhuma, entao sem isto o arquivo inteiro
 * cairia como "linha fora de um bloco de empresa".
 *
 * O corte e no **primeiro** separador, e nao no ultimo: razao social com hifen
 * ("SANTO E BUENO - FILIAL 2") perderia o fim se o corte fosse pelo ultimo. O
 * que vem antes e sempre o nome do relatorio, que nao tem hifen.
 *
 * Sem separador nao e titulo de empresa: o outro modelo tem uma linha
 * "RELACAO DE EMPREGADOS II", e le-la como razao social criaria uma empresa
 * chamada assim a cada importacao.
 */
function empresaDoTitulo(linha: LinhaDaPlanilha) {
  for (const celula of linha.celulas) {
    const texto = celula.valor.trim();

    if (!normalizar(texto).startsWith("relacao de empregados")) {
      continue;
    }

    const separador = texto.indexOf(" - ");

    if (separador < 0) {
      continue;
    }

    const razaoSocial = texto.slice(separador + 3).trim();

    if (razaoSocial !== "") {
      return razaoSocial;
    }
  }

  return null;
}

/** So digitos: a matricula do relatorio e numerica, o resto e linha de legenda. */
function pareceMatricula(valor: string) {
  return /^\d+$/.test(valor);
}

/**
 * Le o relatorio inteiro.
 *
 * Nada e descartado em silencio: o que nao vira funcionario vira uma linha em
 * `recusadas`, com o numero da linha e o motivo — a tela de importacao mostra
 * as duas listas antes de qualquer gravacao.
 *
 * CPF repetido dentro do proprio arquivo tambem e recusa, e nao a ultima
 * ocorrencia vencendo: duas linhas com o mesmo CPF sao um problema da folha, e
 * escolher uma delas por conta propria esconderia o problema.
 */
export function lerRelatorio(linhas: readonly LinhaDaPlanilha[]): LeituraDoRelatorio {
  const funcionarios: LinhaDoRelatorio[] = [];
  const recusadas: LinhaRecusada[] = [];
  const vistos = new Map<string, number>();

  let empresa: string | null = null;
  let bandas: Bandas | null = null;

  for (const linha of linhas) {
    // Os dois modelos dizem a empresa em lugares diferentes: um no cabecalho de
    // cada pagina, outro no titulo do relatorio. Nenhum dos dois reconhecedores
    // acerta o formato do outro, entao os dois convivem sem se atrapalhar.
    const daEmpresa = empresaDaPagina(linha) ?? empresaDoTitulo(linha);

    if (daEmpresa) {
      empresa = daEmpresa;
      continue;
    }

    const cabecalho = lerCabecalho(linha);

    if (cabecalho) {
      bandas = cabecalho;
      continue;
    }

    if (!bandas) {
      continue;
    }

    const matricula = valorDaBanda(linha, bandas.matricula);
    const cpfBruto = valorDaBanda(linha, bandas.cpf);
    const nome = valorDaBanda(linha, bandas.nome);

    // O que nao tem matricula numerica e CPF nao e linha de gente: e o total do
    // bloco, a legenda das situacoes, o rodape. Nao vira recusa, porque nunca
    // pretendeu ser um funcionario.
    if (!pareceMatricula(matricula) || cpfBruto === "") {
      continue;
    }

    const identificacao = nome || cpfBruto || `Matricula ${matricula}`;
    const recusar = (motivo: string) =>
      recusadas.push({ linha: linha.numero, identificacao, motivo });

    if (!empresa) {
      recusar("Linha fora de um bloco de empresa: falta o cabecalho com a razao social.");
      continue;
    }

    if (nome.length < 3) {
      recusar("Nome ausente ou curto demais.");
      continue;
    }

    if (!ehCpfValido(cpfBruto)) {
      recusar(`CPF invalido: ${cpfBruto}`);
      continue;
    }

    const cpf = normalizarCpf(cpfBruto);
    const jaVisto = vistos.get(cpf);

    if (jaVisto !== undefined) {
      recusar(`CPF repetido na planilha: ja aparece na linha ${jaVisto}.`);
      continue;
    }

    const admissao = dataDaCelula(valorDaBanda(linha, bandas.admissao));

    if (admissao === undefined) {
      recusar(`Data de admissao invalida: ${valorDaBanda(linha, bandas.admissao)}`);
      continue;
    }

    /**
     * `null` quando o arquivo nao tem a coluna — e nao "Trabalhando".
     *
     * A distincao importa na reimportacao: o modelo de uma empresa so nao traz
     * Situacao, e assumir 1 ali diria que quem estava de ferias voltou. Celula
     * **vazia** numa planilha que tem a coluna e outra coisa: ali o relatorio
     * teve a chance de dizer e nao disse, entao vale o padrao.
     */
    const temColunaSituacao = bandas.situacao !== undefined;
    const situacaoBruta = valorDaBanda(linha, bandas.situacao);
    const situacao = !temColunaSituacao
      ? null
      : situacaoBruta === ""
        ? SITUACAO_TRABALHANDO
        : Number(situacaoBruta);

    if (situacao !== null && (!Number.isInteger(situacao) || situacao < 1 || situacao > 99)) {
      recusar(`Situacao invalida: ${situacaoBruta}`);
      continue;
    }

    const cargo = valorDaBanda(linha, bandas.cargo);

    vistos.set(cpf, linha.numero);
    funcionarios.push({
      linha: linha.numero,
      empresa,
      matricula,
      nome,
      cpf,
      cargo: cargo || null,
      admissao,
      situacao,
    });
  }

  return { cabecalhoEncontrado: bandas !== null, funcionarios, recusadas };
}
