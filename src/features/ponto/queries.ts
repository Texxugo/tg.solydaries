import "server-only";

import { createHash } from "node:crypto";

import { and, asc, count, desc, eq, gte, inArray, isNull, lte, max, min, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";

import { db } from "@/db";
import {
  empresas,
  escalaExcecoes,
  escalas,
  funcionarios,
  importacoesPonto,
  marcacoes,
  mensagensPonto,
  tratativasPonto,
  usuarios,
} from "@/db/schema";
import type { MensagemDestino, MensagemStatus, TratativaStatus } from "@/db/schema";
import type { CompetenciaResumo } from "@/features/competencias/types";
import { diaAnterior, hojeNoPortal, horaNoPortal } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import {
  formatarHora,
  rotuloDoCiclo,
  temViradaDeTurno,
  type ExcecaoDoCiclo,
} from "@/features/escalas/jornada";
import { folgasDaEscala } from "@/features/escalas/queries";
import type { PeriodoDeAfastamento } from "@/features/funcionarios/afastamentos";
import { digitosDoCpf } from "@/features/funcionarios/cpf";
import { afastamentosNaJanela } from "@/features/funcionarios/queries";
import { contatoDoFuncionario, contatosDosFuncionarios } from "@/features/postos/queries";

import {
  apurarPeriodo,
  gravidadeDaDivergencia,
  type ApuracaoDoFuncionario,
  type BatidaApurada,
  type TipoDeDivergencia,
} from "./apuracao";
import {
  destinoDaMensagem,
  entraNoConsolidado,
  OCORRENCIAS_POR_CONSOLIDADO,
  prazoDaOcorrencia,
  prazoDeRetorno,
  tipoDoConsolidado,
  type DestinoDaMensagem,
} from "./contato";
import { sugerirEscalas, type EscalaCandidata } from "./inferencia";
import { modeloConsolidado, modeloDaMensagem, modeloParaResponsavel } from "./mensagens";
import { idFuncionarioSchema } from "./schema";
import { tratativaEncerrada } from "./tratativas";
import { zapiConfigurada } from "./zapi";
import {
  FUNCIONARIOS_POR_PAGINA,
  OCORRENCIAS_POR_PAGINA,
  type ApuracaoDetalhada,
  type ApuracaoResumo,
  type ChaveDaOcorrencia,
  type EmpresaParaAssociar,
  type FiltrosDeOcorrencias,
  type FiltrosDePonto,
  type JanelaApurada,
  type Ocorrencia,
  type OcorrenciaDetalhada,
  type PaginaDaConferencia,
  type PaginaDePendencias,
  type PaginaDeSugestoes,
  type PaginaDosResponsaveis,
  type ResponsavelComPendencias,
  type ResumoDaConferencia,
  type ResumoDasOcorrencias,
  type StatusDaApuracao,
  SEM_SUGESTOES,
} from "./types";

/**
 * Leituras da feature: chamadas por Server Components, nunca pelo client.
 *
 * `connection()` interrompe o prerender: sem ele o Next resolveria a query no
 * build e a pagina serviria dados congelados.
 *
 * Ao contrario de escalas e funcionarios, **tudo aqui filtra por
 * `competenciaEmVigor()`**: marcacao e dado datado, e uma tela que esquecesse o
 * filtro misturaria o ponto de dois periodos sem que nada acusasse.
 *
 * A apuracao em si nao mora aqui e nao esta no banco: as consultas carregam
 * marcacoes, escalas e excecoes e entregam tudo a `apuracao.ts`, que e um
 * modulo puro. E o que permite a leitura mudar quando a escala muda, sem uma
 * unica linha reescrita.
 */

/* -------------------------------------------------------------------------- */
/* A janela apurada                                                           */
/* -------------------------------------------------------------------------- */

/** Dias entre duas datas, contando as duas pontas. Conta inteira em UTC. */
const MS_DO_DIA = 24 * 60 * 60 * 1000;

function diasEntre(inicio: string, fim: string) {
  return Math.round(
    (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / MS_DO_DIA,
  );
}

/**
 * Ate onde a competencia foi apurada: a uniao dos periodos que os arquivos de
 * ponto cobrem, recortada pela competencia.
 *
 * `null` quando nenhuma carga aconteceu — e a diferenca entre "ninguem bateu
 * ponto" e "ninguem importou o arquivo". Sem essa distincao, uma competencia
 * recem-aberta mostraria trinta faltas para cada pessoa do cadastro.
 */
export async function janelaApurada(competencia: CompetenciaResumo): Promise<JanelaApurada | null> {
  await connection();

  const [linha] = await db
    .select({
      inicio: min(importacoesPonto.periodoInicio),
      fim: max(importacoesPonto.periodoFim),
      cargas: count(),
    })
    .from(importacoesPonto)
    .where(eq(importacoesPonto.competenciaId, competencia.id));

  if (!linha?.inicio || !linha.fim || linha.cargas === 0) {
    return null;
  }

  // O recorte pela competencia e cinto e suspensorio: a importacao ja grava o
  // periodo recortado. Repetir aqui e barato e protege a apuracao de uma linha
  // gravada antes de a regra existir.
  const inicio = linha.inicio < competencia.dataInicio ? competencia.dataInicio : linha.inicio;
  const fim = linha.fim > competencia.dataFim ? competencia.dataFim : linha.fim;

  return {
    inicio,
    fim,
    cargas: linha.cargas,
    diasNaoCobertos: Math.max(0, diasEntre(fim, competencia.dataFim)),
  };
}

/* -------------------------------------------------------------------------- */
/* Quem e apurado                                                             */
/* -------------------------------------------------------------------------- */

const colunasDoFuncionario = {
  id: funcionarios.id,
  nome: funcionarios.nome,
  matricula: funcionarios.matricula,
  cpf: funcionarios.cpf,
  cargo: funcionarios.cargo,
  telefone: funcionarios.telefone,
  situacao: funcionarios.situacao,
  empresaId: funcionarios.empresaId,
  empresaNome: empresas.nome,
  inicioCiclo: funcionarios.inicioCiclo,
  escalaId: funcionarios.escalaId,
  escalaNome: escalas.nome,
  entrada: escalas.entrada,
  saida: escalas.saida,
  diasCiclo: escalas.diasCiclo,
  intrajornadaMinutos: escalas.intrajornadaMinutos,
  marcacoesEsperadas: escalas.marcacoesEsperadas,
  horasExtrasMinutos: escalas.horasExtrasMinutos,
  folgas: folgasDaEscala,
};

type LinhaDoFuncionario = {
  id: string;
  nome: string;
  matricula: string;
  cpf: string;
  cargo: string | null;
  telefone: string | null;
  situacao: number;
  empresaId: string;
  empresaNome: string;
  inicioCiclo: string | null;
  escalaId: string | null;
  escalaNome: string | null;
  entrada: string | null;
  saida: string | null;
  diasCiclo: number | null;
  intrajornadaMinutos: number | null;
  marcacoesEsperadas: number | null;
  horasExtrasMinutos: number | null;
  folgas: number[];
};

/**
 * A escala de uma linha, ou `null` — as colunas do `left join` sao anulaveis
 * mas inseparaveis, como em `funcionarios/queries.ts`. A conferencia dos campos
 * aqui e o que permite ao resto tratar a atribuicao como um objeto inteiro.
 */
function escalaDaLinha(linha: LinhaDoFuncionario) {
  if (
    !linha.escalaId ||
    !linha.inicioCiclo ||
    !linha.escalaNome ||
    !linha.entrada ||
    !linha.saida ||
    linha.diasCiclo === null ||
    linha.intrajornadaMinutos === null ||
    linha.marcacoesEsperadas === null ||
    linha.horasExtrasMinutos === null
  ) {
    return null;
  }

  return {
    nome: linha.escalaNome,
    inicioCiclo: linha.inicioCiclo,
    // O `time` do Postgres volta como `HH:MM:SS`; a apuracao trabalha em `HH:MM`.
    entrada: formatarHora(linha.entrada),
    saida: formatarHora(linha.saida),
    diasCiclo: linha.diasCiclo,
    folgas: linha.folgas,
    intrajornadaMinutos: linha.intrajornadaMinutos,
    marcacoesEsperadas: linha.marcacoesEsperadas,
    horasExtrasMinutos: linha.horasExtrasMinutos,
  };
}

/** As excecoes de cada escala, agrupadas — o dia do ciclo que foge do padrao. */
async function excecoesPorEscala(escalaIds: readonly string[]) {
  if (escalaIds.length === 0) {
    return new Map<string, ExcecaoDoCiclo[]>();
  }

  const linhas = await db
    .select({
      escalaId: escalaExcecoes.escalaId,
      diaCiclo: escalaExcecoes.diaCiclo,
      entrada: escalaExcecoes.entrada,
      saida: escalaExcecoes.saida,
      intrajornadaMinutos: escalaExcecoes.intrajornadaMinutos,
      marcacoesEsperadas: escalaExcecoes.marcacoesEsperadas,
      horasExtrasMinutos: escalaExcecoes.horasExtrasMinutos,
    })
    .from(escalaExcecoes)
    .where(inArray(escalaExcecoes.escalaId, [...escalaIds]))
    .orderBy(asc(escalaExcecoes.diaCiclo));

  const agrupadas = Map.groupBy(linhas, (linha) => linha.escalaId);

  return new Map(
    [...agrupadas].map(([escalaId, doGrupo]) => [
      escalaId,
      // O `escala_id` do agrupamento nao entra na excecao: `regraDoDia()` so
      // conhece o dia do ciclo e a jornada dele.
      doGrupo.map((excecao) => ({
        diaCiclo: excecao.diaCiclo,
        // O `time` do Postgres volta como `HH:MM:SS`; a apuracao le `HH:MM`.
        entrada: formatarHora(excecao.entrada),
        saida: formatarHora(excecao.saida),
        intrajornadaMinutos: excecao.intrajornadaMinutos,
        marcacoesEsperadas: excecao.marcacoesEsperadas,
        horasExtrasMinutos: excecao.horasExtrasMinutos,
      })),
    ]),
  );
}

/**
 * As batidas da competencia, agrupadas por funcionario e por dia.
 *
 * Carregadas de uma vez, e nao por pessoa: sao alguns milhares de linhas por
 * competencia (o relatorio de quinze dias traz 2.840), e trezentas idas ao
 * banco custariam a apuracao inteira em latencia.
 *
 * O recorte e por **data**, e comeca no dia anterior ao inicio — que e da
 * competencia passada. Com a vespera, o agrupamento em jornadas sabe que a
 * saida das 06:00 do dia 21 fecha o plantao do dia 20, e a jornada que comecou
 * la fica fora da apuracao sozinha. Sem ela, era preciso cortar pelo horario
 * da escala, e o corte levava junto a entrada das 17:55 do proprio dia 21.
 */
async function batidasDaCompetencia(competencia: CompetenciaResumo) {
  const linhas = await db
    .select({
      funcionarioId: marcacoes.funcionarioId,
      data: marcacoes.data,
      hora: marcacoes.hora,
      incluida: marcacoes.incluida,
    })
    .from(marcacoes)
    .where(
      and(
        gte(marcacoes.data, diaAnterior(competencia.dataInicio)),
        lte(marcacoes.data, competencia.dataFim),
      ),
    )
    .orderBy(asc(marcacoes.funcionarioId), asc(marcacoes.data), asc(marcacoes.hora));

  const porFuncionario = new Map<string, Map<string, BatidaApurada[]>>();

  for (const linha of linhas) {
    let porData = porFuncionario.get(linha.funcionarioId);

    if (!porData) {
      porData = new Map();
      porFuncionario.set(linha.funcionarioId, porData);
    }

    const doDia = porData.get(linha.data) ?? [];

    doDia.push({ hora: formatarHora(linha.hora), incluida: linha.incluida });
    porData.set(linha.data, doDia);
  }

  return porFuncionario;
}

/* -------------------------------------------------------------------------- */
/* A conferencia                                                              */
/* -------------------------------------------------------------------------- */

function statusDaApuracao(
  temEscala: boolean,
  apuracao: ApuracaoDoFuncionario | null,
): StatusDaApuracao {
  if (!temEscala || !apuracao) {
    return "sem_escala";
  }

  if (apuracao.diasComPendencia > 0) {
    return "com_pendencia";
  }

  return apuracao.diasComAtencao > 0 ? "atencao" : "conforme";
}

function resumoDaLinha(
  linha: LinhaDoFuncionario,
  escala: ReturnType<typeof escalaDaLinha>,
  apuracao: ApuracaoDoFuncionario | null,
  batidas: number,
): ApuracaoResumo {
  return {
    funcionarioId: linha.id,
    nome: linha.nome,
    matricula: linha.matricula,
    empresaId: linha.empresaId,
    empresaNome: linha.empresaNome,
    cargo: linha.cargo,
    telefone: linha.telefone,
    situacao: linha.situacao,
    escala: escala
      ? {
          nome: escala.nome,
          rotuloCiclo: rotuloDoCiclo({ diasCiclo: escala.diasCiclo, folgas: escala.folgas }),
          entrada: escala.entrada,
          saida: escala.saida,
          viradaTurno: temViradaDeTurno(escala.entrada, escala.saida),
        }
      : null,
    status: statusDaApuracao(escala !== null, apuracao),
    batidas,
    batidasIncluidas: apuracao?.batidasIncluidas ?? 0,
    diasPrevistos: apuracao?.diasPrevistos ?? 0,
    faltas: apuracao?.faltas ?? 0,
    diasComPendencia: apuracao?.diasComPendencia ?? 0,
    diasComAtencao: apuracao?.diasComAtencao ?? 0,
    previstoMinutos: apuracao?.previstoMinutos ?? 0,
    trabalhadoMinutos: apuracao?.trabalhadoMinutos ?? 0,
    saldoMinutos: apuracao?.saldoMinutos ?? 0,
    saldoToleradoMinutos: apuracao?.saldoToleradoMinutos ?? 0,
  };
}

/**
 * A ordem da tela: quem precisa de trabalho primeiro, e o nome como desempate.
 *
 * `sem_escala` vai depois de `atencao`, e nao na frente de tudo, embora seja a
 * pendencia que **impede** a apuracao. E que ela e pendencia de **cadastro**, e
 * nao de ponto: quem nunca recebeu escala e a maioria do cadastro logo depois
 * de uma importacao da folha (303 de 314, no primeiro periodo), e po-los na
 * frente enterraria as pendencias de ponto sob centenas de linhas de tracos —
 * a tela existe justamente para as primeiras. A fila deles tem lugar proprio:
 * o filtro de status aqui, e `?pendentes=1` em Funcionarios.
 */
const PESO_DO_STATUS: Record<StatusDaApuracao, number> = {
  com_pendencia: 0,
  atencao: 1,
  sem_escala: 2,
  conforme: 3,
};

function compararApuracoes(a: ApuracaoResumo, b: ApuracaoResumo) {
  if (PESO_DO_STATUS[a.status] !== PESO_DO_STATUS[b.status]) {
    return PESO_DO_STATUS[a.status] - PESO_DO_STATUS[b.status];
  }

  if (a.diasComPendencia !== b.diasComPendencia) {
    return b.diasComPendencia - a.diasComPendencia;
  }

  return a.nome.localeCompare(b.nome, "pt-BR");
}

/** O termo bate com nome, matricula, cargo ou CPF — o que a pessoa tiver a mao. */
function combinaComBusca(linha: ApuracaoResumo, busca: string, cpf: string) {
  if (!busca) {
    return true;
  }

  const termo = busca.trim().toLowerCase();
  const digitos = digitosDoCpf(busca);

  return (
    linha.nome.toLowerCase().includes(termo) ||
    linha.matricula.toLowerCase().includes(termo) ||
    (linha.cargo ?? "").toLowerCase().includes(termo) ||
    (digitos.length >= 3 && cpf.includes(digitos))
  );
}

const SEM_RESUMO: ResumoDaConferencia = {
  funcionarios: 0,
  semEscala: 0,
  comPendencia: 0,
  comAtencao: 0,
  conformes: 0,
  porTipo: [],
};

/**
 * A conferencia do periodo: uma linha por funcionario ativo, com o resultado da
 * leitura das marcacoes contra a escala de cada um.
 *
 * O recorte da pagina acontece **em memoria**, e nao no `select` — ao contrario
 * das listas de escalas e funcionarios. A ordem da tela e "quem tem mais
 * pendencia primeiro", e pendencia nao existe no banco: ela nasce de ler as
 * batidas contra a escala. Ordenar em SQL exigiria gravar a conclusao, que e
 * exatamente o que este modulo nao faz. O custo e limitado pelo cadastro
 * (algumas centenas de pessoas, alguns milhares de batidas), e nao pelo tempo.
 */
export async function conferirCompetencia(filtros: FiltrosDePonto): Promise<PaginaDaConferencia> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return {
      competencia: null,
      janela: null,
      itens: [],
      total: 0,
      pagina: 1,
      paginas: 1,
      resumo: SEM_RESUMO,
    };
  }

  const competencia = vigor.competencia;
  const janela = await janelaApurada(competencia);
  const apuradas = await apurarTodos(competencia, janela);

  const porTipo = new Map<TipoDeDivergencia, number>();
  const itens: ApuracaoResumo[] = [];
  const cpfs = new Map<string, string>();

  for (const { linha, escala, apuracao, batidas } of apuradas) {
    for (const dia of apuracao?.dias ?? []) {
      for (const divergencia of dia.divergencias) {
        porTipo.set(divergencia.tipo, (porTipo.get(divergencia.tipo) ?? 0) + 1);
      }
    }

    cpfs.set(linha.id, linha.cpf);
    itens.push(resumoDaLinha(linha, escala, apuracao, batidas));
  }

  const resumo: ResumoDaConferencia = {
    funcionarios: itens.length,
    semEscala: itens.filter((item) => item.status === "sem_escala").length,
    comPendencia: itens.filter((item) => item.status === "com_pendencia").length,
    comAtencao: itens.filter((item) => item.status === "atencao").length,
    conformes: itens.filter((item) => item.status === "conforme").length,
    porTipo: [...porTipo]
      .map(([tipo, dias]) => ({ tipo, gravidade: gravidadeDaDivergencia(tipo), dias }))
      .sort((a, b) => b.dias - a.dias),
  };

  const filtrados = itens
    .filter((item) => !filtros.empresaId || item.empresaId === filtros.empresaId)
    .filter((item) => !filtros.status || item.status === filtros.status)
    .filter((item) => combinaComBusca(item, filtros.busca, cpfs.get(item.funcionarioId) ?? ""))
    .sort(compararApuracoes);

  const paginas = Math.max(1, Math.ceil(filtrados.length / FUNCIONARIOS_POR_PAGINA));
  // Link velho (ou `?pagina=99`) cai na ultima pagina, e nao numa tela vazia.
  const pagina = Math.min(filtros.pagina, paginas);

  return {
    competencia,
    janela,
    itens: filtrados.slice(
      (pagina - 1) * FUNCIONARIOS_POR_PAGINA,
      pagina * FUNCIONARIOS_POR_PAGINA,
    ),
    total: filtrados.length,
    pagina,
    paginas,
    resumo,
  };
}

