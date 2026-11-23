"use server";

import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  freelancers,
  funcionarios,
  movimentacaoDocumentos,
  movimentacaoPessoas,
  movimentacoes,
  type PapelNaMovimentacao,
} from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarData, formatarPeriodo } from "@/features/competencias/periodo";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { lerColaborador } from "@/features/extras/colaborador";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";

import { MAXIMO_DE_DOCUMENTOS } from "./arquivos";
import { lerDocumentosEnviados } from "./documentos";
import { excluirMovimentacaoSchema, salvarMovimentacaoSchema } from "./schema";
import {
  AREA_MOVIMENTACOES,
  ROTULOS_TIPO_DE_MOVIMENTACAO,
  ehTroca,
  type CampoDaMovimentacao,
  type ExcluirMovimentacaoState,
  type SalvarMovimentacaoState,
} from "./types";

/**
 * Escritas do modulo de movimentacoes.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod, refaz a checagem de acesso e — porque a movimentacao e dado datado —
 * comeca por `competenciaDeEscrita()`. A data e conferida contra o periodo
 * dela, e e isso que impede uma tela aberta antes de a consulta ser encerrada
 * de gravar na competencia errada (a action tem data, entao nao precisa do
 * campo escondido `competenciaId`).
 */

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Recusa = { campo: CampoDaMovimentacao | null; mensagem: string };

type PessoaPedida = { papel: PapelNaMovimentacao; valor: string; campo: CampoDaMovimentacao };

/** O recorte do `FormData` que o schema le. Os documentos ficam com `documentos.ts`. */
function lerCampos(formData: FormData) {
  const texto = (campo: string) => String(formData.get(campo) ?? "");

  return {
    movimentacaoId: texto("movimentacaoId"),
    tipo: texto("tipo"),
    data: texto("data"),
    justificativa: texto("justificativa"),
    ausente: texto("ausente"),
    cobertura: texto("cobertura"),
    envolvidos: formData.getAll("envolvidos").map(String),
    removerDocumentos: formData.getAll("removerDocumentos").map(String),
  };
}

function erro(recusa: Recusa): SalvarMovimentacaoState {
  return recusa.campo
    ? {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { [recusa.campo]: [recusa.mensagem] },
      }
    : { status: "error", mensagem: recusa.mensagem };
}

/**
 * Confere cada pessoa contra o cadastro, dentro da transacao.
 *
 * Quem ja estava na movimentacao continua valendo mesmo desativado desde o
 * registro — corrigir a justificativa de uma falta antiga nao pode esbarrar no
 * desligamento de quem faltou. Pessoa **nova** na movimentacao precisa estar
 * ativa. Mesma folga da edicao de extras.
 */
async function conferirPessoas(
  tx: Transacao,
  pedidas: PessoaPedida[],
  jaGravadas: ReadonlySet<string>,
): Promise<{ nomes: string[] } | Recusa> {
  const escolhas = pedidas.map((pessoa) => ({ ...pessoa, escolha: lerColaborador(pessoa.valor)! }));
  const idsFuncionarios = escolhas
    .filter(({ escolha }) => escolha.tipo === "funcionario")
    .map(({ escolha }) => escolha.id);
  const idsFreelancers = escolhas
    .filter(({ escolha }) => escolha.tipo === "freelancer")
    .map(({ escolha }) => escolha.id);

  const [daFolha, avulsos] = await Promise.all([
    idsFuncionarios.length > 0
      ? tx
          .select({ id: funcionarios.id, nome: funcionarios.nome, ativo: funcionarios.ativo })
          .from(funcionarios)
          .where(inArray(funcionarios.id, idsFuncionarios))
      : [],
    idsFreelancers.length > 0
      ? tx
          .select({ id: freelancers.id, nome: freelancers.nome, ativo: freelancers.ativo })
          .from(freelancers)
          .where(inArray(freelancers.id, idsFreelancers))
      : [],
  ]);

  const cadastro = new Map<string, { nome: string; ativo: boolean }>([
    ...daFolha.map((pessoa) => [`f:${pessoa.id}`, pessoa] as const),
    ...avulsos.map((pessoa) => [`l:${pessoa.id}`, pessoa] as const),
  ]);

  const nomes: string[] = [];

  for (const pessoa of pedidas) {
    const encontrada = cadastro.get(pessoa.valor);

    if (!encontrada || (!encontrada.ativo && !jaGravadas.has(pessoa.valor))) {
      return { campo: pessoa.campo, mensagem: "Pessoa nao encontrada ou inativa" };
    }

    nomes.push(encontrada.nome);
  }

  return { nomes };
}

