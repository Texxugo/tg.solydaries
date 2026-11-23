import { diaDaSemana, formatarData } from "@/features/competencias/periodo";

import { rotuloDaDivergencia, type TipoDeDivergencia } from "./apuracao";
import { PRAZO_RETORNO_DIAS } from "./contato";

/**
 * O texto que o colaborador recebe — ou o responsavel pelo posto, quando o
 * colaborador esta no grupo de contato de um (`modeloParaResponsavel`).
 *
 * Modulo puro, como `apuracao.ts`: nao envia nada e nao sabe que existe Z-API.
 * Ele so escreve — e escreve no servidor, para que a previa e o envio partam da
 * **mesma** string. Um modelo montado na tela e outro no envio seria uma previa
 * que nao promete o que sera enviado, o mesmo erro que a importacao evita
 * chamando `planejarCarga()` duas vezes.
 *
 * O texto e um ponto de partida editavel, e nao um formulario travado: quem
 * conhece a pessoa costuma acrescentar uma linha, e a conversa e por WhatsApp.
 * O que o portal garante e que **o que aparece na previa e o que sai**.
 */

/**
 * Teto do texto. O WhatsApp aceita bem mais, mas mensagem de tratativa que
 * passa disso deixou de ser uma pergunta objetiva sobre um dia — e o campo tem
 * de ter um limite, ja que a action e um POST publico.
 */
export const LIMITE_MENSAGEM = 1000;

