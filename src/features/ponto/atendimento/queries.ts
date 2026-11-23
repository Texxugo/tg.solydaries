import "server-only";

import { and, asc, count, desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import {
  atendimentosPonto,
  comprovantesTratativa,
  mensagensWhatsapp,
  type AtendimentoDesfecho,
  type AtendimentoEtapa,
} from "@/db/schema";

import type { TipoDeDivergencia } from "../apuracao";
import { idFuncionarioSchema } from "../schema";
import {
  serializarCanonico,
  sha256,
  type ConteudoConsolidado,
  type MensagemDaTranscricao,
} from "./consolidacao";
import { transcricoesAte } from "./processar";

/**
 * Leituras dos atendimentos pelo WhatsApp e dos comprovantes — para as telas de
 * ocorrencia e de ponto do funcionario.
 */

/** O resultado de conferir um comprovante contra o banco. */
export type Integridade = {
  /** O SHA-256 do conteudo gravado e igual ao hash gravado. */
  hashConfere: boolean;
  /**
   * A transcricao reconstruida das mensagens gravadas e igual a que entrou no
   * conteudo. E o que pega uma mensagem editada no banco depois da confirmacao,
   * mesmo que alguem tenha recalculado o hash.
   */
  transcricaoConfere: boolean;
};

export type ComprovanteResumo = {
  id: string;
  atendimentoId: string;
  funcionarioId: string;
  data: string;
  tipo: TipoDeDivergencia;
  hash: string;
  pdfHash: string;
  geradoEm: Date;
  telefone: string;
  mensagens: number;
  motivo: string;
  integridade: Integridade;
};

/**
 * Confere o comprovante: o hash contra o conteudo, e o conteudo contra as
 * mensagens.
 *
 * As duas conferencias sao feitas porque respondem perguntas diferentes. O hash
 * sozinho prova que o `conteudo` nao mudou; nao prova que as mensagens de onde
 * ele saiu continuam as mesmas. A reconstrucao usa `transcricaoAte()`, a mesma
 * funcao da geracao — duas montagens divergiriam e acusariam alteracao onde nao
 * houve.
 */
function conferir(
  comprovante: { atendimentoId: string; conteudo: string; hash: string },
  reconstruida: MensagemDaTranscricao[] | undefined,
): Integridade {
  const hashConfere = sha256(comprovante.conteudo) === comprovante.hash;

  let transcricaoConfere = false;

  try {
    const gravado = JSON.parse(comprovante.conteudo) as ConteudoConsolidado;

    transcricaoConfere =
      serializarCanonico(reconstruida ?? []) === serializarCanonico(gravado.transcricao);
  } catch {
    transcricaoConfere = false;
  }

  return { hashConfere, transcricaoConfere };
}

const colunasDoComprovante = {
  id: comprovantesTratativa.id,
  atendimentoId: comprovantesTratativa.atendimentoId,
  funcionarioId: comprovantesTratativa.funcionarioId,
  data: comprovantesTratativa.data,
  tipo: comprovantesTratativa.tipo,
  hash: comprovantesTratativa.hash,
  pdfHash: comprovantesTratativa.pdfHash,
  geradoEm: comprovantesTratativa.geradoEm,
  sequenciaFinal: comprovantesTratativa.sequenciaFinal,
  conteudo: comprovantesTratativa.conteudo,
  telefone: atendimentosPonto.telefone,
};

async function resumir(
  linhas: (Omit<ComprovanteResumo, "mensagens" | "motivo" | "integridade"> & {
    sequenciaFinal: number;
    conteudo: string;
  })[],
): Promise<ComprovanteResumo[]> {
  // Uma consulta para a lista inteira: a conferencia de cada comprovante
  // reconstroi a transcricao dele, e uma leitura por linha crescia com o
  // historico da pessoa.
  const transcricoes = await transcricoesAte(
    db,
    linhas.map(({ atendimentoId, sequenciaFinal }) => ({ atendimentoId, sequenciaFinal })),
  );

  return linhas.map((linha) => {
    let mensagens = 0;
    let motivo = "—";

    try {
      const lido = JSON.parse(linha.conteudo) as ConteudoConsolidado;
      mensagens = lido.transcricao.length;
      motivo = lido.correcao.motivoRotulo;
    } catch {
      // Conteudo que nem JSON e aparece na conferencia como nao integro.
    }

    return {
      id: linha.id,
      atendimentoId: linha.atendimentoId,
      funcionarioId: linha.funcionarioId,
      data: linha.data,
      tipo: linha.tipo,
      hash: linha.hash,
      pdfHash: linha.pdfHash,
      geradoEm: linha.geradoEm,
      telefone: linha.telefone,
      mensagens,
      motivo,
      integridade: conferir(linha, transcricoes.get(linha.atendimentoId)),
    };
  });
}

/** Os comprovantes de uma ocorrencia, do mais recente ao mais antigo. */
export async function comprovantesDaOcorrencia(
  funcionarioId: string,
  data: string,
  tipo: TipoDeDivergencia,
) {
  await connection();

  const linhas = await db
    .select(colunasDoComprovante)
    .from(comprovantesTratativa)
    .innerJoin(atendimentosPonto, eq(atendimentosPonto.id, comprovantesTratativa.atendimentoId))
    .where(
      and(
        eq(comprovantesTratativa.funcionarioId, funcionarioId),
        eq(comprovantesTratativa.data, data),
        eq(comprovantesTratativa.tipo, tipo),
      ),
    )
    .orderBy(desc(comprovantesTratativa.geradoEm));

  return resumir(linhas);
}

/** Todos os comprovantes de uma pessoa, de qualquer competencia. */
export async function comprovantesDoFuncionario(funcionarioId: string) {
  await connection();

  if (!idFuncionarioSchema.safeParse(funcionarioId).success) {
    return [];
  }

  const linhas = await db
    .select(colunasDoComprovante)
    .from(comprovantesTratativa)
    .innerJoin(atendimentosPonto, eq(atendimentosPonto.id, comprovantesTratativa.atendimentoId))
    .where(eq(comprovantesTratativa.funcionarioId, funcionarioId))
    .orderBy(desc(comprovantesTratativa.geradoEm));

  return resumir(linhas);
}

/** O PDF de um comprovante, com o que o download precisa para se nomear. */
export async function pdfDoComprovante(id: string) {
  await connection();

  if (!idFuncionarioSchema.safeParse(id).success) {
    return null;
  }

  const [linha] = await db
    .select({
      pdf: comprovantesTratativa.pdf,
      data: comprovantesTratativa.data,
      atendimentoId: comprovantesTratativa.atendimentoId,
    })
    .from(comprovantesTratativa)
    .where(eq(comprovantesTratativa.id, id))
    .limit(1);

  return linha ?? null;
}

export type AtendimentoDaOcorrencia = {
  id: string;
  etapa: AtendimentoEtapa;
  desfecho: AtendimentoDesfecho | null;
  telefone: string;
  iniciadoEm: Date;
  ultimaInteracaoEm: Date;
  mensagens: number;
};

/**
 * As conversas sobre uma ocorrencia, da mais recente para a mais antiga —
 * inclusive as canceladas, que nao geram comprovante mas explicam por que a
 * ocorrencia continua aberta.
 */
export async function atendimentosDaOcorrencia(
  funcionarioId: string,
  data: string,
  tipo: TipoDeDivergencia,
): Promise<AtendimentoDaOcorrencia[]> {
  await connection();

  return db
    .select({
      id: atendimentosPonto.id,
      etapa: atendimentosPonto.etapa,
      desfecho: atendimentosPonto.desfecho,
      telefone: atendimentosPonto.telefone,
      iniciadoEm: atendimentosPonto.iniciadoEm,
      ultimaInteracaoEm: atendimentosPonto.ultimaInteracaoEm,
      mensagens: count(mensagensWhatsapp.id),
    })
    .from(atendimentosPonto)
    .leftJoin(mensagensWhatsapp, eq(mensagensWhatsapp.atendimentoId, atendimentosPonto.id))
    .where(
      and(
        eq(atendimentosPonto.funcionarioId, funcionarioId),
        eq(atendimentosPonto.data, data),
        eq(atendimentosPonto.tipo, tipo),
      ),
    )
    .groupBy(atendimentosPonto.id)
    .orderBy(desc(atendimentosPonto.ultimaInteracaoEm), asc(atendimentosPonto.id));
}
