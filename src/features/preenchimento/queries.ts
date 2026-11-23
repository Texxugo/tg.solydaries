import "server-only";

import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import {
  empresas,
  escalas,
  eventos,
  extras,
  freelancers,
  funcionarios,
  funcaoCiclos,
  funcoesPosto,
  marcacoes,
  postos,
  preenchimentoDias,
  preenchimentoLinhas,
  sinalizacoesDia,
  type EventoCor,
  type EventoNatureza,
  type FuncaoTurma,
} from "@/db/schema";
import { diaAnterior, diaSeguinte } from "@/features/competencias/periodo";
import { competenciaEmVigor } from "@/features/competencias/queries";
import type { CompetenciaResumo } from "@/features/competencias/types";
import { formatarHora } from "@/features/escalas/jornada";
import { janelaApurada } from "@/features/ponto/queries";

import { chaveDaCelula, diasDoPeriodo, valorDaPessoa } from "./grade";
import {
  derivarPrevisto,
  rotuloDasVigencias,
  siglasDaLinha,
  vigenciaDoDia,
  type SiglasDoPrevisto,
  type VigenciaDoCiclo,
} from "./previsto";
import { atribuirBatidas, type BatidaDoRelogio, type JanelaDoRelogio } from "./relogio";
import { idPostoSchema } from "./schema";
import {
  type CelulaDaGrade,
  type FreelancerDisponivel,
  type GradeDoPosto,
  type GrupoDaGrade,
  type LinhaDaGrade,
  type PessoaDisponivel,
  type SinalizacaoDaGrade,
} from "./types";

/**
 * Leituras da grade: chamadas por Server Components, nunca pelo client.
 *
 * Aqui, ao contrario de postos e eventos, **tudo e dado datado**: a linha e a
 * celula pertencem a competencia, e toda consulta comeca por
 * `competenciaEmVigor()`. `null` significa "nao ha o que mostrar", e nunca
 * "mostre todas as competencias" — sem competencia aberta a grade e uma tela
 * vazia com o motivo escrito, e nao a escala de um periodo qualquer.
 *
 * **So o realizado e lido do banco.** O previsto sai das vigencias da funcao e
 * da turma da linha, a cada leitura — nao ha linha de `preenchimento_dias` para
 * ele, do mesmo jeito que nao ha coluna de falta em `marcacoes`.
 */

/**
 * As tabelas de pessoa aparecem duas vezes na mesma consulta: uma para o dono
 * da linha, outra para a contraparte do dia (quem cobriu, com quem se trocou).
 * Sem apelido, o Postgres nao saberia de qual delas e cada coluna.
 */
const donoFuncionario = alias(funcionarios, "dono_funcionario");
const donoFreelancer = alias(freelancers, "dono_freelancer");
const pessoaFuncionario = alias(funcionarios, "pessoa_funcionario");
const pessoaFreelancer = alias(freelancers, "pessoa_freelancer");
const funcaoDestino = alias(funcoesPosto, "funcao_destino");
const postoDestino = alias(postos, "posto_destino");

/** `GP01 · Portaria remota` — o bloco de destino como a celula o mostra. */
const nomeDoDestino = sql<string | null>`case
  when ${funcaoDestino.id} is null then null
  else ${postoDestino.codigo} || ' · ' || ${funcaoDestino.nome}
end`;

/** O nome da contraparte, venha ela da folha ou do cadastro de freelancers. */
const nomeDaPessoa = sql<
  string | null
>`coalesce(${pessoaFuncionario.nome}, ${pessoaFreelancer.nome})`;

