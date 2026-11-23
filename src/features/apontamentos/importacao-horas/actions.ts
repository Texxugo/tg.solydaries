"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";

import { db } from "@/db";
import { apontamentos, empresas, funcionarios } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { nomeDaCompetencia } from "@/features/competencias/periodo";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { lerPlanilha, PlanilhaInvalidaError } from "@/features/funcionarios/xlsx";

import { AREA_APONTAMENTOS } from "../types";
import { lerRelatorioDeHoras } from "./leitura";
import {
  detalheDoFuncionario,
  planejarHoras,
  type Gravacao,
  type HorasGravadas,
  type PlanoDeHoras,
} from "./plano";
import {
  PREFIXO_ASSOCIACAO,
  TAMANHO_MAXIMO_RELATORIO_DE_HORAS,
  type ImportacaoDeHorasState,
  type ItemDaImportacaoDeHoras,
} from "./types";

/**
 * Importacao do relatorio de horas extras por verba para o apontamento da
 * competencia em vigor: verba 150 -> HE 50%, verba 200 -> HE 100%.
 *
 * Duas etapas, como a importacao da folha: sem `confirmar` devolve a previa;
 * com ele, grava. A confirmacao **reenvia o arquivo**, e nao o plano: a action
 * e um POST publico, e o que o cliente devolve nao e evidencia. Do formulario
 * vem so a escolha de quem importa para os nomes que nao casaram sozinhos —
 * que e decisao dela, e e conferida contra o cadastro aqui dentro.
 *
 * **Substitui as duas colunas, e nao soma.** O relatorio e o total do periodo:
 * somar faria a segunda importacao do mesmo arquivo dobrar as horas. Uma verba
 * que nao veio para a pessoa deixa a coluna dela como esta, e nenhuma outra
 * rubrica do apontamento e tocada.
 */

const FALHA_GENERICA = "Nao foi possivel concluir a importacao. Tente novamente.";

function recusa(mensagem: string): ImportacaoDeHorasState {
  return { status: "error", mensagem };
}

function lerAssociacoes(formData: FormData) {
  const associacoes = new Map<string, string>();

  for (const [campo, valor] of formData) {
    if (campo.startsWith(PREFIXO_ASSOCIACAO) && typeof valor === "string" && valor) {
      associacoes.set(campo.slice(PREFIXO_ASSOCIACAO.length), valor);
    }
  }

  return associacoes;
}

/** O cadastro inteiro (inativos inclusive: quem saiu ainda recebe) e as horas ja gravadas. */
async function lerCadastro(competenciaId: string) {
  const [cadastro, gravados] = await Promise.all([
    db
      .select({
        id: funcionarios.id,
        nome: funcionarios.nome,
        matricula: funcionarios.matricula,
        empresaNome: empresas.nome,
        ativo: funcionarios.ativo,
      })
      .from(funcionarios)
      .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId)),
    db
      .select({
        funcionarioId: apontamentos.funcionarioId,
        he50Minutos: apontamentos.he50Minutos,
        he100Minutos: apontamentos.he100Minutos,
      })
      .from(apontamentos)
      .where(eq(apontamentos.competenciaId, competenciaId)),
  ]);

  const gravadas = new Map<string, HorasGravadas>(
    gravados.map(({ funcionarioId, ...horas }) => [funcionarioId, horas]),
  );

  return { cadastro, gravadas };
}

/** A previa e a gravacao passam pelo mesmo caminho: arquivo -> leitura -> plano. */
async function planejarArquivo(
  arquivo: File,
  competenciaId: string,
  associacoes: ReadonlyMap<string, string>,
) {
  const leitura = lerRelatorioDeHoras(lerPlanilha(Buffer.from(await arquivo.arrayBuffer())));

  if (!leitura.ok) {
    return leitura;
  }

  const { cadastro, gravadas } = await lerCadastro(competenciaId);
  const plano: PlanoDeHoras = planejarHoras({
    linhas: leitura.linhas,
    funcionarios: cadastro,
    gravadas,
    associacoes,
  });

  return { ok: true as const, leitura, plano };
}

