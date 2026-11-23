import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
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
import { freelancers } from "./preenchimento";
import { usuarios } from "./usuarios";

/**
 * O que aconteceu. Enum, e nao tabela como `eventos`: o tipo decide **quem** a
 * movimentacao pede (quem faltou contra as pessoas da troca) e e por ele que a
 * lista, o filtro e a planilha separam os registros — valor desconhecido
 * precisa falhar no INSERT, e nao virar um quarto tipo que nenhuma tela sabe
 * desenhar.
 */
export const movimentacaoTipoEnum = pgEnum("movimentacao_tipo", [
  "falta",
  "troca_interna",
  "troca_escala",
]);

/**
 * O papel de cada pessoa na movimentacao.
 *
 * Na falta ha quem faltou (`ausente`) e, as vezes, quem cobriu (`cobertura`);
 * nas trocas todas as pessoas estao no mesmo pe (`envolvido`) — numa troca de
 * escala nao ha quem "saiu" e quem "entrou", ha duas pessoas que trocaram.
 */
export const movimentacaoPapelEnum = pgEnum("movimentacao_papel", [
  "ausente",
  "cobertura",
  "envolvido",
]);

/** Como o conteudo do documento esta guardado. Ver `movimentacao_documentos.compressao`. */
export const documentoCompressaoEnum = pgEnum("documento_compressao", ["nenhuma", "gzip"]);

/**
 * Uma movimentacao de pessoal: a falta, a troca interna ou a troca de escala
 * de um dia, com a justificativa e os documentos que a sustentam.
 *
 * **Dado datado**, como extras e apontamentos: toda leitura filtra por
 * `competenciaEmVigor()` e toda escrita comeca por `competenciaDeEscrita()`. A
 * competencia sai da **data** da movimentacao, e a action recusa dia fora do
 * periodo — gravar 21/09 dentro de agosto o esconderia de setembro para sempre.
 *
 * E **registro**, e nao leitura: nao alimenta a grade nem a apuracao do ponto,
 * e nenhuma das duas a alimenta. A grade diz quem cobriu cada dia; a
 * movimentacao guarda **por que** e com que papel na mao.
 */
export const movimentacoes = pgTable(
  "movimentacoes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    tipo: movimentacaoTipoEnum("tipo").notNull(),
    /** `date` em `mode: "string"`, pelo mesmo motivo das datas de `competencias`. */
    data: date("data", { mode: "string" }).notNull(),
    /** Obrigatoria: movimentacao sem motivo escrito nao explica nada a quem le depois. */
    justificativa: text("justificativa").notNull(),
    /** `set null`: o registro aconteceu mesmo que a conta suma depois. */
    registradoPorId: uuid("registrado_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Como a lista consulta: as da competencia, do dia mais recente para o mais antigo.
    index("movimentacoes_competencia_idx").on(tabela.competenciaId, tabela.data),
    check("movimentacoes_justificativa_preenchida", sql`length(btrim(justificativa)) > 0`),
  ],
);

/**
 * Quem esta envolvido numa movimentacao, com o papel de cada um.
 *
 * Tabela filha, e nao duas colunas na movimentacao: a troca envolve duas ou
 * mais pessoas, e a busca por nome precisa alcancar todas. Cada linha e um
 * funcionario **ou** um freelancer, com o mesmo par de colunas (e a mesma
 * razao) de `preenchimento_linhas` e `extras`.
 *
 * Quantas pessoas cada tipo pede (uma ausente na falta, duas ou mais nas
 * trocas) e regra da action: o banco so garante que a mesma pessoa nao entra
 * duas vezes na mesma movimentacao.
 */
