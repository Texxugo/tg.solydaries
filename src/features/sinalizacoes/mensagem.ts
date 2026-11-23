import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { aberturaAoResponsavel } from "@/features/ponto/mensagens";

/**
 * O texto do envio dos dias sinalizados ao responsavel do posto (modulo puro).
 *
 * Escrito no servidor e chamado pela previa **e** pelo envio, como o consolidado
 * de ponto: a previa so promete alguma coisa se o envio refizer a mesma string.
 */

/** Um dia sinalizado, como a mensagem o lista. */
export type ItemDoEnvio = {
  /** O nome de quem e o dia. So o nome: matricula nao ajuda o responsavel a perguntar. */
  pessoa: string;
  data: string;
  /**
   * As batidas do turno, ja formatadas. `null` quando o relogio nao tem o que
   * dizer (freelancer, ou dia fora do periodo importado) — e ai a linha nao
   * fala de marcacao nenhuma, em vez de afirmar que nao houve.
   */
  batidas: readonly string[] | null;
  /** O que conferir, escrito por quem sinalizou. */
  observacao: string | null;
};

export type DadosDoEnvio = {
  responsavel: string;
  /** A hora do portal na hora de montar o texto (`horaNoPortal()`): decide a saudacao. */
  hora: number;
  /** Ja na ordem em que saem: por posto, data e pessoa. */
  itens: readonly ItemDoEnvio[];
};

/**
 * Uma mensagem so, com todos os dias sinalizados dos postos do responsavel que
 * ainda nao foram enviados a ele.
 *
 * Cada ocorrencia e um bloco: o nome em negrito (o `*` do WhatsApp) com o
 * numero, sem matricula, e embaixo, uma informacao por linha, so a data com o dia da semana,
 * as marcacoes e o que conferir. Uma linha em branco separa um bloco do outro —
 * no celular, um paragrafo corrido com varios dias se lia como um so.
 *
 * Fica de fora o que o responsavel nao precisa para perguntar ao colaborador:
 * o posto e a funcao (ele conhece os postos dele), o previsto e o que a escala
 * registra. O fechamento pede o retorno, sem prazo nem formato de resposta.
 */
export function modeloDosDiasSinalizados({ responsavel, hora, itens }: DadosDoEnvio) {
  const quantos = itens.length === 1 ? "um dia da escala" : `${itens.length} dias da escala`;

  const linhas = [
    aberturaAoResponsavel(responsavel, hora),
    "",
    `Na conferencia da escala, separamos ${quantos} para verificar com o senhor:`,
  ];

  itens.forEach((item, indice) => {
    linhas.push(
      "",
      `*${indice + 1}. ${item.pessoa}*`,
      `${formatarData(item.data)} (${diaDaSemana(item.data)})`,
    );

    if (item.batidas !== null) {
      linhas.push(
        item.batidas.length > 0
          ? `Marcacoes: ${item.batidas.join(" | ")}`
          : "Marcacoes: nenhuma no dia",
      );
    }

    if (item.observacao) {
      linhas.push(`Conferir: ${item.observacao}`);
    }
  });

  linhas.push(
    "",
    "Por favor, verifique e nos de um retorno o mais breve possivel.",
    "",
    "Obrigado!",
  );

  return linhas.join("\n");
}
