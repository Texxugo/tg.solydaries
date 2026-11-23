import "server-only";

import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  atendimentosPonto,
  comprovantesTratativa,
  funcionarios,
  empresas,
  mensagensWhatsapp,
  tratativasPonto,
  type AtendimentoPonto,
} from "@/db/schema";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { formatarData } from "@/features/competencias/periodo";
import { contatoDoFuncionario } from "@/features/postos/queries";

import { rotuloDaDivergencia } from "../apuracao";
import { primeiroNome } from "../mensagens";
import { obterApuracao } from "../queries";
import { tratativaEncerrada } from "../tratativas";
import { enviarOpcoesNoWhatsapp, enviarTextoNoWhatsapp } from "../zapi";
import {
  consolidar,
  sha256,
  type ConteudoConsolidado,
  type MensagemDaTranscricao,
} from "./consolidacao";
import {
  ehPalavraChave,
  iniciar,
  responder,
  type ContextoDoAtendimento,
  type EstadoDoAtendimento,
  type OcorrenciaPendente,
  type Rascunho,
  type Resposta,
  type Transicao,
} from "./fluxo";
import { ehMotivo, ehTipoDoAtendimento, motivo } from "./motivos";
import { gerarPdfDoComprovante } from "./pdf";
import { variantesDoTelefone, type MensagemRecebida } from "./webhook";

/**
 * O processamento de uma mensagem recebida: quem e, em que ponto da conversa
 * esta, o que responder, o que gravar.
 *
 * **Uma mensagem, uma transacao**, com um bloqueio por numero de telefone logo
 * no inicio (`pg_advisory_xact_lock`). Isso resolve tres coisas de uma vez:
 *
 * - **Duplicidade.** A Z-API reentrega o webhook quando nao recebe 200 a tempo.
 *   Com o bloqueio, a segunda entrega espera a primeira terminar e encontra a
 *   mensagem ja gravada — e para ai.
 * - **Ordem.** Duas mensagens seguidas da mesma pessoa sao processadas uma
 *   depois da outra, e a segunda le o estado que a primeira gravou.
 * - **Retomada.** O estado e gravado na mesma transacao da mensagem. Se o
 *   processo cair no meio, nada fica pela metade: a transacao volta, a Z-API
 *   reentrega, e a conversa continua de onde estava.
 *
 * O envio das respostas acontece **dentro** da transacao, antes do `insert` de
 * cada uma. E deliberado: a mensagem enviada nasce gravada com o id que a Z-API
 * devolveu, e nunca e atualizada depois — e e isso que permite reconstruir o
 * conteudo do comprovante e conferir o hash. O custo e segurar a transacao
 * durante as chamadas HTTP (alguns segundos, uma pessoa por vez), e, se a
 * gravacao falhar depois do envio, a pessoa pode receber a pergunta de novo na
 * reentrega. Receber duas vezes e melhor que perder o estado.
 */

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Conversa parada ha mais que isto recomeca: a ocorrencia e o contexto ja podem ser outros. */
const EXPIRACAO_MS = 72 * 60 * 60 * 1000;

/** Um numero desconhecido recebe no maximo uma resposta por este intervalo. */
const INTERVALO_DE_AVISO_MS = 24 * 60 * 60 * 1000;

export type ResultadoDoProcessamento =
  | "processada"
  | "duplicada"
  | "numero_desconhecido"
  | "numero_ambiguo"
  | "sem_palavra_chave"
  | "com_responsavel";

/* -------------------------------------------------------------------------- */
/* Contexto                                                                   */
/* -------------------------------------------------------------------------- */

