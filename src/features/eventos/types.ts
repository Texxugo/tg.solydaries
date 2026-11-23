import type { EventoCor, EventoNatureza } from "@/db/schema";

import type { AtualizarEventoInput, CriarEventoInput } from "./schema";

/**
 * Contratos compartilhados entre as Server Actions e os formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/** O evento como as telas o enxergam. */
export type EventoResumo = {
  id: string;
  codigo: string;
  rotulo: string;
  descricao: string | null;
  natureza: EventoNatureza;
  cor: EventoCor;
  exigeHorario: boolean;
  exigePessoa: boolean;
  exigeDestino: boolean;
  exigeDiaTrabalhado: boolean;
  padrao: boolean;
  ativo: boolean;
};

/**
 * O recorte que a grade carrega para desenhar e interpretar as celulas. Mora
 * aqui, e nao em `preenchimento/`, pelo mesmo motivo de `EscalaParaAtribuicao`:
 * quem produz a lista e esta feature, e o contrario faria eventos depender de
 * quem por acaso os le.
 */
export type EventoDaGrade = {
  id: string;
  codigo: string;
  rotulo: string;
  natureza: EventoNatureza;
  cor: EventoCor;
  exigeHorario: boolean;
  /** O evento nomeia outra pessoa: quem cobriu, com quem trocou, quem substituiu. */
  exigePessoa: boolean;
  /** O evento nomeia outro bloco: a troca de posto. */
  exigeDestino: boolean;
  exigeDiaTrabalhado: boolean;
};

/**
 * O que o formulario devolve para se redesenhar apos um erro: tudo como texto,
 * porque e assim que os campos leem (`defaultValue`) e que o FormData chega.
 */
export type ValoresDoEvento = {
  codigo: string;
  rotulo: string;
  descricao: string;
  natureza: string;
  cor: string;
  exigeHorario: boolean;
  exigePessoa: boolean;
  exigeDestino: boolean;
  exigeDiaTrabalhado: boolean;
  padrao: boolean;
};

export type ErrosDoEvento = Partial<Record<keyof ValoresDoEvento, string[]>>;

export type CriarEventoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof CriarEventoInput, string[]>>;
  valores?: ValoresDoEvento;
};

export const estadoInicialCriarEvento: CriarEventoState = { status: "idle" };

export type AtualizarEventoState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<keyof AtualizarEventoInput, string[]>>;
};

export const estadoInicialAtualizarEvento: AtualizarEventoState = { status: "idle" };

/** Rota da area de eventos. */
export const ROTA_EVENTOS = "/eventos";

/** A area do portal a que este modulo pertence. */
export const AREA_EVENTOS = "eventos" as const;