/** Uma pessoa ja apurada: a linha do banco, a escala montada e a leitura. */
type LinhaApurada = {
  linha: LinhaDoFuncionario;
  escala: ReturnType<typeof escalaDaLinha>;
  /** `null` para quem esta sem escala, ou quando nenhuma carga cobriu o periodo. */
  apuracao: ApuracaoDoFuncionario | null;
  /** Quantas batidas a competencia tem para esta pessoa. */
  batidas: number;
};

/**
 * Le a competencia inteira: todo mundo que esta ativo, cada um contra a sua
 * escala.
 *
 * Extraida porque as duas telas do modulo partem exatamente daqui — a
 * conferencia, que resume por pessoa, e o painel de pendencias, que achata em
 * ocorrencias. Duas leituras montadas em separado acabariam divergindo, e um
 * dia a lista diria "3 pendencias" com o painel mostrando quatro linhas.
 */
async function apurarTodos(
  competencia: CompetenciaResumo,
  janela: JanelaApurada | null,
): Promise<LinhaApurada[]> {
  const linhas: LinhaDoFuncionario[] = await db
    .select(colunasDoFuncionario)
    .from(funcionarios)
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .leftJoin(escalas, eq(escalas.id, funcionarios.escalaId))
    .where(eq(funcionarios.ativo, true))
    .orderBy(asc(funcionarios.nome));

  const [excecoes, batidas] = await Promise.all([
    excecoesPorEscala([
      ...new Set(linhas.map((linha) => linha.escalaId).filter((id) => id !== null)),
    ]),
    batidasDaCompetencia(competencia),
  ]);

  // Os afastamentos que tocam a janela, de todos de uma vez — uma consulta so,
  // pelo mesmo motivo das batidas: sao trezentas pessoas.
  const afastamentosPorFuncionario = janela
    ? await afastamentosNaJanela(
        linhas.map((linha) => linha.id),
        janela,
      )
    : new Map<string, PeriodoDeAfastamento[]>();

  return linhas.map((linha) => {
    const escala = escalaDaLinha(linha);
    const batidasPorData = batidas.get(linha.id) ?? new Map<string, BatidaApurada[]>();
    // A vespera (da competencia passada) vem so para o agrupamento: nao conta.
    const totalDeBatidas = [...batidasPorData]
      .filter(([data]) => data >= competencia.dataInicio)
      .reduce((soma, [, doDia]) => soma + doDia.length, 0);

    // Sem janela nao ha o que apurar: nenhum arquivo cobriu esta competencia
    // ainda, e um periodo inventado transformaria o cadastro inteiro em faltas.
    const apuracao =
      escala && janela
        ? apurarPeriodo({
            janela,
            inicioCiclo: escala.inicioCiclo,
            escala: {
              diasCiclo: escala.diasCiclo,
              folgas: escala.folgas,
              entrada: escala.entrada,
              saida: escala.saida,
              intrajornadaMinutos: escala.intrajornadaMinutos,
              marcacoesEsperadas: escala.marcacoesEsperadas,
              horasExtrasMinutos: escala.horasExtrasMinutos,
            },
            excecoes: linha.escalaId ? (excecoes.get(linha.escalaId) ?? []) : [],
            batidasPorData,
            afastamentos: afastamentosPorFuncionario.get(linha.id) ?? [],
          })
        : null;

    return { linha, escala, apuracao, batidas: totalDeBatidas };
  });
}

