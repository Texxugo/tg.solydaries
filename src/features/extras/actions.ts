"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { extras, freelancers, funcionarios, postos } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarPeriodo } from "@/features/competencias/periodo";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";

import { lerColaborador } from "./colaborador";
import { atualizarExtraSchema, excluirExtraSchema, registrarExtraSchema } from "./schema";
import { ROTA_EXTRAS } from "./types";
import type {
  AtualizarExtraState,
  ErrosDoExtra,
  ExcluirExtraState,
  RegistrarExtraState,
  ValoresDoExtra,
} from "./types";

/**
 * Escritas do modulo de horas extras.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod, refaz a checagem de acesso e — porque o extra e dado datado — comeca por
 * `competenciaDeEscrita()` — que, durante uma consulta, e a competencia
 * consultada. A data do extra e conferida contra o periodo dela, e e isso que
 * impede um formulario aberto antes de a consulta ser encerrada de gravar na
 * competencia errada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const AREA = "extras" as const;

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

const EXTRA_REPETIDO =
  "Ja existe um extra desta pessoa neste dia, neste posto e com esta mesma entrada";

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * O formulario chega inteiro como texto. Ler tudo antes de validar tambem e o
 * que permite devolver os valores digitados quando o Zod recusa.
 */
function lerValores(formData: FormData): ValoresDoExtra {
  return {
    data: String(formData.get("data") ?? ""),
    colaborador: String(formData.get("colaborador") ?? ""),
    freelancerNome: String(formData.get("freelancerNome") ?? ""),
    postoId: String(formData.get("postoId") ?? ""),
    local: String(formData.get("local") ?? ""),
    horaEntrada: String(formData.get("horaEntrada") ?? ""),
    horaSaida: String(formData.get("horaSaida") ?? ""),
    observacao: String(formData.get("observacao") ?? ""),
  };
}

/** O que a gravacao precisa saber sobre a pessoa: a coluna e o nome, para a mensagem. */
type PessoaDoExtra = {
  funcionarioId: string | null;
  freelancerId: string | null;
  nome: string;
};

type Recusa = { campo: keyof ValoresDoExtra; mensagem: string };

/** A recusa de um campo, no formato que os formularios desenham. */
function errosDaRecusa({ campo, mensagem }: Recusa): ErrosDoExtra {
  return { [campo]: [mensagem] };
}

/**
 * Resolve quem fez o extra, dentro da mesma transacao da gravacao.
 *
 * Sao os dois caminhos que o campo oferece: alguem da lista (funcionario ou
 * freelancer ja cadastrado) ou um freelancer novo, criado aqui. O segundo
 * existe pela mesma razao que na grade — quem cobre um extra as vezes e
 * justamente quem nao esta na folha, e exigir cadastro previo travaria o
 * registro do dia em que ele aconteceu.
 *
 * Devolve a recusa em vez de lancar porque quem chama e uma Server Action de
 * formulario: a mensagem cai no campo, e nao num stack trace.
 */
async function resolverPessoa(
  tx: Transacao,
  colaborador: string,
  freelancerNome: string | null,
  /**
   * Quem ja estava gravado neste extra, na edicao. Continuar com a mesma pessoa
   * vale mesmo que ela tenha sido desativada desde o lancamento: senao,
   * corrigir a observacao de um extra antigo esbarraria num cadastro que nao
   * tem nada a ver com a correcao. Trocar por outra pessoa continua exigindo
   * cadastro ativo.
   */
  gravado?: { funcionarioId: string | null; freelancerId: string | null },
): Promise<PessoaDoExtra | Recusa> {
  const escolhido = colaborador ? lerColaborador(colaborador) : null;

  if (escolhido?.tipo === "funcionario") {
    const mantido = escolhido.id === gravado?.funcionarioId;
    const [pessoa] = await tx
      .select({ nome: funcionarios.nome })
      .from(funcionarios)
      .where(
        mantido
          ? eq(funcionarios.id, escolhido.id)
          : and(eq(funcionarios.id, escolhido.id), eq(funcionarios.ativo, true)),
      );

    if (!pessoa) {
      return { campo: "colaborador", mensagem: "Funcionario nao encontrado ou inativo" };
    }

    return { funcionarioId: escolhido.id, freelancerId: null, nome: pessoa.nome };
  }

  if (escolhido?.tipo === "freelancer") {
    const mantido = escolhido.id === gravado?.freelancerId;
    const [pessoa] = await tx
      .select({ nome: freelancers.nome })
      .from(freelancers)
      .where(
        mantido
          ? eq(freelancers.id, escolhido.id)
          : and(eq(freelancers.id, escolhido.id), eq(freelancers.ativo, true)),
      );

    if (!pessoa) {
      return { campo: "colaborador", mensagem: "Freelancer nao encontrado ou inativo" };
    }

    return { funcionarioId: null, freelancerId: escolhido.id, nome: pessoa.nome };
  }

  if (!freelancerNome) {
    return { campo: "colaborador", mensagem: "Escolha quem fez o extra" };
  }

  return {
    funcionarioId: null,
    freelancerId: await encontrarOuCriarFreelancer(tx, freelancerNome),
    nome: freelancerNome,
  };
}

