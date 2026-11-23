import type { InsalubridadeGrau, RegraAcao, RegraGatilho, RubricaDaRegra } from "@/db/schema";

import type { ApontamentoDaFolha } from "../rubricas";
import type { ContribuicaoDaRegra } from "./calculo";

/**
 * Contratos do cadastro de regras. Vivem fora de `actions.ts` porque um arquivo
 * "use server" so pode exportar funcoes async.
 */

/** Rota do cadastro. Fica dentro de Apontamentos: a regra e configuracao dele. */
export const ROTA_REGRAS = "/apontamentos/regras";

/** Uma regra como a lista e a edicao a mostram, com os nomes ja resolvidos. */
export type RegraResumo = {
  id: string;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  ordem: number;
  gatilho: RegraGatilho;
  rubrica: RubricaDaRegra;
  acao: RegraAcao;
  quantidade: number | null;
  percentual: number | null;
  grau: InsalubridadeGrau | null;
  escopo: {
    empresaId: string | null;
    empresaNome: string | null;
    cargo: string | null;
    funcionarioId: string | null;
    funcionarioNome: string | null;
    postoId: string | null;
    postoNome: string | null;
    funcaoId: string | null;
    funcaoNome: string | null;
    turma: string | null;
    eventoId: string | null;
    eventoCodigo: string | null;
    cicloDias: number | null;
    cicloFolgas: number | null;
    jornadaMinutos: number | null;
  };
  excecoes: ExcecaoResumo[];
};

export type ExcecaoResumo = {
  id: string;
  /** O que ela tira: empresa, posto, funcao ou pessoa. */
  tipo: "empresa" | "posto" | "funcao" | "funcionario";
  alvoId: string;
  nome: string;
};

/** O alvo de uma excecao como o formulario o envia: `empresa:<uuid>`. */
export const TIPOS_DE_EXCECAO = ["empresa", "posto", "funcao", "funcionario"] as const;
export type TipoDeExcecao = (typeof TIPOS_DE_EXCECAO)[number];

export const ROTULOS_TIPO_DE_EXCECAO: Record<TipoDeExcecao, string> = {
  empresa: "Empresa",
  posto: "Posto",
  funcao: "Funcao",
  funcionario: "Funcionario",
};

/** As listas que os campos de escopo e de excecao oferecem. */
export type OpcoesDasRegras = {
  empresas: { id: string; nome: string }[];
  postos: { id: string; nome: string }[];
  funcoes: { id: string; nome: string }[];
  eventos: { id: string; codigo: string; rotulo: string }[];
  funcionarios: { id: string; nome: string }[];
};

/** O que o formulario devolve para se redesenhar apos um erro: tudo como texto. */
export type ValoresDaRegra = {
  nome: string;
  descricao: string;
  ordem: string;
  ativa: string;
  empresaId: string;
  cargo: string;
  funcionarioId: string;
  postoId: string;
  funcaoId: string;
  turma: string;
  eventoId: string;
  cicloDias: string;
  cicloFolgas: string;
  jornadaMinutos: string;
  gatilho: string;
  rubrica: string;
  acao: string;
  quantidade: string;
  percentual: string;
  grau: string;
  /** `empresa:<uuid>`, um por linha marcada no formulario. */
  excecoes: string[];
};

export type ErrosDaRegra = Partial<Record<keyof ValoresDaRegra, string[]>>;

export type RegraState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: ErrosDaRegra;
  valores?: ValoresDaRegra;
  /** Muda a cada resposta, para o formulario remontar com o que foi digitado. */
  tentativa?: string;
};

export const estadoInicialRegra: RegraState = { status: "idle" };

export type ExcluirRegraState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialExcluirRegra: ExcluirRegraState = { status: "idle" };

export type GerarApontamentosState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialGerarApontamentos: GerarApontamentosState = { status: "idle" };

/** A sugestao de uma pessoa, com o que a tela precisa para explicar de onde ela veio. */
export type SugestaoDaPessoa = {
  apontamento: ApontamentoDaFolha;
  contribuicoes: ContribuicaoDaRegra[];
};

/** Sem regra ativa nenhuma nao ha o que sugerir — e a tela diz isso. */
export const SEM_REGRAS =
  "Nenhuma regra ativa cadastrada: a sugestao a partir da grade so aparece depois que houver regra.";