/**
 * A grade de um **posto** na competencia em vigor: as colunas do periodo e uma
 * linha por pessoa, agrupadas pela funcao a que pertencem.
 *
 * Um posto por tela, e nao uma funcao: a escala de um lugar se le inteira, com
 * os turnos um embaixo do outro. As funcoes continuam separadas — cada uma vira
 * uma faixa dentro da mesma tabela —, mas nao viram tela nem menu.
 *
 * Devolve tambem a identificacao do **posto**: ela sai do mesmo join das
 * funcoes, e uma consulta a parte so para o cabecalho pagaria duas vezes pela
 * leitura que esta funcao ja faz — em toda gravacao de dia, porque `refresh()`
 * redesenha a tela inteira.
 *
 * `null` significa "este posto nao existe" (a tela da 404), e nao "nao ha o que
 * mostrar": sem competencia aberta a grade volta com as faixas das funcoes,
 * **sem dias e sem linhas**, para a tela poder dizer qual dos dois e o caso.
 *
 * Varias consultas, e nao um join so: o das celulas repetiria a pessoa uma vez
 * por dia — sao ate 31 por linha. O agrupamento teria de acontecer aqui de
 * qualquer forma; o que nao depende de nada vai junto, num `Promise.all`.
 */
export async function obterGrade(postoId: string): Promise<GradeDoPosto | null> {
  await connection();

  // Sem essa validacao, um id fora do formato uuid faria o Postgres lancar erro
  // de cast em vez de simplesmente nao encontrar nada.
  const idValido = idPostoSchema.safeParse(postoId);

  if (!idValido.success) {
    return null;
  }

  const vigor = await competenciaEmVigor();

  /**
   * As funcoes ativas do posto, **antes** das pessoas: a grade desenha uma faixa
   * para cada uma, mesmo a que ainda nao tem ninguem. Montar os grupos so a
   * partir das linhas faria o turno descoberto sumir da tela — e turno sem
   * ninguem e justamente o que quem monta a escala precisa enxergar.
   *
   * E e daqui que sai o previsto: ciclo, folgas e horario sao **da funcao**,
   * porque quem exige 4x2 na Portaria Remota e o contrato do posto, e nao a
   * jornada de quem por acaso a cobre neste mes.
   */
  const funcoes = await db
    .select({
      id: funcoesPosto.id,
      nome: funcoesPosto.nome,
      postoCodigo: postos.codigo,
      postoNome: postos.nome,
      eventoTrabalhoCodigo: eventos.codigo,
      eventoTrabalhoCor: eventos.cor,
    })
    .from(funcoesPosto)
    .innerJoin(postos, eq(postos.id, funcoesPosto.postoId))
    .leftJoin(eventos, eq(eventos.id, funcoesPosto.eventoTrabalhoId))
    .where(and(eq(funcoesPosto.postoId, idValido.data), eq(funcoesPosto.ativa, true)))
    .orderBy(asc(funcoesPosto.ordem), asc(sql`lower(${funcoesPosto.nome})`));

  if (funcoes.length === 0) {
    // Posto sem funcao ativa nao tem grade — mas continua existindo, e a tela
    // precisa dizer isso em vez de dar 404. O cabecalho vem do cadastro.
    const [semFuncoes] = await db
      .select({ id: postos.id, codigo: postos.codigo, nome: postos.nome })
      .from(postos)
      .where(eq(postos.id, idValido.data));

    return semFuncoes
      ? { posto: semFuncoes, dias: [], grupos: [], janelaDoRelogio: null, sinalizacoes: {} }
      : null;
  }

  const posto = { id: idValido.data, codigo: funcoes[0].postoCodigo, nome: funcoes[0].postoNome };
  const dias = vigor ? diasDoPeriodo(vigor.competencia.dataInicio, vigor.competencia.dataFim) : [];

  /**
   * O contrato de cada funcao ao longo do periodo: uma linha por turma e por
   * data de inicio. E daqui que o previsto sai, dia a dia — a escala muda no
   * meio da competencia, entao nao ha "a" configuracao da funcao.
   */
  const contratos = await db
    .select({
      id: funcaoCiclos.id,
      funcaoId: funcaoCiclos.funcaoId,
      turma: funcaoCiclos.turma,
      vigenciaInicio: funcaoCiclos.vigenciaInicio,
      diasCiclo: funcaoCiclos.diasCiclo,
      folgas: funcaoCiclos.folgas,
      entrada: funcaoCiclos.entrada,
      saida: funcaoCiclos.saida,
      inicioCiclo: funcaoCiclos.inicioCiclo,
    })
    .from(funcaoCiclos)
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, funcaoCiclos.funcaoId))
    .where(eq(funcoesPosto.postoId, idValido.data));

  const porFuncaoCiclo = Map.groupBy(
    contratos.map((vigencia) => ({
      ...vigencia,
      // O `time` do Postgres volta como `HH:MM:SS`; as telas leem `HH:MM`.
      entrada: formatarHora(vigencia.entrada),
      saida: formatarHora(vigencia.saida),
    })),
    (vigencia) => vigencia.funcaoId,
  );

  const { padroes, pessoas, celulas, janela, batidasPorFuncionario, sinalizacoes } =
    await conteudoDaCompetencia(idValido.data, vigor?.competencia ?? null);

  const trabalhoPadrao = padroes.find((evento) => evento.natureza === "trabalho") ?? null;
  const folgaPadrao = padroes.find((evento) => evento.natureza === "folga") ?? null;
  const porLinha = Map.groupBy(celulas, (celula) => celula.linhaId);
  const porFuncao = Map.groupBy(pessoas, (pessoa) => pessoa.funcaoId);

  const grupos: GrupoDaGrade[] = funcoes.map((funcao) => {
    const vigencias = porFuncaoCiclo.get(funcao.id) ?? [];
    const trabalho =
      funcao.eventoTrabalhoCodigo && funcao.eventoTrabalhoCor
        ? { codigo: funcao.eventoTrabalhoCodigo, cor: funcao.eventoTrabalhoCor }
        : trabalhoPadrao;

    // Sem as duas siglas nao ha previsto a desenhar. E cadastro faltando, e nao
    // erro: a faixa nasce em branco e a tela diz o que falta, em vez de inventar
    // uma sigla que ninguem cadastrou.
    const siglas: SiglasDoPrevisto | null =
      trabalho && folgaPadrao
        ? {
            trabalho: { codigo: trabalho.codigo, cor: trabalho.cor },
            folga: { codigo: folgaPadrao.codigo, cor: folgaPadrao.cor },
          }
        : null;

    return {
      funcaoId: funcao.id,
      funcaoNome: funcao.nome,
      vigencias,
      siglas,
      rotuloDoCiclo: rotuloDasVigencias(
        vigencias.filter((vigencia) => vigencia.turma === "escala"),
      ),
      linhas: (porFuncao.get(funcao.id) ?? []).map((pessoa) =>
        montarLinha(pessoa, porLinha.get(pessoa.id) ?? [], {
          dias,
          vigencias,
          siglas,
          primeiroDia: vigor?.competencia.dataInicio ?? "",
          janela,
          batidasPorData: pessoa.funcionarioId
            ? batidasPorFuncionario.get(pessoa.funcionarioId)
            : undefined,
        }),
      ),
    };
  });

  return { posto, dias, grupos, janelaDoRelogio: janela, sinalizacoes };
}