/**
 * A conferencia de uma pessoa, dia a dia. `null` para id inexistente — e
 * tambem para id que nem uuid e, para que o Postgres nao lance erro de cast.
 */
export async function obterApuracao(id: string): Promise<ApuracaoDetalhada | null> {
  await connection();

  const idValido = idFuncionarioSchema.safeParse(id);
  const vigor = await competenciaEmVigor();

  if (!idValido.success || !vigor) {
    return null;
  }

  const competencia = vigor.competencia;
  const janela = await janelaApurada(competencia);

  if (!janela) {
    return null;
  }

  const [linha] = await db
    .select(colunasDoFuncionario)
    .from(funcionarios)
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .leftJoin(escalas, eq(escalas.id, funcionarios.escalaId))
    .where(eq(funcionarios.id, idValido.data))
    .limit(1);

  if (!linha) {
    return null;
  }

  const escala = escalaDaLinha(linha);

  const [excecoes, batidasDoBanco] = await Promise.all([
    linha.escalaId ? excecoesPorEscala([linha.escalaId]) : new Map<string, ExcecaoDoCiclo[]>(),
    db
      .select({ data: marcacoes.data, hora: marcacoes.hora, incluida: marcacoes.incluida })
      .from(marcacoes)
      .where(
        and(
          eq(marcacoes.funcionarioId, idValido.data),
          // A vespera vem junto, pelo mesmo motivo de `batidasDaCompetencia()`.
          gte(marcacoes.data, diaAnterior(competencia.dataInicio)),
          lte(marcacoes.data, competencia.dataFim),
        ),
      )
      .orderBy(asc(marcacoes.data), asc(marcacoes.hora)),
  ]);

  const batidasPorData = new Map<string, BatidaApurada[]>();

  for (const batida of batidasDoBanco) {
    const doDia = batidasPorData.get(batida.data) ?? [];

    doDia.push({ hora: formatarHora(batida.hora), incluida: batida.incluida });
    batidasPorData.set(batida.data, doDia);
  }

  // Os afastamentos desta pessoa que tocam a janela: e o que tira ferias e
  // atestado da auditoria, em vez de ler o dia sem batida como falta.
  const afastamentosDaPessoa = (await afastamentosNaJanela([linha.id], janela)).get(linha.id) ?? [];

  const apuracao = escala
    ? apurarPeriodo({
        janela,
        inicioCiclo: escala.inicioCiclo,
        escala: {
          diasCiclo: escala.diasCiclo,
          folgas: escala.folgas,
          entrada: escala.entrada,
          saida: escala.saida,
          intrajornadaMinutos: escala.intrajornadaMinutos,
          marcacoesEsperadas: escala.marcacoesEsperadas,
          horasExtrasMinutos: escala.horasExtrasMinutos,
        },
        excecoes: linha.escalaId ? (excecoes.get(linha.escalaId) ?? []) : [],
        batidasPorData,
        afastamentos: afastamentosDaPessoa,
      })
    : {
        dias: [],
        diasPrevistos: 0,
        diasComRegistro: 0,
        faltas: 0,
        previstoMinutos: 0,
        trabalhadoMinutos: 0,
        saldoMinutos: 0,
        saldoToleradoMinutos: 0,
        diasComPendencia: 0,
        diasComAtencao: 0,
        diasAfastado: 0,
        batidasIncluidas: 0,
      };

  return {
    competencia,
    janela,
    resumo: resumoDaLinha(
      linha,
      escala,
      escala ? apuracao : null,
      batidasDoBanco.filter((batida) => batida.data >= competencia.dataInicio).length,
    ),
    apuracao,
  };
}

