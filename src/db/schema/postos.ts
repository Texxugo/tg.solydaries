import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { eventos } from "./eventos";
import { empresas, funcionarios } from "./funcionarios";
import { usuarios } from "./usuarios";

/**
 * O posto de trabalho: o lugar que precisa ser coberto.
 *
 * Cadastro, e nao dado datado — mesma razao das escalas: o posto continua
 * existindo na competencia seguinte, e data-lo forcaria recadastrar a operacao
 * inteira todo mes.
 *
 * Nao se confunde com a empresa nem com a escala: a empresa e quem emprega, a
 * escala e a regra da jornada, e o posto e **onde** a jornada acontece. E por
 * posto que a grade e lida, porque a pergunta de quem monta a escala nao e
 * "quem trabalha amanha?" e sim "quem cobre a portaria amanha?".
 */
export const postos = pgTable(
  "postos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** O apelido curto do posto na operacao (GP01, SG27) — o que encabeca o bloco. */
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    /**
     * A empresa a que o posto pertence, quando ha uma. Anulavel porque o posto
     * pode ser cadastrado antes de a primeira carga da folha criar a empresa —
     * e porque ha posto atendido por mais de uma.
     */
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "restrict" }),
    /**
     * O funcionario que responde pelo grupo de contato do posto
     * (`posto_contatos`). Com ele preenchido, a mensagem de correcao de ponto de
     * quem esta no grupo vai para ele, e nao para o colaborador. Nulo e "o posto
     * nao tem responsavel": o grupo continua cadastrado, mas cada um volta a
     * receber a propria mensagem.
     */
    responsavelId: uuid("responsavel_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("postos_codigo_unico").on(sql`lower(${tabela.codigo})`),
    uniqueIndex("postos_nome_unico").on(sql`lower(${tabela.nome})`),
    index("postos_empresa_idx").on(tabela.empresaId),
    index("postos_responsavel_idx").on(tabela.responsavelId),
    check("postos_codigo_valido", sql`codigo ~ '^[0-9A-Za-z-]{1,20}$'`),
  ],
);

/**
 * A funcao dentro do posto: o segundo nivel — "LIDER", "PORTARIA REMOTA",
 * "ADMINISTRATIVO", "CCO".
 *
 * Sao dois niveis porque a escala e montada assim: o posto diz o lugar e a
 * funcao diz o turno/papel que se cobre ali, e cada par (posto, funcao) tem a
 * sua propria lista de gente e o seu proprio horario. Achatar em um nivel so
 * juntaria numa lista unica pessoas que nunca se substituem.
 *
 * **E a funcao, e nao o posto, que a grade desenha**: um bloco por funcao.
 */
export const funcoesPosto = pgTable(
  "funcoes_posto",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    postoId: uuid("posto_id")
      .notNull()
      // `restrict`: apagar o posto levaria junto as escalas ja preenchidas de
      // todas as competencias. Posto que saiu de operacao e desativado.
      .references(() => postos.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    /**
     * O evento que significa "trabalhou aqui" nesta funcao — `D` num posto
     * diurno, `N` num noturno. E o que o preenchimento automatico do previsto
     * grava nos dias de trabalho; sem ele, cai no evento padrao de natureza
     * `trabalho`.
     */
    eventoTrabalhoId: uuid("evento_trabalho_id").references(() => eventos.id, {
      onDelete: "restrict",
    }),
    /** Texto livre do bloco: "SEG A QUI 07:00 AS 17:00 | SEX FOLGA". */
    observacao: text("observacao"),
    /** Ordem do bloco dentro do posto. Empate desempata pelo nome. */
    ordem: smallint("ordem").notNull().default(0),
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Unico **dentro do posto**, e nao no portal inteiro: "PORTARIA" existe em
    // todo posto e sao portarias diferentes. Mesmo raciocinio da matricula, que
    // e unica por empresa. O indice composto ja cobre `posto_id` a esquerda,
    // que e como a tela lista as funcoes de um posto.
    uniqueIndex("funcoes_posto_nome_unico").on(tabela.postoId, sql`lower(${tabela.nome})`),
  ],
);

/**
 * As duas escalas que uma funcao pode ter.
 *
 * `contraescala` nao e outro contrato: e a outra metade do mesmo posto — a
 * turma que cobre quando a primeira folga. Sao duas e nao N porque e assim que a
 * operacao fala ("escala e contraescala"), e porque cada uma ja pode ter ciclo,
 * folgas e horario proprios: um posto com tres padroes simultaneos seria outra
 * funcao, e nao uma terceira turma.
 */
export const funcaoTurmaEnum = pgEnum("funcao_turma", ["escala", "contraescala"]);

/**
 * O ciclo que o contrato exige de uma funcao, **a partir de uma data**.
 *
 * Uma linha por (funcao, turma, vigencia). Escala muda no meio da competencia —
 * "12x36 ate 27/08, 4x2 a partir de 28/08" — e uma unica configuracao na funcao
 * obrigaria a reescrever o passado para descrever o futuro.
 *
 * A vigencia e **aberta**: cada linha vale ate a proxima da mesma turma
 * comecar. Guardar tambem a data final criaria duas datas a manter em dia a
 * cada troca, e com elas a chance de buraco e de sobreposicao — o "ate 27/08" e
 * consequencia de a proxima comecar em 28/08, e nao informacao.
 *
 * `vigencia_inicio` nulo e "desde sempre": e a primeira configuracao, a que
 * vale antes de qualquer troca. So pode haver uma por turma (indice parcial).
 */
