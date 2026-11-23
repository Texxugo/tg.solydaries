import { ehDataValida } from "@/features/competencias/periodo";
import { ehHoraValida } from "@/features/escalas/jornada";

/**
 * Leitura do relatorio "Lista de Marcacoes Realizadas Simplificadas": de um TXT
 * de larguras fixas para as batidas de cada dia.
 *
 * Modulo puro de proposito (so importa os dois modulos puros de que depende),
 * pela mesma razao de `funcionarios/planilha.ts`: a regra de leitura nao
 * precisa do banco nem do sistema de arquivos para ser lida nem conferida.
 *
 * O arquivo e bem mais simples do que o da folha — cabecalho uma vez so, uma
 * linha por pessoa/dia, um total no fim — e por isso a leitura e uma varredura
 * linha a linha, sem estado de bloco. O que ele **nao** tem e o que manda no
 * desenho do resto: nao ha nome de empresa, so o codigo do relogio, e nao ha
 * CPF, so a matricula. E por isso que `empresas.codigo` existe.
 */

/** Linha que o portal nao aceitou, com o motivo — nenhuma some sem explicacao. */
export type LinhaRecusada = {
  linha: number;
  /** O que der para identificar a pessoa: o nome, ou a matricula. */
  identificacao: string;
  motivo: string;
};

/**
 * Uma batida: a hora e se ela veio do relogio ou foi digitada.
 *
 * O relatorio marca a batida inserida a mao com um `i` colado no horario
 * (`14:05i`). O marcador **nao** e descartado: uma batida incluida ja e a
 * correcao que alguem fez de um dia que faltava marcacao, e apagar essa
 * diferenca faria a tela de pendencias tratar como igual o dia que o relogio
 * registrou inteiro e o dia que alguem completou depois.
 */
export type BatidaDoRelatorio = {
  /** `HH:MM`. */
  hora: string;
  /** `true` quando o relatorio marcou a batida como incluida (`14:05i`). */
  incluida: boolean;
};

/** As batidas de uma pessoa em um dia, como o relatorio as descreve. */
export type RegistroDoRelatorio = {
  /** Linha no arquivo, para a tela poder apontar onde conferir. */
  linha: number;
  /** O codigo da coluna "Emp." — do relogio, nao do portal. */
  codigoEmpresa: string;
  matricula: string;
  nome: string;
  /** `YYYY-MM-DD`. */
  data: string;
  /** Em ordem crescente de hora e sem repeticao. */
  batidas: BatidaDoRelatorio[];
};

export type LeituraDoPonto = {
  /**
   * O periodo que o cabecalho declara ("De 21/08/2026 a 04/09/2026"). `null`
   * quando a linha nao esta la — nesse caso quem chama cai no periodo coberto
   * pelas proprias linhas, que e menos confiavel: um dia sem ninguem batendo
   * ponto some do intervalo.
   */
  periodo: { inicio: string; fim: string } | null;
  registros: RegistroDoRelatorio[];
  recusadas: LinhaRecusada[];
  /** O "Total:" do rodape, quando existe — so para conferir a leitura. */
  totalDeclarado: number | null;
};

/* -------------------------------------------------------------------------- */
/* Linhas                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O cabecalho do periodo. O relatorio o escreve centralizado e com espacos
 * variaveis, entao a busca e pelo padrao, e nao por posicao de coluna.
 */
const PERIODO = /\bDe\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/;

/** O rodape. */
const TOTAL = /\bTotal:\s*(\d+)/;

/**
 * Uma linha de marcacao: codigo da empresa, matricula, nome, data e os
 * horarios. A **data** e o que ancora a leitura — e o unico campo com formato
 * inconfundivel no meio da linha, e por isso o nome pode ter quantos espacos
 * tiver sem que a separacao se perca.
 *
 * O nome nao e recortado por coluna fixa: o relatorio alinha por espacos, e uma
 * exportacao com uma coluna a mais moveria tudo. Ancorar na data custa uma
 * expressao a mais e nao depende da largura de nada.
 *
 * O espaco entre o nome e a data e opcional (`\s*`) porque o relatorio nao o
 * garante: um nome que enche a coluna sai colado na data
 * ("...BUENO DA SILVA21/08/2026"). Exigir o espaco descartaria essas linhas em
 * silencio — foram oito neste arquivo, todas da mesma pessoa, que teria
 * aparecido na tela sem ter batido ponto um dia sequer.
 */
const MARCACAO =
  /^\s*(\d{1,8})\s+(\S+)\s+(.*?)\s*(\d{2}\/\d{2}\/\d{4})((?:\s+\d{1,2}:\d{2}(?::\d{2})?[A-Za-z]?)*)\s*$/;

/** `14:05i` -> hora `14:05` e o marcador `i`; `14:05` -> sem marcador. */
const BATIDA = /^(\d{1,2}):(\d{2})(?::\d{2})?([A-Za-z]?)$/;

/** O marcador que o relatorio usa para a batida digitada a mao. */
const MARCADOR_INCLUIDA = "i";

/** `21/08/2026` -> `2026-08-21`, ou `null` para data impossivel (31/02). */
function comoData(escrita: string) {
  const [dia, mes, ano] = escrita.split("/");
  const data = `${ano}-${mes}-${dia}`;

  return ehDataValida(data) ? data : null;
}

/**
 * `6:57` -> `06:57`, `14:05i` -> `14:05` incluida. `null` para o que nao e hora
 * de relogio — o marcador desconhecido tambem recusa, porque uma letra que este
 * codigo nao conhece pode significar justamente que a batida nao vale.
 */