/** "MARIA APARECIDA DA SILVA" -> "Maria". O tratamento e pelo primeiro nome. */
export function primeiroNome(nome: string) {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";

  if (!primeiro) {
    return "";
  }

  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

export type DadosDaMensagem = {
  nome: string;
  empresa: string;
  /** `YYYY-MM-DD`. */
  data: string;
  tipo: TipoDeDivergencia;
  /** A frase que `apuracao.ts` ja escreveu, com os numeros dentro. */
  descricao: string;
  /** As batidas do dia, `HH:MM`. Vazio quando nao houve nenhuma. */
  batidas: readonly string[];
  /** A jornada prevista para o dia, se havia uma. `null` em dia de folga. */
  previsto: { entrada: string; saida: string } | null;
};

/**
 * O modelo da mensagem.
 *
 * A ocorrencia e descrita com a frase que a apuracao ja produziu, e nao com uma
 * segunda redacao so para o WhatsApp: sao a mesma informacao, e duas versoes
 * dela acabariam divergindo — a tela diria uma coisa e o colaborador leria
 * outra.
 */
export function modeloDaMensagem({
  nome,
  empresa,
  data,
  tipo,
  descricao,
  batidas,
  previsto,
}: DadosDaMensagem) {
  const linhas = [
    `Ola, ${primeiroNome(nome)}.`,
    "",
    `Aqui e o RH da ${empresa}, sobre o seu registro de ponto.`,
    "",
    `Dia ${formatarData(data)} (${diaDaSemana(data)}) — ${rotuloDaDivergencia(tipo)}.`,
    descricao,
  ];

  if (previsto) {
    linhas.push(`Horario previsto: ${previsto.entrada} as ${previsto.saida}.`);
  }

  linhas.push(
    batidas.length > 0
      ? `Marcacoes registradas: ${batidas.join(", ")}.`
      : "Nao houve marcacao registrada no dia.",
  );

  linhas.push(
    "",
    "Voce pode nos responder por aqui o que aconteceu nesse dia? Se tiver atestado ou " +
      "outro documento, e so enviar junto.",
    "",
    "Obrigado!",
  );

  return linhas.join("\n");
}

/**
 * "Bom dia", "Boa tarde" ou "Boa noite" pela hora do portal (`horaNoPortal()`):
 * antes das 12h, das 12h as 17h59 e a partir das 18h.
 *
 * Recebe a hora, e nao le o relogio, para o modulo continuar puro. A saudacao
 * faz parte do texto conferido por assinatura no envio consolidado: previa e
 * clique em lados diferentes das 12h ou das 18h recusam o envio, como a virada
 * do dia.
 */
export function saudacaoDaHora(hora: number) {
  if (hora < 12) {
    return "Bom dia";
  }

  return hora < 18 ? "Boa tarde" : "Boa noite";
}

/** "Boa tarde, Sr. Carlos." — a abertura das mensagens ao responsavel. */
export function aberturaAoResponsavel(responsavel: string, hora: number) {
  return `${saudacaoDaHora(hora)}, Sr. ${primeiroNome(responsavel)}.`;
}

export type DadosDaMensagemAoResponsavel = Omit<DadosDaMensagem, "nome" | "empresa"> & {
  /** Quem recebe: o responsavel pelo posto. */
  responsavel: string;
  /** A hora do portal na hora de montar o texto (`horaNoPortal()`): decide a saudacao. */
  hora: number;
  posto: { codigo: string; nome: string };
  colaborador: { nome: string; matricula: string; cargo: string | null };
  /** `YYYY-MM-DD`: o ultimo dia do prazo, ja calculado por `prazoDeRetorno()`. */
  prazo: string;
};

/**
 * O modelo da mensagem ao responsavel pelo posto, quando o colaborador esta no
 * grupo de contato dele.
 *
 * O responsavel nao estava la no dia e precisa poder agir so com o que leu:
 * quem e a pessoa (nome, matricula e cargo, porque nome se repete), de que
 * posto, que dia, o que o relogio registrou, o que se espera de volta e ate
 * quando. A ocorrencia continua descrita pela frase da apuracao, pelo mesmo
 * motivo do modelo ao colaborador.
 */
export function modeloParaResponsavel({
  responsavel,
  hora,
  posto,
  colaborador,
  data,
  tipo,
  descricao,
  batidas,
  previsto,
  prazo,
}: DadosDaMensagemAoResponsavel) {
  const identificacao = [`matricula ${colaborador.matricula}`, colaborador.cargo]
    .filter(Boolean)
    .join(", ");

  const linhas = [
    aberturaAoResponsavel(responsavel, hora),
    "",
    `Identificamos uma correcao de ponto pendente de colaborador do posto ` +
      `${posto.codigo} - ${posto.nome}, sob sua responsabilidade.`,
    "",
    `Colaborador: ${colaborador.nome} (${identificacao}).`,
    `Dia ${formatarData(data)} (${diaDaSemana(data)}) — ${rotuloDaDivergencia(tipo)}.`,
    descricao,
  ];

  if (previsto) {
    linhas.push(`Horario previsto: ${previsto.entrada} as ${previsto.saida}.`);
  }

  linhas.push(
    batidas.length > 0
      ? `Marcacoes registradas: ${batidas.join(", ")}.`
      : "Nao houve marcacao registrada no dia.",
  );

  linhas.push(
    "",
    "Por favor, confirme com o colaborador o que aconteceu e responda a esta mensagem com os " +
      "horarios corretos ou o motivo (atestado, folga combinada, troca de turno). Se houver " +
      "documento, envie junto.",
    "",
    `Prazo para retorno: ate ${formatarData(prazo)} (${diaDaSemana(prazo)}) — ` +
      `${PRAZO_RETORNO_DIAS} dias a partir do recebimento desta mensagem.`,
    "",
    "Obrigado!",
  );

  return linhas.join("\n");
}

/** Uma ocorrencia, como o envio consolidado a lista. */
export type ItemDoConsolidado = {
  posto: { codigo: string; nome: string };
  colaborador: { nome: string; matricula: string; cargo: string | null };
  data: string;
  tipo: TipoDeDivergencia;
  descricao: string;
  batidas: readonly string[];
  previsto: { entrada: string; saida: string } | null;
};

export type DadosDoConsolidado = {
  responsavel: string;
  /** A hora do portal na hora de montar o texto (`horaNoPortal()`): decide a saudacao. */
  hora: number;
  /** Ja na ordem em que saem: por posto, e por data dentro dele. */
  itens: readonly ItemDoConsolidado[];
  /** `YYYY-MM-DD`: o ultimo dia do prazo, ja calculado por `prazoDeRetorno()`. */
  prazo: string;
};

/**
 * O envio consolidado: uma mensagem so ao responsavel, com todas as
 * ocorrencias do grupo que ainda nao foram enviadas a ele.
 *
 * Os itens sao numerados para que a resposta possa citar "o 3" — o WhatsApp nao
 * tem como responder a um pedaco da mensagem. O posto encabeca cada bloco
 * porque o responsavel pode cuidar de mais de um. Cada item traz o que o
 * responsavel precisa para agir sem abrir o portal: quem, que dia, o que a
 * apuracao viu, o horario previsto e o que o relogio registrou.
 */
export function modeloConsolidado({ responsavel, hora, itens, prazo }: DadosDoConsolidado) {
  const quantas =
    itens.length === 1
      ? "uma correcao de ponto pendente de colaborador"
      : `${itens.length} correcoes de ponto pendentes de colaboradores`;

  const linhas = [aberturaAoResponsavel(responsavel, hora), "", `Identificamos ${quantas}:`];

  let postoAtual = "";

  itens.forEach((item, indice) => {
    const posto = `${item.posto.codigo} - ${item.posto.nome}`;

    if (posto !== postoAtual) {
      linhas.push("", `*Posto ${posto}*`);
      postoAtual = posto;
    }

    const identificacao = [`mat. ${item.colaborador.matricula}`, item.colaborador.cargo]
      .filter(Boolean)
      .join(", ");
    const detalhes = [
      item.descricao,
      item.previsto ? `Previsto ${item.previsto.entrada} as ${item.previsto.saida}.` : null,
      item.batidas.length > 0 ? `Marcacoes: ${item.batidas.join(", ")}.` : "Sem marcacao no dia.",
    ]
      .filter(Boolean)
      .join(" ");

    linhas.push(
      `${indice + 1}. ${item.colaborador.nome} (${identificacao})`,
      `   ${formatarData(item.data)} (${diaDaSemana(item.data)}) — ${rotuloDaDivergencia(item.tipo)}. ${detalhes}`,
    );
  });

  linhas.push(
    "",
    "Por favor, confirme com cada colaborador o que aconteceu e responda a esta mensagem com " +
      "os horarios corretos ou o motivo de cada item, citando o numero dele (atestado, folga " +
      "combinada, troca de turno). Se houver documento, envie junto.",
    "",
    `Prazo para retorno: ate ${formatarData(prazo)} (${diaDaSemana(prazo)}) — ` +
      `${PRAZO_RETORNO_DIAS} dias a partir do recebimento desta mensagem.`,
    "",
    "Obrigado!",
  );

  return linhas.join("\n");
}
