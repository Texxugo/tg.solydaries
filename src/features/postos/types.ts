import type { FuncaoTurma } from "@/db/schema";
import type { VigenciaDoCiclo } from "@/features/preenchimento/previsto";

import type { AtualizarPostoInput, CriarPostoInput } from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/**
 * A funcao dentro do posto — a faixa que a grade desenha.
 *
 * O ciclo e o horario sao **dela**, e nao de uma escala cadastrada: e o
 * contrato do posto que exige 4x2 na Portaria Remota, seja quem for que a cubra
 * neste mes. E deles que o previsto da grade nasce.
 *
 * As `vigencias` sao esse contrato ao longo do tempo, e nao um estado unico:
 * uma por turma e por data de inicio. `escala` e `contraescala` vem na mesma
 * lista — quem desenha separa.
 */
export type FuncaoResumo = {
  id: string;
  postoId: string;
  nome: string;
  vigencias: VigenciaDoCiclo[];
  eventoTrabalhoId: string | null;
  eventoTrabalhoCodigo: string | null;
  observacao: string | null;
  ordem: number;
  ativa: boolean;
};

/**
 * Os dias em que a aba Funcoes desenha o contrato de cada turma.
 *
 * E a competencia em vigor, que e onde a grade vai usar o contrato — e o
 * primeiro dia dela e a ancora da vigencia "desde sempre", como na grade. Sem
 * competencia, os proximos 30 dias: o desenho continua servindo para conferir a
 * alternancia, e o rotulo diz que nao e o periodo de ninguem.
 *
 * Postos continuam sendo cadastro: o periodo so desenha, nao filtra nada.
 */
export type PeriodoDaPrevia = {
  dias: string[];
  primeiroDia: string;
  rotulo: string;
};

/** O posto como as telas o enxergam, com as funcoes que moram nele. */
export type PostoResumo = {
  id: string;
  codigo: string;
  nome: string;
  empresaId: string | null;
  empresaNome: string | null;
  ativo: boolean;
  funcoes: FuncaoResumo[];
};

/**
 * Uma funcao dentro da grade de um posto — a faixa que separa os turnos dentro
 * da mesma tabela.
 */
export type FuncaoDaGrade = {
  id: string;
  nome: string;
  /** O contrato da turma `escala`, ja montado. `null` quando nao ha vigencia nenhuma. */
  rotuloDoCiclo: string | null;
  observacao: string | null;
};

/**
 * O posto como a grade o abre: um por tela, com as funcoes dentro.
 *
 * E o posto que vira tela, e nao a funcao: a escala de um lugar se le inteira,
 * com os turnos um embaixo do outro.
 */
export type PostoDaGrade = {
  id: string;
  codigo: string;
  nome: string;
  funcoes: FuncaoDaGrade[];
  /** A soma das funcoes — quantas pessoas o posto tem escaladas no periodo. */
  pessoas: number;
};

/**
 * O recorte que o campo "posto de destino" do modal do dia usa: so o que a
 * opcao mostra (`GP01 · Portaria remota`) e o id que ela grava.
 */
export type BlocoDaGrade = {
  funcaoId: string;
  funcaoNome: string;
  postoCodigo: string;
};

export type ValoresDoPosto = {
  codigo: string;
  nome: string;
  empresaId: string;
};

export type ErrosDoPosto = Partial<Record<keyof ValoresDoPosto, string[]>>;

export type CriarPostoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof CriarPostoInput, string[]>>;
  valores?: ValoresDoPosto;
};

export const estadoInicialCriarPosto: CriarPostoState = { status: "idle" };

export type AtualizarPostoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof AtualizarPostoInput, string[]>>;
};

export const estadoInicialAtualizarPosto: AtualizarPostoState = { status: "idle" };

export type ValoresDaFuncao = {
  nome: string;
  eventoTrabalhoId: string;
  observacao: string;
};

/** Os campos de uma vigencia, como o formulario os manda (tudo texto). */
export type ValoresDaVigencia = {
  turma: FuncaoTurma;
  /** `YYYY-MM-DD`; vazio e "desde sempre". */
  vigenciaInicio: string;
  /** "2", "7", "14". */
  diasCiclo: string;
  /** "2", "6 7", "7 13". */
  folgas: string;
  entrada: string;
  saida: string;
  /** `YYYY-MM-DD`; vazio ancora no inicio da vigencia. */
  inicioCiclo: string;
};