/**
 * Registra ou atualiza uma movimentacao — com `movimentacaoId`, edita.
 *
 * Uma action so para as duas, porque o modal e um so e os campos sao os
 * mesmos: o que a edicao acrescenta e o id e a lista de documentos a tirar.
 * Pessoas sao regravadas inteiras (o formulario manda a lista completa); os
 * documentos nao — os gravados ficam, salvo os marcados para sair, e os novos
 * se somam a eles.
 */
export async function salvarMovimentacao(
  _estadoAnterior: SalvarMovimentacaoState,
  formData: FormData,
): Promise<SalvarMovimentacaoState> {
  const usuario = await exigirAcesso(AREA_MOVIMENTACOES);

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = salvarMovimentacaoSchema.safeParse(lerCampos(formData));

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const dados = resultado.data;
  const { competencia } = escrita;

  // A movimentacao pertence ao periodo em que o dia caiu: gravar 21/09 dentro de
  // agosto a esconderia de setembro para sempre.
  if (dados.data < competencia.dataInicio || dados.data > competencia.dataFim) {
    return erro({
      campo: "data",
      mensagem: `A competencia em vigor vai de ${formatarPeriodo(competencia.dataInicio, competencia.dataFim)}`,
    });
  }

  const leitura = await lerDocumentosEnviados(formData);

  if (!leitura.ok) {
    return erro({ campo: "documentos", mensagem: leitura.mensagem });
  }

  const pedidas: PessoaPedida[] = ehTroca(dados.tipo)
    ? dados.envolvidos
        .filter((valor) => valor !== null)
        .map((valor) => ({ papel: "envolvido", valor, campo: "envolvidos" }))
    : [
        { papel: "ausente", valor: dados.ausente!, campo: "ausente" },
        ...(dados.cobertura
          ? [{ papel: "cobertura" as const, valor: dados.cobertura, campo: "cobertura" as const }]
          : []),
      ];

  try {
    const gravado = await db.transaction(async (tx): Promise<Recusa | { nomes: string[] }> => {
      let jaGravadas = new Set<string>();
      let documentosQueFicam = 0;

      if (dados.movimentacaoId) {
        // A competencia no filtro impede editar, por um id postado na mao, uma
        // movimentacao que a competencia em vigor nem mostra.
        const [atual] = await tx
          .select({ id: movimentacoes.id })
          .from(movimentacoes)
          .where(
            and(
              eq(movimentacoes.id, dados.movimentacaoId),
              eq(movimentacoes.competenciaId, competencia.id),
            ),
          )
          .for("update");

        if (!atual) {
          return { campo: null, mensagem: "Movimentacao nao encontrada nesta competencia." };
        }

        const pessoasAtuais = await tx
          .select({
            funcionarioId: movimentacaoPessoas.funcionarioId,
            freelancerId: movimentacaoPessoas.freelancerId,
          })
          .from(movimentacaoPessoas)
          .where(eq(movimentacaoPessoas.movimentacaoId, atual.id));

        jaGravadas = new Set(
          pessoasAtuais.map((pessoa) =>
            pessoa.funcionarioId ? `f:${pessoa.funcionarioId}` : `l:${pessoa.freelancerId}`,
          ),
        );

        // Conta sem apagar: a recusa devolvida daqui de dentro **nao** desfaz a
        // transacao (so uma excecao desfaz), entao nenhuma escrita acontece
        // antes de a ultima conferencia passar.
        const [{ quantos }] = await tx
          .select({ quantos: count() })
          .from(movimentacaoDocumentos)
          .where(
            and(
              eq(movimentacaoDocumentos.movimentacaoId, atual.id),
              dados.removerDocumentos.length > 0
                ? notInArray(movimentacaoDocumentos.id, dados.removerDocumentos)
                : undefined,
            ),
          );

        documentosQueFicam = quantos;
      }

      if (documentosQueFicam + leitura.documentos.length > MAXIMO_DE_DOCUMENTOS) {
        return {
          campo: "documentos",
          mensagem: `Uma movimentacao aceita no maximo ${MAXIMO_DE_DOCUMENTOS} documentos — ja ha ${documentosQueFicam}.`,
        };
      }

      const conferidas = await conferirPessoas(tx, pedidas, jaGravadas);

      if ("campo" in conferidas) {
        return conferidas;
      }

      let movimentacaoId: string;

      if (dados.movimentacaoId) {
        movimentacaoId = dados.movimentacaoId;

        await tx
          .update(movimentacoes)
          .set({ tipo: dados.tipo, data: dados.data, justificativa: dados.justificativa })
          .where(eq(movimentacoes.id, movimentacaoId));

        await tx
          .delete(movimentacaoPessoas)
          .where(eq(movimentacaoPessoas.movimentacaoId, movimentacaoId));

        // So sai documento desta movimentacao: um id de outra, postado na mao,
        // simplesmente nao casa.
        if (dados.removerDocumentos.length > 0) {
          await tx
            .delete(movimentacaoDocumentos)
            .where(
              and(
                eq(movimentacaoDocumentos.movimentacaoId, movimentacaoId),
                inArray(movimentacaoDocumentos.id, dados.removerDocumentos),
              ),
            );
        }
      } else {
        const [criada] = await tx
          .insert(movimentacoes)
          .values({
            competenciaId: competencia.id,
            tipo: dados.tipo,
            data: dados.data,
            justificativa: dados.justificativa,
            registradoPorId: usuario.id,
          })
          .returning({ id: movimentacoes.id });

        movimentacaoId = criada.id;
      }

      await tx.insert(movimentacaoPessoas).values(
        pedidas.map((pessoa, ordem) => {
          const escolha = lerColaborador(pessoa.valor)!;

          return {
            movimentacaoId,
            papel: pessoa.papel,
            funcionarioId: escolha.tipo === "funcionario" ? escolha.id : null,
            freelancerId: escolha.tipo === "freelancer" ? escolha.id : null,
            ordem,
          };
        }),
      );

      if (leitura.documentos.length > 0) {
        await tx.insert(movimentacaoDocumentos).values(
          leitura.documentos.map((documento) => ({
            ...documento,
            movimentacaoId,
            enviadoPorId: usuario.id,
          })),
        );
      }

      return conferidas;
    });

    if ("campo" in gravado) {
      return erro(gravado);
    }

    refresh();

    return {
      status: "success",
      mensagem: `${ROTULOS_TIPO_DE_MOVIMENTACAO[dados.tipo]} de ${formatarData(dados.data)} ${dados.movimentacaoId ? "atualizada" : "registrada"} (${gravado.nomes.join(", ")}).`,
    };
  } catch (falha) {
    // O schema ja recusa a pessoa repetida; o indice unico e a rede de baixo.
    if (ehViolacaoDeUnicidade(falha)) {
      return erro({
        campo: ehTroca(dados.tipo) ? "envolvidos" : "cobertura",
        mensagem: "A mesma pessoa aparece duas vezes na movimentacao",
      });
    }

    console.error("Falha ao salvar movimentacao", falha);
    return { status: "error", mensagem: FALHA_GENERICA };
  }
}

/**
 * Apaga uma movimentacao, com pessoas e documentos (`cascade`).
 *
 * Existe pela mesma razao da exclusao do extra e do afastamento: e uma
 * **entrada**, e a falta lancada na pessoa errada continuaria dizendo que ela
 * faltou enquanto a linha existisse.
 */
export async function excluirMovimentacao(
  _estadoAnterior: ExcluirMovimentacaoState,
  formData: FormData,
): Promise<ExcluirMovimentacaoState> {
  await exigirAcesso(AREA_MOVIMENTACOES);

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const resultado = excluirMovimentacaoSchema.safeParse({
    movimentacaoId: formData.get("movimentacaoId"),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Movimentacao invalida." };
  }

  try {
    const apagadas = await db
      .delete(movimentacoes)
      .where(
        and(
          eq(movimentacoes.id, resultado.data.movimentacaoId),
          eq(movimentacoes.competenciaId, escrita.competencia.id),
        ),
      )
      .returning({ id: movimentacoes.id });

    if (apagadas.length === 0) {
      return { status: "error", mensagem: "Movimentacao nao encontrada nesta competencia." };
    }
  } catch (falha) {
    console.error("Falha ao excluir movimentacao", falha);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Movimentacao excluida." };
}
