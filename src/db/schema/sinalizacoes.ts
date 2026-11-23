import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { funcionarios } from "./funcionarios";
import { mensagemStatusEnum } from "./ponto";
import { preenchimentoLinhas } from "./preenchimento";
import { usuarios } from "./usuarios";

/**
 * O dia que alguem sinalizou (o "!") ao preencher a escala, para conferir
 * depois na tela "Dias sinalizados".
 *
 * Presa a **linha da grade** e a data, e nao a celula de `preenchimento_dias`:
 * a celula pode nem existir (o dia em branco que bateu ponto) e pode ser
 * apagada e regravada, e nada disso deve levar a marca junto. A linha ja diz de
 * quem e o dia (funcionario ou freelancer), em que funcao e posto, e em que
 * competencia — e retirar a pessoa da escala leva a marca junto (`cascade`),
 * como leva as celulas.
 *
 * Uma marca por dia (indice unico). Resolver nao apaga: grava quem resolveu e
 * quando, e a marca sai dos pendentes sem sumir do filtro "Resolvidos".
 * Sinalizar de novo um dia resolvido reabre a mesma linha.
 *
 * A `observacao` e o que conferir ("bateu so a entrada"), opcional: e ela que
 * explica o item na mensagem ao responsavel do posto.
 */
export const sinalizacoesDia = pgTable(
  "sinalizacoes_dia",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    linhaId: uuid("linha_id")
      .notNull()
      .references(() => preenchimentoLinhas.id, { onDelete: "cascade" }),
    data: date("data", { mode: "string" }).notNull(),
    sinalizadoPor: uuid("sinalizado_por").references(() => usuarios.id, { onDelete: "set null" }),
    sinalizadoEm: timestamp("sinalizado_em", { withTimezone: true }).notNull().defaultNow(),
    resolvidoPor: uuid("resolvido_por").references(() => usuarios.id, { onDelete: "set null" }),
    /** `null` enquanto pendente. E ele, e nao `resolvido_por`, que decide o estado. */
    resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
    /** O que conferir neste dia, em uma frase. Vai na tela e na mensagem ao responsavel. */
    observacao: text("observacao"),
  },
  (tabela) => [
    uniqueIndex("sinalizacoes_dia_unica").on(tabela.linhaId, tabela.data),
    index("sinalizacoes_dia_pendentes").on(tabela.resolvidoEm),
    // Quem resolveu so existe junto do quando: sem o quando, a marca e pendente.
    check(
      "sinalizacoes_dia_resolucao_completa",
      sql`resolvido_por is null or resolvido_em is not null`,
    ),
    check("sinalizacoes_dia_observacao_curta", sql`char_length(observacao) <= 200`),
  ],
);

/**
 * Cada vez que um dia sinalizado foi enviado ao responsavel do posto: uma linha
 * por dia, com o mesmo `lote_id` para os dias que sairam na mesma mensagem —
 * o arranjo de `mensagens_ponto` no envio consolidado de ponto.
 *
 * O texto e o telefone sao gravados como foram enviados, e a falha tambem vira
 * linha: "ninguem avisou" e "o numero esta errado" pedem gestos diferentes. E
 * daqui que sai o "ja foi enviado?" — um envio **aceito** ao responsavel atual
 * do posto, depois da ultima vez que o dia foi sinalizado (reabrir pelo "!" o
 * devolve ao proximo envio; trocar o responsavel do posto, tambem).
 */
export const enviosSinalizacao = pgTable(
  "envios_sinalizacao",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sinalizacaoId: uuid("sinalizacao_id")
      .notNull()
      .references(() => sinalizacoesDia.id, { onDelete: "cascade" }),
    loteId: uuid("lote_id").notNull(),
    /** O responsavel que recebeu. `set null`: o envio continua sendo fato. */
    responsavelId: uuid("responsavel_id").references(() => funcionarios.id, {
      onDelete: "set null",
    }),
    telefone: text("telefone").notNull(),
    conteudo: text("conteudo").notNull(),
    status: mensagemStatusEnum("status").notNull(),
    mensagemExternaId: text("mensagem_externa_id"),
    erro: text("erro"),
    enviadoPor: uuid("enviado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index("envios_sinalizacao_dia").on(tabela.sinalizacaoId, tabela.criadoEm)],
);
