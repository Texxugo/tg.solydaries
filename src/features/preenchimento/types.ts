import type { EventoCor, EventoNatureza, FuncaoTurma } from "@/db/schema";

import type { SiglasDoPrevisto, VigenciaDoCiclo } from "./previsto";
import type { BatidaDoTurno, JanelaDoRelogio } from "./relogio";

/**
 * Contratos compartilhados entre as Server Actions, a DAL e os componentes da
 * grade.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo/constante de la quebra o build.
 */

/**
 * Um dia do previsto: o que o contrato do posto exige naquela data.
 *
 * **Nao existe no banco.** Sai das vigencias da funcao e da turma da linha
 * a cada leitura, pela mesma razao que a apuracao do ponto nao tem coluna de
 * falta: mudou o contrato, mudou o previsto do periodo inteiro, sem uma linha
 * reescrita. `null` na data significa que a funcao nao declara vigencia nenhuma.
 */
export type PrevistoDoDia = {
  eventoCodigo: string;
  eventoCor: EventoCor;
  natureza: EventoNatureza;
  /**
   * `HH:MM`, so nos dias de trabalho — a folga nao tem jornada. Em branco
   * tambem no dia de trabalho de quem escreve outra sigla que nao a da funcao:
   * o horario da vigencia e o do turno da funcao, e nao o desta pessoa.
   */
  entrada: string | null;
  saida: string | null;
};

/** Um dia do realizado, como esta gravado. */
export type CelulaDaGrade = {
  data: string;
  eventoId: string | null;
  /** A sigla, ja resolvida: a celula desenha o codigo, e nao o uuid. */
  eventoCodigo: string | null;
  eventoCor: EventoCor | null;
  /** `HH:MM`, normalizado na leitura — o Postgres devolve `HH:MM:SS`. */
  horaEntrada: string | null;
  horaSaida: string | null;
  /** `f:<uuid>` ou `l:<uuid>`, no formato que o campo do modal usa. */
  pessoa: string;
  /** O nome dela, ja resolvido, para a celula nao precisar da lista inteira. */
  pessoaNome: string | null;
  destinoId: string | null;
  destinoNome: string | null;
  observacao: string | null;
  /**
   * Se este dia lanca hora extra na conferencia.
   *
   * Nao e coluna de `preenchimento_dias`: sai da existencia da linha em
   * `extras` que aponta para a celula. O extra e o registro; a celula so diz
   * que ele veio dali, e um booleano a parte poderia discordar dele.
   */
  extra: boolean;
  /**
   * Se o intervalo intrajornada **nao** foi usufruido neste dia: a pessoa ficou
   * no posto direto.
   *
   * Esta e coluna de `preenchimento_dias`, ao contrario do extra: ela nao vira
   * lancamento em modulo nenhum, entao nao ha outro registro de onde le-la.
   */
  intrajornada: boolean;
  /**
   * A folga em que a pessoa trabalhou no lugar deste dia (`YYYY-MM-DD`), quando
   * a sigla pede — a TE. O dia apontado nao tem celula: e a partir daqui que a
   * grade o desenha e o conta como trabalho.
   */
  dataTrabalhada: string | null;
};

/** Uma linha da grade: a pessoa, o previsto dela e o que de fato aconteceu. */
export type LinhaDaGrade = {
  id: string;
  /** Nome de quem quer que seja o dono da linha — funcionario ou freelancer. */
  nome: string;
  /** Matricula do funcionario ou codigo do freelancer. `null` quando nao ha. */
  identificacao: string | null;
  freelancer: boolean;
  funcionarioId: string | null;
  freelancerId: string | null;
  /** Qual das duas escalas da funcao esta pessoa segue. */
  turma: FuncaoTurma;
  /** A sigla propria dos dias de trabalho (o `N` numa grade de `D`). `null` herda a da funcao. */
  eventoTrabalhoId: string | null;
  /**
   * O horario proprio da linha (`HH:MM`), que o previsto usa quando a sigla e
   * outra que nao a da funcao. `null` sem horario proprio.
   */
  horario: { entrada: string; saida: string } | null;
  /** Como essa sigla se chama ("Noturno"), para a coluna do nome marcar quem foge da funcao. */
  eventoTrabalhoRotulo: string | null;
  observacao: string | null;
  ordem: number;
  /** Derivado das vigencias da funcao, indexado por data. Vazio quando nao ha vigencia. */
  previsto: Record<string, PrevistoDoDia>;
  /** Gravado, indexado por data. */
  realizado: Record<string, CelulaDaGrade>;
  /**
   * As batidas do relogio, por dia de **turno** (a saida da madrugada volta ao
   * dia em que o turno comecou). `null` para freelancer, que nao bate ponto;
   * vazio quando nao ha arquivo importado ou a pessoa nao bateu.
   */
  batidas: Record<string, BatidaDoTurno[]> | null;
};

