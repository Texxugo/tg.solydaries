import type { LinhaDoRelatorio, LinhaRecusada } from "./planilha";

/**
 * O plano de uma importacao: o que o arquivo faria com o cadastro, decidido
 * antes de qualquer escrita.
 *
 * Modulo puro (so `import type`), e de proposito: a tela de importacao mostra a
 * previa e o botao de confirmar grava — e as duas passam por **esta** funcao.
 * Uma previa calculada por um caminho e uma gravacao por outro seria uma previa
 * que nao promete nada, que e pior do que nao ter previa.
 *
 * Por isso a confirmacao tambem reprocessa o arquivo em vez de receber de volta
 * o plano que a previa mostrou: o que o cliente devolve nao e evidencia, e o
 * cadastro pode ter mudado nos segundos entre uma tela e outra.
 */

/** O que o portal ja tem de uma pessoa, para comparar com o que o arquivo traz. */
export type FuncionarioExistente = {
  id: string;
  cpf: string;
  empresaId: string;
  matricula: string;
  nome: string;
  cargo: string | null;
  admissao: string | null;
  /** Nunca nulo: e o que esta gravado, e a coluna tem `default 1`. */
  situacao: number;
};

export type EmpresaConhecida = { id: string; nome: string };

/** Os campos que a folha manda e a importacao sobrescreve. */
export type DadosDaFolha = {
  empresaId: string | null;
  /** Nome da empresa como veio no arquivo — resolve `empresaId` nulo na gravacao. */
  empresa: string;
  matricula: string;
  nome: string;
  cargo: string | null;
  admissao: string | null;
  /** `null` quando o arquivo nao tem a coluna — ver `LinhaDoRelatorio`. */
  situacao: number | null;
};

export type Criacao = { linha: number; cpf: string; dados: DadosDaFolha };

export type Atualizacao = {
  linha: number;
  id: string;
  cpf: string;
  nome: string;
  dados: DadosDaFolha;
  /** O que muda, em portugues, para a previa dizer o que vai acontecer. */
  mudancas: string[];
};

export type PlanoDeImportacao = {
  /** Nomes de empresa que o arquivo traz e o cadastro ainda nao tem. */
  empresasNovas: string[];
  aCriar: Criacao[];
  aAtualizar: Atualizacao[];
  /** Ja cadastrados e identicos ao arquivo: nao viram escrita nenhuma. */
  inalterados: number;
  recusadas: LinhaRecusada[];
};

/** Empresas sao a mesma quando o nome so difere na caixa — como o indice unico as ve. */
function chaveDaEmpresa(nome: string) {
  return nome.trim().toLowerCase();
}

/**
 * Matricula e unica por empresa, e tambem ignorando a caixa.
 *
 * O separador e `\u0000` porque nem razao social nem matricula contem NUL: com
 * um espaco, a empresa "ACME 1" com matricula "2" e a "ACME" com "1 2" dariam a
 * mesma chave, e uma das duas pessoas sumiria da carga sem aviso.
 */
function chaveDaMatricula(empresa: string, matricula: string) {
  return `${empresa}\u0000${matricula.trim().toLowerCase()}`;
}

/**
 * Descreve, campo a campo, o que a folha muda no cadastro.
 *
 * Escala e inicio de ciclo nao aparecem aqui, e e a regra central da
 * reimportacao: eles nascem no portal, o relatorio da folha nao os conhece, e
 * uma importacao mensal que os zerasse apagaria todo mes o unico trabalho que
 * so o portal faz.
 */
function compararComOCadastro(existente: FuncionarioExistente, dados: DadosDaFolha) {
  const mudancas: string[] = [];

  if (existente.nome !== dados.nome) {
    mudancas.push(`Nome: ${existente.nome} -> ${dados.nome}`);
  }

  if (dados.empresaId !== null && existente.empresaId !== dados.empresaId) {
    mudancas.push(`Muda de empresa para ${dados.empresa}`);
  }

  if (existente.matricula !== dados.matricula) {
    mudancas.push(`Matricula: ${existente.matricula} -> ${dados.matricula}`);
  }

  if ((existente.cargo ?? "") !== (dados.cargo ?? "")) {
    mudancas.push(`Cargo: ${existente.cargo ?? "sem cargo"} -> ${dados.cargo ?? "sem cargo"}`);
  }

  if (existente.admissao !== dados.admissao) {
    mudancas.push(
      `Admissao: ${existente.admissao ?? "sem data"} -> ${dados.admissao ?? "sem data"}`,
    );
  }

  // `null` e "o arquivo nao diz", e nao "voltou a trabalhar": o modelo de uma
  // empresa so nao traz a coluna, e compara-lo com o cadastro acusaria
  // "Situacao: 9 -> 1" em todo mundo que estivesse de ferias ou no INSS.
  if (dados.situacao !== null && existente.situacao !== dados.situacao) {
    mudancas.push(`Situacao: ${existente.situacao} -> ${dados.situacao}`);
  }

  return mudancas;
}