export const movimentacaoPessoas = pgTable(
  "movimentacao_pessoas",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** `cascade`: sem a movimentacao, a pessoa nao esta envolvida em nada. */
    movimentacaoId: uuid("movimentacao_id")
      .notNull()
      .references(() => movimentacoes.id, { onDelete: "cascade" }),
    papel: movimentacaoPapelEnum("papel").notNull(),
    funcionarioId: uuid("funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "restrict" }),
    /** A ordem em que a tela as mostra — a mesma em que foram escolhidas. */
    ordem: smallint("ordem").notNull(),
  },
  (tabela) => [
    index("movimentacao_pessoas_movimentacao_idx").on(tabela.movimentacaoId),
    // "Quantas faltas esta pessoa teve?", sem varrer as movimentacoes.
    index("movimentacao_pessoas_funcionario_idx").on(tabela.funcionarioId),
    index("movimentacao_pessoas_freelancer_idx").on(tabela.freelancerId),
    // Parciais porque uma das duas colunas e sempre nula, e `null` nao repete.
    uniqueIndex("movimentacao_pessoas_funcionario_unico")
      .on(tabela.movimentacaoId, tabela.funcionarioId)
      .where(sql`funcionario_id is not null`),
    uniqueIndex("movimentacao_pessoas_freelancer_unico")
      .on(tabela.movimentacaoId, tabela.freelancerId)
      .where(sql`freelancer_id is not null`),
    check(
      "movimentacao_pessoas_uma_pessoa",
      sql`(funcionario_id is null) <> (freelancer_id is null)`,
    ),
  ],
);

/**
 * Um documento anexado a movimentacao: o atestado, o print da conversa da
 * troca.
 *
 * **O arquivo mora no banco** (`bytea`), como o PDF de `comprovantes_tratativa`,
 * e nao numa pasta do servidor: vai junto no backup do banco, some junto com a
 * movimentacao (`cascade`) e nao depende de um diretorio que o deploy por tar
 * precisaria preservar. O custo e mantido baixo pela compressao — imagem
 * reduzida no navegador antes do envio, e `gzip` no servidor quando ele ganha
 * alguma coisa —, e pelo teto de tamanho e de quantidade da action.
 *
 * Tabela propria, e nao coluna da movimentacao, para que a lista leia os
 * metadados (nome, tamanho) sem carregar o conteudo.
 */
export const movimentacaoDocumentos = pgTable(
  "movimentacao_documentos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    movimentacaoId: uuid("movimentacao_id")
      .notNull()
      .references(() => movimentacoes.id, { onDelete: "cascade" }),
    /** O nome com que o arquivo foi enviado — e com que volta no download. */
    nome: text("nome").notNull(),
    /**
     * O tipo **conferido pelos primeiros bytes** no servidor, e nunca o que o
     * navegador declarou: so `image/jpeg`, `image/png`, `image/webp` e
     * `application/pdf` entram, e e com ele que o download responde.
     */
    tipoMime: text("tipo_mime").notNull(),
    /** O tamanho do arquivo como chegou ao servidor (ja reduzido, se era imagem). */
    tamanhoOriginal: integer("tamanho_original").notNull(),
    /** O tamanho do que esta em `conteudo` — o que de fato ocupa o banco. */
    tamanho: integer("tamanho").notNull(),
    /**
     * `gzip` quando comprimir no servidor deixou o arquivo menor; `nenhuma`
     * quando ele ja vinha comprimido (JPEG, WebP, a maioria dos PDFs) e o gzip
     * so acrescentaria cabecalho. O download desfaz o gzip antes de responder.
     */
    compressao: documentoCompressaoEnum("compressao").notNull(),
    conteudo: bytea("conteudo").notNull(),
    enviadoPorId: uuid("enviado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    index("movimentacao_documentos_movimentacao_idx").on(tabela.movimentacaoId),
    check(
      "movimentacao_documentos_tamanho_valido",
      sql`tamanho > 0 and tamanho_original > 0 and tamanho = octet_length(conteudo)`,
    ),
  ],
);

export type Movimentacao = typeof movimentacoes.$inferSelect;
export type TipoDeMovimentacao = (typeof movimentacaoTipoEnum.enumValues)[number];
export type PapelNaMovimentacao = (typeof movimentacaoPapelEnum.enumValues)[number];
