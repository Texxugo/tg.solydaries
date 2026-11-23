import type { MensagemDestino, MensagemStatus, TratativaStatus } from "@/db/schema";
import type { CompetenciaResumo } from "@/features/competencias/types";

import type { ApuracaoDoFuncionario, DiaApurado, Gravidade, TipoDeDivergencia } from "./apuracao";
import type { BloqueioDoDestino, DestinoDaMensagem, PrazoDeRetorno } from "./contato";
import type { LinhaRecusada } from "./relatorio";
import type { SemSugestao, SugestaoDeEscala } from "./inferencia";

/**
 * Contratos compartilhados entre as Server Actions, as queries e os
 * formularios.
 *
 * Vivem fora de `actions.ts` porque um arquivo "use server" so pode exportar
 * funcoes async: exportar um tipo ou uma constante de la quebra o build.
 */

/** A area do portal a que este modulo pertence. */
export const AREA_PONTO = "ponto" as const;

/** Rota da area. */
export const ROTA_PONTO = "/ponto";

/** Quantos funcionarios cabem em uma pagina da conferencia. */
export const FUNCIONARIOS_POR_PAGINA = 25;

/** Teto do upload. O relatorio de um mes inteiro nao passa de algumas centenas de KB. */
export const TAMANHO_MAXIMO_ARQUIVO = 5 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Conferencia                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Em que pe esta a apuracao de uma pessoa. E o que ordena a lista: quem tem
 * pendencia primeiro, porque a tela existe para resolve-las.
 *
 * `sem_escala` e a pendencia que **impede** a leitura — sem escala e inicio de
 * ciclo nao ha contra o que ler as batidas —, mas e pendencia de cadastro e nao
 * de ponto, e por isso nao encabeca a lista. Ver `PESO_DO_STATUS`, em
 * `queries.ts`.
 */
export type StatusDaApuracao = "sem_escala" | "com_pendencia" | "atencao" | "conforme";

const CATALOGO_STATUS: Record<StatusDaApuracao, { rotulo: string; descricao: string }> = {
  sem_escala: {
    rotulo: "Sem escala",
    descricao: "Sem escala e inicio de ciclo, nao ha contra o que ler as marcacoes.",
  },
  com_pendencia: {
    rotulo: "Com pendencia",
    descricao: "Tem dia que nao fecha: falta, marcacao faltando ou trabalho em folga.",
  },
  atencao: {
    rotulo: "Conferir",
    descricao: "Fecha, mas com hora extra, debito ou intrajornada abaixo do previsto.",
  },
  conforme: { rotulo: "Conforme", descricao: "Todos os dias do periodo fecham com a escala." },
};

export function rotuloDoStatus(status: StatusDaApuracao) {
  return CATALOGO_STATUS[status].rotulo;
}

export function descricaoDoStatus(status: StatusDaApuracao) {
  return CATALOGO_STATUS[status].descricao;
}

/** A escala de alguem, como a conferencia a exibe. */
export type EscalaDaApuracao = {
  nome: string;
  /** `5x2`, `14 dias` — o mesmo rotulo da lista de escalas. */
  rotuloCiclo: string;
  /** `HH:MM`. */
  entrada: string;
  saida: string;
  /** A jornada atravessa a meia-noite: e o que faz o turno ser lido em dois dias. */
  viradaTurno: boolean;
};

/** Uma linha da conferencia: uma pessoa e o resultado do periodo dela. */
export type ApuracaoResumo = {
  funcionarioId: string;
  nome: string;
  matricula: string;
  empresaId: string;
  empresaNome: string;
  cargo: string | null;
  /** So digitos com DDI, ou `null` — quem esta sem numero nao recebe mensagem. */
  telefone: string | null;
  /** Codigo da folha; o rotulo vem de `funcionarios/situacoes.ts`. */
  situacao: number;
  escala: EscalaDaApuracao | null;
  status: StatusDaApuracao;
  /** Quantas batidas o periodo tem, e quantas delas foram digitadas a mao. */
  batidas: number;
  batidasIncluidas: number;
  diasPrevistos: number;
  faltas: number;
  diasComPendencia: number;
  diasComAtencao: number;
  previstoMinutos: number;
  trabalhadoMinutos: number;
  /** Como o relogio registrou. */
  saldoMinutos: number;
  /** Com as pontas dentro da tolerancia valendo o previsto — o que a tela mostra. */
  saldoToleradoMinutos: number;
};