export type ErrosDaVigencia = Partial<Record<keyof ValoresDaVigencia, string[]>>;

/**
 * Estado dos formularios de vigencia. Como o de funcao, sao varios no mesmo
 * DOM — um por vigencia ja gravada, mais o de cada turma nova —, entao a
 * mensagem precisa voltar para o formulario que respondeu.
 */
export type VigenciaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: ErrosDaVigencia;
  valores?: ValoresDaVigencia;
  /** Muda a cada gravacao concluida, para remontar o formulario limpo. */
  chave?: string;
};

export const estadoInicialVigencia: VigenciaState = { status: "idle" };

export type ErrosDaFuncao = Partial<Record<keyof ValoresDaFuncao, string[]>>;

/**
 * Estado compartilhado pelo formulario da funcao nova e pelo de cada funcao ja
 * cadastrada. `funcaoId` volta no retorno para que a tela saiba **qual** das
 * linhas respondeu: sao varios formularios no mesmo DOM, cada um com o seu
 * `useActionState`, e uma mensagem sem dono cairia na linha errada.
 */
export type FuncaoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: ErrosDaFuncao;
  valores?: ValoresDaFuncao;
  /** Muda a cada cadastro concluido, para remontar o formulario limpo. */
  chave?: string;
};

export const estadoInicialFuncao: FuncaoState = { status: "idle" };

/**
 * O posto como um campo de escolha de outra feature o mostra: so os ativos, so
 * o que o campo precisa.
 *
 * Mora aqui, e nao no modulo que consome, porque quem produz a lista e
 * `listarPostosAtivos()` — mesma razao de `EscalaParaAtribuicao` viver em
 * `escalas/types.ts`.
 */
export type PostoParaEscolha = {
  id: string;
  codigo: string;
  nome: string;
};

/**
 * O responsavel do posto como a aba Responsavel o mostra. `ativo` e
 * `telefone` vao junto porque sao eles que decidem se a mensagem sai: o
 * responsavel desativado ou sem numero **bloqueia** o envio, e nao devolve a
 * mensagem ao colaborador.
 */
export type ResponsavelDoPosto = {
  id: string;
  nome: string;
  matricula: string;
  cargo: string | null;
  telefone: string | null;
  ativo: boolean;
};

/** Uma pessoa do grupo de contato do posto. */
export type MembroDoGrupo = {
  funcionarioId: string;
  nome: string;
  matricula: string;
  cargo: string | null;
  empresaNome: string;
  telefone: string | null;
  ativo: boolean;
};

export type GrupoDeContato = {
  responsavel: ResponsavelDoPosto | null;
  membros: MembroDoGrupo[];
};

/**
 * Para quem vai a mensagem de correcao de ponto de uma pessoa.
 *
 * `colaborador` e o comportamento de antes do grupo (a propria pessoa); vale
 * para quem nao esta em grupo nenhum e para quem esta no grupo de um posto sem
 * responsavel. `responsavel` vale assim que o posto tiver um — **mesmo que ele
 * esteja sem telefone ou desativado**: ai o envio para, e nao volta para o
 * colaborador em silencio.
 */
export type ContatoDoFuncionario =
  | { via: "colaborador" }
  | {
      via: "responsavel";
      posto: { id: string; codigo: string; nome: string };
      responsavel: { id: string; nome: string; telefone: string | null; ativo: boolean };
    };

/**
 * Estado dos formularios da aba Responsavel. Sao varios no DOM (o responsavel,
 * a inclusao, o atalho da grade e um "Retirar" por linha), cada um com o seu.
 */
export type GrupoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  /** Muda a cada gravacao concluida, para remontar o campo de pessoa limpo. */
  chave?: string;
};

export const estadoInicialGrupo: GrupoState = { status: "idle" };

/** Rota da area de postos. */
export const ROTA_POSTOS = "/postos";

/** A area do portal a que este modulo pertence. */
export const AREA_POSTOS = "postos" as const;