/** As ocorrencias que a pessoa pode corrigir: as da leitura atual, sem as ja encerradas. */
async function contextoDoFuncionario(funcionario: {
  id: string;
  nome: string;
}): Promise<{ contexto: ContextoDoAtendimento; competenciaId: string | null }> {
  const detalhe = await obterApuracao(funcionario.id);

  if (!detalhe) {
    return { contexto: { nome: funcionario.nome, ocorrencias: [] }, competenciaId: null };
  }

  const tratadas = await db
    .select({
      data: tratativasPonto.data,
      tipo: tratativasPonto.tipo,
      status: tratativasPonto.status,
    })
    .from(tratativasPonto)
    .where(eq(tratativasPonto.funcionarioId, funcionario.id));

  const encerradas = new Set(
    tratadas
      .filter((tratativa) => tratativaEncerrada(tratativa.status))
      .map((tratativa) => `${tratativa.data}|${tratativa.tipo}`),
  );

  const ocorrencias: (OcorrenciaPendente & { impeditiva: boolean })[] = [];

  for (const dia of detalhe.apuracao.dias) {
    for (const divergencia of dia.divergencias) {
      // So falta e marcacao incompleta entram no robo (TIPOS_DO_ATENDIMENTO).
      // Hora extra e as demais ficam no painel, para quem confere o ponto.
      if (!ehTipoDoAtendimento(divergencia.tipo)) {
        continue;
      }

      if (encerradas.has(`${dia.data}|${divergencia.tipo}`)) {
        continue;
      }

      ocorrencias.push({
        data: dia.data,
        tipo: divergencia.tipo,
        descricao: divergencia.descricao,
        batidas: dia.batidas.map((batida) => batida.hora),
        previsto: dia.regra ? { entrada: dia.regra.entrada, saida: dia.regra.saida } : null,
        impeditiva: divergencia.gravidade === "impeditiva",
      });
    }
  }

  ocorrencias.sort((a, b) =>
    a.data !== b.data ? (a.data < b.data ? -1 : 1) : Number(b.impeditiva) - Number(a.impeditiva),
  );

  return {
    contexto: { nome: funcionario.nome, ocorrencias },
    competenciaId: detalhe.competencia.id,
  };
}

function estadoGravado(atendimento: AtendimentoPonto): EstadoDoAtendimento {
  return {
    etapa: atendimento.etapa,
    rascunho: {
      data: atendimento.data,
      tipo: atendimento.tipo,
      descricaoOcorrencia: atendimento.descricaoOcorrencia,
      motivo: ehMotivo(atendimento.motivo) ? atendimento.motivo : null,
      horarios: atendimento.horarios,
      descricao: atendimento.descricao,
    },
    opcoes: atendimento.opcoes,
    tentativasInvalidas: atendimento.tentativasInvalidas,
  };
}

function colunasDoRascunho(rascunho: Rascunho) {
  return {
    data: rascunho.data,
    tipo: rascunho.tipo,
    descricaoOcorrencia: rascunho.descricaoOcorrencia,
    motivo: rascunho.motivo,
    horarios: rascunho.horarios,
    descricao: rascunho.descricao,
  };
}

/* -------------------------------------------------------------------------- */
/* Mensagens                                                                  */
/* -------------------------------------------------------------------------- */

async function registrarRecebida(
  tx: Transacao,
  mensagem: MensagemRecebida,
  atendimentoId: string | null,
) {
  const [linha] = await tx
    .insert(mensagensWhatsapp)
    .values({
      atendimentoId,
      telefone: mensagem.telefone,
      direcao: "recebida",
      status: "recebida",
      mensagemExternaId: mensagem.mensagemExternaId,
      conteudo: mensagem.texto,
      opcaoId: mensagem.opcaoId,
      momento: mensagem.momento,
    })
    .returning({ id: mensagensWhatsapp.id, sequencia: mensagensWhatsapp.sequencia });

  return linha;
}

/** Envia e grava — nessa ordem, para a linha nascer com o desfecho do envio. */
async function enviarERegistrar(
  tx: Transacao,
  telefone: string,
  atendimentoId: string | null,
  resposta: Resposta,
) {
  const momento = new Date();

  const resultado = resposta.menu
    ? await enviarOpcoesNoWhatsapp({
        telefone,
        mensagem: resposta.texto,
        titulo: resposta.menu.titulo,
        opcoes: resposta.menu.opcoes,
      })
    : await enviarTextoNoWhatsapp({ telefone, mensagem: resposta.texto });

  await tx.insert(mensagensWhatsapp).values({
    atendimentoId,
    telefone,
    direcao: "enviada",
    status: resultado.ok ? "enviada" : "falhou",
    mensagemExternaId: resultado.ok ? resultado.mensagemExternaId : null,
    conteudo: resposta.texto,
    opcoes: resposta.menu?.opcoes.map((opcao) => ({ id: opcao.id, titulo: opcao.titulo })) ?? null,
    erro: resultado.ok ? null : resultado.erro,
    momento,
  });
}

