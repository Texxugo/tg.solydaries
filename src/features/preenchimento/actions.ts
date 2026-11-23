"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  eventos,
  extras,
  freelancers,
  funcionarios,
  funcoesPosto,
  preenchimentoAlteracoes,
  preenchimentoDias,
  preenchimentoLinhas,
  sinalizacoesDia,
} from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarData } from "@/features/competencias/periodo";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";

import { chaveDaCelula, diasTrabalhadosPorTroca, lerPessoaEscolhida } from "./grade";
import { obterGrade } from "./queries";
import {
  incluirFreelancerSchema,
  incluirFuncionarioSchema,
  limparDiaSchema,
  linhaSchema,
  pessoasDaFuncaoSchema,
  preencherDiasSchema,
  salvarDiaSchema,
  anotarSinalizacaoSchema,
  sinalizarDiaSchema,
} from "./schema";
import type {
  DiaState,
  IncluirPessoaState,
  LinhaState,
  PreencherDiasState,
  SinalizacaoState,
} from "./types";

/**
 * Escritas da grade de preenchimento.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod, refaz a checagem de acesso e — porque tudo aqui e dado datado — comeca
 * por `competenciaDeEscrita()` — que, durante uma consulta, e a competencia
 * consultada. Os dias sao conferidos contra o periodo dela e as linhas contra
 * o `competencia_id`; a inclusao, que nao tem nenhum dos dois, manda a
 * competencia em que a tela foi desenhada.
 *
 * **So o realizado se grava.** O previsto vem das vigencias da funcao (cadastro
 * de postos) e da turma da linha; nao ha action que o escreva, do mesmo jeito
 * que nao ha action que grave falta na apuracao do ponto.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const AREA = "preenchimento" as const;

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** O estado vazio de uma celula — o que o historico grava quando o dia e apagado. */
const CELULA_VAZIA = {
  eventoId: null,
  horaEntrada: null,
  horaSaida: null,
  pessoaFuncionarioId: null,
  pessoaFreelancerId: null,
  funcaoDestinoId: null,
  observacao: null,
  extra: false,
  intrajornada: false,
  dataTrabalhada: null,
} as const;

/* -------------------------------------------------------------------------- */
/* O dia do realizado                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A linha e a data conferidas contra o banco: a linha existe, e da competencia
 * aberta, e o dia cai dentro do periodo.
 *
 * Nao e redundante com o Zod: ele so sabe que o id **parece** um uuid. Sem esta
 * leitura, um id postado na mao alcancaria a grade de outro periodo — e uma
 * data fora da competencia gravaria um dia que a tela nunca mais mostraria.
 */
async function conferirDia(linhaId: string, data: string) {
  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { ok: false as const, mensagem: escrita.mensagem };
  }

  // Duas comparacoes de string, e nao a lista de dias do periodo: `YYYY-MM-DD`
  // ordena como data, e montar trinta e um dias para descobrir se um deles e
  // este seria trabalho repetido a cada dia gravado. E nao custa ida ao banco.
  if (data < escrita.competencia.dataInicio || data > escrita.competencia.dataFim) {
    return { ok: false as const, mensagem: "Este dia esta fora da competencia aberta." };
  }

  /*
    A leitura ja traz o que o extra precisa saber, porque e a mesma linha: de
    quem e o dia (o dono, quando a celula nao nomeia quem cobriu), em que posto
    ele acontece e como a funcao se chama — que e o "local" do lancamento. Uma
    consulta a parte para isso seria uma segunda espera em cima do gesto que
    mais se repete no modulo.
  */
  const [linha] = await db
    .select({
      id: preenchimentoLinhas.id,
      funcionarioId: preenchimentoLinhas.funcionarioId,
      freelancerId: preenchimentoLinhas.freelancerId,
      funcaoNome: funcoesPosto.nome,
      postoId: funcoesPosto.postoId,
    })
    .from(preenchimentoLinhas)
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
    .where(
      and(
        eq(preenchimentoLinhas.id, linhaId),
        eq(preenchimentoLinhas.competenciaId, escrita.competencia.id),
      ),
    );

  if (!linha) {
    return {
      ok: false as const,
      mensagem: "Esta pessoa nao esta na escala da competencia aberta.",
    };
  }

  return {
    ok: true as const,
    linha,
    competenciaId: escrita.competencia.id,
    periodo: { inicio: escrita.competencia.dataInicio, fim: escrita.competencia.dataFim },
  };
}

/**
 * O que a sigla escolhida exige a mais do dia. `null` quando nao ha sigla — e
 * tambem quando o id postado nao existe, que quem chama distingue.
 *
 * Funcao a parte para poder sair **junto** de `conferirDia()`: as duas leituras
 * nao dependem uma da outra, e em fila seriam duas esperas em cima de um gesto
 * que se repete uma vez por dia preenchido.
 */
async function lerExigencias(eventoId: string | null) {
  if (!eventoId) {
    return null;
  }

  const [evento] = await db
    .select({
      exigePessoa: eventos.exigePessoa,
      exigeDestino: eventos.exigeDestino,
      exigeDiaTrabalhado: eventos.exigeDiaTrabalhado,
      natureza: eventos.natureza,
    })
    .from(eventos)
    .where(eq(eventos.id, eventoId));

  return evento;
}