/**
 * A janela que foi de fato apurada: a intersecao entre o que os arquivos de
 * ponto cobrem e a competencia.
 *
 * `null` quando nenhuma carga aconteceu ainda — e a diferenca entre "ninguem
 * bateu ponto" e "ninguem importou o arquivo", que a tela precisa dizer com
 * todas as letras antes de mostrar trinta faltas para cada pessoa.
 */
export type JanelaApurada = {
  inicio: string;
  fim: string;
  /** Quantas cargas ja entraram nesta competencia. */
  cargas: number;
  /** O fim da competencia ainda nao coberto por arquivo nenhum. */
  diasNaoCobertos: number;
};

/** Os numeros do topo da tela — o periodo inteiro, e nao a pagina. */
export type ResumoDaConferencia = {
  funcionarios: number;
  semEscala: number;
  comPendencia: number;
  comAtencao: number;
  conformes: number;
  /** Divergencias por tipo, da mais frequente para a menos. */
  porTipo: { tipo: TipoDeDivergencia; gravidade: Gravidade; dias: number }[];
};

/** Uma pagina da conferencia, com o que a navegacao e o cabecalho precisam. */
export type PaginaDaConferencia = {
  competencia: CompetenciaResumo | null;
  janela: JanelaApurada | null;
  itens: ApuracaoResumo[];
  total: number;
  pagina: number;
  paginas: number;
  resumo: ResumoDaConferencia;
};

/** A conferencia de uma pessoa: o resumo dela e o dia a dia. */
export type ApuracaoDetalhada = {
  competencia: CompetenciaResumo;
  janela: JanelaApurada;
  resumo: ApuracaoResumo;
  apuracao: ApuracaoDoFuncionario;
};

/**
 * Os filtros da conferencia, todos vindos da URL. Ficam juntos num tipo so
 * porque viajam juntos: cada link da paginacao precisa carregar os outros,
 * senao virar a pagina descartaria o filtro sem avisar. Mesmo arranjo de
 * `FiltrosDeFuncionarios`.
 */
export type FiltrosDePonto = {
  busca: string;
  /** `null` = todas as empresas. */
  empresaId: string | null;
  /** `null` = todos os status. */
  status: StatusDaApuracao | null;
  pagina: number;
};

/** A URL da conferencia com estes filtros — um lugar so para monta-la. */
export function hrefDoPonto(filtros: FiltrosDePonto) {
  const parametros = new URLSearchParams();

  if (filtros.busca) {
    parametros.set("busca", filtros.busca);
  }

  if (filtros.empresaId) {
    parametros.set("empresa", filtros.empresaId);
  }

  if (filtros.status) {
    parametros.set("status", filtros.status);
  }

  if (filtros.pagina > 1) {
    parametros.set("pagina", String(filtros.pagina));
  }

  const consulta = parametros.toString();

  return consulta ? `${ROTA_PONTO}?${consulta}` : ROTA_PONTO;
}

/* -------------------------------------------------------------------------- */
/* Importacao                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Como a confirmacao grava. `acrescentar` so poe o que falta, e e o caminho de
 * sempre; `substituir` faz as batidas do arquivo valerem no recorte que ele
 * cobre — e o que reimportar um relatorio corrigido no relogio precisa.
 *
 * O valor viaja no botao de confirmar (`name="confirmar"`), e nao em estado: o
 * navegador inclui o botao que enviou no `FormData`.
 */
export const MODOS_DA_CARGA = ["acrescentar", "substituir"] as const;
export type ModoDaCarga = (typeof MODOS_DA_CARGA)[number];

/** Quantas linhas de cada grupo a previa detalha antes de virar so um numero. */
export const ITENS_NA_PREVIA = 50;

/** Teto de recusas listadas: arquivo torto nao pode virar uma resposta gigante. */
export const RECUSAS_NA_PREVIA = 200;

/**
 * Um codigo de empresa do relogio que o portal ainda nao sabe de quem e.
 *
 * Bloqueia todas as linhas daquele bloco: sem saber a empresa, a matricula nao
 * identifica ninguem — o codigo 1335 existe em duas empresas e sao duas
 * pessoas. Por isso a previa mostra os codigos com um campo para associa-los,
 * e a associacao e cadastro, gravado de uma vez para sempre.
 */
export type CodigoDesconhecido = {
  codigo: string;
  /** Quantas linhas do arquivo pertencem a este codigo. */
  linhas: number;
  /** Alguns nomes do bloco, para quem confere reconhecer de que empresa e. */
  exemplos: string[];
};