/* -------------------------------------------------------------------------- */
/* Empresas                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * As empresas, com o codigo do relogio que cada uma ja tem. E o que o campo de
 * associacao da tela de importacao mostra: o codigo aparece ao lado do nome
 * para que ninguem associe duas vezes a mesma empresa por engano.
 */
export async function listarEmpresasParaAssociar(): Promise<EmpresaParaAssociar[]> {
  await connection();

  return db
    .select({ id: empresas.id, nome: empresas.nome, codigo: empresas.codigo })
    .from(empresas)
    .where(eq(empresas.ativa, true))
    .orderBy(asc(empresas.nome));
}

/** As empresas que aparecem no filtro da conferencia. */
export async function listarEmpresasDaConferencia() {
  await connection();

  return db
    .select({
      id: empresas.id,
      nome: empresas.nome,
      funcionarios: sql<number>`cast(count(${funcionarios.id}) as int)`,
    })
    .from(empresas)
    .leftJoin(
      funcionarios,
      and(eq(funcionarios.empresaId, empresas.id), eq(funcionarios.ativo, true)),
    )
    .groupBy(empresas.id, empresas.nome)
    .orderBy(asc(empresas.nome));
}

/* -------------------------------------------------------------------------- */
/* Pendencias e tratativas                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A chave da ocorrencia como texto, para indexar em memoria.
 *
 * A tripla `(funcionario, data, tipo)` e a identidade da ocorrencia — a mesma
 * do indice unico de `tratativas_ponto`. Nao ha id porque nao ha tabela de
 * ocorrencias: elas nascem da leitura das batidas contra a escala.
 */
