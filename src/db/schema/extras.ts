import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { competencias } from "./competencias";
import { funcionarios } from "./funcionarios";
import { postos } from "./postos";
import { freelancers, preenchimentoDias } from "./preenchimento";
import { usuarios } from "./usuarios";

/**
 * A hora extra conferida: alguem cobriu um turno alem da jornada, num dia, num
 * posto, num local — e o que se sabe a respeito.
 *
 * **Dado datado**, ao contrario de postos, escalas e funcionarios: toda leitura
 * filtra por `competenciaEmVigor()` e toda escrita comeca por
 * `competenciaDeEscrita()`. Extra pertence ao periodo em que o dia caiu, e e por
 * competencia que ele sera pago e conferido.
 *
 * Nao se confunde com a hora extra que a **apuracao do ponto** aponta: aquela e
 * consequencia da marcacao contra a escala e por isso nao esta no banco
 * (`apuracao.ts` a recalcula a cada leitura). Esta e uma **entrada** — alguem
 * viu, apurou e registrou —, e por isso e gravada, do mesmo jeito e pelo mesmo
 * motivo que a tratativa de uma ocorrencia. As duas se encontram na conferencia:
 * a leitura do relogio levanta a suspeita, este cadastro diz o que foi
 * reconhecido.
 *
 * A duracao **nao** e coluna: ela sai de `hora_entrada` e `hora_saida` a cada
 * leitura, como os totais do rodape da grade. Grava-la criaria a versao velha do
 * fato no dia em que alguem corrigisse o horario.
 */
export const extras = pgTable(
  "extras",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /**
     * A competencia a que o extra pertence. Sai da **data** do extra, e nao da
     * competencia que por acaso estava aberta na hora de digitar — mesma regra
     * de `marcacoes`: gravar 21/09 dentro de agosto o esconderia de setembro
     * para sempre.
     */
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    /** `date` em `mode: "string"`, pelo mesmo motivo das datas de `competencias`. */
    data: date("data", { mode: "string" }).notNull(),
    /**
     * Quem fez o extra: um funcionario **ou** um freelancer, nunca os dois e
     * nunca nenhum (`check` abaixo). Duas colunas com integridade referencial de
     * verdade, e nao uma coluna polimorfica com um campo "tipo" — mesmo arranjo
     * (e mesma razao) de `preenchimento_linhas`.
     *
     * O freelancer entra aqui exatamente como entra na grade: quem cobre um
     * extra as vezes e justamente quem nao esta na folha, e exigir cadastro
     * previo travaria o registro do dia em que ele aconteceu.
     */
    funcionarioId: uuid("funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "restrict" }),
    /**
     * Onde o extra foi feito, no vocabulario do cadastro: o posto (GP01).
     * `restrict` como no resto do portal — posto que saiu de operacao e
     * desativado, e continua explicando os extras que passaram por ele.
     */
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "restrict" }),
    /**
     * O local, em texto livre: o que o posto sozinho nao diz — "Portaria 2",
     * "Fortaleza II", "Recepcao". E o complemento que quem confere usa para
     * reconhecer o dia, e por isso e digitado e nao escolhido: ele muda de nome
     * antes de virar cadastro.
     */
    local: text("local").notNull(),
    /**
     * O horario do extra. `time` sem fuso e como string, pelo mesmo motivo de
     * `escalas`: horario nao tem dia a que pertencer, e converter para `Date`
     * so deixaria o horario de verao move-lo.
     *
     * A virada da meia-noite se le do proprio par (`saida < entrada`), como em
     * `escalas.virada_turno` — e por isso os dois nao podem ser iguais: seria
     * "24 horas ou nenhuma?" sem resposta.
     */
    horaEntrada: time("hora_entrada").notNull(),
    horaSaida: time("hora_saida").notNull(),
    /** O que explica o extra: "cobriu falta do Joao", "evento no cliente". */
    observacao: text("observacao"),
    /**
     * A celula da grade que gerou este extra — o dia, a pessoa e o posto de uma
     * cobertura marcada como extra no modal do preenchimento.
     *
     * `null` no extra lancado a mao, que continua sendo o caminho da tela de
     * registro. Quando ha, o extra e **daquele dia**: regravar a celula o
     * reescreve e apagar o dia o leva junto (`cascade`) — sem a cobertura que o
     * gerou, ele continuaria somando horas que ninguem fez, que e a mesma razao
     * pela qual o extra se apaga em vez de ser desativado.
     *
     * E uma coluna aqui, e nao uma copia da marcacao em `preenchimento_dias`:
     * o extra e o registro, e a celula so aponta para ele. Assim "este dia gerou
     * extra?" e lido do proprio extra, e nao de um booleano que poderia
     * discordar dele.
     */
    preenchimentoDiaId: uuid("preenchimento_dia_id").references(() => preenchimentoDias.id, {
      onDelete: "cascade",
    }),
    /**
     * Quem registrou. `set null` porque o registro aconteceu mesmo que a conta
     * suma depois — mesma escolha de `preenchimento_alteracoes.usuario_id`.
     */
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
    // Como a lista consulta: os extras da competencia, do dia mais recente para
    // o mais antigo.
    index("extras_competencia_idx").on(tabela.competenciaId, tabela.data),
    // "Quantos extras esta pessoa fez?", sem varrer a competencia.
    index("extras_funcionario_idx").on(tabela.funcionarioId),
    index("extras_freelancer_idx").on(tabela.freelancerId),
    index("extras_posto_idx").on(tabela.postoId),
    /**
     * O mesmo extra nao entra duas vezes: mesma pessoa, mesmo dia, mesmo posto e
     * mesma entrada e o registro repetido de quem nao viu que o colega ja tinha
     * lancado. Dois extras no mesmo dia continuam valendo — basta comecarem em
     * horarios diferentes.
     *
     * Parciais porque uma das duas colunas de pessoa e sempre nula, e `null` nao
     * repete em indice unico: sem o `where`, o indice deixaria passar tudo.
     */
    uniqueIndex("extras_funcionario_unico")
      .on(tabela.funcionarioId, tabela.data, tabela.postoId, tabela.horaEntrada)
      .where(sql`funcionario_id is not null`),
    uniqueIndex("extras_freelancer_unico")
      .on(tabela.freelancerId, tabela.data, tabela.postoId, tabela.horaEntrada)
      .where(sql`freelancer_id is not null`),
    /**
     * Um extra por celula da grade. Parcial pelo mesmo motivo dos dois acima: a
     * coluna e nula no extra lancado a mao, e `null` nao repete em indice unico.
     *
     * E o que permite a leitura da grade juntar os dois lados por um `left join`
     * simples — sem ele, uma celula com dois extras faria a linha aparecer
     * duplicada na grade inteira.
     */
    uniqueIndex("extras_preenchimento_dia_unico")
      .on(tabela.preenchimentoDiaId)
      .where(sql`preenchimento_dia_id is not null`),
    /** Uma pessoa, e uma so. Mesma familia do `preenchimento_linhas_uma_pessoa`. */
    check("extras_uma_pessoa", sql`(funcionario_id is null) <> (freelancer_id is null)`),
    /** Entrada igual a saida nao mede jornada nenhuma — como em `escalas`. */
    check("extras_horario_valido", sql`hora_entrada <> hora_saida`),
    /** Local em branco seria uma coluna obrigatoria preenchida com nada. */
    check("extras_local_preenchido", sql`length(btrim(local)) > 0`),
  ],
);

export type Extra = typeof extras.$inferSelect;
export type NovoExtra = typeof extras.$inferInsert;