/** Alguem que o arquivo traz e o cadastro nao tem. */
export type MatriculaNaoEncontrada = {
  codigo: string;
  empresa: string;
  matricula: string;
  nome: string;
  /** Quantos dias deste arquivo pertencem a essa matricula. */
  dias: number;
};

/** Uma batida como a previa da substituicao a desenha. */
export type BatidaDoDia = {
  /** `HH:MM`. */
  hora: string;
  incluida: boolean;
};

/**
 * Um dia em que o arquivo e o portal discordam: as batidas que o portal tem e
 * as que o arquivo traz, lado a lado. E o que a substituicao mudaria.
 */
export type DiaAlterado = {
  funcionarioId: string;
  /** O nome como o relogio o escreve: e o que quem conferiu no relogio reconhece. */
  nome: string;
  matricula: string;
  /** `YYYY-MM-DD`. */
  data: string;
  noPortal: BatidaDoDia[];
  noArquivo: BatidaDoDia[];
};

/**
 * O que o arquivo faria com a competencia, mostrado antes de gravar. Nenhuma
 * escrita aconteceu quando isto chega a tela.
 */
export type PreviaDoPonto = {
  arquivo: string;
  /** O periodo que o arquivo declara cobrir. */
  periodo: { inicio: string; fim: string };
  /** O mesmo periodo ja recortado pela competencia — o que sera apurado. */
  janela: { inicio: string; fim: string };
  /** Linhas de marcacao lidas, e quantas o rodape do arquivo diz existirem. */
  registros: number;
  registrosDeclarados: number | null;
  marcacoesLidas: number;
  funcionarios: number;
  marcacoesNovas: number;
  marcacoesJaGravadas: number;
  /**
   * O que so a substituicao faz: batidas que o portal tem e o arquivo nao traz
   * (saem), e batidas iguais na hora com a marca de incluida trocada.
   */
  marcacoesARemover: number;
  marcacoesComMarcaTrocada: number;
  /** Dias e pessoas em que o arquivo discorda do portal, e a amostra deles. */
  diasAlterados: DiaAlterado[];
  totalDiasAlterados: number;
  pessoasAlteradas: number;
  diasAlteradosCortados: boolean;
  /** Linhas cuja data cai fora da competencia em vigor. */
  foraDaCompetencia: number;
  codigosDesconhecidos: CodigoDesconhecido[];
  naoEncontrados: MatriculaNaoEncontrada[];
  naoEncontradosCortados: boolean;
  recusadas: LinhaRecusada[];
  recusasCortadas: boolean;
};

/** O que a importacao de fato gravou. */
export type ResultadoDoPonto = {
  /** `substituir` quando a carga trocou as batidas do recorte pelas do arquivo. */
  modo: ModoDaCarga;
  periodo: { inicio: string; fim: string };
  funcionarios: number;
  marcacoesGravadas: number;
  marcacoesJaGravadas: number;
  /** Batidas que sairam do portal; sempre 0 em `acrescentar`. */
  marcacoesRemovidas: number;
  ignoradas: number;
};

/**
 * O estado da tela de importacao, em duas etapas: `previa` mostra o que vai
 * acontecer, `success` conta o que aconteceu.
 *
 * A confirmacao reenvia o mesmo arquivo, e nao a previa recebida — o que o
 * cliente devolve nao e evidencia (a action e um POST publico) e o cadastro
 * pode ter mudado entre uma tela e outra: e justamente o caso de quem associou
 * um codigo de empresa no meio do caminho.
 */
export type ImportacaoPontoState = {
  status: "idle" | "previa" | "success" | "error";
  mensagem?: string;
  previa?: PreviaDoPonto;
  resultado?: ResultadoDoPonto;
};

export const estadoInicialImportacaoPonto: ImportacaoPontoState = { status: "idle" };

/** Empresa como o campo de associacao a enxerga. */
export type EmpresaParaAssociar = {
  id: string;
  nome: string;
  /** O codigo do relogio que ela ja tem, se tiver. */
  codigo: string | null;
};

/**
 * A associacao entre um codigo do relogio e uma empresa do portal. Tem estado
 * proprio (e action propria) porque e **cadastro**, e nao parte da carga: uma
 * vez feita, vale para todas as importacoes seguintes.
 */
export type AssociarEmpresaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialAssociarEmpresa: AssociarEmpresaState = { status: "idle" };

/* -------------------------------------------------------------------------- */
/* Pendencias e tratativas                                                    */
/* -------------------------------------------------------------------------- */