function chaveDaOcorrencia(funcionarioId: string, data: string, tipo: TipoDeDivergencia) {
  return `${funcionarioId}|${data}|${tipo}`;
}

/** A tratativa gravada de uma ocorrencia, com quem a registrou. */
type TratativaGravada = {
  id: string;
  status: TratativaStatus;
  observacao: string | null;
  responsavel: string | null;
  atualizadoEm: Date;
};

/** O que o historico de mensagens diz sobre uma tratativa, resumido. */
/** Quem recebeu a mensagem ao responsavel: `funcionarios` de novo, com outro nome. */
const destinatario = alias(funcionarios, "destinatario");

type ResumoDasMensagens = {
  total: number;
  ultima: { status: MensagemStatus; criadoEm: Date };
  /** O ultimo envio aceito — e dele que o prazo do responsavel conta. */
  ultimoEnvio: UltimoEnvio | null;
};

type UltimoEnvio = { destino: MensagemDestino; destinatarioId: string | null; criadoEm: Date };

/** As tratativas da competencia, indexadas pela chave da ocorrencia. */
async function tratativasDaCompetencia(competenciaId: string) {
  const linhas = await db
    .select({
      id: tratativasPonto.id,
      funcionarioId: tratativasPonto.funcionarioId,
      data: tratativasPonto.data,
      tipo: tratativasPonto.tipo,
      status: tratativasPonto.status,
      observacao: tratativasPonto.observacao,
      responsavel: usuarios.nome,
      atualizadoEm: tratativasPonto.atualizadoEm,
    })
    .from(tratativasPonto)
    .leftJoin(usuarios, eq(usuarios.id, tratativasPonto.responsavelId))
    .where(eq(tratativasPonto.competenciaId, competenciaId));

  const porChave = new Map<string, TratativaGravada>();

  for (const linha of linhas) {
    porChave.set(chaveDaOcorrencia(linha.funcionarioId, linha.data, linha.tipo), {
      id: linha.id,
      status: linha.status,
      observacao: linha.observacao,
      responsavel: linha.responsavel,
      atualizadoEm: linha.atualizadoEm,
    });
  }

  return porChave;
}

/**
 * Quantas mensagens cada tratativa ja teve, e como foi a ultima.
 *
 * Carregadas inteiras e resumidas aqui, e nao agregadas em SQL: sao mensagens
 * escritas por pessoas, uma a uma — dezenas por competencia, nao milhares. Um
 * `distinct on` para o mesmo resultado custaria mais em leitura do que
 * economiza em tempo.
 */
async function mensagensPorTratativa(competenciaId: string) {
  const linhas = await db
    .select({
      tratativaId: mensagensPonto.tratativaId,
      status: mensagensPonto.status,
      destino: mensagensPonto.destino,
      destinatarioId: mensagensPonto.destinatarioId,
      criadoEm: mensagensPonto.criadoEm,
    })
    .from(mensagensPonto)
    .innerJoin(tratativasPonto, eq(tratativasPonto.id, mensagensPonto.tratativaId))
    .where(eq(tratativasPonto.competenciaId, competenciaId))
    .orderBy(asc(mensagensPonto.criadoEm));

  const resumo = new Map<string, ResumoDasMensagens>();

  for (const linha of linhas) {
    const anterior = resumo.get(linha.tratativaId);

    resumo.set(linha.tratativaId, {
      total: (anterior?.total ?? 0) + 1,
      // A consulta vem em ordem crescente, entao a ultima lida e a mais recente.
      ultima: { status: linha.status, criadoEm: linha.criadoEm },
      // O prazo conta do ultimo envio que saiu — a falha nao avisou ninguem.
      ultimoEnvio:
        linha.status === "enviada"
          ? {
              destino: linha.destino,
              destinatarioId: linha.destinatarioId,
              criadoEm: linha.criadoEm,
            }
          : (anterior?.ultimoEnvio ?? null),
    });
  }

  return resumo;
}

/**
 * A ordem do painel: primeiro o que ainda pede trabalho, e dentro disso o que
 * trava o fechamento.
 *
 * `encerrada` vem antes da gravidade de proposito. Uma falta ja justificada nao
 * e mais fila — deixa-la no topo por ser impeditiva faria a tela repetir todo
 * dia um trabalho ja feito, que e a maneira mais rapida de alguem parar de
 * olhar para ela.
 */
function compararOcorrencias(a: Ocorrencia, b: Ocorrencia) {
  const encerradas = Number(tratativaEncerrada(a.status)) - Number(tratativaEncerrada(b.status));

  if (encerradas !== 0) {
    return encerradas;
  }

  if (a.gravidade !== b.gravidade) {
    return a.gravidade === "impeditiva" ? -1 : 1;
  }

  if (a.data !== b.data) {
    return a.data < b.data ? -1 : 1;
  }

  return a.nome.localeCompare(b.nome, "pt-BR");
}

/** O termo bate com nome, matricula, cargo ou empresa. */
function combinaComOcorrencia(ocorrencia: Ocorrencia, busca: string) {
  if (!busca) {
    return true;
  }

  const termo = busca.trim().toLowerCase();

  return (
    ocorrencia.nome.toLowerCase().includes(termo) ||
    ocorrencia.matricula.toLowerCase().includes(termo) ||
    (ocorrencia.cargo ?? "").toLowerCase().includes(termo) ||
    ocorrencia.empresaNome.toLowerCase().includes(termo)
  );
}

const SEM_PENDENCIAS: ResumoDasOcorrencias = {
  total: 0,
  abertas: 0,
  emTratativa: 0,
  encerradas: 0,
  impeditivas: 0,
  semTelefone: 0,
  prazosVencidos: 0,
  porTipo: [],
};

/**
 * O painel: **uma linha por ocorrencia**, e nao por pessoa.
 *
 * E a mesma leitura da conferencia vista pelo outro lado. La a pergunta e "como
 * esta o ponto de fulano?"; aqui e "o que ainda falta tratar?" — e para essa a
 * unidade e o problema, e nao a pessoa: quem tem uma falta e uma hora extra tem
 * duas conversas pela frente, com desfechos que podem nao coincidir.
 *
 * A ocorrencia continua sendo calculada a cada leitura; o que se junta a ela
 * aqui e a tratativa gravada. Quem nunca foi tocada nao tem linha nenhuma no
 * banco — a ausencia ja significa `aberta`, e e por isso que o painel funciona
 * desde a primeira carga, sem ninguem precisar "abrir" nada.
 */
/**
 * A ocorrencia com o que o envio consolidado precisa e a lista nao mostra: o
 * dia (batidas e horario previsto) e o ultimo envio aceito, com o destinatario.
 */
