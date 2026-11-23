import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { bytea } from "./colunas";
import { competencias } from "./competencias";
import { funcionarios } from "./funcionarios";
import { divergenciaTipoEnum, tratativasPonto } from "./ponto";

/**
 * Onde a conversa esta.
 *
 * As seis etapas sao as seis perguntas do fluxo, na ordem. Nao ha etapa
 * "inicio": quem escreve pela primeira vez ja recebe a lista de ocorrencias e
 * a pergunta da data, entao o atendimento nasce em `data`.
 */
export const atendimentoEtapaEnum = pgEnum("atendimento_etapa", [
  "data",
  "tipo",
  "motivo",
  "horarios",
  "descricao",
  "confirmacao",
]);

/**
 * Como a conversa terminou. `null` enquanto ela esta aberta.
 *
 * `confirmado` e o unico desfecho que gera comprovante e mexe na tratativa; os
 * outros so encerram a conversa, e o que foi dito continua na transcricao.
 */
export const atendimentoDesfechoEnum = pgEnum("atendimento_desfecho", [
  "confirmado",
  "cancelado",
  "expirado",
  "sem_pendencia",
  "encaminhado_ao_responsavel",
]);

/**
 * Um atendimento pelo WhatsApp: a conversa de um colaborador com o portal para
 * corrigir uma ocorrencia de ponto.
 *
 * E o **estado** do chatbot, gravado a cada mensagem — e por isso a conversa
 * pode ser retomada horas depois (ou depois de o servidor reiniciar) sem que a
 * pessoa precise repetir nada. As respostas ficam em colunas proprias, e nao num
 * JSON solto: data, tipo e motivo tem tipo no banco, e o resumo que a pessoa
 * confirma e montado exatamente a partir delas.
 */
export const atendimentosPonto = pgTable(
  "atendimentos_ponto",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** So digitos com DDI, como a Z-API o entrega. */
    telefone: text("telefone").notNull(),
    /**
     * Anulavel porque o numero pode nao ser de ninguem do cadastro — e ainda
     * assim a conversa fica registrada, para quem for conferir por que alguem
     * nao foi atendido.
     */
    funcionarioId: uuid("funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    competenciaId: uuid("competencia_id").references(() => competencias.id, {
      onDelete: "restrict",
    }),
    etapa: atendimentoEtapaEnum("etapa").notNull().default("data"),
    desfecho: atendimentoDesfechoEnum("desfecho"),
    /**
     * As respostas colhidas ate aqui. A data e o tipo sao a chave da ocorrencia;
     * a descricao dela e **copiada** no momento em que a data e validada, porque
     * a ocorrencia e calculada e pode mudar de redacao se a escala mudar — e o
     * comprovante precisa dizer o que a pessoa leu.
     */
    data: date("data", { mode: "string" }),
    tipo: divergenciaTipoEnum("tipo"),
    descricaoOcorrencia: text("descricao_ocorrencia"),
    motivo: text("motivo"),
    /** `HH:MM`, na ordem em que a pessoa informou. */
    horarios: text("horarios").array(),
    descricao: text("descricao"),
    /**
     * O ultimo menu enviado, `[{ id, titulo }]`. Guardado porque "responda 2"
     * precisa significar o que o **menu da tela da pessoa** dizia — e a lista de
     * ocorrencias pode ter mudado entre a pergunta e a resposta (uma carga nova,
     * uma tratativa encerrada pelo RH).
     */
    opcoes: jsonb("opcoes").$type<{ id: string; titulo: string }[]>().notNull().default([]),
    /** Preenchida na confirmacao: a tratativa que a conversa encerrou. */
    tratativaId: uuid("tratativa_id").references(() => tratativasPonto.id, {
      onDelete: "restrict",
    }),
    /** Quantas respostas seguidas nao foram entendidas — para oferecer ajuda. */
    tentativasInvalidas: smallint("tentativas_invalidas").notNull().default(0),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
    ultimaInteracaoEm: timestamp("ultima_interacao_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    encerradoEm: timestamp("encerrado_em", { withTimezone: true }),
  },
  (tabela) => [
    /**
     * Uma conversa aberta por numero. E o que impede duas mensagens quase
     * simultaneas de abrirem dois atendimentos paralelos para a mesma pessoa —
     * o bloqueio por numero no processamento ja evita isso, e o indice garante.
     */
    uniqueIndex("atendimentos_ponto_um_aberto")
      .on(tabela.telefone)
      .where(sql`encerrado_em is null`),
    index("atendimentos_ponto_funcionario_idx").on(tabela.funcionarioId, tabela.iniciadoEm),
    index("atendimentos_ponto_ocorrencia_idx").on(tabela.funcionarioId, tabela.data, tabela.tipo),
    check("atendimentos_ponto_desfecho_com_fim", sql`(desfecho is null) = (encerrado_em is null)`),
  ],
);

export const mensagemDirecaoEnum = pgEnum("mensagem_whatsapp_direcao", ["recebida", "enviada"]);

/**
 * `pendente` nao existe: o envio acontece dentro da mesma transacao que grava a
 * linha, entao ela ja nasce com o desfecho. Ver `processar.ts`.
 */
export const mensagemWhatsappStatusEnum = pgEnum("mensagem_whatsapp_status", [
  "recebida",
  "enviada",
  "falhou",
]);

