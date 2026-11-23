import { createHash } from "node:crypto";

import type { DivergenciaTipo } from "@/db/schema";

/**
 * O conteudo consolidado de uma tratativa pelo WhatsApp: tudo o que o
 * comprovante atesta, num objeto so, serializado de um jeito so.
 *
 * O hash e calculado sobre a **serializacao canonica** deste objeto, antes de o
 * PDF existir. O PDF e so uma apresentacao dele — e por isso a integridade e
 * conferida contra o banco, e nao contra o arquivo.
 *
 * Serializacao canonica quer dizer: chaves em ordem alfabetica, sem espaco,
 * datas como ISO 8601 em UTC. O `JSON.stringify` comum segue a ordem de
 * insercao das chaves, e um objeto montado em outra ordem daria outro hash para
 * o mesmo conteudo.
 */

export const VERSAO_DO_CONTEUDO = 1;

export type MensagemDaTranscricao = {
  sequencia: number;
  direcao: "recebida" | "enviada";
  /** O id da mensagem na Z-API. `null` quando o envio falhou. */
  mensagemId: string | null;
  /** ISO 8601, UTC. */
  momento: string;
  status: "recebida" | "enviada" | "falhou";
  texto: string;
  opcaoId: string | null;
};

export type ConteudoConsolidado = {
  versao: number;
  protocolo: string;
  ocorrencia: {
    funcionarioId: string;
    nome: string;
    matricula: string;
    empresa: string;
    data: string;
    tipo: DivergenciaTipo;
    rotulo: string;
    descricao: string;
    batidas: string[];
  };
  colaborador: { telefone: string };
  correcao: {
    dataCorrigida: string;
    motivo: string;
    motivoRotulo: string;
    horarios: string[];
    descricao: string | null;
  };
  confirmacao: {
    mensagemId: string | null;
    momento: string;
    resposta: string;
  };
  transcricao: MensagemDaTranscricao[];
  iniciadoEm: string;
  confirmadoEm: string;
};

/** JSON com as chaves ordenadas em todos os niveis. Arrays mantem a ordem. */
export function serializarCanonico(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(ordenar);
  }

  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor as Record<string, unknown>)
        .sort()
        .map((chave) => [chave, ordenar((valor as Record<string, unknown>)[chave])]),
    );
  }

  return valor;
}

/** SHA-256 em hexadecimal minusculo. */
export function sha256(conteudo: string | Uint8Array) {
  return createHash("sha256").update(conteudo).digest("hex");
}

/** A serializacao e o hash, calculados juntos para nao haver como separar um do outro. */
export function consolidar(conteudo: ConteudoConsolidado) {
  const texto = serializarCanonico(conteudo);
  return { texto, hash: sha256(texto) };
}