type OcorrenciaLida = Ocorrencia & {
  batidas: string[];
  previsto: { entrada: string; saida: string } | null;
  ultimoEnvio: UltimoEnvio | null;
};

type LeituraDasOcorrencias = {
  competencia: CompetenciaResumo | null;
  janela: JanelaApurada | null;
  itens: OcorrenciaLida[];
};

/**
 * Todas as ocorrencias da competencia em vigor, com tratativa, historico e
 * destino. E a leitura que o painel recorta e que o envio consolidado agrupa
 * por responsavel — uma so, pelo mesmo motivo de `apurarTodos()`: duas
 * montagens divergiriam, e o consolidado diria "5 pendencias" com o painel
 * mostrando seis.
 */
async function lerOcorrencias(): Promise<LeituraDasOcorrencias> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return { competencia: null, janela: null, itens: [] };
  }

  const competencia = vigor.competencia;
  const janela = await janelaApurada(competencia);

  // Sem carga nao ha janela, e sem janela nao ha ocorrencia nenhuma a listar —
  // nem faltas, que so existem dentro do periodo que algum arquivo cobriu.
  if (!janela) {
    return { competencia, janela: null, itens: [] };
  }

  const [apuradas, tratativas, mensagens] = await Promise.all([
    apurarTodos(competencia, janela),
    tratativasDaCompetencia(competencia.id),
    mensagensPorTratativa(competencia.id),
  ]);

  // Uma consulta so para o grupo de contato de todo mundo que tem ocorrencia.
  const contatos = await contatosDosFuncionarios(
    apuradas.filter(({ apuracao }) => apuracao?.dias.length).map(({ linha }) => linha.id),
  );
  const hoje = hojeNoPortal();

  const itens: OcorrenciaLida[] = [];

  for (const { linha, apuracao } of apuradas) {
    const destino = destinoDaMensagem(linha, contatos.get(linha.id) ?? { via: "colaborador" });

    for (const dia of apuracao?.dias ?? []) {
      for (const divergencia of dia.divergencias) {
        const tratativa = tratativas.get(chaveDaOcorrencia(linha.id, dia.data, divergencia.tipo));
        const historico = tratativa ? mensagens.get(tratativa.id) : undefined;
        const status = tratativa?.status ?? "aberta";

        itens.push({
          funcionarioId: linha.id,
          nome: linha.nome,
          matricula: linha.matricula,
          empresaId: linha.empresaId,
          empresaNome: linha.empresaNome,
          cargo: linha.cargo,
          telefone: linha.telefone,
          data: dia.data,
          diaCiclo: dia.diaCiclo,
          tipo: divergencia.tipo,
          gravidade: divergencia.gravidade,
          descricao: divergencia.descricao,
          // Sem linha gravada a ocorrencia esta aberta: e o estado de tudo o que
          // ninguem tocou, e grava-lo seria gravar a ausencia de trabalho.
          status,
          observacao: tratativa?.observacao ?? null,
          responsavel: tratativa?.responsavel ?? null,
          tratadoEm: tratativa?.atualizadoEm ?? null,
          mensagens: historico?.total ?? 0,
          ultimaMensagem: historico?.ultima ?? null,
          destino,
          prazo: prazoDaOcorrencia(historico?.ultimoEnvio ?? null, status, hoje),
          batidas: dia.batidas.map((batida) => batida.hora),
          previsto: dia.regra ? { entrada: dia.regra.entrada, saida: dia.regra.saida } : null,
          ultimoEnvio: historico?.ultimoEnvio ?? null,
        });
      }
    }
  }

  return { competencia, janela, itens };
}

export async function listarPendencias(filtros: FiltrosDeOcorrencias): Promise<PaginaDePendencias> {
  const { competencia, janela, itens } = await lerOcorrencias();

  if (!competencia || !janela) {
    return {
      competencia,
      janela,
      itens: [],
      total: 0,
      pagina: 1,
      paginas: 1,
      resumo: SEM_PENDENCIAS,
    };
  }

  const porTipo = new Map<TipoDeDivergencia, number>();

  for (const item of itens) {
    porTipo.set(item.tipo, (porTipo.get(item.tipo) ?? 0) + 1);
  }

  const resumo: ResumoDasOcorrencias = {
    total: itens.length,
    abertas: itens.filter((item) => item.status === "aberta").length,
    emTratativa: itens.filter((item) => item.status === "em_tratativa").length,
    encerradas: itens.filter((item) => tratativaEncerrada(item.status)).length,
    impeditivas: itens.filter((item) => item.gravidade === "impeditiva").length,
    // Quem nao tem numero nao pode ser avisado. E pendencia de **cadastro**, e o
    // painel a mostra antes de alguem procurar o botao de enviar e nao encontrar.
    // Conta o numero de quem recebe: com responsavel, e o dele que falta.
    semTelefone: itens.filter((item) => item.destino.bloqueio !== null).length,
    prazosVencidos: itens.filter((item) => item.prazo?.vencido).length,
    porTipo: [...porTipo]
      .map(([tipo, ocorrencias]) => ({
        tipo,
        gravidade: gravidadeDaDivergencia(tipo),
        ocorrencias,
      }))
      .sort((a, b) => b.ocorrencias - a.ocorrencias),
  };

  const filtrados = itens
    .filter((item) => !filtros.empresaId || item.empresaId === filtros.empresaId)
    .filter((item) => !filtros.tratativa || item.status === filtros.tratativa)
    .filter((item) => !filtros.gravidade || item.gravidade === filtros.gravidade)
    .filter((item) => !filtros.tipo || item.tipo === filtros.tipo)
    .filter((item) => combinaComOcorrencia(item, filtros.busca))
    .sort(compararOcorrencias);

  const paginas = Math.max(1, Math.ceil(filtrados.length / OCORRENCIAS_POR_PAGINA));
  // Link velho (ou `?pagina=99`) cai na ultima pagina, e nao numa tela vazia.
  const pagina = Math.min(filtros.pagina, paginas);

  return {
    competencia,
    janela,
    itens: filtrados.slice((pagina - 1) * OCORRENCIAS_POR_PAGINA, pagina * OCORRENCIAS_POR_PAGINA),
    total: filtrados.length,
    pagina,
    paginas,
    resumo,
  };
}

/* -------------------------------------------------------------------------- */
/* Envio consolidado ao responsavel                                           */
/* -------------------------------------------------------------------------- */

/** As ocorrencias cuja mensagem vai a este responsavel. */
function doResponsavel(itens: readonly OcorrenciaLida[], responsavelId: string) {
  return itens.filter(
    (item) => item.destino.via === "responsavel" && item.destino.funcionarioId === responsavelId,
  );
}

/**
 * Os responsaveis que tem pendencia no grupo, com quantas entram no proximo
 * envio consolidado. Sai da mesma leitura do painel (`lerOcorrencias()`), entao
 * as contagens batem com ele.
 *
 * Responsavel sem pendencia nenhuma nao aparece: nao ha o que enviar, e a tela
 * e uma fila de trabalho, e nao o cadastro dos grupos (que mora no posto).
 */