/** A celula de um dia, com o que a TE precisa saber dela. `null` = dia em branco. */
async function lerCelula(linhaId: string, data: string) {
  const [celula] = await db
    .select({
      id: preenchimentoDias.id,
      linhaId: preenchimentoDias.linhaId,
      data: preenchimentoDias.data,
      eventoId: preenchimentoDias.eventoId,
      codigo: eventos.codigo,
      natureza: eventos.natureza,
      horaEntrada: preenchimentoDias.horaEntrada,
      horaSaida: preenchimentoDias.horaSaida,
      pessoaFuncionarioId: preenchimentoDias.pessoaFuncionarioId,
      pessoaFreelancerId: preenchimentoDias.pessoaFreelancerId,
      funcaoDestinoId: preenchimentoDias.funcaoDestinoId,
      observacao: preenchimentoDias.observacao,
      intrajornada: preenchimentoDias.intrajornada,
      dataTrabalhada: preenchimentoDias.dataTrabalhada,
    })
    .from(preenchimentoDias)
    .leftJoin(eventos, eq(eventos.id, preenchimentoDias.eventoId))
    .where(and(eq(preenchimentoDias.linhaId, linhaId), eq(preenchimentoDias.data, data)));

  return celula ?? null;
}

/** A TE da linha que aponta este dia como trabalhado, quando ha uma. */
async function trocaQueApontou(linhaId: string, data: string) {
  const [troca] = await db
    .select({ data: preenchimentoDias.data })
    .from(preenchimentoDias)
    .where(and(eq(preenchimentoDias.linhaId, linhaId), eq(preenchimentoDias.dataTrabalhada, data)));

  return troca ?? null;
}

/**
 * Tira a sigla de folga do dia que a TE aponta como trabalhado.
 *
 * So a sigla sai: bilhete, horario e intrajornada ficam, porque nao dizem nada
 * contra a troca. Sem mais nada, a celula e apagada — celula vazia nao existe.
 * O historico do dia ganha a linha da mudanca, como se alguem a tivesse feito
 * no modal: e isso que responde "por que o F daqui sumiu?".
 */
async function liberarDiaTrabalhado(
  tx: Transacao,
  celula: NonNullable<Awaited<ReturnType<typeof lerCelula>>>,
  usuarioId: string,
) {
  const resto = {
    eventoId: null,
    horaEntrada: celula.horaEntrada,
    horaSaida: celula.horaSaida,
    pessoaFuncionarioId: celula.pessoaFuncionarioId,
    pessoaFreelancerId: celula.pessoaFreelancerId,
    funcaoDestinoId: celula.funcaoDestinoId,
    observacao: celula.observacao,
    intrajornada: celula.intrajornada,
    dataTrabalhada: null,
  };
  const vazia =
    !resto.horaEntrada &&
    !resto.pessoaFuncionarioId &&
    !resto.pessoaFreelancerId &&
    !resto.funcaoDestinoId &&
    !resto.observacao &&
    !resto.intrajornada;

  if (vazia) {
    await apagarDia(tx, celula.linhaId, celula.data);
  } else {
    await tx.update(preenchimentoDias).set(resto).where(eq(preenchimentoDias.id, celula.id));
  }

  await tx.insert(preenchimentoAlteracoes).values({
    linhaId: celula.linhaId,
    data: celula.data,
    ...(vazia ? CELULA_VAZIA : { ...resto, extra: false }),
    usuarioId,
  });
}

function apagarDia(tx: Transacao, linhaId: string, data: string) {
  return tx
    .delete(preenchimentoDias)
    .where(and(eq(preenchimentoDias.linhaId, linhaId), eq(preenchimentoDias.data, data)));
}

/** O lancamento que um dia marcado como extra gera. `null` = este dia nao gera. */
type ExtraDoDia = {
  competenciaId: string;
  data: string;
  postoId: string;
  /** Como a funcao se chama: e o complemento que o posto sozinho nao da. */
  local: string;
  funcionarioId: string | null;
  freelancerId: string | null;
  horaEntrada: string;
  horaSaida: string;
  observacao: string | null;
  usuarioId: string;
};

/**
 * Poe — ou tira — a hora extra que este dia lanca na Conferencia de horas
 * extras.
 *
 * O lancamento e uma linha de `extras` como qualquer outra, a mesma que a tela
 * de registro cria, so que apontando para a celula que a gerou. Ele mora la, e
 * nao numa tabela do preenchimento, porque quem confere as horas do periodo le
 * **uma** lista — venha ela da grade ou da mao.
 *
 * O extra anterior sai sempre, antes de qualquer coisa: desmarcar a caixa,
 * mudar o horario ou trocar quem cobriu mudam a chave do lancamento, e um
 * `update` no lugar do par apagar+gravar deixaria para tras o extra da versao
 * anterior do dia.
 */
async function sincronizarExtra(tx: Transacao, diaId: string, extra: ExtraDoDia | null) {
  await tx.delete(extras).where(eq(extras.preenchimentoDiaId, diaId));

  if (!extra) {
    return;
  }

  const { usuarioId, ...colunas } = extra;
  const valores = { ...colunas, preenchimentoDiaId: diaId, registradoPorId: usuarioId };

  /*
    O conflito aqui e com um extra que **ja existe** para a mesma pessoa, no
    mesmo dia, no mesmo posto e com a mesma entrada — o que alguem lancou a mao
    antes de marcar a cobertura na grade. Ele nao e um extra diferente: e este.
    Adotar a linha existente e o que evita que a grade recuse o dia por causa de
    um lancamento feito pelo outro caminho.

    Sao dois indices parciais, e nao um: uma das duas colunas de pessoa e sempre
    nula, e `null` nao repete em indice unico.
  */
  const atualizacao = {
    competenciaId: valores.competenciaId,
    postoId: valores.postoId,
    local: valores.local,
    horaSaida: valores.horaSaida,
    observacao: valores.observacao,
    preenchimentoDiaId: diaId,
    registradoPorId: usuarioId,
    atualizadoEm: new Date(),
  };

  if (valores.funcionarioId) {
    await tx
      .insert(extras)
      .values(valores)
      .onConflictDoUpdate({
        target: [extras.funcionarioId, extras.data, extras.postoId, extras.horaEntrada],
        targetWhere: sql`funcionario_id is not null`,
        set: atualizacao,
      });

    return;
  }

  await tx
    .insert(extras)
    .values(valores)
    .onConflictDoUpdate({
      target: [extras.freelancerId, extras.data, extras.postoId, extras.horaEntrada],
      targetWhere: sql`freelancer_id is not null`,
      set: atualizacao,
    });
}

