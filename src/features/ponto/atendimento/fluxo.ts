import type { AtendimentoEtapa } from "@/db/schema";
import { diaDaSemana, formatarData } from "@/features/competencias/periodo";

import { rotuloDaDivergencia, type TipoDeDivergencia } from "../apuracao";
import { ehMotivo, motivo, motivosPara, type MotivoDeCorrecao } from "./motivos";

/**
 * O chatbot de correcao de ponto: dada a etapa em que a conversa esta e a
 * mensagem que chegou, o que responder e para onde ir.
 *
 * Modulo **puro**, como `apuracao.ts`: nao le banco, nao envia nada, nao sabe
 * que existe Z-API. Recebe o estado gravado e o contexto (quem e a pessoa,
 * quais ocorrencias ela tem pendentes) e devolve a transicao. Quem grava e
 * envia e `processar.ts`.
 *
 * A separacao existe pelo mesmo motivo de sempre: e aqui que mora a regra da
 * conversa, e ela precisa poder ser conferida sem subir WhatsApp nenhum.
 *
 * Todo menu vai tambem **numerado no texto**. A lista de opcoes do WhatsApp nao
 * aparece em todo aparelho (versoes antigas, WhatsApp Web, alguns clientes
 * Business), e "responda com o numero" funciona em qualquer um.
 */

/** Uma ocorrencia que a pessoa pode corrigir, como o fluxo a enxerga. */
export type OcorrenciaPendente = {
  data: string;
  tipo: TipoDeDivergencia;
  descricao: string;
  /** `HH:MM`, as batidas do turno como a apuracao as leu. */
  batidas: readonly string[];
  previsto: { entrada: string; saida: string } | null;
};

export type ContextoDoAtendimento = {
  nome: string;
  /** Em ordem de data, as impeditivas primeiro no mesmo dia. */
  ocorrencias: readonly OcorrenciaPendente[];
};

export type Opcao = { id: string; titulo: string; descricao?: string };

export type Rascunho = {
  data: string | null;
  tipo: TipoDeDivergencia | null;
  descricaoOcorrencia: string | null;
  motivo: MotivoDeCorrecao | null;
  horarios: string[] | null;
  descricao: string | null;
};

export type EstadoDoAtendimento = {
  etapa: AtendimentoEtapa;
  rascunho: Rascunho;
  /** O ultimo menu mostrado — e o que "responda 2" significa. */
  opcoes: readonly Opcao[];
  tentativasInvalidas: number;
};

/** Uma mensagem a enviar. Com `menu`, sai como lista de opcoes. */
export type Resposta = { texto: string; menu?: { titulo: string; opcoes: readonly Opcao[] } };

export type Transicao =
  /** A conversa segue: grava o estado e envia as respostas. */
  | { tipo: "seguir"; estado: EstadoDoAtendimento; respostas: Resposta[] }
  /** A pessoa confirmou: finalizar a tratativa com este rascunho. */
  | { tipo: "confirmar"; estado: EstadoDoAtendimento }
  /** A conversa termina sem mexer em nada. */
  | { tipo: "encerrar"; desfecho: "cancelado" | "sem_pendencia"; respostas: Resposta[] };

export type Entrada = { texto: string; opcaoId: string | null };

/** Quantas datas cabem na lista. O WhatsApp aceita dez linhas por lista. */
const MAXIMO_DE_OPCOES = 10;

/** O menor texto que conta como explicacao, e o maior que o portal guarda. */
const DESCRICAO_MINIMA = 5;
export const DESCRICAO_MAXIMA = 500;

const RASCUNHO_VAZIO: Rascunho = {
  data: null,
  tipo: null,
  descricaoOcorrencia: null,
  motivo: null,
  horarios: null,
  descricao: null,
};

/* -------------------------------------------------------------------------- */
/* Textos                                                                     */
/* -------------------------------------------------------------------------- */