export async function listarResponsaveisComPendencias(): Promise<PaginaDosResponsaveis> {
  const { competencia, janela, itens } = await lerOcorrencias();
  const porResponsavel = new Map<string, ResponsavelComPendencias>();

  for (const item of itens) {
    const { destino } = item;

    // So os tipos que o consolidado leva: as contagens da tela sao do que ele envia.
    if (
      destino.via !== "responsavel" ||
      !tipoDoConsolidado(item.tipo) ||
      tratativaEncerrada(item.status)
    ) {
      continue;
    }

    let linha = porResponsavel.get(destino.funcionarioId);

    if (!linha) {
      linha = {
        id: destino.funcionarioId,
        nome: destino.nome,
        telefone: destino.telefone,
        bloqueio: destino.bloqueio,
        postos: [],
        pendentes: 0,
        aEnviar: 0,
        prazosVencidos: 0,
      };
      porResponsavel.set(destino.funcionarioId, linha);
    }

    if (destino.posto && !linha.postos.some((posto) => posto.id === destino.posto?.id)) {
      linha.postos.push(destino.posto);
    }

    linha.pendentes++;

    if (entraNoConsolidado(item, destino.funcionarioId)) {
      linha.aEnviar++;
    }

    if (item.prazo?.vencido) {
      linha.prazosVencidos++;
    }
  }

  const responsaveis = [...porResponsavel.values()]
    .map((linha) => ({
      ...linha,
      postos: linha.postos.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
    }))
    // Quem tem o que enviar primeiro; depois quem tem mais.
    .sort(
      (a, b) =>
        Number(b.aEnviar > 0) - Number(a.aEnviar > 0) ||
        b.aEnviar - a.aEnviar ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );

  return { competencia, janela, responsaveis };
}

/** O envio consolidado de um responsavel, pronto: quem recebe, o que entra e o texto. */
export type ConsolidadoDoResponsavel = {
  competencia: CompetenciaResumo;
  destino: DestinoDaMensagem;
  /** As ocorrencias do envio, ja na ordem do texto. */
  incluidas: ChaveDaOcorrencia[];
  restantes: number;
  conteudo: string;
  assinatura: string;
};

/**
 * Monta o envio consolidado de um responsavel — chamado pela previa **e** pela
 * confirmacao, como `planejarCarga()` na importacao: a previa so promete alguma
 * coisa se a gravacao refizer a mesma conta.
 *
 * `null` quando nao ha competencia, o id nao e responsavel de ninguem ou nada
 * do grupo dele esta para enviar.
 */
export async function consolidadoDoResponsavel(
  responsavelId: string,
): Promise<ConsolidadoDoResponsavel | null> {
  const { competencia, itens } = await lerOcorrencias();

  if (!competencia) {
    return null;
  }

  const doGrupo = doResponsavel(itens, responsavelId);
  const aEnviar = doGrupo
    .filter((item) => entraNoConsolidado(item, responsavelId))
    // Por posto e por data: e a ordem em que o responsavel vai conferir.
    .sort(
      (a, b) =>
        (a.destino.posto?.codigo ?? "").localeCompare(b.destino.posto?.codigo ?? "", "pt-BR") ||
        a.data.localeCompare(b.data) ||
        a.nome.localeCompare(b.nome, "pt-BR") ||
        a.tipo.localeCompare(b.tipo),
    );

  if (aEnviar.length === 0) {
    return null;
  }

  const destino = aEnviar[0].destino;
  const incluidas = aEnviar.slice(0, OCORRENCIAS_POR_CONSOLIDADO);

  const conteudo = modeloConsolidado({
    responsavel: destino.nome,
    hora: horaNoPortal(),
    prazo: prazoDeRetorno(hojeNoPortal()),
    itens: incluidas.map((item) => ({
      posto: item.destino.posto ?? { codigo: "-", nome: "sem posto" },
      colaborador: { nome: item.nome, matricula: item.matricula, cargo: item.cargo },
      data: item.data,
      tipo: item.tipo,
      descricao: item.descricao,
      batidas: item.batidas,
      previsto: item.previsto,
    })),
  });

  return {
    competencia,
    destino,
    incluidas: incluidas.map(({ funcionarioId, data, tipo }) => ({ funcionarioId, data, tipo })),
    restantes: aEnviar.length - incluidas.length,
    conteudo,
    assinatura: createHash("sha256").update(conteudo).digest("hex"),
  };
}

/**
 * Uma ocorrencia: o dia como a apuracao o le **hoje**, a tratativa e o
 * historico de mensagens.
 *
 * `null` so quando nao ha nem divergencia nem tratativa — ai a URL nunca
 * apontou para nada. Divergencia que **deixou** de existir devolve a ocorrencia
 * com `divergencia: null`: a tratativa e as mensagens continuam sendo fatos, e
 * some-los faria parecer que o registro se perdeu quando, na verdade, o
 * problema e que foi resolvido.
 */
