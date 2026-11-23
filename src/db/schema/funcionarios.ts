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
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { escalas } from "./escalas";

/**
 * A empresa empregadora. Cadastro proprio, e nao uma coluna de texto no
 * funcionario: a mesma pessoa muda de nome na folha, mas o nome da empresa e
 * repetido por centenas de linhas — como texto, corrigi-lo seria um UPDATE em
 * massa, e duas grafias do mesmo empregador virariam dois empregadores.
 *
 * O relatorio da folha traz o nome **truncado em 40 caracteres**
 * ("SG SERVICOS PORTARIA E MONITORAMENTO DE "), entao a importacao cria a
 * empresa com o que veio e o cadastro corrige depois. E por isso que o nome
 * completo mora aqui e nao e reescrito a cada importacao.
 */
export const empresas = pgTable(
  "empresas",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nome: text("nome").notNull(),
    /** So digitos, sem mascara. Opcional: o relatorio da folha nao traz CNPJ. */
    cnpj: text("cnpj"),
    /**
     * O codigo da empresa no relogio de ponto — a coluna "Emp." do relatorio de
     * marcacoes (1144, 1147...).
     *
     * E a **unica** ponte entre os dois relatorios do portal: o de marcacoes
     * traz o codigo e nunca a razao social, o da folha traz a razao social e
     * nunca o codigo. Sem ela a matricula nao identifica ninguem, porque o
     * codigo 1335 existe em duas empresas e sao duas pessoas.
     *
     * Anulavel porque a empresa nasce pela importacao da folha, que nao o
     * conhece: quem preenche e a primeira carga de ponto que esbarrar no
     * codigo, na propria tela de importacao.
     */
    codigo: text("codigo"),
    /** Empresa inativa some das escolhas novas e continua explicando o passado. */
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Mesmo criterio de `escalas_nome_unico`: duas empresas que so diferem na
    // caixa sao a mesma empresa para quem le — e para quem importa a planilha.
    uniqueIndex("empresas_nome_unico").on(sql`lower(${tabela.nome})`),
    uniqueIndex("empresas_cnpj_unico").on(tabela.cnpj),
    // Um codigo do relogio aponta para uma empresa so: a associacao existe
    // justamente para desfazer a ambiguidade da matricula, e duas empresas com
    // o mesmo codigo a devolveriam.
    uniqueIndex("empresas_codigo_unico").on(tabela.codigo),
    check("empresas_cnpj_valido", sql`cnpj is null or cnpj ~ '^[0-9]{14}$'`),
    check("empresas_codigo_valido", sql`codigo is null or codigo ~ '^[0-9A-Za-z-]{1,20}$'`),
  ],
);

/**
 * O funcionario: quem tem jornada a ser interpretada.
 *
 * Cadastro, e nao dado datado — pela mesma razao das escalas: ninguem e
 * recontratado ao virar a competencia. Nenhuma query da feature chama
 * `competenciaEmVigor()`.
 *
 * Os dados de identificacao vem da folha (manualmente ou pela importacao do
 * relatorio "Relacao de Empregados"); escala e inicio de ciclo nascem no portal
 * e **nunca** sao sobrescritos por uma reimportacao.
 */
