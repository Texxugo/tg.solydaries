import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { competencias } from "./competencias";
import { funcionarios } from "./funcionarios";
import { usuarios } from "./usuarios";

/**
 * A marcacao: o instante em que alguem passou o cartao no relogio. E o **fato
 * bruto**, e nada mais — o que ele significa (entrada, saida, intervalo, hora
 * extra, falta) sai de le-lo contra a escala, e por isso nao esta gravado aqui.
 *
 * Uma linha por batida, e nao uma linha por dia com a lista de horarios: a
 * batida e a unidade indivisivel do relogio, e e por ela que a reimportacao se
 * torna idempotente — o indice unico (funcionario, data, hora) faz o mesmo
 * arquivo enviado duas vezes nao duplicar nada, sem que a importacao precise
 * apagar o que ja existia.
 *
 * **Nada de apuracao e gravado**: nenhuma coluna diz "pendencia", "hora extra"
 * ou "falta". Divergencia e consequencia da escala, e escala muda — quem estava
 * sem escala na importacao ganha uma no dia seguinte, e o dia sem marcacao que
 * era "nao apurado" vira falta sem que uma linha sequer precise ser reescrita.
 * Gravar a conclusao criaria a versao velha do fato, do mesmo jeito que uma
 * coluna `virada_turno` digitada criaria uma escala em contradicao consigo.
 *
 * Dado datado, ao contrario de escalas e funcionarios: a marcacao **pertence** a
 * uma competencia, e toda leitura filtra por `competenciaEmVigor()`.
 */
export const marcacoes = pgTable(
  "marcacoes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /**
     * A competencia a que o dia pertence. Definida pela **data** na importacao
     * (o arquivo pode cobrir menos dias do que a competencia, nunca outros), e
     * nao pela competencia aberta no momento do envio: assim uma carga tardia
     * nao joga marcacao de agosto dentro de setembro.
     */
    competenciaId: uuid("competencia_id")
      .notNull()
      // `restrict`: apagar a competencia levaria junto o ponto do periodo.
      .references(() => competencias.id, { onDelete: "restrict" }),
    funcionarioId: uuid("funcionario_id")
      .notNull()
      .references(() => funcionarios.id, { onDelete: "restrict" }),
    /** `date` em `mode: "string"`, pelo mesmo motivo das datas de `competencias`. */
    data: date("data", { mode: "string" }).notNull(),
    /**
     * `time` sem fuso, como os horarios da escala: o relogio marcou "06:57"
     * naquele dia, e nao um instante UTC. Segundos existem no tipo mas nao no
     * relatorio — a leitura normaliza para `HH:MM:00`.
     */
    hora: time("hora").notNull(),
    /**
     * `true` quando o relatorio marcou a batida como incluida a mao (`14:05i`),
     * e nao registrada pelo relogio.
     *
     * Guardado porque e diferenca que muda a leitura: a batida incluida ja e a
     * correcao que alguem fez de um dia que estava faltando marcacao. Um dia
     * que fecha so por causa dela nao e o mesmo dia que o relogio registrou
     * inteiro, e a tela precisa poder dizer isso.
     */
    incluida: boolean("incluida").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    /**
     * A mesma pessoa nao bate duas vezes no mesmo minuto: quando isso aparece
     * no arquivo e repeticao, nao um segundo fato. E o que faz a importacao ser
     * idempotente — reenviar o relatorio (ou enviar um que se sobrepoe ao
     * anterior) nao duplica nem exige apagar o que ja estava la.
     */
    uniqueIndex("marcacoes_unica").on(tabela.funcionarioId, tabela.data, tabela.hora),
    /**
     * Como a apuracao consulta: todas as marcacoes de uma competencia, em
     * ordem de pessoa e de dia. O indice unico acima nao serve para isso —
     * `funcionario_id` a esquerda nao alcanca "a competencia inteira".
     */
    index("marcacoes_competencia_idx").on(tabela.competenciaId, tabela.funcionarioId, tabela.data),
  ],
);

/**
 * Uma carga do relatorio "Lista de Marcacoes Realizadas Simplificadas".
 *
 * Existe por causa de **uma** pergunta que as marcacoes sozinhas nao respondem:
 * ate onde o periodo foi apurado. Dia sem marcacao pode ser falta ou pode ser
 * dia que o arquivo nem cobriu — e o relatorio costuma parar antes do fim da
 * competencia (21/08 a 04/09, numa competencia que vai ate 20/09). Sem o
 * periodo do arquivo, os dezesseis dias que faltam virariam dezesseis faltas
 * para o portal inteiro.
 *
 * Por isso a janela apurada e a **uniao** dos periodos importados na
 * competencia, recortada pela competencia — e nao a competencia inteira.
 */