export const funcaoCiclos = pgTable(
  "funcao_ciclos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    funcaoId: uuid("funcao_id")
      .notNull()
      // `cascade`: o ciclo nao explica nada sem a funcao — seria um contrato de
      // um turno que nao existe. Mesma razao de `escala_folgas`.
      .references(() => funcoesPosto.id, { onDelete: "cascade" }),
    turma: funcaoTurmaEnum("turma").notNull().default("escala"),
    /** `null` = vale desde sempre, ate a proxima vigencia desta turma comecar. */
    vigenciaInicio: date("vigencia_inicio", { mode: "string" }),
    /**
     * De quantos em quantos dias o padrao se repete, e quais posicoes sao
     * folga. Mesmo formato de `escalas`+`escala_folgas` e pela mesma razao: ha
     * escala em que a folga anda, e nenhum par "N trabalhados x M de folga"
     * descreve um 6x1 alternado. As posicoes sao um `smallint[]` em vez de
     * tabela filha porque nunca sao lidas nem escritas sem a vigencia.
     */
    diasCiclo: smallint("dias_ciclo").notNull(),
    folgas: smallint("folgas").array().notNull().default([]),
    /**
     * O horario que o previsto carrega. `time` sem fuso, como em `escalas`:
     * horario de escala nao tem dia a que pertencer, e converter para `Date` so
     * deixaria o horario de verao mover a jornada. A virada de turno se le do
     * proprio par (`saida < entrada`).
     */
    entrada: time("entrada").notNull(),
    saida: time("saida").notNull(),
    /**
     * Em que dia a **posicao 1** do ciclo cai.
     *
     * Anulavel: sem ela a posicao 1 cai no inicio da vigencia. Vale a pena
     * dizer quando a troca acontece no meio da semana — um 5x2 que passa a
     * valer numa quarta continua ancorando na segunda.
     */
    inicioCiclo: date("inicio_ciclo", { mode: "string" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Como a derivacao do previsto consulta: as vigencias de uma turma, em
    // ordem, para achar a que vale em cada dia.
    index("funcao_ciclos_vigencia_idx").on(tabela.funcaoId, tabela.turma, tabela.vigenciaInicio),
    // Duas vigencias da mesma turma no mesmo dia nao respondem qual vale.
    uniqueIndex("funcao_ciclos_vigencia_unica")
      .on(tabela.funcaoId, tabela.turma, tabela.vigenciaInicio)
      .where(sql`vigencia_inicio is not null`),
    // E so uma "desde sempre" por turma: `null` nao repete em indice unico, e
    // sem o parcial duas linhas sem data conviveriam.
    uniqueIndex("funcao_ciclos_inicial_unica")
      .on(tabela.funcaoId, tabela.turma)
      .where(sql`vigencia_inicio is null`),
    check("funcao_ciclos_dias_valido", sql`dias_ciclo between 1 and 62`),
    /**
     * Ciclo sem nenhum dia de trabalho nao e escala de coisa nenhuma — o
     * previsto sairia com folga nos trinta e um dias.
     */
    check("funcao_ciclos_folgas_no_ciclo", sql`coalesce(array_length(folgas, 1), 0) < dias_ciclo`),
    check("funcao_ciclos_horario_valido", sql`entrada <> saida`),
  ],
);

/**
 * O grupo de contato do posto: quem tem a correcao de ponto encaminhada ao
 * responsavel do posto (`postos.responsavel_id`), e nao a si mesmo.
 *
 * Cadastro, e nao dado datado — e nao se confunde com a grade: a grade diz quem
 * cobre o posto neste mes, o grupo diz por quem passa a conversa sobre o ponto
 * de cada pessoa. Quem cobre dois postos teria dois responsaveis se o grupo
 * saisse da grade.
 *
 * **Uma pessoa, um grupo** (indice unico em `funcionario_id`): com dois, nao
 * haveria como saber a quem mandar a mensagem.
 */
export const postoContatos = pgTable(
  "posto_contatos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "restrict" }),
    funcionarioId: uuid("funcionario_id")
      .notNull()
      .references(() => funcionarios.id, { onDelete: "restrict" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
  },
  (tabela) => [
    uniqueIndex("posto_contatos_um_grupo").on(tabela.funcionarioId),
    index("posto_contatos_posto_idx").on(tabela.postoId),
  ],
);

export type Posto = typeof postos.$inferSelect;
export type NovoPosto = typeof postos.$inferInsert;
export type FuncaoPosto = typeof funcoesPosto.$inferSelect;
export type NovaFuncaoPosto = typeof funcoesPosto.$inferInsert;
export type FuncaoCiclo = typeof funcaoCiclos.$inferSelect;
export type NovoFuncaoCiclo = typeof funcaoCiclos.$inferInsert;
export type FuncaoTurma = (typeof funcaoTurmaEnum.enumValues)[number];
