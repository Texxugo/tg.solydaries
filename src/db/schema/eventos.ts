import { sql } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * O que o evento significa para quem soma a escala no fim do periodo.
 *
 * Enum no banco (e nao text livre) pelo mesmo motivo de `area_portal`: uma
 * natureza inexistente falha no INSERT, e nao so na validacao da aplicacao.
 *
 * Sao estas cinco porque sao as cinco perguntas que o rodape da grade responde:
 * quantos dias a pessoa trabalhou, quantos folgou, quantos faltou, quantos
 * estava afastada e quantos foram outra coisa qualquer. Reduzir a "trabalhou ou
 * nao" perderia justamente **por que** o dia nao teve jornada — o mesmo erro que
 * `funcionarios.situacao` evita ao guardar o codigo da folha em vez de um
 * booleano.
 *
 * `troca` e a sexta, e nao conta por si: ela **inverte o previsto** do dia
 * (`naturezaDoRealizado()`, em `preenchimento/grade.ts`). E a troca interna — a
 * mesma sigla vale trabalho na folga em que a pessoa cobriu o colega, e folga no
 * dia de trabalho em que o colega a cobriu.
 */
export const eventoNaturezaEnum = pgEnum("evento_natureza", [
  "trabalho",
  "folga",
  "falta",
  "afastamento",
  "outro",
  "troca",
]);

/**
 * A cor da celula na grade. Enum curto, e nao hexadecimal livre: a grade tem
 * trinta e uma colunas e duas faixas por pessoa, e cor escolhida a dedo por
 * cadastro viraria um mosaico ilegivel — alem de nao ter como acompanhar o tema
 * claro/escuro do portal. Cada valor vira um par de classes em `cores.ts`.
 */
export const eventoCorEnum = pgEnum("evento_cor", [
  "cinza",
  "verde",
  "azul",
  "ambar",
  "vermelho",
  "roxo",
]);

/**
 * O catalogo de eventos da escala: o vocabulario que se digita em cada celula
 * da grade (D, N, F, FALTA, TP, TI...).
 *
 * Cadastro, e nao dado datado — como escalas e funcionarios: "F" nao muda de
 * significado ao virar a competencia. Nenhuma query da feature chama
 * `competenciaEmVigor()`.
 *
 * Ele existe como tabela, e nao como enum no codigo, porque quem inventa
 * evento e a operacao e nao o portal: a planilha de origem ja traz TP, TI, TT,
 * TE, TF e MEIO, cada um com um sentido local. Enum obrigaria uma migration a
 * cada sigla nova.
 */
export const eventos = pgTable(
  "eventos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /**
     * A sigla que a celula da grade mostra (D, N, F). Curta de proposito: e o que cabe
     * numa coluna de dia, e e assim que a escala e preenchida hoje.
     */
    codigo: text("codigo").notNull(),
    /** O que a sigla quer dizer por extenso ("Diurno", "Folga"). */
    rotulo: text("rotulo").notNull(),
    descricao: text("descricao"),
    natureza: eventoNaturezaEnum("natureza").notNull(),
    cor: eventoCorEnum("cor").notNull().default("cinza"),
    /**
     * `true` quando o evento pede hora de entrada e saida na celula — o apoio
     * extra que entrou as 13h, o meio periodo. A grade nao **impede** horario
     * nos demais; ela apenas cobra nos que dependem dele para significar algo.
     */
    exigeHorario: boolean("exige_horario").notNull().default(false),
    /**
     * `true` quando o evento nomeia **outra pessoa**: quem cobriu o extra, com
     * quem se trocou o turno, quem substituiu. Sem ela a sigla diz que algo
     * mudou e nao diz com quem — que e metade do que se quer saber ao reler a
     * escala do mes.
     */
    exigePessoa: boolean("exige_pessoa").notNull().default(false),
    /**
     * `true` quando o evento nomeia **outro bloco**: a troca de posto. E o par
     * do anterior — um diz com quem, o outro diz para onde.
     */
    exigeDestino: boolean("exige_destino").notNull().default(false),
    /**
     * `true` quando o evento aponta **outro dia** da mesma pessoa: a troca de
     * escala (TE), lancada no dia de trabalho em que ela folgou e apontando a
     * folga em que ela trabalhou no lugar. Terceiro do trio com `exige_pessoa`
     * e `exige_destino`: o que o modal pede e cadastro, e nao lista de siglas.
     */
    exigeDiaTrabalhado: boolean("exige_dia_trabalhado").notNull().default(false),
    /**
     * O evento que o portal usa quando precisa escolher sozinho um da natureza
     * — e o que o preenchimento automatico do previsto grava em dia trabalhado
     * e em dia de folga. No maximo um por natureza (indice parcial abaixo).
     */
    padrao: boolean("padrao").notNull().default(false),
    /** Evento desativado sai das escolhas novas e continua explicando o passado. */
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Mesmo criterio de `escalas_nome_unico`: "d" e "D" sao a mesma sigla para
    // quem preenche a grade, e a celula e casada por codigo sem olhar a caixa.
    uniqueIndex("eventos_codigo_unico").on(sql`lower(${tabela.codigo})`),
    uniqueIndex("eventos_rotulo_unico").on(sql`lower(${tabela.rotulo})`),
    // A regra "existe no maximo um padrao por natureza" e do banco, e nao da
    // action — mesmo arranjo de `competencias_unica_aberta`. Duas requisicoes
    // marcando o padrao ao mesmo tempo terminam com uma em erro de unicidade,
    // e nao com duas respostas para "qual e o evento de folga?".
    uniqueIndex("eventos_padrao_por_natureza")
      .on(tabela.natureza)
      .where(sql`padrao`),
  ],
);

export type Evento = typeof eventos.$inferSelect;
export type NovoEvento = typeof eventos.$inferInsert;
export type EventoNatureza = (typeof eventoNaturezaEnum.enumValues)[number];
export type EventoCor = (typeof eventoCorEnum.enumValues)[number];