/**
 * O freelancer de mesmo nome, ou um novo. A comparacao ignora a caixa pelo
 * mesmo criterio do indice `freelancers_nome_unico`: "Joao" e "JOAO" sao a
 * mesma pessoa para quem confere o extra.
 *
 * Reaproveitar em vez de criar e o que faz o mesmo freela ser reencontravel no
 * mes seguinte — se cada digitacao criasse um cadastro, ninguem saberia quantos
 * extras cada um fez.
 */
async function encontrarOuCriarFreelancer(tx: Transacao, nome: string) {
  const [existente] = await tx
    .select({ id: freelancers.id })
    .from(freelancers)
    .where(eq(sql`lower(${freelancers.nome})`, nome.toLowerCase()));

  if (existente) {
    return existente.id;
  }

  const [criado] = await tx.insert(freelancers).values({ nome }).returning({ id: freelancers.id });

  return criado.id;
}

/** O posto precisa existir e estar ativo — extra novo nao entra em posto encerrado. */
async function conferirPosto(tx: Transacao, postoId: string): Promise<Recusa | null> {
  const [posto] = await tx
    .select({ id: postos.id })
    .from(postos)
    .where(and(eq(postos.id, postoId), eq(postos.ativo, true)));

  return posto ? null : { campo: "postoId", mensagem: "Posto nao encontrado ou inativo" };
}

/**
 * O dia do extra tem de cair dentro do periodo da competencia aberta.
 *
 * Mesma regra da carga de marcacoes, e pelo mesmo motivo: o extra pertence ao
 * periodo em que o dia caiu, e gravar 21/09 dentro de agosto o esconderia de
 * setembro para sempre. As datas sao `YYYY-MM-DD`, entao a comparacao de texto
 * e a comparacao de calendario.
 */
function conferirData(data: string, inicio: string, fim: string): Recusa | null {
  if (data < inicio || data > fim) {
    return {
      campo: "data",
      mensagem: `A competencia aberta vai de ${formatarPeriodo(inicio, fim)}`,
    };
  }

  return null;
}

export async function registrarExtra(
  _estadoAnterior: RegistrarExtraState,
  formData: FormData,
): Promise<RegistrarExtraState> {
  const usuario = await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const valores = lerValores(formData);
  const resultado = registrarExtraSchema.safeParse(valores);

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      valores,
    };
  }

  const { colaborador, freelancerNome, ...extra } = resultado.data;
  const { competencia } = escrita;

  const foraDoPeriodo = conferirData(extra.data, competencia.dataInicio, competencia.dataFim);

  if (foraDoPeriodo) {
    return recusa(foraDoPeriodo, valores);
  }

  try {
    const gravado = await db.transaction(async (tx) => {
      const postoInvalido = await conferirPosto(tx, extra.postoId);

      if (postoInvalido) {
        return postoInvalido;
      }

      const pessoa = await resolverPessoa(tx, colaborador, freelancerNome);

      if ("campo" in pessoa) {
        return pessoa;
      }

      await tx.insert(extras).values({
        ...extra,
        competenciaId: competencia.id,
        funcionarioId: pessoa.funcionarioId,
        freelancerId: pessoa.freelancerId,
        registradoPorId: usuario.id,
      });

      return pessoa;
    });

    if ("campo" in gravado) {
      return recusa(gravado, valores);
    }

    refresh();

    return {
      status: "success",
      mensagem: `Extra de ${gravado.nome} registrado.`,
      chave: crypto.randomUUID(),
    };
  } catch (erro) {
    // O indice parcial unico e quem garante que o mesmo extra nao entre duas
    // vezes: entre a tela e este INSERT, outra pessoa pode ter lancado o dia.
    if (ehViolacaoDeUnicidade(erro)) {
      return recusa({ campo: "horaEntrada", mensagem: EXTRA_REPETIDO }, valores);
    }

    console.error("Falha ao registrar hora extra", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }
}