/** "MARIA APARECIDA" -> "Maria". */
function primeiroNome(nome: string) {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

function dataComSemana(data: string) {
  return `${formatarData(data)} (${diaDaSemana(data)})`;
}

/** O texto com as opcoes numeradas embaixo — o menu que funciona em qualquer aparelho. */
function comMenu(texto: string, titulo: string, opcoes: readonly Opcao[]): Resposta {
  const linhas = opcoes.map((opcao, indice) => `${indice + 1} - ${opcao.titulo}`);

  return {
    texto: `${texto}\n\n${linhas.join("\n")}\n\nResponda com o numero da opcao.`,
    menu: { titulo, opcoes },
  };
}

const AJUDA =
  "A qualquer momento, envie *cancelar* para encerrar ou *reiniciar* para comecar de novo.";

/**
 * A palavra que abre o atendimento, enviada sozinha. O numero e o WhatsApp
 * oficial da empresa: recebe de tudo, e so quem escreve "Ponto" quer corrigir o
 * ponto. Qualquer outra mensagem, sem conversa aberta, nao e com o robo.
 */
export const PALAVRA_CHAVE = "ponto";

/** "Ponto", "PONTO" ou "ponto." — a palavra sozinha, sem mais nada na mensagem. */
export function ehPalavraChave(texto: string) {
  return normalizar(texto) === PALAVRA_CHAVE;
}

/** Minusculas, sem acento e sem pontuacao nas pontas: "Sim!" e "sim" sao a mesma resposta. */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/* -------------------------------------------------------------------------- */
/* Perguntas                                                                  */
/* -------------------------------------------------------------------------- */

/** As datas distintas, na ordem das ocorrencias. */
function datasPendentes(ocorrencias: readonly OcorrenciaPendente[]) {
  return [...new Set(ocorrencias.map((ocorrencia) => ocorrencia.data))];
}

function perguntaDaData(contexto: ContextoDoAtendimento, abertura: string | null): Transicao {
  const datas = datasPendentes(contexto.ocorrencias);
  const naLista = datas.slice(0, MAXIMO_DE_OPCOES);

  const opcoes: Opcao[] = naLista.map((data) => {
    const doDia = contexto.ocorrencias.filter((ocorrencia) => ocorrencia.data === data);

    return {
      id: `d:${data}`,
      titulo: dataComSemana(data),
      descricao: doDia.map((ocorrencia) => rotuloDaDivergencia(ocorrencia.tipo)).join(", "),
    };
  });

  const detalhe = naLista
    .map((data) => {
      const tipos = contexto.ocorrencias
        .filter((ocorrencia) => ocorrencia.data === data)
        .map((ocorrencia) => rotuloDaDivergencia(ocorrencia.tipo))
        .join(", ");

      return `• ${dataComSemana(data)}: ${tipos}`;
    })
    .join("\n");

  const sobra =
    datas.length > naLista.length
      ? `\n\nE mais ${datas.length - naLista.length} data(s). Se a sua nao estiver na lista, ` +
        "digite a data (DD/MM)."
      : "";

  const texto =
    (abertura ? `${abertura}\n\n` : "") +
    `Encontrei ${contexto.ocorrencias.length} ocorrencia(s) pendente(s) no seu ponto:\n\n` +
    `${detalhe}${sobra}\n\nQual data voce quer corrigir? Escolha na lista ou digite a data (DD/MM).`;

  return {
    tipo: "seguir",
    estado: { etapa: "data", rascunho: RASCUNHO_VAZIO, opcoes, tentativasInvalidas: 0 },
    respostas: [comMenu(texto, "Datas pendentes", opcoes)],
  };
}

function perguntaDoTipo(rascunho: Rascunho, doDia: readonly OcorrenciaPendente[]): Transicao {
  const opcoes: Opcao[] = doDia.map((ocorrencia) => ({
    id: `t:${ocorrencia.tipo}`,
    titulo: rotuloDaDivergencia(ocorrencia.tipo).slice(0, 24),
    descricao: ocorrencia.descricao.slice(0, 72),
  }));

  return {
    tipo: "seguir",
    estado: { etapa: "tipo", rascunho, opcoes, tentativasInvalidas: 0 },
    respostas: [
      comMenu(
        `O dia ${dataComSemana(rascunho.data ?? "")} tem mais de uma ocorrencia. ` +
          "Qual delas voce quer corrigir?",
        "Ocorrencias do dia",
        opcoes,
      ),
    ],
  };
}

function perguntaDoMotivo(rascunho: Rascunho, ocorrencia: OcorrenciaPendente): Transicao {
  const opcoes: Opcao[] = motivosPara(ocorrencia.tipo).map((atual) => ({
    id: `m:${atual.codigo}`,
    titulo: atual.titulo,
    descricao: atual.descricao,
  }));

  const registro =
    ocorrencia.batidas.length > 0
      ? `Marcacoes registradas: ${ocorrencia.batidas.join(" ")}`
      : "Nenhuma marcacao registrada no dia.";

  const previsto = ocorrencia.previsto
    ? `\nHorario previsto: ${ocorrencia.previsto.entrada} as ${ocorrencia.previsto.saida}`
    : "";

  const texto =
    `*${dataComSemana(ocorrencia.data)} — ${rotuloDaDivergencia(ocorrencia.tipo)}*\n` +
    `${ocorrencia.descricao}\n${registro}${previsto}\n\nQual o motivo?`;

  return {
    tipo: "seguir",
    estado: {
      etapa: "motivo",
      rascunho: {
        ...rascunho,
        data: ocorrencia.data,
        tipo: ocorrencia.tipo,
        descricaoOcorrencia: ocorrencia.descricao,
        motivo: null,
        horarios: null,
        descricao: null,
      },
      opcoes,
      tentativasInvalidas: 0,
    },
    respostas: [comMenu(texto, "Motivo", opcoes)],
  };
}

function perguntaDosHorarios(rascunho: Rascunho): Transicao {
  return {
    tipo: "seguir",
    estado: { etapa: "horarios", rascunho, opcoes: [], tentativasInvalidas: 0 },
    respostas: [
      {
        texto:
          `Informe *todos* os horarios corretos do dia ${formatarData(rascunho.data ?? "")}, ` +
          "na ordem em que aconteceram, separados por espaco.\n\n" +
          "Exemplo: 07:00 12:00 13:00 17:00",
      },
    ],
  };
}

function perguntaDaDescricao(rascunho: Rascunho): Transicao {
  const pedido =
    rascunho.motivo === "atestado"
      ? "Explique o afastamento (atestado, ferias, INSS) e o periodo."
      : rascunho.motivo === "folga_trocada"
        ? "Explique a troca: com quem trocou e quem autorizou."
        : "Explique o que aconteceu nesse dia.";

  return {
    tipo: "seguir",
    estado: { etapa: "descricao", rascunho, opcoes: [], tentativasInvalidas: 0 },
    respostas: [{ texto: `${pedido} Escreva numa mensagem so.` }],
  };
}

/** O resumo que a pessoa confirma. Exportado: o comprovante registra o mesmo texto. */
export function textoDoResumo(nome: string, rascunho: Rascunho, batidas: readonly string[]) {
  const linhas = [
    "*Resumo da correcao*",
    "",
    `Colaborador: ${nome}`,
    `Data corrigida: ${dataComSemana(rascunho.data ?? "")}`,
    `Ocorrencia: ${rascunho.tipo ? rotuloDaDivergencia(rascunho.tipo) : "—"}`,
    `Registro do relogio: ${batidas.length > 0 ? batidas.join(" ") : "nenhuma marcacao"}`,
    `Motivo: ${rascunho.motivo ? motivo(rascunho.motivo).titulo : "—"}`,
  ];

  if (rascunho.horarios?.length) {
    linhas.push(`Horarios informados: ${rascunho.horarios.join(" ")}`);
  }

  if (rascunho.descricao) {
    linhas.push(`Descricao: ${rascunho.descricao}`);
  }

  return linhas.join("\n");
}

const OPCOES_DA_CONFIRMACAO: Opcao[] = [
  { id: "c:confirmar", titulo: "Sim, esta correto", descricao: "Enviar a correcao ao RH" },
  { id: "c:corrigir", titulo: "Corrigir", descricao: "Escolher o motivo de novo" },
  { id: "c:cancelar", titulo: "Cancelar", descricao: "Encerrar sem enviar nada" },
];

function perguntaDaConfirmacao(
  contexto: ContextoDoAtendimento,
  rascunho: Rascunho,
  ocorrencia: OcorrenciaPendente,
): Transicao {
  return {
    tipo: "seguir",
    estado: {
      etapa: "confirmacao",
      rascunho,
      opcoes: OPCOES_DA_CONFIRMACAO,
      tentativasInvalidas: 0,
    },
    respostas: [
      comMenu(
        `${textoDoResumo(contexto.nome, rascunho, ocorrencia.batidas)}\n\n` +
          "*Os dados acima estao corretos?* A correcao so e registrada depois da sua confirmacao.",
        "Confirmacao",
        OPCOES_DA_CONFIRMACAO,
      ),
    ],
  };
}

/** Depois do motivo: horarios, descricao ou direto para o resumo. */
function proximaDepoisDoMotivo(
  contexto: ContextoDoAtendimento,
  rascunho: Rascunho,
  ocorrencia: OcorrenciaPendente,
) {
  const catalogo = motivo(rascunho.motivo as MotivoDeCorrecao);

  if (catalogo.pedeHorarios && !rascunho.horarios) {
    return perguntaDosHorarios(rascunho);
  }

  if (catalogo.pedeDescricao && !rascunho.descricao) {
    return perguntaDaDescricao(rascunho);
  }

  return perguntaDaConfirmacao(contexto, rascunho, ocorrencia);
}

/* -------------------------------------------------------------------------- */
/* Leitura das respostas                                                      */
/* -------------------------------------------------------------------------- */

/** A opcao escolhida: pelo id da lista, ou pelo numero digitado. */
function opcaoEscolhida(estado: EstadoDoAtendimento, entrada: Entrada) {
  if (entrada.opcaoId) {
    const pelaLista = estado.opcoes.find((opcao) => opcao.id === entrada.opcaoId);

    if (pelaLista) {
      return pelaLista;
    }
  }

  const numero = entrada.texto.trim().match(/^(\d{1,2})$/);

  if (numero) {
    return estado.opcoes[Number(numero[1]) - 1] ?? null;
  }

  return null;
}

/**
 * A data digitada, ja casada com as ocorrencias pendentes.
 *
 * Aceita `25/08`, `25/8`, `25-08`, `25/08/2026` e `2026-08-25`. Sem ano, vale o
 * dia e o mes: a janela apurada e de uma competencia, e nela nao ha dois 25/08.
 */
function dataDigitada(texto: string, ocorrencias: readonly OcorrenciaPendente[]) {
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const brasileira = texto.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);

  let dia: number;
  let mes: number;
  let ano: number | null = null;

  if (iso) {
    [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (brasileira) {
    dia = Number(brasileira[1]);
    mes = Number(brasileira[2]);

    if (brasileira[3]) {
      ano = Number(brasileira[3].length === 2 ? `20${brasileira[3]}` : brasileira[3]);
    }
  } else {
    return { lida: false as const };
  }

  const dd = String(dia).padStart(2, "0");
  const mm = String(mes).padStart(2, "0");
  const encontrada = datasPendentes(ocorrencias).find(
    (data) => data.slice(5) === `${mm}-${dd}` && (ano === null || data.startsWith(`${ano}-`)),
  );

  return { lida: true as const, texto: `${dd}/${mm}${ano ? `/${ano}` : ""}`, data: encontrada };
}

/**
 * Os horarios informados, ou o motivo da recusa.
 *
 * Aceita `07:00`, `7:00`, `07h00` e `0700`. Nao exige ordem crescente: num turno
 * que vira o dia, 19:00 vem antes de 07:00.
 */
export function horariosInformados(texto: string):
  | { ok: true; horarios: string[] }
  | {
      ok: false;
      motivo: string;
    } {
  const encontrados = [...texto.matchAll(/\b(\d{1,2})\s*[:hH.]\s*(\d{2})\b|\b(\d{2})(\d{2})\b/g)];

  if (encontrados.length === 0) {
    return { ok: false, motivo: "Nao encontrei nenhum horario na mensagem." };
  }

  const horarios: string[] = [];

  for (const achado of encontrados) {
    const hora = Number(achado[1] ?? achado[3]);
    const minuto = Number(achado[2] ?? achado[4]);

    if (hora > 23 || minuto > 59) {
      return {
        ok: false,
        motivo: `"${achado[0]}" nao e um horario valido.`,
      };
    }

    horarios.push(`${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`);
  }

  if (new Set(horarios).size !== horarios.length) {
    return { ok: false, motivo: "Ha um horario repetido." };
  }

  if (horarios.length > 8) {
    return { ok: false, motivo: "Informe no maximo 8 horarios." };
  }

  // Toda entrada precisa da saida: e a mesma regra que a apuracao usa para
  // acusar marcacao impar, e aceitar numero impar aqui criaria a pendencia de novo.
  if (horarios.length % 2 !== 0) {
    return {
      ok: false,
      motivo:
        `Voce informou ${horarios.length} horario(s). Toda entrada tem a saida ` +
        "correspondente, entao a quantidade precisa ser par.",
    };
  }

  return { ok: true, horarios };
}

/* -------------------------------------------------------------------------- */
/* A conversa                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A primeira mensagem de um atendimento — e tambem o "reiniciar".
 *
 * Chamada quando alguem envia a palavra-chave (`PALAVRA_CHAVE`) sem conversa
 * aberta: a saudacao e as ocorrencias pendentes.
 */
export function iniciar(contexto: ContextoDoAtendimento): Transicao {
  const saudacao = `Ola, ${primeiroNome(contexto.nome)}! Aqui e o atendimento de ponto do RH.`;

  if (contexto.ocorrencias.length === 0) {
    return {
      tipo: "encerrar",
      desfecho: "sem_pendencia",
      respostas: [
        {
          texto:
            `${saudacao}\n\nNao encontrei nenhuma ocorrencia pendente no seu ponto neste ` +
            "periodo. Se voce acha que ha algo errado, procure o RH.",
        },
      ],
    };
  }

  return perguntaDaData(contexto, `${saudacao}\n${AJUDA}`);
}

/** Quantas respostas nao entendidas seguidas antes de lembrar os comandos. */
const TENTATIVAS_ATE_AJUDA = 2;

function naoEntendi(
  estado: EstadoDoAtendimento,
  explicacao: string,
  repetir: Transicao,
): Transicao {
  const tentativas = estado.tentativasInvalidas + 1;

  if (repetir.tipo !== "seguir") {
    return repetir;
  }

  const lembrete = tentativas >= TENTATIVAS_ATE_AJUDA ? `\n\n${AJUDA}` : "";

  return {
    tipo: "seguir",
    estado: { ...repetir.estado, tentativasInvalidas: tentativas },
    respostas: [
      { texto: `${explicacao}${lembrete}` },
      // A pergunta vai de novo inteira: quem voltou horas depois nao lembra dela.
      ...repetir.respostas,
    ],
  };
}

/**
 * A resposta a uma mensagem, dada a etapa em que a conversa estava.
 *
 * O contexto e relido a cada mensagem, e nao confiado ao estado gravado: entre
 * a pergunta e a resposta pode ter entrado uma carga nova, ou o RH pode ter
 * encerrado a tratativa pelo portal. Ocorrencia que deixou de estar pendente no
 * meio da conversa recomeca o atendimento, dizendo por que.
 */
export function responder(
  estado: EstadoDoAtendimento,
  entrada: Entrada,
  contexto: ContextoDoAtendimento,
): Transicao {
  const comando = normalizar(entrada.texto);

  if (["cancelar", "sair", "encerrar", "parar"].includes(comando)) {
    return {
      tipo: "encerrar",
      desfecho: "cancelado",
      respostas: [
        {
          texto:
            "Atendimento cancelado. Nenhuma correcao foi registrada. " +
            "Quando quiser, envie *Ponto* para comecar de novo.",
        },
      ],
    };
  }

  if ([PALAVRA_CHAVE, "reiniciar", "recomecar", "menu", "inicio", "voltar"].includes(comando)) {
    return iniciar(contexto);
  }

  const { rascunho } = estado;

  // A ocorrencia escolhida precisa continuar pendente em todas as etapas depois
  // da data — e e aqui que a mudanca no meio da conversa e percebida.
  const escolhida =
    rascunho.data && rascunho.tipo
      ? contexto.ocorrencias.find(
          (ocorrencia) => ocorrencia.data === rascunho.data && ocorrencia.tipo === rascunho.tipo,
        )
      : undefined;

  if (rascunho.data && rascunho.tipo && !escolhida) {
    const aviso =
      `A ocorrencia de ${formatarData(rascunho.data)} nao esta mais pendente — ` +
      "ela pode ter sido tratada pelo RH ou corrigida por uma carga nova do relogio.";

    if (contexto.ocorrencias.length === 0) {
      return {
        tipo: "encerrar",
        desfecho: "sem_pendencia",
        respostas: [{ texto: `${aviso}\n\nNao ha outra ocorrencia pendente no seu ponto.` }],
      };
    }

    return perguntaDaData(contexto, aviso);
  }

  switch (estado.etapa) {
    case "data": {
      const opcao = opcaoEscolhida(estado, entrada);
      let data = opcao?.id.startsWith("d:") ? opcao.id.slice(2) : undefined;

      if (!data) {
        const digitada = dataDigitada(entrada.texto, contexto.ocorrencias);

        if (!digitada.lida) {
          return naoEntendi(
            estado,
            "Nao entendi a data. Escolha uma opcao da lista ou digite a data no formato DD/MM.",
            perguntaDaData(contexto, null),
          );
        }

        if (!digitada.data) {
          // Validacao contra a ocorrencia existente: data que nao tem pendencia
          // nao abre correcao nenhuma.
          return naoEntendi(
            estado,
            `Nao ha ocorrencia pendente em ${digitada.texto}. So e possivel corrigir as datas ` +
              "da lista.",
            perguntaDaData(contexto, null),
          );
        }

        data = digitada.data;
      }

      const doDia = contexto.ocorrencias.filter((ocorrencia) => ocorrencia.data === data);

      if (doDia.length === 0) {
        return naoEntendi(
          estado,
          `Nao ha mais ocorrencia pendente em ${formatarData(data)}.`,
          perguntaDaData(contexto, null),
        );
      }

      if (doDia.length > 1) {
        return perguntaDoTipo({ ...RASCUNHO_VAZIO, data }, doDia);
      }

      return perguntaDoMotivo({ ...RASCUNHO_VAZIO, data }, doDia[0]);
    }

    case "tipo": {
      const doDia = contexto.ocorrencias.filter((ocorrencia) => ocorrencia.data === rascunho.data);
      const opcao = opcaoEscolhida(estado, entrada);
      const tipo = opcao?.id.startsWith("t:") ? opcao.id.slice(2) : null;
      const ocorrencia = doDia.find((atual) => atual.tipo === tipo);

      if (!ocorrencia) {
        return naoEntendi(
          estado,
          "Escolha uma das ocorrencias da lista.",
          doDia.length > 0 ? perguntaDoTipo(rascunho, doDia) : perguntaDaData(contexto, null),
        );
      }

      return perguntaDoMotivo(rascunho, ocorrencia);
    }

    case "motivo": {
      const opcao = opcaoEscolhida(estado, entrada);
      const codigo = opcao?.id.startsWith("m:") ? opcao.id.slice(2) : null;

      if (
        !escolhida ||
        !ehMotivo(codigo) ||
        !motivosPara(escolhida.tipo).some((m) => m.codigo === codigo)
      ) {
        return naoEntendi(
          estado,
          "Escolha um dos motivos da lista, respondendo com o numero.",
          escolhida ? perguntaDoMotivo(rascunho, escolhida) : perguntaDaData(contexto, null),
        );
      }

      return proximaDepoisDoMotivo(
        contexto,
        { ...rascunho, motivo: codigo, horarios: null, descricao: null },
        escolhida,
      );
    }

    case "horarios": {
      if (!escolhida) {
        return perguntaDaData(contexto, null);
      }

      const lidos = horariosInformados(entrada.texto);

      if (!lidos.ok) {
        return naoEntendi(estado, lidos.motivo, perguntaDosHorarios(rascunho));
      }

      return proximaDepoisDoMotivo(contexto, { ...rascunho, horarios: lidos.horarios }, escolhida);
    }

    case "descricao": {
      if (!escolhida) {
        return perguntaDaData(contexto, null);
      }

      const texto = entrada.texto.trim();

      if (texto.length < DESCRICAO_MINIMA) {
        return naoEntendi(
          estado,
          "A explicacao ficou curta demais. Conte em uma frase o que aconteceu.",
          perguntaDaDescricao(rascunho),
        );
      }

      if (texto.length > DESCRICAO_MAXIMA) {
        return naoEntendi(
          estado,
          `A explicacao passou de ${DESCRICAO_MAXIMA} caracteres. Resuma numa mensagem menor.`,
          perguntaDaDescricao(rascunho),
        );
      }

      return proximaDepoisDoMotivo(contexto, { ...rascunho, descricao: texto }, escolhida);
    }

    case "confirmacao": {
      if (!escolhida) {
        return perguntaDaData(contexto, null);
      }

      const opcao = opcaoEscolhida(estado, entrada);
      const escolha =
        opcao?.id ??
        (["sim", "confirmo", "confirmar", "correto", "esta correto"].includes(comando)
          ? "c:confirmar"
          : ["corrigir", "nao", "alterar", "errado"].includes(comando)
            ? "c:corrigir"
            : null);

      /**
       * A confirmacao so vale explicita: a opcao da lista, o numero ou uma das
       * palavras acima. "Ok", um emoji ou uma pergunta nao confirmam nada — a
       * correcao passa a ser registro, e registro nao nasce de ambiguidade.
       */
      if (escolha === "c:confirmar") {
        return { tipo: "confirmar", estado: { ...estado, tentativasInvalidas: 0 } };
      }

      if (escolha === "c:corrigir") {
        return perguntaDoMotivo(rascunho, escolhida);
      }

      if (escolha === "c:cancelar") {
        return responder(estado, { texto: "cancelar", opcaoId: null }, contexto);
      }

      return naoEntendi(
        estado,
        "Para registrar a correcao preciso de uma confirmacao explicita: responda *1* se os " +
          "dados estao corretos, *2* para corrigir ou *3* para cancelar.",
        perguntaDaConfirmacao(contexto, rascunho, escolhida),
      );
    }
  }
}