async function enviarTodas(
  tx: Transacao,
  telefone: string,
  atendimentoId: string | null,
  respostas: readonly Resposta[],
) {
  for (const resposta of respostas) {
    await enviarERegistrar(tx, telefone, atendimentoId, resposta);
  }
}

/* -------------------------------------------------------------------------- */
/* Transcricao e comprovante                                                  */
/* -------------------------------------------------------------------------- */

/** As colunas da transcricao, num lugar so: as duas leituras abaixo as compartilham. */
const colunasDaTranscricao = {
  atendimentoId: mensagensWhatsapp.atendimentoId,
  sequencia: mensagensWhatsapp.sequencia,
  direcao: mensagensWhatsapp.direcao,
  status: mensagensWhatsapp.status,
  mensagemExternaId: mensagensWhatsapp.mensagemExternaId,
  conteudo: mensagensWhatsapp.conteudo,
  opcaoId: mensagensWhatsapp.opcaoId,
  momento: mensagensWhatsapp.momento,
};

type LinhaDaTranscricao = {
  sequencia: number;
  direcao: MensagemDaTranscricao["direcao"];
  status: MensagemDaTranscricao["status"];
  mensagemExternaId: string | null;
  conteudo: string;
  opcaoId: string | null;
  momento: Date;
};

/**
 * A linha do banco como ela entra no conteudo consolidado.
 *
 * Esta conversao e a razao de a leitura em lote existir ao lado da leitura de
 * uma: as duas passam por aqui, e uma segunda montagem acusaria alteracao onde
 * nao houve.
 */
function paraTranscricao(linha: LinhaDaTranscricao): MensagemDaTranscricao {
  return {
    sequencia: linha.sequencia,
    direcao: linha.direcao,
    mensagemId: linha.mensagemExternaId,
    momento: linha.momento.toISOString(),
    status: linha.status,
    texto: linha.conteudo,
    opcaoId: linha.opcaoId,
  };
}

/**
 * A transcricao de um atendimento ate uma mensagem, como entra no conteudo
 * consolidado. Exportada porque a verificacao do comprovante a reconstroi com
 * **esta mesma** funcao — duas montagens divergiriam no primeiro detalhe.
 */
export async function transcricaoAte(
  executor: Transacao | typeof db,
  atendimentoId: string,
  sequenciaFinal: number,
): Promise<MensagemDaTranscricao[]> {
  const linhas = await executor
    .select(colunasDaTranscricao)
    .from(mensagensWhatsapp)
    .where(
      and(
        eq(mensagensWhatsapp.atendimentoId, atendimentoId),
        sql`${mensagensWhatsapp.sequencia} <= ${sequenciaFinal}`,
      ),
    )
    .orderBy(asc(mensagensWhatsapp.sequencia));

  return linhas.map(paraTranscricao);
}

/**
 * As transcricoes de varios atendimentos, numa consulta so.
 *
 * E o que a conferencia dos comprovantes usa: uma tela lista todos os
 * comprovantes de uma pessoa, e uma leitura por comprovante crescia com o
 * historico dela. O recorte por `sequenciaFinal` e por atendimento, entao a
 * consulta traz as mensagens ate a **maior** sequencia pedida e cada
 * transcricao e cortada na sua — a transcricao de um atendimento nao passa de
 * algumas dezenas de linhas.
 */
