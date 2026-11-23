import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { insalubridadeGrauEnum } from "./apontamentos";
import { empresas, funcionarios } from "./funcionarios";
import { eventos } from "./eventos";
import { funcaoTurmaEnum, funcoesPosto, postos } from "./postos";
import { usuarios } from "./usuarios";

/**
 * A rubrica que a regra alimenta.
 *
 * Enum no banco, e nao `text` livre, pelo mesmo motivo de `divergencia_tipo`:
 * rubrica escrita errada criaria uma regra que nunca alimenta nada, em
 * silencio. Os valores espelham o catalogo de `apontamentos/rubricas.ts`, e o
 * `Record<RubricaDaRegra, Rubrica>` de `regras/campos.ts` quebra o typecheck se
 * um lado mudar sem o outro.
 */
export const apontamentoRubricaEnum = pgEnum("apontamento_rubrica", [
  "vt_dias",
  "vr_dias",
  "cesta_basica",
  "he_50",
  "he_60",
  "he_100",
  "adicional_noturno",
  "intrajornada",
  "insalubridade",
  "periculosidade",
  "assiduidade",
  "gratificacao",
  "faltas_escala",
  "faltas_folga",
  "dsr",
]);

/**
 * O que faz a regra disparar.
 *
 * Vocabulario fechado, e nao expressao livre: a regra precisa ser conferivel na
 * tela por quem fecha a folha, e uma linguagem dentro do banco nao seria. Os
 * tres primeiros contam **dias** da grade; `fixo` vale uma vez na competencia
 * (a periculosidade que a empresa sempre paga).
 *
 * `dia_de_falta` conta o dia cuja sigla e de natureza `falta`; qual das duas
 * rubricas de falta ele alimenta e a regra que diz, porque so ela sabe se o
 * caso e o dia previsto de trabalho ou o de folga convocada.
 */
export const regraGatilhoEnum = pgEnum("regra_gatilho", [
  "dia_trabalhado",
  "dia_de_falta",
  "dia_com_intrajornada",
  "fixo",
]);

/**
 * `somar` acumula a quantidade a cada dia que dispara; `definir` fixa o valor,
 * sobrescrevendo o que as regras anteriores acumularam naquela rubrica.
 */
export const regraAcaoEnum = pgEnum("regra_acao", ["somar", "definir"]);

/**
 * A regra que alimenta o apontamento a partir da grade.
 *
 * **Cadastro, e nao dado datado** — como eventos e postos: "dia trabalhado vale
 * um VT" nao muda de significado ao virar a competencia. Nenhuma query da
 * feature chama `competenciaEmVigor()`; quem e datado e o resultado, que e
 * derivado a cada leitura e nunca gravado aqui.
 *
 * Ela existe como tabela, e nao como `if` no codigo, pela mesma razao de
 * `eventos`: quem inventa as condicoes e a operacao (uma empresa que passa a
 * pagar cesta, um posto que ganha adicional), e cada ajuste viraria deploy.
 *
 * O escopo e uma conjuncao: coluna nula e "nao filtra por isso". `empresa_id` e
 * `cargo` olham a pessoa; posto, funcao, turma, sigla, ciclo e jornada olham o
 * **dia**, porque a pessoa pode cobrir dois postos no mesmo mes e o contrato da
 * funcao pode trocar no meio do periodo.
 */