/** Quantas ocorrencias cabem em uma pagina do painel. */
export const OCORRENCIAS_POR_PAGINA = 30;

/** Rota do painel de pendencias. */
export const ROTA_PENDENCIAS = `${ROTA_PONTO}/pendencias`;

/**
 * A identidade de uma ocorrencia: quem, que dia, que tipo.
 *
 * Nao ha id porque **nao ha tabela de ocorrencias** a que apontar — elas nascem
 * da leitura das batidas contra a escala, a cada requisicao. Esta tripla e o que
 * a tratativa guarda, o que o indice unico protege e o que a URL carrega.
 */
export type ChaveDaOcorrencia = {
  funcionarioId: string;
  /** `YYYY-MM-DD`. */
  data: string;
  tipo: TipoDeDivergencia;
};

/** A URL de uma ocorrencia. A chave inteira viaja no caminho, e nao um id. */
export function hrefDaOcorrencia({ funcionarioId, data, tipo }: ChaveDaOcorrencia) {
  return `${ROTA_PENDENCIAS}/${funcionarioId}/${data}/${tipo}`;
}

/**
 * Uma ocorrencia: um dia de uma pessoa com uma divergencia, ja com a tratativa
 * que alguem registrou sobre ela.
 *
 * As duas metades tem origens diferentes e isso e o ponto: da divergencia para
 * cima tudo e **calculado** a cada leitura (e some se a escala mudar), e do
 * `status` para baixo tudo e **gravado** — o trabalho humano sobre o problema.
 */
export type Ocorrencia = {
  funcionarioId: string;
  nome: string;
  matricula: string;
  empresaId: string;
  empresaNome: string;
  cargo: string | null;
  /** So digitos com DDI, ou `null` — quem esta sem numero nao recebe mensagem. */
  telefone: string | null;
  /** `YYYY-MM-DD`. */
  data: string;
  diaCiclo: number;
  tipo: TipoDeDivergencia;
  gravidade: Gravidade;
  descricao: string;
  /** `aberta` tambem para quem nunca teve linha gravada: a ausencia ja diz isso. */
  status: TratativaStatus;
  observacao: string | null;
  /** Nome de quem registrou a ultima tratativa. */
  responsavel: string | null;
  tratadoEm: Date | null;
  /** Quantas mensagens ja sairam (ou tentaram sair) por causa desta ocorrencia. */
  mensagens: number;
  /** O ultimo envio, para a lista dizer se alguem ja avisou — e se deu certo. */
  ultimaMensagem: { status: MensagemStatus; criadoEm: Date } | null;
  /** Para quem a proxima mensagem iria: o colaborador ou o responsavel do posto. */
  destino: DestinoDaMensagem;
  /** Ate quando se espera o retorno do responsavel. `null` quando nao ha o que esperar. */
  prazo: PrazoDeRetorno | null;
};

/** Os numeros do topo do painel — o periodo inteiro, e nao a pagina. */
export type ResumoDasOcorrencias = {
  total: number;
  abertas: number;
  emTratativa: number;
  encerradas: number;
  impeditivas: number;
  /**
   * Ocorrencias cuja mensagem nao pode sair por falta de telefone ou de
   * cadastro ativo **do destino** — o colaborador, ou o responsavel do posto.
   */
  semTelefone: number;
  /** Ocorrencias com retorno do responsavel esperado e prazo ja vencido. */
  prazosVencidos: number;
  /** Ocorrencias por tipo, da mais frequente para a menos. */
  porTipo: { tipo: TipoDeDivergencia; gravidade: Gravidade; ocorrencias: number }[];
};

/**
 * Os filtros do painel, todos vindos da URL. O status da tratativa viaja como
 * `?tratativa=` e nao como `?status=`: na conferencia `status` ja significa
 * outra coisa (o pe em que esta a apuracao de uma pessoa), e dois parametros
 * com o mesmo nome e significados diferentes so trocariam as pernas de quem
 * copia uma URL.
 */
export type FiltrosDeOcorrencias = {
  busca: string;
  empresaId: string | null;
  tratativa: TratativaStatus | null;
  gravidade: Gravidade | null;
  tipo: TipoDeDivergencia | null;
  pagina: number;
};

