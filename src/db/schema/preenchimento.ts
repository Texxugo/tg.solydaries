import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { competencias } from "./competencias";
import { eventos } from "./eventos";
import { funcionarios } from "./funcionarios";
import { funcaoTurmaEnum, funcoesPosto } from "./postos";
import { usuarios } from "./usuarios";

/**
 * O freelancer: quem cobre um posto sem estar na folha.
 *
 * Cadastro deliberadamente magro — nome e, quando ha, o codigo pelo qual a
 * operacao o chama ("18", "606"). Nao tem CPF, matricula nem empresa porque
 * exigi-los travaria justamente o caso de uso: o freela entra na grade no dia
 * em que aparece, e quem monta a escala nao tem a documentacao dele em maos.
 *
 * Existe como tabela, e nao como texto solto na linha da grade, para que o
 * mesmo freelancer seja reencontravel no mes seguinte: como texto, "Joao" de
 * agosto e "Joao " de setembro seriam duas pessoas, e ninguem saberia quantas
 * diarias cada um fez.
 */
export const freelancers = pgTable(
  "freelancers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nome: text("nome").notNull(),
    /** O numero pelo qual a operacao o chama na planilha. Opcional e unico. */
    codigo: text("codigo"),
    /** Mesmo formato de `funcionarios.telefone`: so digitos, com DDI. */
    telefone: text("telefone"),
    observacao: text("observacao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("freelancers_nome_unico").on(sql`lower(${tabela.nome})`),
    uniqueIndex("freelancers_codigo_unico").on(sql`lower(${tabela.codigo})`),
    check("freelancers_telefone_valido", sql`telefone is null or telefone ~ '^[0-9]{10,15}$'`),
  ],
);

/**
 * Uma linha da grade: uma pessoa dentro de uma funcao de posto, numa
 * competencia.
 *
 * **Dado datado**: toda leitura filtra por `competenciaEmVigor()`, ao contrario
 * de postos, eventos e freelancers. Virar a competencia copia as linhas para
 * a nova (`levarGradeAdiante()`) — o efetivo do posto segue — mas nao as
 * celulas: o preenchimento da anterior continua inteiro la, para quem
 * consultar o periodo.
 *
 * A pessoa e um funcionario **ou** um freelancer, nunca os dois e nunca nenhum
 * (`check` abaixo). Sao duas colunas, e nao uma coluna polimorfica com um campo
 * "tipo", porque as duas tem integridade referencial de verdade: referencia
 * solta so daria as caras na leitura.
 */
