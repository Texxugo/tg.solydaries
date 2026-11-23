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

import { competencias } from "./competencias";
import { funcionarios } from "./funcionarios";
import { usuarios } from "./usuarios";

/**
 * O grau da insalubridade, e nao um "sim/nao": e o grau que a folha precisa
 * saber para lancar o adicional (10, 20 ou 40%). Enum no banco, como
 * `evento_natureza`, porque um valor fora da lista falharia calado numa coluna
 * de texto. Ausencia de insalubridade e `null`, e nao um quarto valor.
 */
export const insalubridadeGrauEnum = pgEnum("insalubridade_grau", ["minimo", "medio", "maximo"]);

/**
 * O apontamento da folha: o que um funcionario tem a receber ou a descontar
 * numa competencia — VT, VR, horas extras, adicionais, faltas, DSR —, registrado
 * por quem fecha a folha com o espelho de ponto aberto ao lado.
 *
 * **Dado datado**: pertence a competencia, e toda leitura filtra por
 * `competenciaEmVigor()` e toda escrita comeca por `competenciaDeEscrita()`.
 *
 * **Uma linha por funcionario e competencia**, com uma coluna por rubrica, e
 * nao uma linha por lancamento (`tipo`, `quantidade`). A lista de rubricas e a
 * do fechamento, e cada uma tem unidade propria — dias, minutos, grau,
 * percentual, sim/nao. Numa tabela de lancamentos a quantidade seria uma coluna
 * so para todas as unidades, e "12" nao diria se sao dias ou horas; aqui cada
 * coluna tem o tipo e o `check` da propria unidade. O preco e uma migration por
 * rubrica nova, que e o ritmo em que a folha muda.
 *
 * **Nao calcula salario.** Nenhuma coluna guarda valor em reais nem base de
 * calculo: e a quantidade que a folha vai valorar. E tambem nao e a apuracao do
 * ponto — aquela e consequencia da escala, recalculada a cada leitura; esta e o
 * que alguem conferiu e decidiu lancar, e por isso e gravada.
 *
 * **Apontamento vazio nao e gravado** (`check apontamentos_nao_vazio`): a
 * ausencia de linha ja diz "nada apontado", do mesmo jeito que em
 * `preenchimento_dias`. Salvar tudo zerado apaga a linha.
 */
export const apontamentos = pgTable(
  "apontamentos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    /**
     * Funcionario, e nunca freelancer: freelancer nao esta na folha. `restrict`
     * como no resto do portal — funcionario e desativado, e continua explicando
     * os apontamentos das competencias em que esteve.
     */
    funcionarioId: uuid("funcionario_id")
      .notNull()
      .references(() => funcionarios.id, { onDelete: "restrict" }),

    /** Dias de vale-transporte a pagar na competencia. */
    vtDias: smallint("vt_dias").notNull().default(0),
    /** Dias de vale-refeicao. */
    vrDias: smallint("vr_dias").notNull().default(0),
    /** Tem direito a cesta basica nesta competencia. */
    cestaBasica: boolean("cesta_basica").notNull().default(false),

    /**
     * Horas em **minutos inteiros**, e nao `numeric` de horas decimais: "1,30"
     * seria uma hora e meia ou uma hora e trinta? O minuto nao tem essa
     * ambiguidade, e e a mesma unidade de `escalas.intrajornada_minutos`.
     */
    he50Minutos: integer("he_50_minutos").notNull().default(0),
    he60Minutos: integer("he_60_minutos").notNull().default(0),
    he100Minutos: integer("he_100_minutos").notNull().default(0),
    adicionalNoturnoMinutos: integer("adicional_noturno_minutos").notNull().default(0),
    /** Intervalo intrajornada nao concedido, a indenizar. */
    intrajornadaMinutos: integer("intrajornada_minutos").notNull().default(0),

    insalubridade: insalubridadeGrauEnum("insalubridade"),
    periculosidade: boolean("periculosidade").notNull().default(false),
    /** Faz jus ao premio assiduidade. Nao e deduzido das faltas: e decisao de quem fecha. */
    assiduidade: boolean("assiduidade").notNull().default(false),
    /** Gratificacao em percentual (12,5 = 12,5%), com duas casas. */
    gratificacaoPercentual: numeric("gratificacao_percentual", {
      precision: 5,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),

    /** Faltas em dia que a escala previa trabalho. */
    faltasEscala: smallint("faltas_escala").notNull().default(0),
    /** Faltas em dia de folga para o qual a pessoa tinha sido convocada. */
    faltasFolga: smallint("faltas_folga").notNull().default(0),
    /** Quantos descansos semanais remunerados perdem o pagamento. */
    dsrDescontados: smallint("dsr_descontados").notNull().default(0),

    observacao: text("observacao"),

    /**
     * Quem gravou por ultimo. `set null` pela mesma razao de
     * `extras.registrado_por_id`: o registro aconteceu mesmo que a conta suma.
     */
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
    /**
     * Um apontamento por pessoa na competencia. E o alvo do `on conflict` da
     * gravacao, e ja cobre a leitura da competencia (coluna a esquerda).
     */
    uniqueIndex("apontamentos_competencia_funcionario_unico").on(
      tabela.competenciaId,
      tabela.funcionarioId,
    ),
    // "Em que competencias esta pessoa teve apontamento?", sem varrer todas.
    index("apontamentos_funcionario_idx").on(tabela.funcionarioId),
    /**
     * Dias ate 31: nenhuma competencia do portal passa disso na pratica, e a
     * action ainda confere contra o tamanho do periodo aberto.
     */
    check(
      "apontamentos_dias_validos",
      sql`vt_dias between 0 and 31 and vr_dias between 0 and 31
        and faltas_escala between 0 and 31 and faltas_folga between 0 and 31
        and dsr_descontados between 0 and 31`,
    ),
    /** 744 horas = 31 dias inteiros: o que passar disso e digitacao errada. */
    check(
      "apontamentos_minutos_validos",
      sql`he_50_minutos between 0 and 44640 and he_60_minutos between 0 and 44640
        and he_100_minutos between 0 and 44640 and adicional_noturno_minutos between 0 and 44640
        and intrajornada_minutos between 0 and 44640`,
    ),
    check("apontamentos_gratificacao_valida", sql`gratificacao_percentual between 0 and 100`),
    /**
     * Linha que nao aponta nada e indistinguivel de linha nenhuma — mesma regra
     * de `preenchimento_dias_nao_vazia`. A observacao sozinha conta: "conferido,
     * nada a lancar" e um apontamento.
     */
    check(
      "apontamentos_nao_vazio",
      sql`vt_dias > 0 or vr_dias > 0 or cesta_basica
        or he_50_minutos > 0 or he_60_minutos > 0 or he_100_minutos > 0
        or adicional_noturno_minutos > 0 or intrajornada_minutos > 0
        or insalubridade is not null or periculosidade or assiduidade
        or gratificacao_percentual > 0
        or faltas_escala > 0 or faltas_folga > 0 or dsr_descontados > 0
        or length(btrim(coalesce(observacao, ''))) > 0`,
    ),
  ],
);

export type Apontamento = typeof apontamentos.$inferSelect;
export type NovoApontamento = typeof apontamentos.$inferInsert;
export type InsalubridadeGrau = (typeof insalubridadeGrauEnum.enumValues)[number];