/**
 * O que a grade so tem quando ha competencia aberta: as siglas padrao, quem
 * esta escalado, os dias gravados, a janela e as batidas do relogio, e os dias
 * sinalizados.
 *
 * Nenhuma depende das outras, entao saem no mesmo `Promise.all` — idas ao
 * banco em fila sao esperas somadas, e esta leitura se repete a
 * cada dia gravado, porque `refresh()` redesenha a tela inteira.
 *
 * Sem competencia nada disso existe e nenhuma consulta sai: a tela mostra as
 * faixas das funcoes e o aviso de que nao ha periodo aberto.
 */
async function conteudoDaCompetencia(postoId: string, competencia: CompetenciaResumo | null) {
  if (!competencia) {
    return {
      padroes: [],
      pessoas: [],
      celulas: [],
      janela: null,
      batidasPorFuncionario: new Map<string, Map<string, BatidaDoRelogio[]>>(),
      sinalizacoes: {},
    };
  }

  const competenciaId = competencia.id;

  const doPosto = and(
    eq(funcoesPosto.postoId, postoId),
    eq(preenchimentoLinhas.competenciaId, competenciaId),
  );

  // As siglas que o previsto escreve. Sao cadastro (`eventos.padrao`), e nao
  // literais aqui: quem inventa sigla e a operacao.
  const padroes = db
    .select({ codigo: eventos.codigo, cor: eventos.cor, natureza: eventos.natureza })
    .from(eventos)
    .where(and(eq(eventos.padrao, true), eq(eventos.ativo, true)));

  // A sigla que a propria linha escolheu. Alias porque `eventos` ja entra nesta
  // funcao por outros caminhos, e o mesmo nome de tabela duas vezes no mesmo
  // select e ambiguo para o Postgres.
  const eventoDaLinha = alias(eventos, "evento_da_linha");

  const pessoas = db
    .select({
      id: preenchimentoLinhas.id,
      funcaoId: preenchimentoLinhas.funcaoId,
      funcionarioId: preenchimentoLinhas.funcionarioId,
      freelancerId: preenchimentoLinhas.freelancerId,
      turma: preenchimentoLinhas.turma,
      eventoTrabalhoId: preenchimentoLinhas.eventoTrabalhoId,
      eventoTrabalhoCodigo: eventoDaLinha.codigo,
      eventoTrabalhoRotulo: eventoDaLinha.rotulo,
      eventoTrabalhoCor: eventoDaLinha.cor,
      horaEntrada: preenchimentoLinhas.horaEntrada,
      horaSaida: preenchimentoLinhas.horaSaida,
      // O horario da escala cadastrada: e a referencia da virada de turno de
      // quem escreve outra sigla, cujo previsto nao tem horario.
      escalaEntrada: escalas.entrada,
      escalaSaida: escalas.saida,
      observacao: preenchimentoLinhas.observacao,
      ordem: preenchimentoLinhas.ordem,
      funcionarioNome: donoFuncionario.nome,
      funcionarioMatricula: donoFuncionario.matricula,
      freelancerNome: donoFreelancer.nome,
      freelancerCodigo: donoFreelancer.codigo,
    })
    .from(preenchimentoLinhas)
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
    .leftJoin(donoFuncionario, eq(donoFuncionario.id, preenchimentoLinhas.funcionarioId))
    .leftJoin(donoFreelancer, eq(donoFreelancer.id, preenchimentoLinhas.freelancerId))
    .leftJoin(eventoDaLinha, eq(eventoDaLinha.id, preenchimentoLinhas.eventoTrabalhoId))
    .leftJoin(escalas, eq(escalas.id, donoFuncionario.escalaId))
    .where(doPosto)
    .orderBy(
      asc(preenchimentoLinhas.ordem),
      asc(sql`lower(coalesce(${donoFuncionario.nome}, ${donoFreelancer.nome}))`),
    );

  const celulas = db
    .select({
      linhaId: preenchimentoDias.linhaId,
      data: preenchimentoDias.data,
      eventoId: preenchimentoDias.eventoId,
      eventoCodigo: eventos.codigo,
      eventoCor: eventos.cor,
      eventoNatureza: eventos.natureza,
      horaEntrada: preenchimentoDias.horaEntrada,
      horaSaida: preenchimentoDias.horaSaida,
      pessoaFuncionarioId: preenchimentoDias.pessoaFuncionarioId,
      pessoaFreelancerId: preenchimentoDias.pessoaFreelancerId,
      pessoaNome: nomeDaPessoa,
      destinoId: preenchimentoDias.funcaoDestinoId,
      destinoNome: nomeDoDestino,
      observacao: preenchimentoDias.observacao,
      /*
        "Este dia lanca hora extra?" e lido do proprio lancamento, e nao de um
        booleano em `preenchimento_dias` que poderia discordar dele: o extra e
        a linha em `extras`, e a celula so aponta para ela. O `left join` nao
        multiplica a grade porque `extras_preenchimento_dia_unico` garante uma
        por celula.
      */
      extra: sql<boolean>`${extras.id} is not null`,
      // Esta e coluna daqui: ela nao vira lancamento em lugar nenhum, entao nao
      // ha outro registro a que a celula pudesse apontar.
      intrajornada: preenchimentoDias.intrajornada,
      dataTrabalhada: preenchimentoDias.dataTrabalhada,
    })
    .from(preenchimentoDias)
    .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, preenchimentoDias.linhaId))
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
    .leftJoin(eventos, eq(eventos.id, preenchimentoDias.eventoId))
    .leftJoin(pessoaFuncionario, eq(pessoaFuncionario.id, preenchimentoDias.pessoaFuncionarioId))
    .leftJoin(pessoaFreelancer, eq(pessoaFreelancer.id, preenchimentoDias.pessoaFreelancerId))
    .leftJoin(funcaoDestino, eq(funcaoDestino.id, preenchimentoDias.funcaoDestinoId))
    .leftJoin(postoDestino, eq(postoDestino.id, funcaoDestino.postoId))
    .leftJoin(extras, eq(extras.preenchimentoDiaId, preenchimentoDias.id))
    .where(doPosto);

  /*
    As batidas do relogio de quem esta escalado no posto — o que a grade cruza
    com o realizado, sem nunca preencher nada a partir delas.

    Vao ate o dia seguinte ao fim da competencia: a saida do turno noturno do
    ultimo dia cai la. E comecam no dia anterior ao inicio, que e da
    competencia passada: com ele o agrupamento sabe que a saida das 06:00 do
    dia 21 fecha o plantao do dia 20, sem precisar cortar pelo horario (o corte
    levava junto a entrada das 17:55 do proprio dia 21). `selectDistinct` porque a mesma pessoa pode estar em
    duas funcoes do posto, e o join a repetiria. O indice unico de `marcacoes`
    `(funcionario, data, hora)` e o que responde esta consulta.
  */
  const batidas = db
    .selectDistinct({
      funcionarioId: marcacoes.funcionarioId,
      data: marcacoes.data,
      hora: marcacoes.hora,
      incluida: marcacoes.incluida,
    })
    .from(marcacoes)
    .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.funcionarioId, marcacoes.funcionarioId))
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
    .where(
      and(
        doPosto,
        gte(marcacoes.data, diaAnterior(competencia.dataInicio)),
        lte(marcacoes.data, diaSeguinte(competencia.dataFim)),
      ),
    )
    .orderBy(asc(marcacoes.data), asc(marcacoes.hora));

  // Os dias marcados com o "!" do modal. So o estado: quem sinalizou e quando
  // sao da tela "Dias sinalizados", e nao da grade.
  const sinalizados = db
    .select({
      linhaId: sinalizacoesDia.linhaId,
      data: sinalizacoesDia.data,
      resolvida: sql<boolean>`${sinalizacoesDia.resolvidoEm} is not null`,
      observacao: sinalizacoesDia.observacao,
    })
    .from(sinalizacoesDia)
    .innerJoin(preenchimentoLinhas, eq(preenchimentoLinhas.id, sinalizacoesDia.linhaId))
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
    .where(doPosto);

  const [padroesLidos, pessoasLidas, celulasLidas, janela, batidasLidas, sinalizadosLidos] =
    await Promise.all([
      padroes,
      pessoas,
      celulas,
      janelaApurada(competencia),
      batidas,
      sinalizados,
    ]);

  const sinalizacoes: Record<string, SinalizacaoDaGrade> = {};

  for (const marca of sinalizadosLidos) {
    sinalizacoes[chaveDaCelula(marca.linhaId, marca.data)] = {
      estado: marca.resolvida ? "resolvida" : "pendente",
      observacao: marca.observacao,
    };
  }

  // Por pessoa e por data, ja em ordem de hora — o formato que
  // `atribuirBatidas()` percorre.
  const batidasPorFuncionario = new Map<string, Map<string, BatidaDoRelogio[]>>();

  for (const batida of batidasLidas) {
    const porData = batidasPorFuncionario.get(batida.funcionarioId) ?? new Map();
    batidasPorFuncionario.set(batida.funcionarioId, porData);

    const doDia = porData.get(batida.data) ?? [];
    doDia.push({ hora: formatarHora(batida.hora), incluida: batida.incluida });
    porData.set(batida.data, doDia);
  }

  return {
    padroes: padroesLidos,
    pessoas: pessoasLidas,
    celulas: celulasLidas,
    janela: janela ? { inicio: janela.inicio, fim: janela.fim } : null,
    batidasPorFuncionario,
    sinalizacoes,
  };
}