/**
 * Uma funcao dentro da grade: a faixa que separa os turnos de um mesmo posto.
 *
 * E um grupo de linhas, e nao uma tabela propria: a escala de um lugar se le
 * inteira, com um cabecalho de funcao entre um turno e outro.
 */
export type GrupoDaGrade = {
  funcaoId: string;
  funcaoNome: string;
  /**
   * O contrato da funcao ao longo do tempo — as duas turmas na mesma lista.
   *
   * Vem inteiro para a tela porque o modal e a aba de pessoas precisam saber o
   * que cada turma exige, e nao so o que vale hoje: a escala muda no meio do
   * periodo, e a grade desenha os dois lados da troca.
   */
  vigencias: VigenciaDoCiclo[];
  /** O contrato da turma `escala`, ja montado. `null` quando nao ha vigencia. */
  rotuloDoCiclo: string | null;
  /**
   * As siglas que o previsto escreve quando a linha nao escolhe outra: a de
   * trabalho da funcao (ou o `padrao` de trabalho) e o `padrao` de folga.
   * `null` sem as duas — e ai o previsto nasce em branco.
   *
   * Vem para a tela porque a aba Pessoas desenha o previsto da escolha antes de
   * grava-la, com a mesma `derivarPrevisto()` da DAL.
   */
  siglas: SiglasDoPrevisto | null;
  linhas: LinhaDaGrade[];
};

/** O posto inteiro pronto para desenhar — uma grade so, com as funcoes dentro. */
export type GradeDoPosto = {
  /**
   * De que posto e a grade. Vem junto porque sai do mesmo join das funcoes:
   * uma consulta a parte so para o cabecalho seria paga de novo a cada dia
   * gravado, ja que `refresh()` redesenha a tela inteira.
   */
  posto: { id: string; codigo: string; nome: string };
  /** As datas da competencia, do dia 21 ao 20 — uma coluna cada. Vazio sem competencia aberta. */
  dias: string[];
  grupos: GrupoDaGrade[];
  /**
   * Os dias que os arquivos de ponto cobrem nesta competencia. `null` sem carga
   * nenhuma — e ai a grade nao cruza com o relogio, em vez de acusar trinta dias
   * "sem batida" que so ainda nao foram importados.
   */
  janelaDoRelogio: JanelaDoRelogio | null;
  /**
   * Os dias sinalizados com o "!" do modal, por `chaveDaCelula()`. Dia sem
   * marca nao tem chave. Vem com a grade, como as celulas: abrir o dia e ver a
   * marca nao pode custar uma consulta.
   */
  sinalizacoes: Record<string, SinalizacaoDaGrade>;
};

/**
 * Em que pe esta a marca de um dia sinalizado. Resolvida continua existindo —
 * sai so dos pendentes da tela "Dias sinalizados".
 */
export type EstadoDaSinalizacao = "pendente" | "resolvida";

/** A marca de um dia, como a grade e o modal a leem. */
export type SinalizacaoDaGrade = {
  estado: EstadoDaSinalizacao;
  /** O que conferir, escrito por quem sinalizou. Vai na mensagem ao responsavel. */
  observacao: string | null;
};

/** O retorno do "!" do modal e da observacao: a marca como ficou, ou a recusa. */
export type SinalizacaoState =
  { ok: true; sinalizacao: SinalizacaoDaGrade | null } | { ok: false; mensagem: string };

/** Quantos caracteres a observacao da marca aceita (o `check` do banco repete). */
export const OBSERVACAO_DA_SINALIZACAO_MAX = 200;

/**
 * Um funcionario que pode entrar num bloco — e que pode ser a contraparte de um
 * dia.
 *
 * A mesma lista serve as duas coisas de proposito: sao as mesmas pessoas, e
 * mandar duas versoes dela para o navegador dobraria o payload de trezentos
 * nomes a cada dia gravado. O campo do dia embute a origem no valor
 * (`valorDaPessoa()`), que e o que o `<select>` precisa.
 */