function comoBatida(escrita: string): BatidaDoRelatorio | null {
  const partes = BATIDA.exec(escrita);

  if (!partes) {
    return null;
  }

  const [, h, m, marcador] = partes;
  const hora = `${h.padStart(2, "0")}:${m}`;

  if (!ehHoraValida(hora)) {
    return null;
  }

  if (marcador !== "" && marcador.toLowerCase() !== MARCADOR_INCLUIDA) {
    return null;
  }

  return { hora, incluida: marcador.toLowerCase() === MARCADOR_INCLUIDA };
}

/** As batidas em ordem de hora, sem repetir o mesmo minuto. */
function ordenarBatidas(batidas: readonly BatidaDoRelatorio[]): BatidaDoRelatorio[] {
  const porHora = new Map<string, BatidaDoRelatorio>();

  for (const batida of batidas) {
    const existente = porHora.get(batida.hora);

    // O mesmo minuto duas vezes e a mesma batida. Entre a versao do relogio e a
    // digitada, vale a do relogio: ela e o fato, e a outra e a correcao dele.
    if (!existente || existente.incluida) {
      porHora.set(batida.hora, batida);
    }
  }

  return [...porHora.values()].sort((a, b) => a.hora.localeCompare(b.hora));
}

/** Duas linhas da mesma pessoa no mesmo dia sao o mesmo registro. */
function chaveDoRegistro(codigoEmpresa: string, matricula: string, data: string) {
  return `${codigoEmpresa}|${matricula.toLowerCase()}|${data}`;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Le o relatorio inteiro.
 *
 * Nada e descartado em silencio: o que tem cara de linha de marcacao e nao vira
 * registro vira uma recusa com o numero da linha e o motivo. O que **nao** tem
 * cara de linha de marcacao (titulo, cabecalho, rodape, pagina em branco) e
 * simplesmente ignorado — nunca pretendeu ser um registro.
 *
 * A mesma pessoa aparecendo duas vezes no mesmo dia nao e conflito: o relatorio
 * quebra a linha quando ha batidas demais para a largura da pagina, e as duas
 * metades descrevem o mesmo dia. Os horarios se juntam, ordenados e sem
 * repeticao — a repeticao seria a mesma batida contada duas vezes.
 */
export function lerRelatorioDePonto(conteudo: string): LeituraDoPonto {
  // O TXT vem com BOM e CRLF do sistema da folha.
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/);

  const porChave = new Map<string, RegistroDoRelatorio>();
  const recusadas: LinhaRecusada[] = [];

  let periodo: { inicio: string; fim: string } | null = null;
  let totalDeclarado: number | null = null;

  for (const [indice, texto] of linhas.entries()) {
    const numero = indice + 1;

    if (texto.trim() === "") {
      continue;
    }

    if (!periodo) {
      const cabecalho = PERIODO.exec(texto);
      const inicio = cabecalho && comoData(cabecalho[1]);
      const fim = cabecalho && comoData(cabecalho[2]);

      // So vale como periodo se as duas datas existem e estao em ordem: um
      // cabecalho torto nao pode virar uma janela de apuracao invertida.
      if (inicio && fim && inicio <= fim) {
        periodo = { inicio, fim };
        continue;
      }
    }

    if (totalDeclarado === null) {
      const rodape = TOTAL.exec(texto);

      if (rodape) {
        totalDeclarado = Number(rodape[1]);
        continue;
      }
    }

    const partes = MARCACAO.exec(texto);

    if (!partes) {
      continue;
    }

    const [, codigoEmpresa, matricula, nomeBruto, dataEscrita, horasBrutas] = partes;
    const nome = nomeBruto.trim();
    const identificacao = nome || `Matricula ${matricula}`;
    const recusar = (motivo: string) => recusadas.push({ linha: numero, identificacao, motivo });

    if (nome.length < 3) {
      recusar("Nome ausente ou curto demais.");
      continue;
    }

    const data = comoData(dataEscrita);

    if (!data) {
      recusar(`Data invalida: ${dataEscrita}`);
      continue;
    }

    const batidas: BatidaDoRelatorio[] = [];
    let horaInvalida: string | null = null;

    for (const bruta of horasBrutas.trim().split(/\s+/).filter(Boolean)) {
      const batida = comoBatida(bruta);

      if (!batida) {
        horaInvalida = bruta;
        break;
      }

      batidas.push(batida);
    }

    if (horaInvalida) {
      recusar(`Horario invalido: ${horaInvalida}`);
      continue;
    }

    // Dia sem nenhuma batida nao e informacao: o relatorio simplesmente nao
    // imprime a linha. Se imprimir, ela nao acrescenta nada ao que ja se sabe.
    if (batidas.length === 0) {
      continue;
    }

    const chave = chaveDoRegistro(codigoEmpresa, matricula, data);
    const existente = porChave.get(chave);

    if (existente) {
      existente.batidas = ordenarBatidas([...existente.batidas, ...batidas]);
      continue;
    }

    porChave.set(chave, {
      linha: numero,
      codigoEmpresa,
      matricula,
      nome,
      data,
      batidas: ordenarBatidas(batidas),
    });
  }

  return {
    periodo,
    registros: [...porChave.values()],
    recusadas,
    totalDeclarado,
  };
}

/**
 * O periodo coberto pelas proprias linhas — a rede de seguranca para quando o
 * cabecalho nao veio. Menos confiavel do que o cabecalho de proposito: um dia
 * em que ninguem bateu ponto (feriado de uma equipe pequena) fica de fora do
 * intervalo e deixa de ser apurado.
 */
export function periodoDosRegistros(registros: readonly RegistroDoRelatorio[]) {
  if (registros.length === 0) {
    return null;
  }

  const datas = registros.map((registro) => registro.data).sort();

  return { inicio: datas[0], fim: datas[datas.length - 1] };
}