export const funcionarios = pgTable(
  "funcionarios",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      // `restrict`: apagar a empresa levaria junto o historico de quem trabalhou
      // nela. Empresa que saiu de operacao e desativada, como a escala.
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** O "Codigo" da folha. Unico dentro da empresa, e nao no portal inteiro. */
    matricula: text("matricula").notNull(),
    nome: text("nome").notNull(),
    /**
     * Onze digitos, sem mascara. E a **identidade** do funcionario no portal:
     * a matricula se repete entre empresas e o nome muda (casamento, correcao
     * de grafia), entao e por CPF que a reimportacao reconhece quem ja existe.
     */
    cpf: text("cpf").notNull(),
    /** Rotulo da folha ("VIGIA", "PORTEIRO"). Texto livre: quem o define e a folha. */
    cargo: text("cargo"),
    /**
     * O WhatsApp do colaborador, so digitos e **com DDI** (5562999999999).
     *
     * Nasce no portal e nao na folha: o relatorio "Relacao de Empregados" nao
     * traz telefone nenhum, entao a importacao nunca o preenche nem o apaga —
     * pelo mesmo motivo (e com o mesmo cuidado) de `escala_id` e `inicio_ciclo`.
     *
     * Anulavel porque a maior parte do cadastro entra pela carga sem ele; quem
     * esta sem numero simplesmente nao recebe mensagem, e a tela da ocorrencia
     * diz isso com todas as letras em vez de falhar no envio.
     */
    telefone: text("telefone"),
    /** `date` em `mode: "string"`, pelo mesmo motivo das datas de `competencias`. */
    admissao: date("admissao", { mode: "string" }),
    /**
     * O codigo de situacao da folha (1 = Trabalhando, 9 = Ferias, 12 = Novo
     * afastamento pela mesma doenca...). Guardado como veio, com o catalogo em
     * `situacoes.ts`: reduzir a ativo/inativo perderia **por que** a pessoa nao
     * bateu ponto, e e isso que decide como o dia sem marcacao e lido.
     */
    situacao: smallint("situacao").notNull().default(1),
    /**
     * A escala que descreve a jornada desta pessoa. Anulavel de proposito: a
     * importacao traz centenas de funcionarios e o relatorio da folha nao diz
     * escala nenhuma. Quem esta sem escala aparece na lista como pendencia, e
     * nao impede a importacao de terminar.
     */
    escalaId: uuid("escala_id").references(() => escalas.id, { onDelete: "restrict" }),
    /**
     * O dia em que o ciclo da escala comeca a contar **para esta pessoa** — e a
     * metade que falta para `ehDiaTrabalhado()` responder qualquer coisa. Mora
     * aqui, e nao na escala, porque a mesma 12x36 serve todas as turmas: o que
     * distingue a turma A da turma B e justamente esta data.
     */
    inicioCiclo: date("inicio_ciclo", { mode: "string" }),
    /** Desativa sem apagar: a pessoa explica jornadas ja interpretadas. */
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("funcionarios_cpf_unico").on(tabela.cpf),
    // A matricula e da folha de cada empresa: o codigo 1335 da PREVSERV e o
    // 1335 da SANTO E BUENO sao pessoas diferentes. Unico por empresa, portanto.
    uniqueIndex("funcionarios_matricula_unica").on(
      tabela.empresaId,
      sql`lower(${tabela.matricula})`,
    ),
    // Nao ha indice proprio para `empresa_id`: o unico acima ja o cobre, por ser
    // a coluna mais a esquerda — e e assim que o filtro por empresa consulta.
    // Mesmo raciocinio da PK composta de `acessos`.
    //
    // `escala_id` precisa do seu: e por ele que a lista encontra quem esta sem
    // escala (`where escala_id is null`), a fila de trabalho da tela.
    index("funcionarios_escala_idx").on(tabela.escalaId),
    check("funcionarios_cpf_valido", sql`cpf ~ '^[0-9]{11}$'`),
    // DDI + DDD + numero: 12 digitos na linha fixa antiga, 13 no celular com o
    // nono digito. O `check` aceita a faixa inteira porque o portal tambem
    // atende numero de fora do Brasil, e o formato exato de cada pais nao cabe
    // numa expressao regular — o que nao pode e chegar mascarado.
    check("funcionarios_telefone_valido", sql`telefone is null or telefone ~ '^[0-9]{10,15}$'`),
    // O teto acompanha a legenda do relatorio, que vai ate 91.
    check("funcionarios_situacao_valida", sql`situacao >= 1 and situacao <= 99`),
    /**
     * Escala e inicio de ciclo andam juntos ou nao andam. Escala sem a data de
     * virada nao responde "hoje e dia de trabalho?" — seria um cadastro que
     * parece completo e nao serve para nada; data sem escala nao tem ciclo a
     * comecar. A pendencia legitima e nao ter nenhum dos dois.
     */
    check("funcionarios_escala_com_inicio", sql`(escala_id is null) = (inicio_ciclo is null)`),
  ],
);