/** A URL do painel com estes filtros — um lugar so para monta-la. */
export function hrefDasPendencias(filtros: FiltrosDeOcorrencias) {
  const parametros = new URLSearchParams();

  if (filtros.busca) {
    parametros.set("busca", filtros.busca);
  }

  if (filtros.empresaId) {
    parametros.set("empresa", filtros.empresaId);
  }

  if (filtros.tratativa) {
    parametros.set("tratativa", filtros.tratativa);
  }

  if (filtros.gravidade) {
    parametros.set("gravidade", filtros.gravidade);
  }

  if (filtros.tipo) {
    parametros.set("tipo", filtros.tipo);
  }

  if (filtros.pagina > 1) {
    parametros.set("pagina", String(filtros.pagina));
  }

  const consulta = parametros.toString();

  return consulta ? `${ROTA_PENDENCIAS}?${consulta}` : ROTA_PENDENCIAS;
}

/** Uma pagina do painel, com o que a navegacao e o cabecalho precisam. */
export type PaginaDePendencias = {
  competencia: CompetenciaResumo | null;
  janela: JanelaApurada | null;
  itens: Ocorrencia[];
  total: number;
  pagina: number;
  paginas: number;
  resumo: ResumoDasOcorrencias;
};

/** Uma mensagem do historico, como a tela a mostra. */
export type MensagemEnviada = {
  id: string;
  destino: MensagemDestino;
  /** Nome do responsavel que recebeu; `null` quando foi ao proprio colaborador. */
  destinatario: string | null;
  /** Quantas ocorrencias foram na mesma mensagem consolidada. `null` na mensagem avulsa. */
  ocorrenciasNoLote: number | null;
  telefone: string;
  conteudo: string;
  status: MensagemStatus;
  erro: string | null;
  /** Nome de quem enviou; `null` se a conta foi apagada depois. */
  enviadoPor: string | null;
  criadoEm: Date;
};

/**
 * A ocorrencia inteira: o dia como a apuracao o leu, a tratativa e o historico
 * de mensagens.
 *
 * `divergencia` e anulavel de proposito. A ocorrencia e calculada, entao ela
 * pode **deixar de existir** entre o momento em que alguem abriu a tratativa e
 * agora — foi o que aconteceu se a escala foi corrigida ou a batida que faltava
 * entrou numa carga nova. Nesse caso a tela mostra o historico e diz que a
 * divergencia nao aparece mais, em vez de um 404 que faria parecer que o
 * registro se perdeu.
 */
export type OcorrenciaDetalhada = {
  competencia: CompetenciaResumo;
  janela: JanelaApurada;
  funcionario: {
    id: string;
    nome: string;
    matricula: string;
    empresaNome: string;
    cargo: string | null;
    telefone: string | null;
  };
  data: string;
  tipo: TipoDeDivergencia;
  /** `null` quando a leitura atual nao acusa mais esta divergencia. */
  divergencia: { gravidade: Gravidade; descricao: string } | null;
  /** O dia inteiro, para a tela mostrar batidas e horario previsto. */
  dia: DiaApurado | null;
  status: TratativaStatus;
  observacao: string | null;
  responsavel: string | null;
  tratadoEm: Date | null;
  mensagens: MensagemEnviada[];
  /** Para quem a mensagem iria agora — relido do grupo de contato a cada abertura. */
  destino: DestinoDaMensagem;
  prazo: PrazoDeRetorno | null;
  /** O texto sugerido, montado no servidor a partir do dia. */
  sugestao: string;
  /** `false` quando faltam credenciais da Z-API neste ambiente. */
  envioDisponivel: boolean;
};

/** O estado do formulario de tratativa. */
export type TratativaState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
  erros?: Record<string, string[] | undefined>;
};

export const estadoInicialTratativa: TratativaState = { status: "idle" };

/**
 * A mensagem exatamente como sera enviada, mostrada antes de sair.
 *
 * Nenhum envio aconteceu quando isto chega a tela — e o mesmo arranjo em duas
 * etapas da importacao de marcacoes, pela mesma razao: um envio de WhatsApp nao
 * tem desfazer. A diferenca e que aqui a confirmacao reenvia o **texto**, que e
 * entrada do usuario; o destinatario e o numero sao relidos do cadastro no
 * momento do envio, e nunca vem do cliente.
 */