export async function obterOcorrencia(
  chave: ChaveDaOcorrencia,
): Promise<OcorrenciaDetalhada | null> {
  await connection();

  const detalhe = await obterApuracao(chave.funcionarioId);

  if (!detalhe) {
    return null;
  }

  const { competencia, janela, resumo } = detalhe;
  const dia = detalhe.apuracao.dias.find((atual) => atual.data === chave.data) ?? null;
  const divergencia = dia?.divergencias.find((atual) => atual.tipo === chave.tipo) ?? null;

  const [gravada] = await db
    .select({
      id: tratativasPonto.id,
      status: tratativasPonto.status,
      observacao: tratativasPonto.observacao,
      responsavel: usuarios.nome,
      atualizadoEm: tratativasPonto.atualizadoEm,
    })
    .from(tratativasPonto)
    .leftJoin(usuarios, eq(usuarios.id, tratativasPonto.responsavelId))
    .where(
      and(
        eq(tratativasPonto.funcionarioId, chave.funcionarioId),
        eq(tratativasPonto.data, chave.data),
        eq(tratativasPonto.tipo, chave.tipo),
      ),
    )
    .limit(1);

  if (!divergencia && !gravada) {
    return null;
  }

  const historico = gravada
    ? await db
        .select({
          id: mensagensPonto.id,
          destino: mensagensPonto.destino,
          destinatario: destinatario.nome,
          ocorrenciasNoLote: sql<
            number | null
          >`case when ${mensagensPonto.loteId} is null then null else (select count(*)::int from mensagens_ponto lote where lote.lote_id = ${mensagensPonto.loteId}) end`,
          telefone: mensagensPonto.telefone,
          conteudo: mensagensPonto.conteudo,
          status: mensagensPonto.status,
          erro: mensagensPonto.erro,
          enviadoPor: usuarios.nome,
          criadoEm: mensagensPonto.criadoEm,
        })
        .from(mensagensPonto)
        .leftJoin(usuarios, eq(usuarios.id, mensagensPonto.enviadoPor))
        .leftJoin(destinatario, eq(destinatario.id, mensagensPonto.destinatarioId))
        .where(eq(mensagensPonto.tratativaId, gravada.id))
        .orderBy(desc(mensagensPonto.criadoEm))
    : [];

  const status = gravada?.status ?? "aberta";
  const contato = await contatoDoFuncionario(resumo.funcionarioId);
  const destino = destinoDaMensagem(
    { id: resumo.funcionarioId, nome: resumo.nome, telefone: resumo.telefone },
    contato,
  );
  // O historico vem do mais recente para o mais antigo: o primeiro aceito e o ultimo envio.
  const ultimoEnvio = historico.find((mensagem) => mensagem.status === "enviada") ?? null;

  const dadosDoDia = divergencia
    ? {
        empresa: resumo.empresaNome,
        data: chave.data,
        tipo: chave.tipo,
        descricao: divergencia.descricao,
        batidas: dia?.batidas.map((batida) => batida.hora) ?? [],
        previsto: dia?.regra ? { entrada: dia.regra.entrada, saida: dia.regra.saida } : null,
      }
    : null;

  return {
    competencia,
    janela,
    funcionario: {
      id: resumo.funcionarioId,
      nome: resumo.nome,
      matricula: resumo.matricula,
      empresaNome: resumo.empresaNome,
      cargo: resumo.cargo,
      telefone: resumo.telefone,
    },
    data: chave.data,
    tipo: chave.tipo,
    divergencia: divergencia
      ? { gravidade: divergencia.gravidade, descricao: divergencia.descricao }
      : null,
    dia,
    status,
    observacao: gravada?.observacao ?? null,
    responsavel: gravada?.responsavel ?? null,
    tratadoEm: gravada?.atualizadoEm ?? null,
    mensagens: historico,
    destino,
    prazo: prazoDaOcorrencia(ultimoEnvio, status, hojeNoPortal()),
    /**
     * O texto sugerido nasce no **servidor**, e nao no componente: e a mesma
     * string que o envio usaria se ninguem editasse nada. Monta-la no cliente
     * abriria a porta para a previa mostrar uma coisa e a action enviar outra —
     * o mesmo motivo pelo qual a previa da importacao chama `planejarCarga()`.
     *
     * Com responsavel, o texto e o dele: quem e o colaborador, de que posto, e
     * o prazo de retorno contado de hoje — o dia em que a mensagem sairia.
     */
    sugestao: !dadosDoDia
      ? ""
      : contato.via === "responsavel"
        ? modeloParaResponsavel({
            ...dadosDoDia,
            responsavel: contato.responsavel.nome,
            hora: horaNoPortal(),
            posto: contato.posto,
            colaborador: { nome: resumo.nome, matricula: resumo.matricula, cargo: resumo.cargo },
            prazo: prazoDeRetorno(hojeNoPortal()),
          })
        : modeloDaMensagem({ ...dadosDoDia, nome: resumo.nome }),
    envioDisponivel: zapiConfigurada(),
  };
}

/* -------------------------------------------------------------------------- */
/* Escalas sugeridas pelo ponto                                               */
/* -------------------------------------------------------------------------- */

/**
 * A escala que o ponto sugere para quem esta sem uma.
 *
 * A leitura e a mesma da conferencia — batidas da competencia contra o
 * catalogo —, so que ao contrario: la a escala e conhecida e se procura a
 * divergencia; aqui a divergencia e o criterio e se procura a escala.
 *
 * Sem janela apurada nao ha o que sugerir: "ninguem bateu ponto" e "ninguem
 * importou o arquivo" continuam sendo coisas diferentes.
 */
export async function sugerirEscalasDoPonto(): Promise<PaginaDeSugestoes> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return SEM_SUGESTOES;
  }

  const competencia = vigor.competencia;
  const janela = await janelaApurada(competencia);

  if (!janela) {
    return { ...SEM_SUGESTOES, competencia };
  }

  const [pendentes, catalogo, batidas] = await Promise.all([
    db
      .select({
        id: funcionarios.id,
        nome: funcionarios.nome,
        matricula: funcionarios.matricula,
        cargo: funcionarios.cargo,
        empresaId: funcionarios.empresaId,
        empresaNome: empresas.nome,
      })
      .from(funcionarios)
      .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
      .where(and(eq(funcionarios.ativo, true), isNull(funcionarios.escalaId)))
      .orderBy(asc(funcionarios.nome)),
    db
      .select({
        id: escalas.id,
        nome: escalas.nome,
        diasCiclo: escalas.diasCiclo,
        folgas: folgasDaEscala,
        entrada: escalas.entrada,
        saida: escalas.saida,
        marcacoesEsperadas: escalas.marcacoesEsperadas,
      })
      .from(escalas)
      .where(eq(escalas.ativa, true))
      .orderBy(asc(escalas.nome)),
    batidasDaCompetencia(competencia),
  ]);

  const candidatas: EscalaCandidata[] = catalogo.map((escala) => ({
    ...escala,
    // O `time` do Postgres volta como `HH:MM:SS`; a inferencia le `HH:MM`.
    entrada: formatarHora(escala.entrada),
    saida: formatarHora(escala.saida),
  }));

  // So a vespera (dia da competencia passada) nao faz de ninguem "com ponto".
  const comPonto = pendentes.filter((pessoa) =>
    [...(batidas.get(pessoa.id)?.keys() ?? [])].some((data) => data >= competencia.dataInicio),
  );

  const { sugestoes, semSugestao } = sugerirEscalas({
    pontos: comPonto.map((pessoa) => ({
      funcionarioId: pessoa.id,
      batidasPorData: batidas.get(pessoa.id)!,
    })),
    escalas: candidatas,
    janela: { inicio: janela.inicio, fim: janela.fim },
  });

  const porId = new Map(pendentes.map((pessoa) => [pessoa.id, pessoa]));
  const dados = (funcionarioId: string) => {
    const pessoa = porId.get(funcionarioId)!;

    return {
      nome: pessoa.nome,
      matricula: pessoa.matricula,
      cargo: pessoa.cargo,
      empresaId: pessoa.empresaId,
      empresaNome: pessoa.empresaNome,
    };
  };

  return {
    competencia,
    janela,
    // Confiavel primeiro, e dentro de cada bloco quem tem mais acerto: quem
    // confere comeca pela lista que so precisa de um olhar.
    sugestoes: sugestoes
      .map((sugestao) => ({ ...sugestao, ...dados(sugestao.funcionarioId) }))
      .sort(
        (a, b) =>
          Number(b.confiavel) - Number(a.confiavel) ||
          b.percentual - a.percentual ||
          a.nome.localeCompare(b.nome),
      ),
    semSugestao: semSugestao
      .map((pessoa) => ({ ...pessoa, ...dados(pessoa.funcionarioId) }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    semPonto: pendentes.length - comPonto.length,
    totalSemEscala: pendentes.length,
  };
}