/** Uma pessoa, o previsto derivado dela e as celulas que ela ja tem gravadas. */
function montarLinha(
  pessoa: {
    id: string;
    funcionarioId: string | null;
    freelancerId: string | null;
    turma: FuncaoTurma;
    eventoTrabalhoId: string | null;
    eventoTrabalhoCodigo: string | null;
    eventoTrabalhoRotulo: string | null;
    eventoTrabalhoCor: EventoCor | null;
    horaEntrada: string | null;
    horaSaida: string | null;
    escalaEntrada: string | null;
    escalaSaida: string | null;
    observacao: string | null;
    ordem: number;
    funcionarioNome: string | null;
    funcionarioMatricula: string | null;
    freelancerNome: string | null;
    freelancerCodigo: string | null;
  },
  daLinha: {
    data: string;
    eventoId: string | null;
    eventoCodigo: string | null;
    eventoCor: EventoCor | null;
    eventoNatureza: EventoNatureza | null;
    horaEntrada: string | null;
    horaSaida: string | null;
    pessoaFuncionarioId: string | null;
    pessoaFreelancerId: string | null;
    pessoaNome: string | null;
    destinoId: string | null;
    destinoNome: string | null;
    observacao: string | null;
    extra: boolean;
    intrajornada: boolean;
    dataTrabalhada: string | null;
  }[],
  contexto: {
    dias: string[];
    vigencias: readonly VigenciaDoCiclo[];
    siglas: SiglasDoPrevisto | null;
    primeiroDia: string;
    janela: JanelaDoRelogio | null;
    batidasPorData: ReadonlyMap<string, readonly BatidaDoRelogio[]> | undefined;
  },
): LinhaDaGrade {
  const realizado: Record<string, CelulaDaGrade> = {};

  for (const celula of daLinha) {
    realizado[celula.data] = {
      data: celula.data,
      eventoId: celula.eventoId,
      eventoCodigo: celula.eventoCodigo,
      eventoCor: celula.eventoCor,
      // O `time` do Postgres volta como `HH:MM:SS`; as telas leem `HH:MM`.
      horaEntrada: celula.horaEntrada ? formatarHora(celula.horaEntrada) : null,
      horaSaida: celula.horaSaida ? formatarHora(celula.horaSaida) : null,
      pessoa: valorDaPessoa(celula.pessoaFuncionarioId, celula.pessoaFreelancerId),
      pessoaNome: celula.pessoaNome,
      destinoId: celula.destinoId,
      destinoNome: celula.destinoNome,
      observacao: celula.observacao,
      extra: celula.extra,
      intrajornada: celula.intrajornada,
      dataTrabalhada: celula.dataTrabalhada,
    };
  }

  const propria =
    pessoa.eventoTrabalhoCodigo && pessoa.eventoTrabalhoCor
      ? { codigo: pessoa.eventoTrabalhoCodigo, cor: pessoa.eventoTrabalhoCor }
      : null;
  const { siglas, horarioDaVigencia } = siglasDaLinha(contexto.siglas, propria);
  const vigenciasDaTurma = contexto.vigencias.filter((vigencia) => vigencia.turma === pessoa.turma);

  // O horario proprio so vale com sigla propria: com a da funcao, o horario e o
  // da vigencia, e o da linha (que a action ja limpa) seria um segundo contrato.
  const horarioDaLinha =
    pessoa.horaEntrada && pessoa.horaSaida
      ? { entrada: formatarHora(pessoa.horaEntrada), saida: formatarHora(pessoa.horaSaida) }
      : null;

  const previsto = derivarPrevisto(vigenciasDaTurma, {
    dias: contexto.dias,
    primeiroDia: contexto.primeiroDia,
    siglas,
    horarioDaVigencia,
    horarioDaLinha,
  });

  /*
    De onde sai a hora de corte da virada de turno, dia a dia: a vigencia da
    turma — o mesmo horario que o previsto carrega —; com sigla propria, o
    horario da linha (o 18:00-06:00 do `N`); e, sem ele, a escala cadastrada da
    pessoa. A escala cadastrada e a mesma que a apuracao do ponto usa, entao
    nesses dias as duas telas atribuem as batidas igual.
    Freelancer nao bate ponto: `null`, e nao lista vazia.
  */
  const cadastro =
    pessoa.escalaEntrada && pessoa.escalaSaida
      ? { entrada: formatarHora(pessoa.escalaEntrada), saida: formatarHora(pessoa.escalaSaida) }
      : null;

  const batidas = pessoa.funcionarioId
    ? atribuirBatidas({
        dias: contexto.dias,
        janela: contexto.janela,
        batidasPorData: contexto.batidasPorData,
        referenciaDoDia: (data) => {
          const vigencia = horarioDaVigencia ? vigenciaDoDia(data, vigenciasDaTurma) : null;

          return vigencia
            ? { entrada: vigencia.entrada, saida: vigencia.saida }
            : (horarioDaLinha ?? cadastro);
        },
      })
    : null;

  return {
    id: pessoa.id,
    nome: pessoa.funcionarioNome ?? pessoa.freelancerNome ?? "(sem nome)",
    identificacao: pessoa.funcionarioMatricula ?? pessoa.freelancerCodigo,
    freelancer: pessoa.freelancerId !== null,
    funcionarioId: pessoa.funcionarioId,
    freelancerId: pessoa.freelancerId,
    turma: pessoa.turma,
    eventoTrabalhoId: pessoa.eventoTrabalhoId,
    horario: horarioDaLinha,
    // So marca quem de fato foge da funcao: escolher a mesma sigla que ela ja
    // escreve nao e excecao nenhuma a apontar na coluna do nome.
    eventoTrabalhoRotulo:
      propria && propria.codigo !== contexto.siglas?.trabalho.codigo
        ? pessoa.eventoTrabalhoRotulo
        : null,
    observacao: pessoa.observacao,
    ordem: pessoa.ordem,
    previsto,
    realizado,
    batidas,
  };
}