export type PreviaDaMensagem = {
  /**
   * Para quem a previa foi montada. Volta no envio e e comparado com o destino
   * relido: se alguem atribuiu ou tirou o responsavel no meio, o texto escrito
   * para um nao vai para o outro.
   */
  destino: MensagemDestino;
  destinatarioId: string;
  destinatario: string;
  /** O posto cujo responsavel recebe, `GP01 - Portaria`. `null` quando vai ao colaborador. */
  posto: string | null;
  /** De quem e a ocorrencia, quando quem recebe e o responsavel. */
  sobre: string | null;
  /** Formatado para leitura: `+55 (62) 99999-9999`. */
  telefone: string;
  empresa: string;
  ocorrencia: { data: string; tipo: TipoDeDivergencia; descricao: string };
  conteudo: string;
};

/** Um responsavel com o que o grupo dele tem de pendente — uma linha da tela do consolidado. */
export type ResponsavelComPendencias = {
  id: string;
  nome: string;
  telefone: string | null;
  bloqueio: BloqueioDoDestino | null;
  /** Os postos de onde vem as pendencias — o responsavel pode cuidar de mais de um. */
  postos: { id: string; codigo: string; nome: string }[];
  /** Faltas e marcacoes incompletas nao encerradas — os tipos do consolidado. */
  pendentes: number;
  /** As que entram no proximo envio: nao encerradas e ainda nao enviadas a ele. */
  aEnviar: number;
  /** Ja enviadas a ele, ainda nao encerradas e com o prazo vencido. */
  prazosVencidos: number;
};

export type PaginaDosResponsaveis = {
  competencia: CompetenciaResumo | null;
  janela: JanelaApurada | null;
  responsaveis: ResponsavelComPendencias[];
};

/**
 * A mensagem consolidada exatamente como sera enviada. A `assinatura` e o
 * SHA-256 do texto: volta na confirmacao e e comparada com o texto refeito na
 * action. Se uma carga nova, uma tratativa encerrada ou a virada do dia (que
 * muda o prazo) mudou o texto entre as duas etapas, nada sai.
 */
export type PreviaDoConsolidado = {
  responsavelId: string;
  destinatario: string;
  telefone: string;
  ocorrencias: number;
  /** As que passaram do teto e ficam para o envio seguinte. */
  restantes: number;
  conteudo: string;
  assinatura: string;
};

export type ConsolidadoState = {
  status: "idle" | "previa" | "success" | "error";
  mensagem?: string;
  previa?: PreviaDoConsolidado;
};

export const estadoInicialConsolidado: ConsolidadoState = { status: "idle" };

/** Rota do envio consolidado aos responsaveis. */
export const ROTA_CONSOLIDADO = `${ROTA_PENDENCIAS}/responsaveis`;

export type MensagemState = {
  status: "idle" | "previa" | "success" | "error";
  mensagem?: string;
  previa?: PreviaDaMensagem;
  /** O texto digitado, devolvido para o campo nao perder o que se escreveu. */
  conteudo?: string;
};

export const estadoInicialMensagem: MensagemState = { status: "idle" };

/* -------------------------------------------------------------------------- */
/* Escalas sugeridas pelo ponto                                               */
/* -------------------------------------------------------------------------- */

/** Quem a sugestao e de quem — o que a tela mostra ao lado da escala. */
type DadosDaPessoa = {
  nome: string;
  matricula: string;
  cargo: string | null;
  empresaId: string;
  empresaNome: string;
};

export type SugestaoParaConferencia = SugestaoDeEscala & DadosDaPessoa;
export type SemSugestaoParaConferencia = SemSugestao & DadosDaPessoa;

/**
 * A tela de escalas sugeridas. `semPonto` e `totalSemEscala` ficam aqui porque
 * a conta que interessa a quem abre a tela e "de quantos o ponto da conta?" —
 * e quem nao bateu ponto nenhum nao aparece em lista nenhuma.
 */
export type PaginaDeSugestoes = {
  competencia: CompetenciaResumo | null;
  janela: JanelaApurada | null;
  sugestoes: SugestaoParaConferencia[];
  semSugestao: SemSugestaoParaConferencia[];
  /** Sem escala e sem nenhuma batida na competencia. */
  semPonto: number;
  totalSemEscala: number;
};

export const SEM_SUGESTOES: PaginaDeSugestoes = {
  competencia: null,
  janela: null,
  sugestoes: [],
  semSugestao: [],
  semPonto: 0,
  totalSemEscala: 0,
};

export type AplicarSugestoesState = {
  status: "idle" | "success" | "error";
  mensagem?: string;
};

export const estadoInicialAplicarSugestoes: AplicarSugestoesState = { status: "idle" };

/** Rota da conferencia das escalas que o ponto sugere. */
export const ROTA_SUGESTOES = "/funcionarios/escalas-sugeridas";