/**
 * Grava o realizado de um dia — o que o modal do dia manda.
 *
 * Um POST por dia, e nao um envio da grade inteira: o realizado se preenche
 * quando algo acontece naquele dia, e mandar seiscentas celulas para corrigir
 * uma so obrigaria a action a adivinhar o que mudou.
 *
 * O que o modal manda vazio **apaga** o que estava la: ele desenha todos os
 * campos do dia, e campo desenhado e campo que a pessoa pode ter esvaziado de
 * proposito.
 */
export async function salvarDia(_estadoAnterior: DiaState, formData: FormData): Promise<DiaState> {
  const usuario = await exigirAcesso(AREA);

  // A chave sai dos campos crus e volta em **toda** resposta, inclusive na
  // recusa: sem `refresh()`, e por ela que a grade sabe qual celula promover —
  // ou desfazer, quando o servidor nao aceitou o que a tela ja desenhou.
  const chave = chaveDaCelula(
    String(formData.get("linhaId") ?? ""),
    String(formData.get("data") ?? ""),
  );

  const resultado = salvarDiaSchema.safeParse({
    linhaId: String(formData.get("linhaId") ?? ""),
    data: String(formData.get("data") ?? ""),
    eventoId: String(formData.get("eventoId") ?? ""),
    horaEntrada: String(formData.get("horaEntrada") ?? ""),
    horaSaida: String(formData.get("horaSaida") ?? ""),
    pessoa: String(formData.get("pessoa") ?? ""),
    destino: String(formData.get("destino") ?? ""),
    extra: String(formData.get("extra") ?? ""),
    intrajornada: String(formData.get("intrajornada") ?? ""),
    dataTrabalhada: String(formData.get("dataTrabalhada") ?? ""),
    observacao: String(formData.get("observacao") ?? ""),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      chave,
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const {
    linhaId,
    data,
    eventoId,
    horaEntrada,
    horaSaida,
    destino,
    extra,
    intrajornada,
    observacao,
  } = resultado.data;

  // As duas leituras nao dependem uma da outra: em fila, cada dia gravado
  // pagaria duas esperas onde cabe uma.
  const [conferencia, exigencias] = await Promise.all([
    conferirDia(linhaId, data),
    lerExigencias(eventoId),
  ]);

  if (!conferencia.ok) {
    return { status: "error", mensagem: conferencia.mensagem, chave };
  }

  const pessoa = lerPessoaEscolhida(resultado.data.pessoa);

  if (!pessoa) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      chave,
      erros: { pessoa: ["Escolha alguem da lista"] },
    };
  }

  /**
   * O evento decide o que mais o dia precisa dizer. Sao os dois flags do
   * cadastro (`exige_pessoa`, `exige_destino`), e nao uma lista de siglas aqui:
   * uma sexta situacao nao custa migration nenhuma.
   *
   * Aqui a exigencia e **recusa**, e nao pendencia como na versao digitada na
   * celula: o modal desenha os dois campos na mesma tela, entao completar o dia
   * nao cobra mais uma navegacao de quem esta preenchendo. O modal ja marca os
   * campos como `required`, mas a checagem fica: action e endpoint POST
   * publico, e `required` nao e validacao.
   */
  if (eventoId && !exigencias) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      chave,
      erros: { eventoId: ["Evento nao encontrado"] },
    };
  }

  if (exigencias?.exigePessoa && !pessoa.funcionarioId && !pessoa.freelancerId) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      chave,
      erros: { pessoa: ["Esta sigla precisa dizer quem cobriu ou com quem foi a troca"] },
    };
  }

  if (exigencias?.exigeDestino && !destino) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      chave,
      erros: { destino: ["Esta sigla precisa dizer para qual posto a pessoa foi"] },
    };
  }

  /*
    O dia trabalhado da TE. So existe quando a sigla pede: postado com outra
    sigla, o campo e ignorado — e trocar a TE por outra sigla leva a data junto,
    devolvendo o dia apontado a folga que ele era.
  */
  const dataTrabalhada = exigencias?.exigeDiaTrabalhado ? resultado.data.dataTrabalhada : null;

  if (exigencias?.exigeDiaTrabalhado) {
    const erro = !dataTrabalhada
      ? "Escolha a folga em que a pessoa trabalhou"
      : dataTrabalhada === data
        ? "O dia trabalhado precisa ser outro dia"
        : dataTrabalhada < conferencia.periodo.inicio || dataTrabalhada > conferencia.periodo.fim
          ? "O dia trabalhado precisa estar nesta competencia"
          : null;

    if (erro) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        chave,
        erros: { dataTrabalhada: [erro] },
      };
    }
  }

  const [diaApontado, trocaDesteDia] = await Promise.all([
    dataTrabalhada ? lerCelula(linhaId, dataTrabalhada) : null,
    eventoId ? trocaQueApontou(linhaId, data) : null,
  ]);

  /*
    Este dia ja e o dia trabalhado de uma TE: ele conta como trabalho por ela, e
    outra sigla aqui contaria o mesmo dia duas vezes. O bilhete e a intrajornada
    continuam livres — eles nao mudam a contagem.
  */
  if (trocaDesteDia) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      chave,
      erros: {
        eventoId: [
          `Este dia e o dia trabalhado da TE de ${formatarData(trocaDesteDia.data)}: para mudar, abra aquele dia`,
        ],
      },
    };
  }

  /*
    O dia apontado pode estar em branco ou ter uma sigla de folga — o F que o
    "Preencher varios dias" deixa em toda folga, e que a TE vem justamente
    desmentir. Qualquer outra sigla ja diz o que aconteceu ali, e a TE nao a
    sobrescreve sem ninguem ver.
  */
  if (
    diaApontado?.eventoId &&
    (diaApontado.natureza !== "folga" || diaApontado.dataTrabalhada !== null)
  ) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      chave,
      erros: {
        dataTrabalhada: [
          `${formatarData(diaApontado.data)} ja tem ${diaApontado.codigo} lancado: apague-o antes ou escolha outro dia`,
        ],
      },
    };
  }

  const valores = {
    eventoId,
    horaEntrada,
    horaSaida,
    pessoaFuncionarioId: pessoa.funcionarioId,
    pessoaFreelancerId: pessoa.freelancerId,
    funcaoDestinoId: destino,
    observacao,
  };

  /*
    Celula sem nada nao existe — ela seria indistinguivel de dia em branco, e o
    `check preenchimento_dias_nao_vazia` a recusaria. Esvaziar tudo apaga o dia.

    A intrajornada entra na conta (e no `check`) porque tambem e algo a dizer
    sobre o dia: sem ela, marcar so a caixa apagaria a celula em silencio. Fica
    fora de `valores` porque a comparacao ali e com `null`, e booleano nunca e.
  */
  const colunas = { ...valores, intrajornada, dataTrabalhada };
  const vazia = Object.values(valores).every((campo) => campo === null) && !intrajornada;

  /*
    O extra e de **quem cobriu** o dia; so quando a celula nao nomeia ninguem
    ele e do dono da linha, que e quem ficou no posto. E a mesma leitura que a
    grade ja faz na tela: a contraparte, quando ha, e a pessoa daquele dia.

    A troca interna e a excecao: o colega que ela nomeia e com quem se trocou, e
    quem trabalhou naquele dia foi o dono da linha — como em `celulaParaSinal()`.
  */
  const quemFezOExtra =
    (pessoa.funcionarioId || pessoa.freelancerId) && exigencias?.natureza !== "troca"
      ? pessoa
      : {
          funcionarioId: conferencia.linha.funcionarioId,
          freelancerId: conferencia.linha.freelancerId,
        };

  try {
    await db.transaction(async (tx) => {
      // O F do dia trabalhado sai na mesma transacao da TE: as duas celulas
      // juntas sao a troca, e uma sem a outra contaria aquele dia duas vezes.
      if (diaApontado?.eventoId) {
        await liberarDiaTrabalhado(tx, diaApontado, usuario.id);
      }

      if (vazia) {
        // O extra vai junto, pela FK `cascade`: sem a cobertura que o gerou, ele
        // continuaria somando horas que ninguem fez.
        await apagarDia(tx, linhaId, data);
      } else {
        const [gravada] = await tx
          .insert(preenchimentoDias)
          .values({ linhaId, data, ...colunas })
          .onConflictDoUpdate({
            target: [preenchimentoDias.linhaId, preenchimentoDias.data],
            set: colunas,
          })
          .returning({ id: preenchimentoDias.id });

        // Na mesma transacao da celula, e pelo mesmo motivo do historico: uma
        // sem a outra mente. Extra sem a celula soma horas de uma cobertura que
        // nao existe; celula sem o extra esconde horas que alguem vai pagar.
        await sincronizarExtra(
          tx,
          gravada.id,
          extra && horaEntrada && horaSaida
            ? {
                competenciaId: conferencia.competenciaId,
                // As horas da TE aconteceram no dia trabalhado, e nao no dia
                // em que a pessoa folgou.
                data: dataTrabalhada ?? data,
                postoId: conferencia.linha.postoId,
                local: conferencia.linha.funcaoNome,
                ...quemFezOExtra,
                horaEntrada,
                horaSaida,
                observacao,
                usuarioId: usuario.id,
              }
            : null,
        );
      }

      /**
       * O historico vai na **mesma transacao** que a celula: uma sem a outra
       * mente. Celula sem historico apagaria a resposta de "quem mudou isso?";
       * historico sem a celula contaria uma alteracao que nao aconteceu. Ele
       * nao aparece na tela: fica no banco para quando for preciso saber.
       *
       * A linha guarda o estado **depois** — inclusive o estado vazio de quem
       * apagou o dia.
       */
      await tx.insert(preenchimentoAlteracoes).values({
        linhaId,
        data,
        ...(vazia ? CELULA_VAZIA : { ...colunas, extra }),
        usuarioId: usuario.id,
      });
    });
  } catch (erro) {
    // O indice `preenchimento_dias_trabalhado_unico`: outra TE apontou o mesmo
    // dia entre a leitura acima e esta gravacao.
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        chave,
        erros: { dataTrabalhada: ["Este dia ja e o dia trabalhado de outra TE"] },
      };
    }

    console.error("Falha ao gravar o dia da grade", erro);
    return { status: "error", mensagem: FALHA_GENERICA, chave };
  }

  /*
    A TE que substituiu o F do dia trabalhado mexeu em **outra** celula, que a
    camada da sessao nao conhece. So nesse caso a rota e redesenhada: e a
    excecao prevista em `DiaState`, e nao o caminho de todo dia gravado.
  */
  if (diaApontado?.eventoId) {
    refresh();
  }

  /*
    Sem `refresh()` de proposito — ver `DiaState`. A celula e o total a tela ja
    desenhou no clique; redesenhar a rota inteira custava tres vezes a propria
    gravacao para trazer o que ela ja sabia.
  */
  return { status: "success", mensagem: vazia ? "Dia apagado." : "Dia gravado.", chave };
}

