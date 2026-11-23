import type { TratativaStatus } from "@/db/schema";
import { dataNoPortal, diaSeguinte } from "@/features/competencias/periodo";
import type { ContatoDoFuncionario } from "@/features/postos/types";

import type { TipoDeDivergencia } from "./apuracao";
import { ehTipoDoAtendimento } from "./atendimento/motivos";
import { tratativaEncerrada } from "./tratativas";

/**
 * Para quem a mensagem de correcao de ponto vai, e ate quando se espera o
 * retorno. Modulo puro, como `mensagens.ts`: e lido pela DAL, pela action e
 * pelo formulario, e os tres precisam chegar na mesma resposta.
 *
 * Quem esta no grupo de contato de um posto com responsavel
 * (`posto_contatos`) e tratado **pelo responsavel**; os demais continuam
 * recebendo a propria mensagem, como antes do grupo existir.
 */

/** O prazo de retorno que a mensagem ao responsavel promete, em dias corridos. */
export const PRAZO_RETORNO_DIAS = 3;

/**
 * Por que a mensagem nao pode sair. `null` = pode.
 *
 * Com responsavel, faltar telefone ou cadastro ativo **dele** bloqueia — e a
 * mensagem nao volta para o colaborador. Cair no contato direto em silencio e
 * justamente o que o grupo existe para evitar.
 */
export type BloqueioDoDestino = "sem_telefone" | "responsavel_sem_telefone" | "responsavel_inativo";

export type DestinoDaMensagem = {
  via: ContatoDoFuncionario["via"];
  /** O funcionario que recebe — o colaborador ou o responsavel. */
  funcionarioId: string;
  nome: string;
  telefone: string | null;
  /** O posto cujo responsavel recebe. `null` quando vai ao proprio colaborador. */
  posto: { id: string; codigo: string; nome: string } | null;
  bloqueio: BloqueioDoDestino | null;
};

export function destinoDaMensagem(
  colaborador: { id: string; nome: string; telefone: string | null },
  contato: ContatoDoFuncionario,
): DestinoDaMensagem {
  if (contato.via === "colaborador") {
    return {
      via: "colaborador",
      funcionarioId: colaborador.id,
      nome: colaborador.nome,
      telefone: colaborador.telefone,
      posto: null,
      bloqueio: colaborador.telefone ? null : "sem_telefone",
    };
  }

  const { responsavel, posto } = contato;

  return {
    via: "responsavel",
    funcionarioId: responsavel.id,
    nome: responsavel.nome,
    telefone: responsavel.telefone,
    posto,
    bloqueio: !responsavel.ativo
      ? "responsavel_inativo"
      : responsavel.telefone
        ? null
        : "responsavel_sem_telefone",
  };
}

/** `YYYY-MM-DD` mais o prazo, em dias corridos e na aritmetica UTC de `diaSeguinte()`. */
export function prazoDeRetorno(dataDoEnvio: string) {
  let data = dataDoEnvio;

  for (let dia = 0; dia < PRAZO_RETORNO_DIAS; dia++) {
    data = diaSeguinte(data);
  }

  return data;
}

export type PrazoDeRetorno = {
  /** `YYYY-MM-DD`: o ultimo dia do prazo. */
  ate: string;
  vencido: boolean;
};

/**
 * O prazo da ocorrencia, a partir do ultimo envio **aceito**.
 *
 * Calculado, e nao gravado: e a data que o texto prometeu (o envio mais a
 * constante), e reenviar renova — o texto novo diz a data nova. So existe
 * quando esse ultimo envio foi ao responsavel e a tratativa ainda nao foi
 * encerrada; encerrada, nao ha mais retorno a esperar.
 *
 * "A partir do recebimento" e aproximado pelo instante em que a Z-API aceitou a
 * mensagem: o portal nao recebe o status de entrega.
 */
export function prazoDaOcorrencia(
  ultimoEnvio: { destino: ContatoDoFuncionario["via"]; criadoEm: Date } | null,
  status: TratativaStatus,
  hoje: string,
): PrazoDeRetorno | null {
  if (!ultimoEnvio || ultimoEnvio.destino !== "responsavel" || tratativaEncerrada(status)) {
    return null;
  }

  const ate = prazoDeRetorno(dataNoPortal(ultimoEnvio.criadoEm));

  return { ate, vencido: hoje > ate };
}

/** A frase que explica o bloqueio, igual na tela e na recusa da action. */
export function motivoDoBloqueio(bloqueio: BloqueioDoDestino) {
  switch (bloqueio) {
    case "sem_telefone":
      return "Esta pessoa esta sem telefone no cadastro. Informe o numero em Funcionarios antes de enviar.";
    case "responsavel_sem_telefone":
      return "O responsavel pelo posto esta sem telefone no cadastro. Informe o numero dele em Funcionarios antes de enviar.";
    case "responsavel_inativo":
      return "O responsavel pelo posto esta desativado. Escolha outro responsavel na aba Responsavel do posto antes de enviar.";
  }
}

/**
 * Quantas ocorrencias cabem num envio consolidado. As demais ficam para o
 * envio seguinte — a tela diz quantas. Sem teto, um grupo grande com o mes
 * inteiro pendente viraria uma mensagem que ninguem le ate o fim.
 */
export const OCORRENCIAS_POR_CONSOLIDADO = 30;

/**
 * Os tipos que o envio consolidado leva: falta e marcacao incompleta — os
 * mesmos do chatbot (`TIPOS_DO_ATENDIMENTO`). Sao os que o responsavel resolve
 * perguntando ao colaborador o que aconteceu; hora extra, debito, intrajornada
 * e os demais sao decisao de quem confere o ponto, e continuam so no painel
 * (e na mensagem avulsa da ocorrencia, para quem quiser).
 */
export function tipoDoConsolidado(tipo: TipoDeDivergencia) {
  return ehTipoDoAtendimento(tipo);
}

/**
 * Se a ocorrencia entra no envio consolidado a este responsavel: de um tipo
 * do consolidado, nao encerrada, e ainda nao enviada **a ele** — nunca
 * enviada, so com envios que falharam, ou enviada antes a outra pessoa (ao
 * colaborador, ou ao responsavel anterior do posto).
 *
 * Quem ja foi avisado e esta no prazo fica de fora: reenviar renovaria o prazo
 * sem ninguem ter pedido. Para cobrar, o caminho e a tela da ocorrencia.
 */
export function entraNoConsolidado(
  ocorrencia: {
    tipo: TipoDeDivergencia;
    status: TratativaStatus;
    ultimoEnvio: { destino: ContatoDoFuncionario["via"]; destinatarioId: string | null } | null;
  },
  responsavelId: string,
) {
  if (!tipoDoConsolidado(ocorrencia.tipo) || tratativaEncerrada(ocorrencia.status)) {
    return false;
  }

  const { ultimoEnvio } = ocorrencia;

  return (
    !ultimoEnvio ||
    ultimoEnvio.destino !== "responsavel" ||
    ultimoEnvio.destinatarioId !== responsavelId
  );
}