export const importacoesPonto = pgTable(
  "importacoes_ponto",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    /** Nome do arquivo enviado, so para a tela dizer de onde os dados vieram. */
    arquivo: text("arquivo").notNull(),
    /** O periodo que o **arquivo** declara cobrir, ja recortado pela competencia. */
    periodoInicio: date("periodo_inicio", { mode: "string" }).notNull(),
    periodoFim: date("periodo_fim", { mode: "string" }).notNull(),
    /** Quantas marcacoes o arquivo trouxe e quantas eram novas. */
    marcacoesLidas: integer("marcacoes_lidas").notNull().default(0),
    marcacoesGravadas: integer("marcacoes_gravadas").notNull().default(0),
    /**
     * Quem enviou. `set null` porque a carga continua explicando o periodo
     * depois de a conta de quem a fez ser apagada.
     */
    importadoPor: uuid("importado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    index("importacoes_ponto_competencia_idx").on(tabela.competenciaId),
    check("importacoes_ponto_periodo_valido", sql`periodo_fim >= periodo_inicio`),
  ],
);

export type Marcacao = typeof marcacoes.$inferSelect;
export type NovaMarcacao = typeof marcacoes.$inferInsert;
export type ImportacaoPonto = typeof importacoesPonto.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Tratativa da ocorrencia                                                    */
/* -------------------------------------------------------------------------- */

/**
 * O tipo da divergencia, como enum do banco.
 *
 * A lista e a mesma de `TipoDeDivergencia`, em `ponto/apuracao.ts` — que passa a
 * derivar deste enum, do mesmo jeito que `acessos/areas.ts` deriva de
 * `area_portal`. O motivo e o de sempre: a **ocorrencia** e calculada e nao e
 * gravada, mas a **tratativa** dela e, e o tipo e parte da chave. Como text
 * livre, um erro de digitacao criaria uma tratativa que nunca mais casaria com
 * ocorrencia nenhuma — silenciosamente, porque nada acusaria.
 */
export const divergenciaTipoEnum = pgEnum("divergencia_tipo", [
  "sem_marcacao",
  "marcacao_em_afastamento",
  "marcacao_impar",
  "marcacoes_a_menos",
  "marcacoes_a_mais",
  "trabalho_em_folga",
  "turno_em_aberto",
  "intrajornada_curta",
  "hora_extra",
  "debito_de_horas",
]);

/**
 * Em que pe esta o **trabalho humano** sobre a ocorrencia — nunca o que o
 * relogio registrou.
 *
 * `aberta` e o estado de toda ocorrencia que ninguem tocou, e por isso a
 * maioria nao tem linha nenhuma nesta tabela: a ausencia ja diz "aberta". As
 * outras quatro sao os quatro fins possiveis de uma conversa com o colaborador
 * — ainda conversando, explicada, corrigida, ou nao era ocorrencia.
 */
export const tratativaStatusEnum = pgEnum("tratativa_status", [
  "aberta",
  "em_tratativa",
  "justificada",
  "resolvida",
  "descartada",
]);

/**
 * A tratativa de uma ocorrencia de ponto.
 *
 * Aqui mora a **unica** coisa do modulo que e fato novo e nao consequencia: o
 * que uma pessoa fez a respeito. A ocorrencia em si (falta, marcacao impar,
 * hora extra) continua sendo calculada a cada leitura por `apuracao.ts` e nao
 * tem linha em lugar nenhum — mudou a escala de alguem, mudou a leitura dos
 * dias que ja passaram.
 *
 * Por isso a chave nao e um `ocorrencia_id`: **nao existe** tabela de
 * ocorrencias a que apontar. A tratativa se prende a
 * `(funcionario, data, tipo)`, que e a identidade natural e estavel da
 * ocorrencia, e o indice unico garante que ela e uma so.
 *
 * A consequencia e deliberada: se a divergencia deixar de existir (alguem
 * atribuiu a escala certa, importou a batida que faltava, lancou o atestado), a
 * tratativa fica orfa e **some da tela** — nao ha mais o que tratar. Ela nao e
 * apagada: se a mesma divergencia voltar, a chave reencontra a linha e o
 * historico da conversa volta junto.
 */
export const tratativasPonto = pgTable(
  "tratativas_ponto",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /**
     * Derivavel da data, mas gravada: e por ela que o painel encontra as
     * tratativas do periodo sem varrer a tabela inteira, e e ela que mantem a
     * tratativa dentro do mesmo recorte temporal das marcacoes.
     */
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    funcionarioId: uuid("funcionario_id")
      .notNull()
      .references(() => funcionarios.id, { onDelete: "restrict" }),
    /** O dia da ocorrencia, `YYYY-MM-DD`. */
    data: date("data", { mode: "string" }).notNull(),
    tipo: divergenciaTipoEnum("tipo").notNull(),
    status: tratativaStatusEnum("status").notNull().default("aberta"),
    /** O que se apurou com o colaborador. Texto livre: e a conversa, nao um codigo. */
    observacao: text("observacao"),
    /** Quem tratou por ultimo. `set null` pelo mesmo motivo de `importado_por`. */
    responsavelId: uuid("responsavel_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    /**
     * A identidade da ocorrencia. E o que permite a tratativa ser gravada por
     * upsert: reabrir a mesma ocorrencia encontra a linha que ja existe, em vez
     * de empilhar uma segunda opiniao sobre o mesmo dia.
     */
    uniqueIndex("tratativas_ponto_ocorrencia").on(tabela.funcionarioId, tabela.data, tabela.tipo),
    // Como o painel consulta: as tratativas da competencia, filtradas por status.
    index("tratativas_ponto_competencia_idx").on(tabela.competenciaId, tabela.status),
  ],
);