/**
 * Monta o plano: quem entra, quem muda, quem fica como esta e quem o portal nao
 * aceita.
 *
 * A identidade e o **CPF**: a matricula se repete entre empresas e o nome muda
 * (casamento, correcao de grafia), entao so o CPF responde "e a mesma pessoa?".
 *
 * O conflito de matricula e resolvido aqui, e nao pelo indice unico do banco:
 * dentro de uma transacao, o INSERT recusado aborta tudo que veio antes, e uma
 * importacao de trezentas linhas cairia inteira por causa de uma. Detectando em
 * memoria, a linha problematica vira uma recusa com motivo e as outras entram.
 */
export function planejarImportacao(
  linhas: readonly LinhaDoRelatorio[],
  existentes: readonly FuncionarioExistente[],
  empresas: readonly EmpresaConhecida[],
  recusadasDaLeitura: readonly LinhaRecusada[] = [],
): PlanoDeImportacao {
  const idPorEmpresa = new Map(
    empresas.map((empresa) => [chaveDaEmpresa(empresa.nome), empresa.id]),
  );
  const porCpf = new Map(existentes.map((funcionario) => [funcionario.cpf, funcionario]));

  // Quem ja ocupa cada matricula, por empresa. Guarda o CPF porque o dono
  // legitimo da matricula pode ser a propria pessoa que esta sendo atualizada.
  const donoDaMatricula = new Map<string, string>();

  for (const funcionario of existentes) {
    const empresa = empresas.find((atual) => atual.id === funcionario.empresaId);

    if (empresa) {
      donoDaMatricula.set(chaveDaMatricula(empresa.nome, funcionario.matricula), funcionario.cpf);
    }
  }

  const empresasNovas: string[] = [];
  const aCriar: Criacao[] = [];
  const aAtualizar: Atualizacao[] = [];
  const recusadas: LinhaRecusada[] = [...recusadasDaLeitura];
  let inalterados = 0;

  for (const linha of linhas) {
    const chaveEmpresa = chaveDaEmpresa(linha.empresa);
    const empresaId = idPorEmpresa.get(chaveEmpresa) ?? null;

    if (
      empresaId === null &&
      !empresasNovas.some((nome) => chaveDaEmpresa(nome) === chaveEmpresa)
    ) {
      empresasNovas.push(linha.empresa);
    }

    const chaveMatricula = chaveDaMatricula(linha.empresa, linha.matricula);
    const dono = donoDaMatricula.get(chaveMatricula);

    // A matricula so e conflito quando pertence a **outra** pessoa: reimportar
    // a mesma planilha encontra a matricula ocupada por quem sempre a teve.
    if (dono !== undefined && dono !== linha.cpf) {
      recusadas.push({
        linha: linha.linha,
        identificacao: linha.nome,
        motivo: `Matricula ${linha.matricula} ja pertence a outra pessoa nesta empresa.`,
      });
      continue;
    }

    donoDaMatricula.set(chaveMatricula, linha.cpf);

    const dados: DadosDaFolha = {
      empresaId,
      empresa: linha.empresa,
      matricula: linha.matricula,
      nome: linha.nome,
      cargo: linha.cargo,
      admissao: linha.admissao,
      situacao: linha.situacao,
    };

    const existente = porCpf.get(linha.cpf);

    if (!existente) {
      aCriar.push({ linha: linha.linha, cpf: linha.cpf, dados });
      continue;
    }

    const mudancas = compararComOCadastro(existente, dados);

    if (mudancas.length === 0) {
      inalterados += 1;
      continue;
    }

    aAtualizar.push({
      linha: linha.linha,
      id: existente.id,
      cpf: linha.cpf,
      nome: existente.nome,
      dados,
      mudancas,
    });
  }

  return { empresasNovas, aCriar, aAtualizar, inalterados, recusadas };
}