/**
 * Preenche o realizado de varios dias de uma vez — o que o modal faria dia a
 * dia, para o caso em que nada mudou.
 *
 * **So dia em branco.** Dia que ja tem registro fica como esta, sem exceção:
 * sobrescrever em lote apagaria, sem ninguem ver, a troca ou a falta que alguem
 * lancou com cuidado — e desfazer centenas de celulas nao tem botao. O que
 * mudou continua sendo feito no dia.
 *
 * **O previsto sai da mesma leitura da tela** (`obterGrade()`), e nao de uma
 * conta refeita aqui: e o mesmo principio da previa e da gravacao da
 * importacao. Duas derivacoes do previsto divergiriam no primeiro detalhe (a
 * sigla propria da linha, a vigencia que troca no meio do mes), e o lote
 * gravaria um dia diferente do que a faixa P mostrava.
 *
 * Grava **so a sigla**, sem horario: em branco, o dia seguiu a jornada da
 * funcao — que e exatamente o que "nada mudou" quer dizer. Sigla que pede quem
 * cobriu ou para onde a pessoa foi e recusada, porque esses detalhes sao de um
 * dia, e nao de um intervalo. Nenhum extra e lancado.
 */
export async function preencherDias(
  _estadoAnterior: PreencherDiasState,
  formData: FormData,
): Promise<PreencherDiasState> {
  const usuario = await exigirAcesso(AREA);

  const resultado = preencherDiasSchema.safeParse({
    postoId: String(formData.get("postoId") ?? ""),
    linhaIds: formData.getAll("linhaId").map(String),
    de: String(formData.get("de") ?? ""),
    ate: String(formData.get("ate") ?? ""),
    sigla: String(formData.get("sigla") ?? ""),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: z.prettifyError(resultado.error) };
  }

  const { postoId, linhaIds, de, ate, sigla } = resultado.data;

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  if (de < escrita.competencia.dataInicio || ate > escrita.competencia.dataFim) {
    return { status: "error", mensagem: "O intervalo sai da competencia aberta." };
  }

  // A grade e o catalogo nao dependem um do outro.
  const [grade, catalogo] = await Promise.all([
    obterGrade(postoId),
    db
      .select({
        id: eventos.id,
        codigo: eventos.codigo,
        exigePessoa: eventos.exigePessoa,
        exigeDestino: eventos.exigeDestino,
      })
      .from(eventos)
      .where(eq(eventos.ativo, true)),
  ]);

  if (!grade) {
    return { status: "error", mensagem: "Posto nao encontrado." };
  }

  const escolhida = sigla ? catalogo.find((evento) => evento.id === sigla) : null;

  if (sigla && !escolhida) {
    return { status: "error", mensagem: "Sigla nao encontrada ou desativada." };
  }

  if (escolhida && (escolhida.exigePessoa || escolhida.exigeDestino)) {
    return {
      status: "error",
      mensagem:
        "Esta sigla pede quem cobriu ou para onde a pessoa foi — isso se diz dia a dia, no modal.",
    };
  }

  const pedidas = new Set(linhaIds);
  const linhas = grade.grupos
    .flatMap((grupo) => grupo.linhas)
    .filter((linha) => pedidas.has(linha.id));

  if (linhas.length !== pedidas.size) {
    return { status: "error", mensagem: "Alguem escolhido nao esta na escala deste posto." };
  }

  // A sigla do previsto e o codigo; o dia grava o id. O indice unico de
  // `eventos` e por `lower(codigo)`, e e por ele que se casa.
  const idPorCodigo = new Map(catalogo.map((evento) => [evento.codigo.toLowerCase(), evento.id]));
  const dias = grade.dias.filter((data) => data >= de && data <= ate);

  const novos: { linhaId: string; data: string; eventoId: string }[] = [];
  let jaPreenchidos = 0;
  let semPrevisto = 0;

  for (const linha of linhas) {
    // O dia trabalhado de uma TE nao tem celula, mas ja esta contado: um F do
    // lote ali desmentiria a troca.
    const trabalhados = diasTrabalhadosPorTroca(Object.values(linha.realizado));

    for (const data of dias) {
      if (linha.realizado[data] || trabalhados.has(data)) {
        jaPreenchidos += 1;
        continue;
      }

      const eventoId =
        escolhida?.id ?? idPorCodigo.get(linha.previsto[data]?.eventoCodigo.toLowerCase() ?? "");

      if (!eventoId) {
        semPrevisto += 1;
        continue;
      }

      novos.push({ linhaId: linha.id, data, eventoId });
    }
  }

  let gravados = 0;

  if (novos.length > 0) {
    try {
      gravados = await db.transaction(async (tx) => {
        /*
          `do nothing` no conflito, e nao `update`: entre a leitura da grade e
          esta gravacao alguem pode ter preenchido um desses dias pelo modal, e
          o que essa pessoa gravou vale mais do que o lote. So o que de fato
          entrou ganha linha de historico — na mesma transacao, pelo mesmo
          motivo de `salvarDia()`.
        */
        const inseridos = await tx
          .insert(preenchimentoDias)
          .values(novos)
          .onConflictDoNothing({ target: [preenchimentoDias.linhaId, preenchimentoDias.data] })
          .returning({
            linhaId: preenchimentoDias.linhaId,
            data: preenchimentoDias.data,
            eventoId: preenchimentoDias.eventoId,
          });

        if (inseridos.length > 0) {
          await tx
            .insert(preenchimentoAlteracoes)
            .values(inseridos.map((dia) => ({ ...dia, usuarioId: usuario.id })));
        }

        return inseridos.length;
      });
    } catch (erro) {
      console.error("Falha ao preencher varios dias", erro);
      return { status: "error", mensagem: FALHA_GENERICA };
    }
  }

  const intocados = jaPreenchidos + (novos.length - gravados);
  const partes = [
    intocados > 0 ? `${intocados} ja tinham registro e ficaram como estavam` : null,
    semPrevisto > 0 ? `${semPrevisto} sem previsto para copiar` : null,
  ].filter(Boolean);
  const detalhe = partes.length > 0 ? ` (${partes.join("; ")})` : "";

  if (gravados === 0) {
    return {
      status: "success",
      preenchidos: 0,
      mensagem: `Nenhum dia em branco para preencher neste intervalo${detalhe}.`,
    };
  }

  // Aqui sim `refresh()`: um lote muda dezenas de celulas e de totais, e a
  // camada de sessao da grade existe para um dia por vez.
  refresh();

  return {
    status: "success",
    preenchidos: gravados,
    mensagem: `${gravados} ${gravados === 1 ? "dia preenchido" : "dias preenchidos"}${detalhe}.`,
  };
}