export const preenchimentoLinhas = pgTable(
  "preenchimento_linhas",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    funcaoId: uuid("funcao_id")
      .notNull()
      .references(() => funcoesPosto.id, { onDelete: "restrict" }),
    funcionarioId: uuid("funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "restrict" }),
    /**
     * Qual das duas escalas da funcao esta pessoa segue.
     *
     * E o unico campo de escala que a linha tem: o ciclo, o horario e a ancora
     * sao da funcao (`funcao_ciclos`), e o que a pessoa escolhe e a **turma**.
     * E assim que as duas metades de um 12x36 se alternam sem que nenhuma delas
     * precise redigitar o contrato — e sem que uma pessoa possa, sem querer,
     * inventar um padrao que o posto nao tem.
     */
    turma: funcaoTurmaEnum("turma").notNull().default("escala"),
    /**
     * A sigla que o previsto desta pessoa escreve nos dias de trabalho — o `N`
     * de quem cobre a noite numa grade em que os outros sao `D`.
     *
     * `null` herda a da funcao (`funcoes_posto.evento_trabalho_id`, e na falta
     * dela o `padrao` de natureza `trabalho`), que continua sendo o caso comum.
     * Existe na linha, e nao so na funcao, porque o mesmo turno de um posto
     * pode ter metade das pessoas de dia e metade de noite seguindo o mesmo
     * ciclo: separar em duas funcoes so para trocar a letra obrigaria a
     * duplicar as vigencias e partir a grade em duas faixas.
     *
     * So escolhe a **sigla**. Ciclo e folgas continuam sendo da vigencia. O
     * horario da vigencia descreve o turno da funcao, e nao o desta pessoa: com
     * sigla propria, o previsto usa `hora_entrada`/`hora_saida` da linha, e
     * sai sem horario quando elas estao vazias.
     */
    eventoTrabalhoId: uuid("evento_trabalho_id").references(() => eventos.id, {
      onDelete: "restrict",
    }),
    /**
     * O horario do previsto de quem escreve outra sigla — o 18:00-06:00 do `N`
     * numa portaria de `D` 06:00-18:00. Mesmo ciclo da turma, outro turno.
     *
     * So vale com `evento_trabalho_id` diferente da sigla da funcao: com a sigla
     * da funcao, o horario e o da vigencia, e um segundo horario na linha seria
     * uma versao concorrente do contrato. A action grava vazio nesse caso.
     */
    horaEntrada: time("hora_entrada"),
    horaSaida: time("hora_saida"),
    /**
     * O que explica a linha fora das celulas: "TROCA DE ESCALA",
     * "FERIAS DE 01/09 A 30/09", "TRAMITACAO DE RESCISAO". E a faixa de texto
     * que a planilha escreve por cima dos dias.
     */
    observacao: text("observacao"),
    /** Posicao dentro do bloco. Empate desempata pelo nome da pessoa. */
    ordem: smallint("ordem").notNull().default(0),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Como a grade consulta: as linhas de um bloco, na ordem em que aparecem.
    index("preenchimento_linhas_bloco_idx").on(tabela.competenciaId, tabela.funcaoId, tabela.ordem),
    // A mesma pessoa nao entra duas vezes no mesmo bloco — seriam duas escalas
    // simultaneas para o mesmo dia, sem como dizer qual vale. Entrar em **outra**
    // funcao continua valendo: e assim que uma troca de posto no meio do periodo
    // e registrada, com um bloco encerrando e o outro comecando.
    //
    // Parciais porque uma das duas colunas e sempre nula, e `null` nao repete em
    // indice unico: sem o `where`, o indice deixaria a mesma pessoa entrar duas
    // vezes desde que a outra coluna estivesse vazia — que e sempre.
    uniqueIndex("preenchimento_linhas_funcionario_unico")
      .on(tabela.competenciaId, tabela.funcaoId, tabela.funcionarioId)
      .where(sql`funcionario_id is not null`),
    uniqueIndex("preenchimento_linhas_freelancer_unico")
      .on(tabela.competenciaId, tabela.funcaoId, tabela.freelancerId)
      .where(sql`freelancer_id is not null`),
    // Encontrar em que blocos uma pessoa esta, sem varrer a competencia.
    index("preenchimento_linhas_funcionario_idx").on(tabela.funcionarioId),
    index("preenchimento_linhas_freelancer_idx").on(tabela.freelancerId),
    /**
     * Um dono, e um so. Linha sem ninguem nao e escala de pessoa nenhuma; linha
     * com os dois nao responde de quem e o dia. Mesma familia do
     * `funcionarios_escala_com_inicio`: a regra que so existe com os campos
     * juntos vive no banco, e nao na action que por acaso lembrou dela.
     */
    check(
      "preenchimento_linhas_uma_pessoa",
      sql`(funcionario_id is null) <> (freelancer_id is null)`,
    ),
    /**
     * O horario da linha anda inteiro ou nao anda, como o da celula
     * (`preenchimento_dias_horario_completo`); e entrada igual a saida seria
     * "24h ou nenhuma", como na escala. Horario sem sigla propria nao chega a
     * ser recusado aqui: a action o limpa, e a leitura o ignora.
     */
    check(
      "preenchimento_linhas_horario_completo",
      sql`(hora_entrada is null) = (hora_saida is null)`,
    ),
    check(
      "preenchimento_linhas_horario_valido",
      sql`hora_entrada is null or hora_entrada <> hora_saida`,
    ),
  ],
);