/**
 * Por que a pessoa esteve fora. Enum no banco (e nao text livre) pelo mesmo
 * motivo de `area_portal`: um tipo inexistente falha no INSERT, nao so na
 * validacao da aplicacao.
 *
 * Sao tres porque sao tres coisas diferentes na hora de conferir o ponto, e nao
 * por gosto de classificar: ferias sao programadas, o atestado justifica dias
 * ja passados e o INSS tira a pessoa da folha de ponto por semanas. O rotulo de
 * cada um vive em `funcionarios/afastamentos.ts`.
 */
export const afastamentoTipoEnum = pgEnum("afastamento_tipo", ["ferias", "atestado", "inss"]);

/**
 * Um periodo em que a pessoa nao devia bater ponto.
 *
 * E o par que falta para a apuracao nao mentir: a escala diz que terca era dia
 * de trabalho, o relogio nao tem batida nenhuma, e sem isto aqui o dia vira
 * falta. Com o afastamento, vira um dia explicado.
 *
 * **Nao pertence a uma competencia**, ao contrario das marcacoes. Um
 * afastamento do INSS atravessa meses, e prende-lo a um periodo o faria sumir
 * no seguinte — justo quando ele ainda esta valendo. A apuracao cruza por
 * **data**, e nao por competencia.
 *
 * Tambem nao se confunde com `funcionarios.situacao`: aquilo e a foto que a
 * folha manda ("9 = Ferias" hoje), isto e o intervalo com inicio e fim. A folha
 * nao diz de quando ate quando, e e disso que a apuracao precisa.
 */
export const afastamentos = pgTable(
  "afastamentos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    funcionarioId: uuid("funcionario_id")
      .notNull()
      // `cascade`, e nao `restrict` como as outras FKs: o afastamento nao
      // explica nada sozinho — sem a pessoa ele e uma linha orfa, e nao um
      // registro historico a preservar.
      .references(() => funcionarios.id, { onDelete: "cascade" }),
    tipo: afastamentoTipoEnum("tipo").notNull(),
    /** Ambas inclusivas: um afastamento de um dia so tem inicio igual ao fim. */
    dataInicio: date("data_inicio", { mode: "string" }).notNull(),
    dataFim: date("data_fim", { mode: "string" }).notNull(),
    /** O numero do atestado, o beneficio do INSS — o que ajudar a conferir depois. */
    observacao: text("observacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Como a apuracao consulta: os afastamentos de uma pessoa, em ordem.
    index("afastamentos_funcionario_idx").on(tabela.funcionarioId, tabela.dataInicio),
    check("afastamentos_periodo_valido", sql`data_fim >= data_inicio`),
    /**
     * Nao ha constraint impedindo dois afastamentos sobrepostos da mesma
     * pessoa: exigiria `btree_gist` e um `exclude using gist`, extensao a mais
     * para um problema que nao corrompe nada — um dia coberto duas vezes
     * continua sendo um dia coberto. A action recusa a sobreposicao porque ela
     * quase sempre e engano de digitacao, e nao porque o banco precise.
     */
  ],
);

export type Empresa = typeof empresas.$inferSelect;
export type NovaEmpresa = typeof empresas.$inferInsert;
export type Funcionario = typeof funcionarios.$inferSelect;
export type NovoFuncionario = typeof funcionarios.$inferInsert;
export type Afastamento = typeof afastamentos.$inferSelect;
export type AfastamentoTipo = (typeof afastamentoTipoEnum.enumValues)[number];