/**
 * Se a mensagem chegou a sair, e o que saiu.
 *
 * `enviada` e `falhou` sao os dois desfechos que o envio conhece: a Z-API
 * responde na hora se aceitou a mensagem. O que acontece depois (entregue,
 * lida) depende de webhook, que o portal ainda nao recebe — e inventar os
 * valores agora criaria estados que nada nunca escreveria.
 */
export const mensagemStatusEnum = pgEnum("mensagem_status", ["enviada", "falhou"]);

/**
 * A quem a mensagem foi: ao proprio colaborador, ou ao responsavel do posto em
 * cujo grupo de contato ele esta (`posto_contatos`). Gravado como foi, e nao
 * relido do grupo: o grupo muda, e o historico precisa dizer quem foi avisado
 * naquele dia.
 */
export const mensagemDestinoEnum = pgEnum("mensagem_destino", ["colaborador", "responsavel"]);

/**
 * Uma mensagem enviada ao colaborador por causa de uma ocorrencia.
 *
 * O texto e o telefone ficam gravados **como foram enviados**, e nao por
 * referencia ao cadastro ou ao modelo: os dois mudam, e o historico precisa
 * dizer o que a pessoa recebeu naquele dia, e nao o que ela receberia hoje. E a
 * mesma razao pela qual `importacoes_ponto` guarda o nome do arquivo.
 *
 * A falha tambem vira linha. Um envio que nao saiu e informacao de tratativa —
 * sem ela, "ninguem avisou o colaborador" e "o numero esta errado" ficariam
 * indistinguiveis, e os dois pedem acoes diferentes.
 */
export const mensagensPonto = pgTable(
  "mensagens_ponto",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tratativaId: uuid("tratativa_id")
      .notNull()
      // `cascade`: a mensagem existe por causa da ocorrencia. Sem a tratativa
      // ela e um texto solto, e nao um registro a preservar.
      .references(() => tratativasPonto.id, { onDelete: "cascade" }),
    destino: mensagemDestinoEnum("destino").notNull().default("colaborador"),
    /**
     * Quem recebeu, quando foi o responsavel do posto. Nulo quando o destino e
     * o proprio colaborador — que ja e o `funcionario_id` da tratativa.
     */
    destinatarioId: uuid("destinatario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    /**
     * O envio consolidado de que esta linha faz parte: uma mensagem so ao
     * responsavel, com varias ocorrencias, vira uma linha por tratativa com o
     * mesmo `lote_id` (e o mesmo texto). Nulo na mensagem de uma ocorrencia so.
     *
     * Uma linha por tratativa, e nao uma tabela de envios a parte: o historico
     * de cada ocorrencia, o prazo e o "ja foi enviado?" continuam lendo so
     * `mensagens_ponto`, como antes do consolidado existir.
     */
    loteId: uuid("lote_id"),
    /** So digitos, com DDI — o numero como foi discado. */
    telefone: text("telefone").notNull(),
    conteudo: text("conteudo").notNull(),
    status: mensagemStatusEnum("status").notNull(),
    /** O id que a Z-API devolve quando aceita a mensagem. */
    mensagemExternaId: text("mensagem_externa_id"),
    /** O motivo da recusa, quando houve. Guardado em portugues, para a tela. */
    erro: text("erro"),
    enviadoPor: uuid("enviado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // Como a tela consulta: o historico de uma ocorrencia, do mais recente ao
    // mais antigo.
    index("mensagens_ponto_tratativa_idx").on(tabela.tratativaId, tabela.criadoEm),
    index("mensagens_ponto_lote_idx").on(tabela.loteId),
  ],
);

export type TratativaPonto = typeof tratativasPonto.$inferSelect;
export type TratativaStatus = (typeof tratativaStatusEnum.enumValues)[number];
export type MensagemDestino = (typeof mensagemDestinoEnum.enumValues)[number];
export type DivergenciaTipo = (typeof divergenciaTipoEnum.enumValues)[number];
export type MensagemPonto = typeof mensagensPonto.$inferSelect;
export type MensagemStatus = (typeof mensagemStatusEnum.enumValues)[number];