/**
 * Uma celula da grade: o que uma pessoa **fez** num dia.
 *
 * So o realizado ocupa linha aqui. O previsto e derivado das vigencias da
 * funcao a cada leitura — como a apuracao do ponto e derivada das marcacoes —,
 * e grava-lo criaria a versao velha do fato: corrigir o contrato do posto
 * deixaria o mes ja montado discordando do que o posto passou a exigir.
 *
 * A linha so existe quando ha algo a dizer sobre aquele dia — dia em branco nao
 * tem linha, do mesmo jeito que ocorrencia sem tratativa nao tem linha em
 * `tratativas_ponto`. Gravar trinta e uma celulas vazias por pessoa seria
 * gravar a ausencia de preenchimento.
 *
 * `data` guarda o dia inteiro em vez de "coluna 5 do periodo": a competencia
 * pode ter o periodo corrigido, e uma posicao relativa passaria a apontar para
 * outro dia sem nada acusar — o mesmo motivo pelo qual `marcacoes` guarda data,
 * e nao deslocamento.
 */
export const preenchimentoDias = pgTable(
  "preenchimento_dias",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    linhaId: uuid("linha_id")
      .notNull()
      // `cascade`, e nao `restrict`: a celula nao explica nada sozinha — sem a
      // linha ela e um dia sem dono. Mesma razao de `afastamentos`.
      .references(() => preenchimentoLinhas.id, { onDelete: "cascade" }),
    /** `date` em `mode: "string"`, pelo mesmo motivo das datas de `competencias`. */
    data: date("data", { mode: "string" }).notNull(),
    /**
     * O evento daquele dia. Anulavel porque ha celula que so tem horario ou so
     * tem observacao — o dia em que a pessoa entrou fora do padrao e ninguem
     * classificou ainda.
     */
    eventoId: uuid("evento_id").references(() => eventos.id, { onDelete: "restrict" }),
    /**
     * O horario daquele dia, quando ele difere do horario da funcao. Os dois
     * andam juntos ou nao andam (`check` abaixo): entrada sem saida nao mede
     * jornada nenhuma.
     *
     * `time` sem fuso, como em `escalas`: horario de escala nao tem dia a que
     * pertencer, e converter para `Date` so deixaria o horario de verao mover a
     * jornada. A virada de turno se le do proprio par, como la
     * (`saida < entrada`).
     */
    horaEntrada: time("hora_entrada"),
    horaSaida: time("hora_saida"),
    /**
     * A outra pessoa do dia: quem cobriu o extra, com quem se trocou o turno,
     * quem substituiu. Um funcionario **ou** um freelancer, nunca os dois —
     * mesmo par de colunas (e mesma razao) do dono da linha.
     *
     * Anulaveis porque a maioria dos dias nao tem contraparte nenhuma: um `D`
     * comum e so um `D`. Quais eventos a pedem esta em `eventos.exige_pessoa`,
     * e nao numa lista de siglas aqui — sigla e cadastro, e a operacao inventa
     * as suas.
     */
    pessoaFuncionarioId: uuid("pessoa_funcionario_id").references(() => funcionarios.id, {
      onDelete: "restrict",
    }),
    pessoaFreelancerId: uuid("pessoa_freelancer_id").references(() => freelancers.id, {
      onDelete: "restrict",
    }),
    /**
     * O bloco para onde a pessoa foi naquele dia — a troca de posto. E o par de
     * `pessoa_*`: um diz com quem, o outro diz para onde.
     *
     * Guarda a **funcao**, e nao o posto, pelo mesmo motivo de
     * `preenchimento_linhas`: e a funcao que tem lista de gente e horario, e e
     * ela que a grade desenha.
     */
    funcaoDestinoId: uuid("funcao_destino_id").references(() => funcoesPosto.id, {
      onDelete: "restrict",
    }),
    /** O bilhete da celula: "COBRIU EM TI", "SEM COBERTURA", "FORTALEZA II". */
    observacao: text("observacao"),
    /**
     * O intervalo intrajornada que **nao** foi usufruido naquele dia: a pessoa
     * ficou no posto direto.
     *
     * E a excecao, como a caixa de Extra ao lado dela na tela — o dia em que o
     * intervalo aconteceu continua sendo `false`, que e a esmagadora maioria.
     *
     * Booleano, e nao minutos: quantos minutos o intervalo teria ja esta
     * declarado no contrato da funcao e na escala cadastrada, e repeti-los aqui
     * criaria a versao velha do fato no dia em que a jornada mudasse — mesma
     * razao pela qual a celula nao guarda a duracao do dia. O que a grade sabe,
     * e so ela, e que naquele dia ele nao houve.
     *
     * Ao contrario do extra, nao vira lancamento em modulo nenhum: fica no dia
     * e no historico dele, e quem fecha a folha o le junto com o resto da grade.
     */
    intrajornada: boolean("intrajornada").notNull().default(false),
    /**
     * O dia em que a pessoa trabalhou no lugar deste, quando a sigla pede
     * (`eventos.exige_dia_trabalhado` — a TE). Esta celula e o dia de trabalho
     * previsto em que ela folgou; a data aqui e a folga em que ela trabalhou.
     *
     * A contagem le os dois dias a partir desta coluna: este conta como folga
     * (pela natureza do evento) e o apontado conta como trabalho — e como folga
     * trabalhada, quando o previsto dizia folga. O dia apontado **nao ganha
     * celula propria**: duas linhas para o mesmo fato poderiam discordar, e
     * apagar uma deixaria a outra mentindo.
     */
    dataTrabalhada: date("data_trabalhada", { mode: "string" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Uma celula por dia. E tambem o indice pelo qual a grade carrega o bloco
    // inteiro: `linha_id` esta a esquerda.
    uniqueIndex("preenchimento_dias_celula_unica").on(tabela.linhaId, tabela.data),
    // Ler um dia da operacao inteira ("quem esta escalado no dia 25?") sem
    // varrer a competencia.
    index("preenchimento_dias_data_idx").on(tabela.data),
    // Um dia trabalhado serve a uma troca so: duas TE apontando a mesma folga
    // contariam o mesmo dia de trabalho duas vezes.
    uniqueIndex("preenchimento_dias_trabalhado_unico")
      .on(tabela.linhaId, tabela.dataTrabalhada)
      .where(sql`data_trabalhada is not null`),
    check(
      "preenchimento_dias_trabalhado_outro_dia",
      sql`data_trabalhada is null or data_trabalhada <> data`,
    ),
    check(
      "preenchimento_dias_horario_completo",
      sql`(hora_entrada is null) = (hora_saida is null)`,
    ),
    /**
     * Celula sem nada nao existe: seria indistinguivel de dia em branco e
     * ocuparia uma linha para dizer que nao ha o que dizer. Quem apaga os tres
     * campos apaga a celula.
     *
     * `intrajornada` conta como conteudo: "nao teve intervalo" e uma coisa a
     * dizer sobre o dia, mesmo sem sigla nenhuma. Sem ela na lista, marcar so a
     * caixa apagaria a celula em silencio.
     */
    check(
      "preenchimento_dias_nao_vazia",
      sql`evento_id is not null or hora_entrada is not null or observacao is not null
        or pessoa_funcionario_id is not null or pessoa_freelancer_id is not null
        or funcao_destino_id is not null or intrajornada`,
    ),
    /**
     * A contraparte e uma so. Mesma familia do `preenchimento_linhas_uma_pessoa`,
     * com a diferenca de que aqui **nenhuma** e o caso comum: a maioria dos dias
     * nao tem com quem se trocar.
     */
    check(
      "preenchimento_dias_uma_pessoa",
      sql`pessoa_funcionario_id is null or pessoa_freelancer_id is null`,
    ),
  ],
);

/**
 * O historico de uma celula do realizado: uma linha por alteracao, so
 * acrescentada.
 *
 * Guarda o **estado depois** da mudanca, e nao "o que mudou": o que mudou e a
 * diferenca entre duas linhas vizinhas, e calcular na leitura evita gravar a
 * mesma conclusao duas vezes — mesma razao pela qual a apuracao do ponto nao
 * tem coluna de falta. Pelo mesmo motivo nao ha coluna `acao`: a primeira linha
 * de uma celula e a criacao, e a linha com tudo nulo e a exclusao.
 *
 * Existe porque a escala do dia a dia e reescrita o tempo todo — a cobertura
 * que mudou de nome, o turno que voltou atras, a falta que virou atestado — e
 * "quem mudou isso, e quando?" nao pode depender da memoria de quem preencheu.
 * A celula continua mostrando so o estado atual: o historico e o que esta
 * **atras** dela, e por isso nao atrapalha a leitura da escala inteira.
 */
export const preenchimentoAlteracoes = pgTable(
  "preenchimento_alteracoes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    linhaId: uuid("linha_id")
      .notNull()
      // `cascade` como a propria celula: sem a linha, e historico de um dia sem
      // dono. Quem sai do bloco leva o que fez nele.
      .references(() => preenchimentoLinhas.id, { onDelete: "cascade" }),
    data: date("data", { mode: "string" }).notNull(),
    /**
     * O estado da celula **depois** desta alteracao. Todo nulo significa que a
     * celula foi apagada.
     *
     * As FKs sao `set null`, e nao `restrict`: o historico nao pode impedir que
     * um evento ou uma funcao sejam removidos um dia, e uma referencia perdida
     * aqui degrada a leitura de uma linha antiga — nao corrompe a escala.
     */
    eventoId: uuid("evento_id").references(() => eventos.id, { onDelete: "set null" }),
    horaEntrada: time("hora_entrada"),
    horaSaida: time("hora_saida"),
    pessoaFuncionarioId: uuid("pessoa_funcionario_id").references(() => funcionarios.id, {
      onDelete: "set null",
    }),
    pessoaFreelancerId: uuid("pessoa_freelancer_id").references(() => freelancers.id, {
      onDelete: "set null",
    }),
    funcaoDestinoId: uuid("funcao_destino_id").references(() => funcoesPosto.id, {
      onDelete: "set null",
    }),
    observacao: text("observacao"),
    /** O dia trabalhado da TE, como estava depois desta alteracao. */
    dataTrabalhada: date("data_trabalhada", { mode: "string" }),
    /**
     * Se, depois desta alteracao, o dia lancava hora extra na conferencia.
     *
     * Faz parte do estado da celula como qualquer outro campo: marcar o extra
     * cria horas a pagar, e "quem marcou isso, e quando?" e justamente o que o
     * historico existe para responder. Sem a coluna, a linha diria que nada
     * mudou num dia em que o extra entrou ou saiu.
     */
    extra: boolean("extra").notNull().default(false),
    /**
     * Se, depois desta alteracao, o dia dizia que o intervalo intrajornada nao
     * foi usufruido. Estado da celula como os demais campos, e pelo mesmo
     * motivo: sem a coluna, a linha diria que nada mudou num dia em que a caixa
     * foi marcada ou desmarcada.
     */
    intrajornada: boolean("intrajornada").notNull().default(false),
    /** Quem alterou. `set null` porque a alteracao aconteceu mesmo que a conta suma. */
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // Como o modal do dia consulta: o historico daquela celula, do mais novo
    // para o mais antigo.
    index("preenchimento_alteracoes_celula_idx").on(tabela.linhaId, tabela.data, tabela.criadoEm),
  ],
);

export type Freelancer = typeof freelancers.$inferSelect;
export type NovoFreelancer = typeof freelancers.$inferInsert;
export type PreenchimentoLinha = typeof preenchimentoLinhas.$inferSelect;
export type PreenchimentoDia = typeof preenchimentoDias.$inferSelect;
export type PreenchimentoAlteracao = typeof preenchimentoAlteracoes.$inferSelect;