export async function transcricoesAte(
  executor: Transacao | typeof db,
  pedidos: readonly { atendimentoId: string; sequenciaFinal: number }[],
): Promise<Map<string, MensagemDaTranscricao[]>> {
  const transcricoes = new Map<string, MensagemDaTranscricao[]>();

  if (pedidos.length === 0) {
    return transcricoes;
  }

  const ids = [...new Set(pedidos.map((pedido) => pedido.atendimentoId))];
  const ultima = Math.max(...pedidos.map((pedido) => pedido.sequenciaFinal));

  const linhas = await executor
    .select(colunasDaTranscricao)
    .from(mensagensWhatsapp)
    .where(
      and(
        inArray(mensagensWhatsapp.atendimentoId, ids),
        sql`${mensagensWhatsapp.sequencia} <= ${ultima}`,
      ),
    )
    .orderBy(asc(mensagensWhatsapp.sequencia));

  for (const pedido of pedidos) {
    transcricoes.set(
      pedido.atendimentoId,
      linhas
        .filter(
          (linha) =>
            linha.atendimentoId === pedido.atendimentoId &&
            linha.sequencia <= pedido.sequenciaFinal,
        )
        .map(paraTranscricao),
    );
  }

  return transcricoes;
}

/**
 * A confirmacao: registra a tratativa, consolida a conversa, calcula o hash, gera
 * o PDF e encerra o atendimento — tudo na transacao da mensagem que confirmou.
 *
 * A ordem importa e e a pedida: o hash sai do conteudo consolidado **antes** de o
 * PDF existir, e o PDF recebe o hash pronto para exibir.
 */