/** A recusa de um campo no registro, que devolve tambem o que foi digitado. */
function recusa(motivo: Recusa, valores: ValoresDoExtra): RegistrarExtraState {
  return {
    status: "error",
    mensagem: "Confira os campos destacados.",
    erros: errosDaRecusa(motivo),
    valores,
  };
}

export async function atualizarExtra(
  _estadoAnterior: AtualizarExtraState,
  formData: FormData,
): Promise<AtualizarExtraState> {
  await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = atualizarExtraSchema.safeParse({
    ...lerValores(formData),
    extraId: formData.get("extraId"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { extraId, colaborador, freelancerNome, ...extra } = resultado.data;
  const { competencia } = escrita;

  const foraDoPeriodo = conferirData(extra.data, competencia.dataInicio, competencia.dataFim);

  if (foraDoPeriodo) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: errosDaRecusa(foraDoPeriodo),
    };
  }

  try {
    const gravado = await db.transaction(async (tx) => {
      // A competencia no filtro nao e redundante: ela impede que um id de outro
      // periodo, postado na mao, seja lido ou editado por quem esta na
      // competencia aberta — a tela nem mostra esse extra.
      const [atual] = await tx
        .select({
          funcionarioId: extras.funcionarioId,
          freelancerId: extras.freelancerId,
          postoId: extras.postoId,
        })
        .from(extras)
        .where(and(eq(extras.id, extraId), eq(extras.competenciaId, competencia.id)));

      if (!atual) {
        return null;
      }

      // Manter o posto que ja estava vale mesmo que ele tenha sido desativado
      // desde o lancamento — pela mesma razao da pessoa mantida. Trocar de
      // posto continua exigindo um ativo.
      const postoInvalido =
        extra.postoId === atual.postoId ? null : await conferirPosto(tx, extra.postoId);

      if (postoInvalido) {
        return postoInvalido;
      }

      const pessoa = await resolverPessoa(tx, colaborador, freelancerNome, atual);

      if ("campo" in pessoa) {
        return pessoa;
      }

      const linhas = await tx
        .update(extras)
        .set({
          ...extra,
          funcionarioId: pessoa.funcionarioId,
          freelancerId: pessoa.freelancerId,
        })
        .where(and(eq(extras.id, extraId), eq(extras.competenciaId, competencia.id)))
        .returning({ id: extras.id });

      return linhas.length > 0 ? pessoa : null;
    });

    if (gravado && "campo" in gravado) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: errosDaRecusa(gravado),
      };
    }

    if (!gravado) {
      return { status: "error", mensagem: "Extra nao encontrado nesta competencia." };
    }
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { horaEntrada: [EXTRA_REPETIDO] },
      };
    }

    console.error("Falha ao atualizar hora extra", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Extra atualizado." };
}

/**
 * Apaga um extra.
 *
 * E a unica exclusao do modulo, e existe pela mesma razao da do afastamento: o
 * extra e uma **entrada**, e nao um fato ja interpretado como a escala. Lancar
 * a pessoa errada e engano de digitacao, e enquanto a linha existir ela continua
 * somando horas que ninguem fez — desativar nao resolveria isso.
 */
export async function excluirExtra(
  _estadoAnterior: ExcluirExtraState,
  formData: FormData,
): Promise<ExcluirExtraState> {
  await exigirAcesso(AREA);

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = excluirExtraSchema.safeParse({ extraId: formData.get("extraId") });

  if (!resultado.success) {
    return { status: "error", mensagem: "Extra invalido." };
  }

  try {
    const apagados = await db
      .delete(extras)
      .where(
        and(
          eq(extras.id, resultado.data.extraId),
          eq(extras.competenciaId, escrita.competencia.id),
        ),
      )
      .returning({ id: extras.id });

    if (apagados.length === 0) {
      return { status: "error", mensagem: "Extra nao encontrado nesta competencia." };
    }
  } catch (erro) {
    console.error("Falha ao excluir hora extra", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  // Volta para a lista, e nao `refresh()`: a tela aberta e a do extra que acabou
  // de deixar de existir, e recarrega-la no lugar mostraria o 404 dele. O
  // `redirect` fica **fora** do `try` de proposito — ele sinaliza a navegacao
  // lancando, e um `catch` em volta o leria como falha da exclusao.
  redirect(ROTA_EXTRAS);
}