function itemDaPrevia(gravacao: Gravacao): ItemDaImportacaoDeHoras {
  return {
    funcionarioId: gravacao.funcionario.id,
    funcionario: gravacao.funcionario.nome,
    detalhe: detalheDoFuncionario(gravacao.funcionario),
    nomeNoArquivo: gravacao.nomeNoArquivo,
    linhas: gravacao.linhas,
    associado: gravacao.associado,
    he50: gravacao.he50,
    he100: gravacao.he100,
    gravado50: gravacao.gravado?.he50Minutos ?? 0,
    gravado100: gravacao.gravado?.he100Minutos ?? 0,
    novo: gravacao.gravado === null,
  };
}

async function gravar(plano: PlanoDeHoras, competenciaId: string, usuarioId: string) {
  await db.transaction(async (tx) => {
    for (const gravacao of plano.gravar) {
      // So as colunas das verbas que vieram: a que nao veio fica como esta.
      const horas = {
        ...(gravacao.he50 !== null && { he50Minutos: gravacao.he50 }),
        ...(gravacao.he100 !== null && { he100Minutos: gravacao.he100 }),
      };

      await tx
        .insert(apontamentos)
        .values({
          ...horas,
          competenciaId,
          funcionarioId: gravacao.funcionario.id,
          atualizadoPorId: usuarioId,
        })
        .onConflictDoUpdate({
          target: [apontamentos.competenciaId, apontamentos.funcionarioId],
          set: { ...horas, atualizadoPorId: usuarioId, atualizadoEm: new Date() },
        });
    }
  });
}

export async function importarHorasExtras(
  _estadoAnterior: ImportacaoDeHorasState,
  formData: FormData,
): Promise<ImportacaoDeHorasState> {
  const usuario = await exigirAcesso(AREA_APONTAMENTOS);

  const escrita = await competenciaDeEscrita(formData.get("competenciaId"));

  if (!escrita.ok) {
    return recusa(escrita.mensagem);
  }

  const arquivo = formData.get("arquivo");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return recusa("Escolha o arquivo .xlsx do relatorio de horas.");
  }

  if (arquivo.size > TAMANHO_MAXIMO_RELATORIO_DE_HORAS) {
    return recusa("O arquivo passa de 5 MB. Confira se e o relatorio certo.");
  }

  const { competencia } = escrita;
  let planejamento: Awaited<ReturnType<typeof planejarArquivo>>;

  try {
    planejamento = await planejarArquivo(arquivo, competencia.id, lerAssociacoes(formData));
  } catch (erro) {
    if (erro instanceof PlanilhaInvalidaError) {
      return recusa(erro.message);
    }

    console.error("Falha ao ler o relatorio de horas extras", erro);
    return recusa(FALHA_GENERICA);
  }

  if (!planejamento.ok) {
    return recusa(planejamento.mensagem);
  }

  const { leitura, plano } = planejamento;
  const recusadas = [...leitura.recusadas, ...plano.recusadas].sort((a, b) => a.linha - b.linha);

  if (formData.get("confirmar") !== "1") {
    return {
      status: "previa",
      previa: {
        token: crypto.randomUUID(),
        arquivo: arquivo.name,
        competencia: nomeDaCompetencia(competencia.dataFim),
        gravar: plano.gravar.map(itemDaPrevia),
        semMudanca: plano.semMudanca.length,
        semCadastro: plano.semCadastro,
        recusadas,
        outrasVerbas: leitura.outrasVerbas,
        zeradas: leitura.zeradas,
      },
    };
  }

  if (plano.gravar.length === 0) {
    return recusa("Nada a gravar: o apontamento de todos ja esta com as horas do arquivo.");
  }

  try {
    await gravar(plano, competencia.id, usuario.id);
  } catch (erro) {
    console.error("Falha ao gravar a importacao de horas extras", erro);
    return recusa(FALHA_GENERICA);
  }

  refresh();

  const criados = plano.gravar.filter((gravacao) => gravacao.gravado === null).length;

  return {
    status: "success",
    mensagem: `Horas extras importadas: ${plano.gravar.length} apontamentos atualizados.`,
    resultado: {
      gravados: plano.gravar.length,
      criados,
      semMudanca: plano.semMudanca.length,
      naoImportados: plano.semCadastro.map((nome) => nome.nomeNoArquivo),
      recusadas,
    },
  };
}