export const regrasApontamento = pgTable(
  "regras_apontamento",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    ativa: boolean("ativa").notNull().default(true),
    /**
     * A ordem em que as regras sao aplicadas — e a ordem em que a lista as
     * mostra. Importa porque `definir` sobrescreve: quem vem depois manda.
     */
    ordem: smallint("ordem").notNull().default(0),

    /* -------- escopo: da pessoa -------- */
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "restrict" }),
    /** Casa por trecho, sem olhar a caixa (`%porteiro%`). */
    cargo: text("cargo"),
    funcionarioId: uuid("funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),

    /* -------- escopo: do dia -------- */
    postoId: uuid("posto_id").references(() => postos.id, { onDelete: "restrict" }),
    funcaoId: uuid("funcao_id").references(() => funcoesPosto.id, { onDelete: "restrict" }),
    turma: funcaoTurmaEnum("turma"),
    /** A sigla do dia na grade — e assim que "turno N" vira regra. */
    eventoId: uuid("evento_id").references(() => eventos.id, { onDelete: "restrict" }),
    /**
     * O ciclo da vigencia que vale naquele dia: tamanho e quantidade de folgas.
     *
     * Os dois juntos, e nunca so um: um 5x1 e um ciclo de 6 com 1 folga e o
     * 12x36 e um ciclo de 2 com 1 folga — filtrar so pelas folgas daria as tres
     * horas extras do 5x1 a quem faz 12x36.
     */
    cicloDias: smallint("ciclo_dias"),
    cicloFolgas: smallint("ciclo_folgas"),
    /**
     * A duracao do turno da vigencia, em minutos (720 = 12 horas), contada de
     * `entrada` a `saida` com a virada da meia-noite incluida. E o que separa o
     * 5x1 de 11 horas do 5x1 comum.
     */
    jornadaMinutos: integer("jornada_minutos"),

    /* -------- gatilho e efeito -------- */
    gatilho: regraGatilhoEnum("gatilho").notNull(),
    rubrica: apontamentoRubricaEnum("rubrica").notNull(),
    acao: regraAcaoEnum("acao").notNull().default("somar"),
    /**
     * Quanto, na unidade da rubrica: dias, minutos, ou `1`/`0` para a marcacao
     * de sim/nao. Percentual e grau tem coluna propria — uma coluna so para
     * todas as unidades repetiria o erro que `apontamentos` evita ao ter uma
     * coluna por rubrica.
     */
    quantidade: integer("quantidade"),
    percentual: numeric("percentual", { precision: 5, scale: 2, mode: "number" }),
    grau: insalubridadeGrauEnum("grau"),

    atualizadoPorId: uuid("atualizado_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Mesmo criterio de `eventos_rotulo_unico`: dois nomes que so diferem na
    // caixa sao o mesmo nome para quem procura a regra na lista.
    uniqueIndex("regras_apontamento_nome_unico").on(sql`lower(${tabela.nome})`),
    index("regras_apontamento_ordem_idx").on(tabela.ordem),
    /** Um valor, e um so: a unidade e da rubrica, e duas preenchidas se contradizem. */
    check(
      "regras_apontamento_um_valor",
      sql`(case when quantidade is null then 0 else 1 end)
        + (case when percentual is null then 0 else 1 end)
        + (case when grau is null then 0 else 1 end) = 1`,
    ),
    check(
      "regras_apontamento_valores_validos",
      sql`(quantidade is null or quantidade between 0 and 44640)
        and (percentual is null or percentual between 0 and 100)`,
    ),
    /** Ciclo e meio ciclo nao existe: ou se filtra pelos dois numeros, ou por nenhum. */
    check("regras_apontamento_ciclo_completo", sql`(ciclo_dias is null) = (ciclo_folgas is null)`),
    check("regras_apontamento_cargo_preenchido", sql`cargo is null or length(btrim(cargo)) > 0`),
  ],
);

/**
 * Onde a regra **nao** vale.
 *
 * Tabela a parte, e nao uma coluna "exceto empresa": a excecao e uma lista
 * ("todas menos a LC", "todo mundo menos estes dois"), e como coluna ela
 * obrigaria a cadastrar uma regra por empresa so para deixar uma de fora — que
 * e justamente o que este modulo evita.
 *
 * Uma linha diz um alvo so, como o `check` abaixo garante. Casou qualquer uma
 * delas, a regra nao se aplica naquele dia.
 */
export const regraApontamentoExcecoes = pgTable(
  "regra_apontamento_excecoes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    regraId: uuid("regra_id")
      .notNull()
      // `cascade`: a excecao nao explica nada sem a regra — mesma razao das
      // celulas de `preenchimento_dias`.
      .references(() => regrasApontamento.id, { onDelete: "cascade" }),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "restrict" }),
    postoId: uuid("posto_id").references(() => postos.id, { onDelete: "restrict" }),
    funcaoId: uuid("funcao_id").references(() => funcoesPosto.id, { onDelete: "restrict" }),
    funcionarioId: uuid("funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    index("regra_apontamento_excecoes_regra_idx").on(tabela.regraId),
    check(
      "regra_apontamento_excecoes_um_alvo",
      sql`(case when empresa_id is null then 0 else 1 end)
        + (case when posto_id is null then 0 else 1 end)
        + (case when funcao_id is null then 0 else 1 end)
        + (case when funcionario_id is null then 0 else 1 end) = 1`,
    ),
  ],
);

export type RegraApontamento = typeof regrasApontamento.$inferSelect;
export type NovaRegraApontamento = typeof regrasApontamento.$inferInsert;
export type RegraApontamentoExcecao = typeof regraApontamentoExcecoes.$inferSelect;
export type RubricaDaRegra = (typeof apontamentoRubricaEnum.enumValues)[number];
export type RegraGatilho = (typeof regraGatilhoEnum.enumValues)[number];
export type RegraAcao = (typeof regraAcaoEnum.enumValues)[number];