/**
 * Os funcionarios que podem ser escalados: todos os ativos.
 *
 * Sem filtrar quem ja esta no posto: a inclusao escolhe **em qual funcao** a
 * pessoa entra, e a mesma pessoa pode legitimamente estar em duas — e assim que
 * uma troca de turno no meio do mes e registrada. A repeticao dentro da
 * **mesma** funcao continua barrada, mas pelo indice parcial unico, que e quem
 * sabe disso sem correr atras.
 */
export const listarDisponiveis = cache(async (): Promise<PessoaDisponivel[]> => {
  await connection();

  return db
    .select({
      id: funcionarios.id,
      nome: funcionarios.nome,
      identificacao: funcionarios.matricula,
      empresaNome: empresas.nome,
    })
    .from(funcionarios)
    .leftJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .where(eq(funcionarios.ativo, true))
    .orderBy(asc(sql`lower(${funcionarios.nome})`));
});

/**
 * Quantas pessoas e quantos dias de realizado a competencia em vigor ja tem — o
 * resumo que a lista de postos mostra no cabecalho.
 *
 * Serve para responder "a escala deste periodo ja foi conferida?" sem abrir
 * posto por posto, que e a primeira pergunta de quem entra na tela.
 */
export async function resumoDaCompetencia(): Promise<{ pessoas: number; celulas: number } | null> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return null;
  }

  const [linha] = await db
    .select({
      pessoas: sql<number>`cast(count(distinct ${preenchimentoLinhas.id}) as int)`,
      celulas: sql<number>`cast(count(${preenchimentoDias.id}) as int)`,
    })
    .from(preenchimentoLinhas)
    .leftJoin(preenchimentoDias, eq(preenchimentoDias.linhaId, preenchimentoLinhas.id))
    .where(eq(preenchimentoLinhas.competenciaId, vigor.competencia.id));

  return linha ?? { pessoas: 0, celulas: 0 };
}

/**
 * Os freelancers ja cadastrados, para o campo de inclusao sugerir em vez de
 * criar um homonimo. Cadastro, e nao dado datado: o freela de agosto e o mesmo
 * de setembro, e e justamente para isso que ele tem tabela em vez de virar
 * texto solto na linha.
 */
export const listarFreelancers = cache(async (): Promise<FreelancerDisponivel[]> => {
  await connection();

  return db
    .select({ id: freelancers.id, nome: freelancers.nome, identificacao: freelancers.codigo })
    .from(freelancers)
    .where(eq(freelancers.ativo, true))
    .orderBy(asc(sql`lower(${freelancers.nome})`));
});