export type PessoaDisponivel = {
  id: string;
  nome: string;
  identificacao: string | null;
  empresaNome: string | null;
};

/**
 * Em que turno do posto a pessoa entra.
 *
 * Sai dos proprios grupos da grade, e nao de uma leitura de `postos`: sao as
 * mesmas funcoes ativas, ja carregadas — e a grade e a aba de inclusao nunca
 * podem discordar sobre quais existem.
 */
export type FuncaoParaInclusao = { id: string; nome: string };

/**
 * Uma pessoa que a busca do modal encontrou — funcionario ou freelancer, na
 * mesma lista.
 *
 * O tipo vai embutido no `valor` (`f:` e `l:`) porque o campo e um so, e o
 * `check preenchimento_dias_uma_pessoa` diz exatamente isso no banco.
 */
export type PessoaEncontrada = {
  /** `f:<uuid>` ou `l:<uuid>`. */
  valor: string;
  nome: string;
  identificacao: string | null;
  freelancer: boolean;
};

/**
 * Quantos nomes uma busca devolve.
 *
 * Teto, e nao pagina: quem digita tres letras e ve vinte nomes digita a quarta,
 * e nao pagina uma lista. Paginar aqui seria oferecer navegacao para o caso em
 * que a busca falhou.
 */
export const PESSOAS_POR_BUSCA = 20;

/**
 * Quantas letras a busca espera antes de ir ao banco.
 *
 * Com uma so, o termo casaria com quase todo o cadastro e o teto devolveria
 * vinte nomes arbitrarios — a lista pareceria errada em vez de curta.
 */
export const TERMO_MINIMO = 2;

/** Milissegundos de silencio antes de a busca sair. */
export const ESPERA_DA_BUSCA = 250;

/** Um freelancer ja cadastrado. Sem empresa: ele nao esta na folha de ninguem. */
export type FreelancerDisponivel = {
  id: string;
  nome: string;
  identificacao: string | null;
};

export type IncluirPessoaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<Record<"funcionarioId" | "nome" | "codigo", string[]>>;
  /** Muda a cada inclusao concluida, para remontar o formulario limpo. */
  chave?: string;
};

export const estadoInicialIncluirPessoa: IncluirPessoaState = { status: "idle" };

export type LinhaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialLinha: LinhaState = { status: "idle" };

/**
 * O retorno da gravacao de um dia.
 *
 * Continua tendo `erros` por campo — o dia recusa por motivos diferentes —, mas
 * quem os le e a grade, e nao o modal: ele nao espera a resposta (pode estar em
 * outro dia quando ela chega), e a tela ja barra antes o que ela sabe barrar
 * (`required`). O que chega aqui vira aviso.
 *
 * **A resposta carrega o que mudou, e a action nao chama `refresh()`.** Gravar
 * um dia so muda duas coisas na tela — a celula e o total da linha —, e as duas
 * a grade desenhou no clique. Redesenhar a rota inteira para trazer isso
 * custava mais do que a gravacao (uma ida de
 * ~60ms virava ~300ms), e o resto da tela nao muda quando um dia e preenchido.
 */
export type DiaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Partial<
    Record<
      "eventoId" | "horario" | "pessoa" | "destino" | "observacao" | "extra" | "dataTrabalhada",
      string[]
    >
  >;
  /**
   * A celula a que esta resposta se refere (`chaveDaCelula()`), inclusive na
   * recusa: e por ela que a grade sabe qual dia promover — ou desfazer.
   */
  chave?: string;
};

export const estadoInicialDia: DiaState = { status: "idle" };

/**
 * O retorno de "preencher varios dias". `preenchidos` diz quantos dias de fato
 * ganharam registro: zero nao e erro — pode ser que o intervalo inteiro ja
 * estivesse preenchido —, mas tambem nao e motivo para fechar o formulario.
 */
export type PreencherDiasState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  preenchidos?: number;
};

export const estadoInicialPreencherDias: PreencherDiasState = { status: "idle" };

/** Rota da area de preenchimento. */
export const ROTA_PREENCHIMENTO = "/preenchimento";

/** A area do portal a que este modulo pertence. */
export const AREA_PREENCHIMENTO = "preenchimento" as const;

export const SEM_COMPETENCIA =
  "Nenhuma competencia aberta: abra a competencia do periodo para montar a escala.";