/**
 * Cada mensagem da conversa, nos dois sentidos — a transcricao.
 *
 * `sequencia` da a ordem total. O `momento` sozinho nao basta: duas mensagens
 * do portal saem no mesmo milissegundo, e a Z-API marca a recebida com o relogio
 * do WhatsApp, e nao com o nosso. E pela sequencia que o comprovante sabe quais
 * mensagens entraram no conteudo que foi assinado.
 *
 * Nada aqui e atualizado depois de gravado. A mensagem enviada nasce com o id
 * que a Z-API devolveu (ou com o erro), porque o envio acontece antes do
 * `insert` — e e isso que permite reconstruir o conteudo consolidado mais
 * tarde e conferir se ele bate com o hash.
 */
export const mensagensWhatsapp = pgTable(
  "mensagens_whatsapp",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sequencia: bigserial("sequencia", { mode: "number" }).notNull(),
    atendimentoId: uuid("atendimento_id").references(() => atendimentosPonto.id, {
      onDelete: "restrict",
    }),
    telefone: text("telefone").notNull(),
    direcao: mensagemDirecaoEnum("direcao").notNull(),
    status: mensagemWhatsappStatusEnum("status").notNull(),
    /** O `messageId` da Z-API: o da recebida vem no webhook, o da enviada na resposta. */
    mensagemExternaId: text("mensagem_externa_id"),
    conteudo: text("conteudo").notNull(),
    /** O id da opcao tocada numa lista, quando a resposta foi por menu. */
    opcaoId: text("opcao_id"),
    /** As opcoes que acompanharam a mensagem enviada, como foram mostradas. */
    opcoes: jsonb("opcoes").$type<{ id: string; titulo: string }[]>(),
    erro: text("erro"),
    /**
     * Quando a mensagem aconteceu: o `momment` do webhook na recebida, o instante
     * do envio na enviada. Sempre gravado a partir de um `Date` do JavaScript, e
     * nunca pelo `now()` do banco — o Postgres guarda microssegundos, o
     * JavaScript le milissegundos, e a reconstrucao do comprovante daria outro
     * texto (e outro hash).
     */
    momento: timestamp("momento", { withTimezone: true }).notNull(),
  },
  (tabela) => [
    /**
     * A Z-API reentrega o webhook quando nao recebe 200 a tempo. A mesma
     * mensagem recebida duas vezes e uma so — e o `insert ... on conflict do
     * nothing` sobre este indice e o que impede a segunda de andar a conversa.
     */
    uniqueIndex("mensagens_whatsapp_recebida_unica")
      .on(tabela.mensagemExternaId)
      .where(sql`direcao = 'recebida' and mensagem_externa_id is not null`),
    uniqueIndex("mensagens_whatsapp_sequencia").on(tabela.sequencia),
    index("mensagens_whatsapp_atendimento_idx").on(tabela.atendimentoId, tabela.sequencia),
    index("mensagens_whatsapp_telefone_idx").on(tabela.telefone, tabela.momento),
  ],
);

/**
 * O comprovante de um atendimento confirmado: o conteudo consolidado, o hash
 * dele e o PDF.
 *
 * O hash e calculado sobre `conteudo` **antes** de o PDF existir, e guardado em
 * coluna propria: o PDF so o exibe. Conferir a integridade depois e recalcular
 * o SHA-256 de `conteudo` — e, mais forte, reconstruir o conteudo a partir das
 * linhas de `mensagens_whatsapp` e ver se da o mesmo texto.
 *
 * Nada aqui se edita ou se apaga: nao ha action que o faca, e as FKs sao
 * `restrict`.
 */
export const comprovantesTratativa = pgTable(
  "comprovantes_tratativa",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    atendimentoId: uuid("atendimento_id")
      .notNull()
      .references(() => atendimentosPonto.id, { onDelete: "restrict" }),
    tratativaId: uuid("tratativa_id")
      .notNull()
      .references(() => tratativasPonto.id, { onDelete: "restrict" }),
    funcionarioId: uuid("funcionario_id")
      .notNull()
      .references(() => funcionarios.id, { onDelete: "restrict" }),
    /** A data corrigida — a mesma da tratativa, repetida para listar sem join. */
    data: date("data", { mode: "string" }).notNull(),
    tipo: divergenciaTipoEnum("tipo").notNull(),
    /** A ultima mensagem que entrou no conteudo: a confirmacao da pessoa. */
    sequenciaFinal: bigint("sequencia_final", { mode: "number" }).notNull(),
    /** JSON canonico (chaves ordenadas, sem espacos): exatamente o que foi hasheado. */
    conteudo: text("conteudo").notNull(),
    /** SHA-256 de `conteudo`, em hexadecimal. */
    hash: text("hash").notNull(),
    pdf: bytea("pdf").notNull(),
    /** SHA-256 do arquivo PDF, para conferir uma copia baixada. Outra coisa que `hash`. */
    pdfHash: text("pdf_hash").notNull(),
    geradoEm: timestamp("gerado_em", { withTimezone: true }).notNull(),
  },
  (tabela) => [
    uniqueIndex("comprovantes_tratativa_atendimento").on(tabela.atendimentoId),
    index("comprovantes_tratativa_funcionario_idx").on(tabela.funcionarioId, tabela.geradoEm),
    index("comprovantes_tratativa_tratativa_idx").on(tabela.tratativaId),
    check("comprovantes_tratativa_hash_valido", sql`hash ~ '^[0-9a-f]{64}$'`),
  ],
);

export type AtendimentoPonto = typeof atendimentosPonto.$inferSelect;
export type AtendimentoEtapa = (typeof atendimentoEtapaEnum.enumValues)[number];
export type AtendimentoDesfecho = (typeof atendimentoDesfechoEnum.enumValues)[number];
export type MensagemWhatsapp = typeof mensagensWhatsapp.$inferSelect;
export type ComprovanteTratativa = typeof comprovantesTratativa.$inferSelect;