async function finalizar(
  tx: Transacao,
  atendimento: AtendimentoPonto,
  estado: EstadoDoAtendimento,
  recebida: { sequencia: number },
  mensagem: MensagemRecebida,
  funcionario: { id: string; nome: string; matricula: string; empresa: string },
  contexto: ContextoDoAtendimento,
) {
  const { rascunho } = estado;
  const ocorrencia = contexto.ocorrencias.find(
    (atual) => atual.data === rascunho.data && atual.tipo === rascunho.tipo,
  );

  if (!rascunho.data || !rascunho.tipo || !ocorrencia || !rascunho.motivo) {
    // `responder()` ja garante isso; a checagem e so para o TypeScript e para o
    // dia em que alguem mudar o fluxo sem mudar esta funcao.
    throw new Error("Confirmacao sem ocorrencia valida no rascunho");
  }

  const escrita = await competenciaDeEscrita();

  if (
    !escrita.ok ||
    rascunho.data < escrita.competencia.dataInicio ||
    rascunho.data > escrita.competencia.dataFim
  ) {
    await tx
      .update(atendimentosPonto)
      .set({ ultimaInteracaoEm: mensagem.momento })
      .where(eq(atendimentosPonto.id, atendimento.id));

    await enviarTodas(tx, atendimento.telefone, atendimento.id, [
      {
        texto:
          "Nao consegui registrar a correcao agora: o periodo de ponto dessa data nao esta " +
          "aberto para alteracoes. Seus dados continuam guardados — tente confirmar mais tarde " +
          "ou procure o RH.",
      },
    ]);
    return;
  }

  const catalogo = motivo(rascunho.motivo);
  const confirmadoEm = new Date();

  const observacao =
    `Correcao informada pelo colaborador via WhatsApp (protocolo ${atendimento.id}). ` +
    `Motivo: ${catalogo.titulo}.` +
    (rascunho.horarios?.length ? ` Horarios: ${rascunho.horarios.join(" ")}.` : "") +
    (rascunho.descricao ? ` Descricao: ${rascunho.descricao}` : "");

  /**
   * `justificada`: a pessoa explicou o dia e confirmou a explicacao. A
   * observacao do RH que ja existisse nao e sobrescrita — a da conversa entra
   * embaixo dela.
   */
  const [tratativa] = await tx
    .insert(tratativasPonto)
    .values({
      competenciaId: escrita.competencia.id,
      funcionarioId: funcionario.id,
      data: rascunho.data,
      tipo: rascunho.tipo,
      status: "justificada",
      observacao,
    })
    .onConflictDoUpdate({
      target: [tratativasPonto.funcionarioId, tratativasPonto.data, tratativasPonto.tipo],
      set: {
        status: "justificada",
        observacao: sql`coalesce(${tratativasPonto.observacao} || E'\n\n', '') || ${observacao}`,
        atualizadoEm: confirmadoEm,
      },
    })
    .returning({ id: tratativasPonto.id });

  const transcricao = await transcricaoAte(tx, atendimento.id, recebida.sequencia);

  const conteudo: ConteudoConsolidado = {
    versao: 1,
    protocolo: atendimento.id,
    ocorrencia: {
      funcionarioId: funcionario.id,
      nome: funcionario.nome,
      matricula: funcionario.matricula,
      empresa: funcionario.empresa,
      data: rascunho.data,
      tipo: rascunho.tipo,
      rotulo: rotuloDaDivergencia(rascunho.tipo),
      // A descricao que a pessoa leu na conversa, e nao a da leitura de agora.
      descricao: rascunho.descricaoOcorrencia ?? ocorrencia.descricao,
      batidas: [...ocorrencia.batidas],
    },
    colaborador: { telefone: atendimento.telefone },
    correcao: {
      dataCorrigida: rascunho.data,
      motivo: rascunho.motivo,
      motivoRotulo: catalogo.titulo,
      horarios: rascunho.horarios ?? [],
      descricao: rascunho.descricao,
    },
    confirmacao: {
      mensagemId: mensagem.mensagemExternaId,
      momento: mensagem.momento.toISOString(),
      resposta: mensagem.texto,
    },
    transcricao,
    iniciadoEm: atendimento.iniciadoEm.toISOString(),
    confirmadoEm: confirmadoEm.toISOString(),
  };

  // 1. O hash, sobre o conteudo consolidado. 2. O PDF, que so o exibe.
  const { texto, hash } = consolidar(conteudo);
  const pdf = await gerarPdfDoComprovante(conteudo, hash, confirmadoEm);

  await tx.insert(comprovantesTratativa).values({
    atendimentoId: atendimento.id,
    tratativaId: tratativa.id,
    funcionarioId: funcionario.id,
    data: rascunho.data,
    tipo: rascunho.tipo,
    sequenciaFinal: recebida.sequencia,
    conteudo: texto,
    hash,
    pdf,
    pdfHash: sha256(pdf),
    geradoEm: confirmadoEm,
  });

  await tx
    .update(atendimentosPonto)
    .set({
      ...colunasDoRascunho(rascunho),
      etapa: "confirmacao",
      desfecho: "confirmado",
      tratativaId: tratativa.id,
      opcoes: [],
      tentativasInvalidas: 0,
      ultimaInteracaoEm: mensagem.momento,
      encerradoEm: confirmadoEm,
    })
    .where(eq(atendimentosPonto.id, atendimento.id));

  // A mensagem de encerramento vem depois do hash e nao entra no conteudo: ela
  // anuncia o comprovante, e nao poderia fazer parte do que ele atesta.
  await enviarTodas(tx, atendimento.telefone, atendimento.id, [
    {
      texto:
        `Correcao registrada! ✅\n\nProtocolo: ${atendimento.id}\n` +
        `Data: ${formatarData(rascunho.data)} — ${rotuloDaDivergencia(rascunho.tipo)}\n` +
        `Codigo de verificacao: ${hash.slice(0, 16)}\n\n` +
        "O RH ja recebeu a sua correcao. Se precisar corrigir outra data, envie *Ponto*.",
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Responde a quem nao e (ou nao e um so) do cadastro, ou a quem tem o ponto
 * tratado pelo responsavel do posto — no maximo uma vez por
 * dia. O numero da empresa pode receber mensagem de qualquer pessoa, e responder
 * a cada "bom dia" de quem nao e colaborador seria spam com o nome do RH.
 */
async function avisarNumeroNaoAtendido(tx: Transacao, mensagem: MensagemRecebida, texto: string) {
  const [recente] = await tx
    .select({ id: mensagensWhatsapp.id })
    .from(mensagensWhatsapp)
    .where(
      and(
        eq(mensagensWhatsapp.telefone, mensagem.telefone),
        eq(mensagensWhatsapp.direcao, "enviada"),
        isNull(mensagensWhatsapp.atendimentoId),
        gt(mensagensWhatsapp.momento, new Date(mensagem.momento.getTime() - INTERVALO_DE_AVISO_MS)),
      ),
    )
    .limit(1);

  await registrarRecebida(tx, mensagem, null);

  if (!recente) {
    await enviarTodas(tx, mensagem.telefone, null, [{ texto }]);
  }
}

export async function processarMensagem(
  mensagem: MensagemRecebida,
): Promise<ResultadoDoProcessamento> {
  return db.transaction(async (tx) => {
    // Um processamento por numero de cada vez. Solto no fim da transacao.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`whatsapp:${mensagem.telefone}`}))`,
    );

    let aberto: AtendimentoPonto | undefined;

    [aberto] = await tx
      .select()
      .from(atendimentosPonto)
      .where(
        and(
          eq(atendimentosPonto.telefone, mensagem.telefone),
          isNull(atendimentosPonto.encerradoEm),
        ),
      )
      .limit(1);

    const palavraChave = ehPalavraChave(mensagem.texto);

    // Sem conversa aberta, so a palavra-chave e com o robo. O numero e o WhatsApp
    // oficial da empresa: o resto nem e gravado — nao e atendimento de ponto, e
    // guardar a conversa alheia seria guardar o que ninguem pediu.
    if (!aberto && !palavraChave) {
      return "sem_palavra_chave";
    }

    const [jaRecebida] = await tx
      .select({ id: mensagensWhatsapp.id })
      .from(mensagensWhatsapp)
      .where(
        and(
          eq(mensagensWhatsapp.direcao, "recebida"),
          eq(mensagensWhatsapp.mensagemExternaId, mensagem.mensagemExternaId),
        ),
      )
      .limit(1);

    if (jaRecebida) {
      return "duplicada";
    }

    const cadastrados = await tx
      .select({
        id: funcionarios.id,
        nome: funcionarios.nome,
        matricula: funcionarios.matricula,
        empresa: empresas.nome,
      })
      .from(funcionarios)
      .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
      .where(
        and(
          inArray(funcionarios.telefone, variantesDoTelefone(mensagem.telefone)),
          eq(funcionarios.ativo, true),
        ),
      )
      .limit(2);

    if (cadastrados.length === 0) {
      await avisarNumeroNaoAtendido(
        tx,
        mensagem,
        "Ola! Este e o atendimento de ponto do RH. Nao encontrei o seu numero no cadastro de " +
          "colaboradores — procure o RH para atualizar o seu WhatsApp.",
      );
      return "numero_desconhecido";
    }

    if (cadastrados.length > 1) {
      // Dois cadastros com o mesmo numero: escolher um seria abrir correcao no
      // ponto de outra pessoa.
      await avisarNumeroNaoAtendido(
        tx,
        mensagem,
        "Ola! Este numero esta cadastrado para mais de um colaborador, entao nao consigo " +
          "saber de quem e o ponto. Procure o RH para corrigir o cadastro.",
      );
      return "numero_ambiguo";
    }

    const funcionario = cadastrados[0];

    /*
      Quem esta no grupo de contato de um posto com responsavel nao corrige o
      ponto por aqui: a correcao passa pelo responsavel, que e quem recebe as
      mensagens do RH sobre ele. A conversa que estivesse aberta e encerrada, e
      o aviso sai no maximo uma vez por dia, como o de numero desconhecido.
    */
    const contato = await contatoDoFuncionario(funcionario.id);

    if (contato.via === "responsavel") {
      if (aberto) {
        await tx
          .update(atendimentosPonto)
          .set({ desfecho: "encaminhado_ao_responsavel", encerradoEm: mensagem.momento })
          .where(eq(atendimentosPonto.id, aberto.id));
      }

      await avisarNumeroNaoAtendido(
        tx,
        mensagem,
        `Ola, ${primeiroNome(funcionario.nome)}! A correcao do seu registro de ponto e feita ` +
          `pelo responsavel do seu posto (${primeiroNome(contato.responsavel.nome)}). Procure-o ` +
          "para informar o que aconteceu.",
      );
      return "com_responsavel";
    }

    const { contexto, competenciaId } = await contextoDoFuncionario(funcionario);

    let aviso: string | null = null;

    // Conversa aberta por outra pessoa com o mesmo numero (o cadastro mudou) ou
    // parada ha dias: encerra e recomeca, em vez de confirmar dados velhos.
    if (
      aberto &&
      (aberto.funcionarioId !== funcionario.id ||
        mensagem.momento.getTime() - aberto.ultimaInteracaoEm.getTime() > EXPIRACAO_MS)
    ) {
      await tx
        .update(atendimentosPonto)
        .set({ desfecho: "expirado", encerradoEm: mensagem.momento })
        .where(eq(atendimentosPonto.id, aberto.id));

      aviso = "A sua conversa anterior ficou parada e foi encerrada. Vamos recomecar.";
      aberto = undefined;

      // A conversa velha acabou, e o que chegou nao pede uma nova.
      if (!palavraChave) {
        return "sem_palavra_chave";
      }
    }

    if (!aberto) {
      const transicao = iniciar(contexto);
      const encerrada = transicao.tipo === "encerrar";

      const [criado] = await tx
        .insert(atendimentosPonto)
        .values({
          telefone: mensagem.telefone,
          funcionarioId: funcionario.id,
          competenciaId,
          etapa: transicao.tipo === "seguir" ? transicao.estado.etapa : "data",
          opcoes: transicao.tipo === "seguir" ? [...transicao.estado.opcoes] : [],
          desfecho: encerrada ? transicao.desfecho : null,
          iniciadoEm: mensagem.momento,
          ultimaInteracaoEm: mensagem.momento,
          encerradoEm: encerrada ? mensagem.momento : null,
        })
        .returning({ id: atendimentosPonto.id });

      await registrarRecebida(tx, mensagem, criado.id);

      const respostas = transicao.tipo === "confirmar" ? [] : transicao.respostas;

      await enviarTodas(
        tx,
        mensagem.telefone,
        criado.id,
        aviso && respostas.length > 0
          ? [{ ...respostas[0], texto: `${aviso}\n\n${respostas[0].texto}` }, ...respostas.slice(1)]
          : respostas,
      );

      return "processada";
    }

    const estado = estadoGravado(aberto);
    const transicao: Transicao = responder(
      estado,
      { texto: mensagem.texto, opcaoId: mensagem.opcaoId },
      contexto,
    );

    const recebida = await registrarRecebida(tx, mensagem, aberto.id);

    switch (transicao.tipo) {
      case "seguir":
        await tx
          .update(atendimentosPonto)
          .set({
            ...colunasDoRascunho(transicao.estado.rascunho),
            etapa: transicao.estado.etapa,
            opcoes: [...transicao.estado.opcoes],
            tentativasInvalidas: transicao.estado.tentativasInvalidas,
            competenciaId: competenciaId ?? aberto.competenciaId,
            ultimaInteracaoEm: mensagem.momento,
          })
          .where(eq(atendimentosPonto.id, aberto.id));

        await enviarTodas(tx, mensagem.telefone, aberto.id, transicao.respostas);
        break;

      case "encerrar":
        await tx
          .update(atendimentosPonto)
          .set({
            desfecho: transicao.desfecho,
            opcoes: [],
            ultimaInteracaoEm: mensagem.momento,
            encerradoEm: mensagem.momento,
          })
          .where(eq(atendimentosPonto.id, aberto.id));

        await enviarTodas(tx, mensagem.telefone, aberto.id, transicao.respostas);
        break;

      case "confirmar":
        await finalizar(tx, aberto, transicao.estado, recebida, mensagem, funcionario, contexto);
        break;
    }

    return "processada";
  });
}