/**
 * Apaga o realizado de um dia, devolvendo a celula ao branco.
 *
 * Existe ao lado de `salvarDia()` com os campos vazios porque e outro gesto:
 * "este dia nao tem nada a dizer" nao deveria exigir limpar cinco campos um a
 * um. O historico registra a exclusao como uma linha de estado vazio.
 */
export async function limparDia(_estadoAnterior: DiaState, formData: FormData): Promise<DiaState> {
  const usuario = await exigirAcesso(AREA);

  const chave = chaveDaCelula(
    String(formData.get("linhaId") ?? ""),
    String(formData.get("data") ?? ""),
  );

  const resultado = limparDiaSchema.safeParse({
    linhaId: String(formData.get("linhaId") ?? ""),
    data: String(formData.get("data") ?? ""),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Dia invalido.", chave };
  }

  const { linhaId, data } = resultado.data;
  const conferencia = await conferirDia(linhaId, data);

  if (!conferencia.ok) {
    return { status: "error", mensagem: conferencia.mensagem, chave };
  }

  try {
    await db.transaction(async (tx) => {
      const apagadas = await apagarDia(tx, linhaId, data);

      // Sem celula, nao houve alteracao a registrar: gravar historico de um dia
      // que ja estava em branco registraria uma alteracao que nao aconteceu.
      if (!apagadas.rowCount) {
        return;
      }

      await tx
        .insert(preenchimentoAlteracoes)
        .values({ linhaId, data, ...CELULA_VAZIA, usuarioId: usuario.id });
    });
  } catch (erro) {
    console.error("Falha ao limpar o dia da grade", erro);
    return { status: "error", mensagem: FALHA_GENERICA, chave };
  }

  // Sem `refresh()`, como em `salvarDia()`: a grade ja apagou a celula.
  return { status: "success", mensagem: "Dia apagado.", chave };
}

/**
 * O "!" do modal do dia: sinaliza o dia para a tela "Dias sinalizados", ou tira
 * a marca enquanto ela esta pendente.
 *
 * Chamada direto pelo modal, e nao por formulario: e um gesto ao lado das
 * marcacoes, fora do formulario do dia — sinalizar nao pode gravar (nem exigir)
 * o que estiver meio digitado nos campos.
 *
 * Sinalizar um dia ja resolvido o **reabre**: a mesma linha volta a pendente,
 * com quem sinalizou agora. Tirar a marca so alcanca a pendente — a resolvida e
 * registro de que o dia foi conferido, e sai da tela "Dias sinalizados" pelo
 * filtro, e nao daqui.
 *
 * Sem `refresh()`, como as gravacoes do dia: a grade ja desenhou a marca no
 * clique, e a resposta diz o estado que ela passou a ter.
 */
export async function marcarSinalizacao(
  linhaId: string,
  data: string,
  sinalizado: boolean,
): Promise<SinalizacaoState> {
  const usuario = await exigirAcesso(AREA);

  const entrada = sinalizarDiaSchema.safeParse({ linhaId, data, sinalizado });

  if (!entrada.success) {
    return { ok: false, mensagem: "Dia invalido." };
  }

  const conferencia = await conferirDia(entrada.data.linhaId, entrada.data.data);

  if (!conferencia.ok) {
    return { ok: false, mensagem: conferencia.mensagem };
  }

  const dia = and(
    eq(sinalizacoesDia.linhaId, entrada.data.linhaId),
    eq(sinalizacoesDia.data, entrada.data.data),
  );

  try {
    if (!entrada.data.sinalizado) {
      await db.delete(sinalizacoesDia).where(and(dia, isNull(sinalizacoesDia.resolvidoEm)));

      const [restante] = await db
        .select({ observacao: sinalizacoesDia.observacao })
        .from(sinalizacoesDia)
        .where(dia);

      return {
        ok: true,
        sinalizacao: restante ? { estado: "resolvida", observacao: restante.observacao } : null,
      };
    }

    const [gravada] = await db
      .insert(sinalizacoesDia)
      .values({
        linhaId: entrada.data.linhaId,
        data: entrada.data.data,
        sinalizadoPor: usuario.id,
      })
      .onConflictDoUpdate({
        target: [sinalizacoesDia.linhaId, sinalizacoesDia.data],
        set: {
          sinalizadoPor: usuario.id,
          sinalizadoEm: sql`now()`,
          resolvidoPor: null,
          resolvidoEm: null,
        },
      })
      .returning({ observacao: sinalizacoesDia.observacao });

    return { ok: true, sinalizacao: { estado: "pendente", observacao: gravada.observacao } };
  } catch (erro) {
    console.error("Falha ao sinalizar o dia da grade", erro);
    return { ok: false, mensagem: FALHA_GENERICA };
  }
}

/**
 * O que conferir no dia sinalizado, em uma frase — vai na tela "Dias
 * sinalizados" e na mensagem ao responsavel do posto. Vazia apaga.
 *
 * Gesto do modal, como o "!", e fora do formulario do dia pelo mesmo motivo.
 * So existe para um dia que ja tem marca: anotar nao sinaliza ninguem.
 */
export async function anotarSinalizacao(
  linhaId: string,
  data: string,
  observacao: string,
): Promise<SinalizacaoState> {
  await exigirAcesso(AREA);

  const entrada = anotarSinalizacaoSchema.safeParse({ linhaId, data, observacao });

  if (!entrada.success) {
    return {
      ok: false,
      mensagem: z.flattenError(entrada.error).fieldErrors.observacao?.[0] ?? "Dia invalido.",
    };
  }

  const conferencia = await conferirDia(entrada.data.linhaId, entrada.data.data);

  if (!conferencia.ok) {
    return { ok: false, mensagem: conferencia.mensagem };
  }

  try {
    const [marca] = await db
      .update(sinalizacoesDia)
      .set({ observacao: entrada.data.observacao })
      .where(
        and(
          eq(sinalizacoesDia.linhaId, entrada.data.linhaId),
          eq(sinalizacoesDia.data, entrada.data.data),
        ),
      )
      .returning({
        resolvida: sql<boolean>`${sinalizacoesDia.resolvidoEm} is not null`,
        observacao: sinalizacoesDia.observacao,
      });

    if (!marca) {
      return { ok: false, mensagem: "Este dia nao esta mais sinalizado." };
    }

    return {
      ok: true,
      sinalizacao: {
        estado: marca.resolvida ? "resolvida" : "pendente",
        observacao: marca.observacao,
      },
    };
  } catch (erro) {
    console.error("Falha ao anotar o dia sinalizado", erro);
    return { ok: false, mensagem: FALHA_GENERICA };
  }
}

/* -------------------------------------------------------------------------- */
/* Quem entra na grade                                                         */
/* -------------------------------------------------------------------------- */

/** A proxima posicao livre do bloco, calculada no proprio banco. */
function proximaOrdem(funcaoId: string, competenciaId: string) {
  return sql<number>`coalesce((
    select max(ordem) + 1 from ${preenchimentoLinhas} irma
    where irma.funcao_id = ${funcaoId} and irma.competencia_id = ${competenciaId}
  ), 0)`;
}

export async function incluirFuncionario(
  _estadoAnterior: IncluirPessoaState,
  formData: FormData,
): Promise<IncluirPessoaState> {
  await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita(formData.get("competenciaId"));

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = incluirFuncionarioSchema.safeParse({
    funcaoId: String(formData.get("funcaoId") ?? ""),
    funcionarioId: String(formData.get("funcionarioId") ?? ""),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { funcaoId, funcionarioId } = resultado.data;

  const [pessoa] = await db
    .select({ nome: funcionarios.nome })
    .from(funcionarios)
    .where(and(eq(funcionarios.id, funcionarioId), eq(funcionarios.ativo, true)));

  if (!pessoa) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: { funcionarioId: ["Funcionario nao encontrado ou inativo"] },
    };
  }

  try {
    await db.insert(preenchimentoLinhas).values({
      competenciaId: escrita.competencia.id,
      funcaoId,
      funcionarioId,
      ordem: proximaOrdem(funcaoId, escrita.competencia.id),
    });
  } catch (erro) {
    // O indice parcial e quem garante que a mesma pessoa nao entre duas vezes
    // no bloco: entre o SELECT acima e este INSERT, outra requisicao pode ter
    // gravado a mesma linha.
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { funcionarioId: ["Esta pessoa ja esta neste bloco"] },
      };
    }

    console.error("Falha ao incluir funcionario na grade", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return {
    status: "success",
    mensagem: `${pessoa.nome} entrou na escala.`,
    chave: crypto.randomUUID(),
  };
}

/**
 * Inclui um freelancer, criando o cadastro dele se for a primeira vez.
 *
 * O cadastro nasce aqui de proposito: exigir que alguem passe por outra tela
 * antes de escalar quem apareceu hoje travaria justamente o caso de uso. O que
 * o portal nao faz e criar **dois** freelancers com o mesmo nome — o indice
 * `freelancers_nome_unico` decide isso, e a action reaproveita o que ja existe.
 */
export async function incluirFreelancer(
  _estadoAnterior: IncluirPessoaState,
  formData: FormData,
): Promise<IncluirPessoaState> {
  await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita(formData.get("competenciaId"));

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = incluirFreelancerSchema.safeParse({
    funcaoId: String(formData.get("funcaoId") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    codigo: String(formData.get("codigo") ?? ""),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { funcaoId, nome, codigo } = resultado.data;

  try {
    await db.transaction(async (tx) => {
      const freelancerId = await encontrarOuCriarFreelancer(tx, nome, codigo);

      await tx.insert(preenchimentoLinhas).values({
        competenciaId: escrita.competencia.id,
        funcaoId,
        freelancerId,
        ordem: proximaOrdem(funcaoId, escrita.competencia.id),
      });
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { nome: ["Este freelancer ja esta neste bloco"] },
      };
    }

    console.error("Falha ao incluir freelancer na grade", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: `${nome} entrou na escala.`, chave: crypto.randomUUID() };
}

/**
 * O freelancer de mesmo nome, ou um novo. A comparacao ignora a caixa pelo
 * mesmo criterio do indice: "Joao" e "JOAO" sao a mesma pessoa para quem monta
 * a escala.
 *
 * O codigo so e gravado quando o cadastro e novo: reescrever o codigo de quem
 * ja existe transformaria uma inclusao em edicao silenciosa do cadastro.
 */
async function encontrarOuCriarFreelancer(tx: Transacao, nome: string, codigo: string | null) {
  const [existente] = await tx
    .select({ id: freelancers.id })
    .from(freelancers)
    .where(eq(sql`lower(${freelancers.nome})`, nome.toLowerCase()));

  if (existente) {
    return existente.id;
  }

  const [criado] = await tx
    .insert(freelancers)
    .values({ nome, codigo })
    .returning({ id: freelancers.id });

  return criado.id;
}

/**
 * Tira alguem do bloco. As celulas vao junto (`on delete cascade`): sem a linha
 * elas seriam dias sem dono.
 *
 * E a unica exclusao do modulo, e existe pela mesma razao que a do afastamento:
 * incluir a pessoa errada e engano de digitacao, e enquanto a linha existir ela
 * continua ocupando um lugar na escala do posto.
 */
export async function removerLinha(
  _estadoAnterior: LinhaState,
  formData: FormData,
): Promise<LinhaState> {
  await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = linhaSchema.safeParse({ linhaId: String(formData.get("linhaId") ?? "") });

  if (!resultado.success) {
    return { status: "error", mensagem: "Linha invalida." };
  }

  try {
    // O `competencia_id` no filtro nao e redundante: ele impede que um id
    // postado na mao apague uma linha de outro periodo.
    await db
      .delete(preenchimentoLinhas)
      .where(
        and(
          eq(preenchimentoLinhas.id, resultado.data.linhaId),
          eq(preenchimentoLinhas.competenciaId, escrita.competencia.id),
        ),
      );
  } catch (erro) {
    console.error("Falha ao remover linha da grade", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Pessoa retirada da escala." };
}

/**
 * O que a aba Pessoas grava: turma, sigla do previsto e observacao das linhas
 * que mudaram, todas de uma vez.
 *
 * Uma gravacao para a funcao, e nao uma por campo de cada linha: montar a
 * alternancia de um 12x36 e mexer em duas ou tres pessoas olhando a cobertura
 * do dia, e gravar cada uma pela metade redesenharia a tela entre um ajuste e
 * outro. A tela so manda as linhas que mudaram — reenviar a intocada apagaria o
 * que outra pessoa acabou de gravar nela.
 *
 * Nenhum campo inventa padrao: a turma escolhe entre as duas escalas que a
 * funcao ja declara, e a sigla so troca a letra (o `N` de quem cobre a noite
 * numa grade de `D`), mantendo o ciclo e as folgas da vigencia.
 */
export async function definirPessoasDaFuncao(
  _estadoAnterior: LinhaState,
  formData: FormData,
): Promise<LinhaState> {
  await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita(formData.get("competenciaId"));

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  // Campos repetidos, um por linha alterada, na mesma ordem.
  const ids = formData.getAll("linhaId").map(String);
  const turmas = formData.getAll("turma").map(String);
  const siglas = formData.getAll("eventoTrabalhoId").map(String);
  const observacoes = formData.getAll("observacao").map(String);
  const entradas = formData.getAll("horaEntrada").map(String);
  const saidas = formData.getAll("horaSaida").map(String);

  if (
    ![turmas, siglas, observacoes, entradas, saidas].every((campo) => campo.length === ids.length)
  ) {
    return { status: "error", mensagem: "Formulario incompleto. Recarregue a tela." };
  }

  const resultado = pessoasDaFuncaoSchema.safeParse(
    ids.map((linhaId, indice) => ({
      linhaId,
      turma: turmas[indice],
      eventoTrabalhoId: siglas[indice],
      horaEntrada: entradas[indice],
      horaSaida: saidas[indice],
      observacao: observacoes[indice],
    })),
  );

  if (!resultado.success) {
    return { status: "error", mensagem: z.prettifyError(resultado.error) };
  }

  const linhas = resultado.data;

  /*
    A sigla escrita nos dias de trabalho precisa ser de trabalho: uma folga ali
    faria o rodape contar como folga um dia que o contrato preve trabalhado. E
    precisa estar ativa — evento desativado sai das escolhas novas, como em
    todo o portal. O `<select>` so oferece essas, mas a action e um POST
    publico.
  */
  const idsDeSigla = [...new Set(linhas.flatMap((linha) => linha.eventoTrabalhoId ?? []))];

  if (idsDeSigla.length > 0) {
    const validas = await db
      .select({ id: eventos.id })
      .from(eventos)
      .where(
        and(
          inArray(eventos.id, idsDeSigla),
          eq(eventos.ativo, true),
          eq(eventos.natureza, "trabalho"),
        ),
      );

    if (validas.length !== idsDeSigla.length) {
      return {
        status: "error",
        mensagem: "Escolha uma sigla de trabalho ativa: e ela que o previsto escreve.",
      };
    }
  }

  let gravadas = 0;

  try {
    await db.transaction(async (tx) => {
      for (const linha of linhas) {
        // O `competencia_id` no filtro nao e redundante: ele impede que um id
        // postado na mao mexa numa linha de outro periodo.
        const alteradas = await tx
          .update(preenchimentoLinhas)
          .set({
            turma: linha.turma,
            eventoTrabalhoId: linha.eventoTrabalhoId,
            // Horario proprio so com sigla propria: com a da funcao, o horario e o
            // da vigencia, e guardar outro seria um segundo contrato calado.
            horaEntrada: linha.eventoTrabalhoId ? linha.horaEntrada : null,
            horaSaida: linha.eventoTrabalhoId ? linha.horaSaida : null,
            observacao: linha.observacao,
          })
          .where(
            and(
              eq(preenchimentoLinhas.id, linha.linhaId),
              eq(preenchimentoLinhas.competenciaId, escrita.competencia.id),
            ),
          )
          .returning({ id: preenchimentoLinhas.id });

        gravadas += alteradas.length;
      }
    });
  } catch (erro) {
    console.error("Falha ao gravar as pessoas da funcao", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  // Quem foi retirado do bloco no meio tempo nao tem o que gravar; o resto
  // gravou, e a tela diz que faltou alguem em vez de fingir que foi tudo.
  if (gravadas < linhas.length) {
    return {
      status: "error",
      mensagem: `${gravadas} de ${linhas.length} gravadas: as demais sairam da escala enquanto voce editava.`,
    };
  }

  return {
    status: "success",
    mensagem:
      gravadas === 1
        ? "Pessoa gravada — a grade ja saiu recalculada."
        : `${gravadas} pessoas gravadas — a grade ja saiu recalculada.`,
  };
}
