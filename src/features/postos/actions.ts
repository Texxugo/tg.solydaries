"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  funcaoCiclos,
  funcionarios,
  funcoesPosto,
  postoContatos,
  postos,
  preenchimentoLinhas,
} from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { ehViolacaoDeUnicidade, restricaoViolada } from "@/lib/postgres";

import { lerFolgas } from "@/features/preenchimento/previsto";

import {
  atualizarFuncaoSchema,
  atualizarPostoSchema,
  camposDaFuncaoSchema,
  camposDaVigenciaSchema,
  criarFuncaoSchema,
  criarPostoSchema,
  definirResponsavelSchema,
  donoDaVigenciaSchema,
  idPostoSchema,
  incluirNoGrupoSchema,
  removerVigenciaSchema,
  retirarDoGrupoSchema,
} from "./schema";
import type {
  AtualizarPostoState,
  CriarPostoState,
  FuncaoState,
  GrupoState,
  ValoresDaFuncao,
  ValoresDaVigencia,
  ValoresDoPosto,
  VigenciaState,
} from "./types";

/**
 * Escritas do cadastro de postos e das funcoes que moram neles.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod e refaz a checagem de acesso — o formulario nao autoriza nada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const AREA = "postos" as const;

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

/**
 * Traduz a recusa do banco para o campo certo do formulario — a tabela de
 * postos tem dois indices unicos, e sem saber qual falhou a mensagem cairia no
 * campo errado.
 */
function erroDePosto(erro: unknown) {
  switch (restricaoViolada(erro)) {
    case "postos_codigo_unico":
      return { codigo: ["Ja existe um posto com este codigo"] };
    case "postos_nome_unico":
      return { nome: ["Ja existe um posto com este nome"] };
    default:
      return null;
  }
}

function lerValoresDoPosto(formData: FormData): ValoresDoPosto {
  return {
    codigo: String(formData.get("codigo") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    empresaId: String(formData.get("empresaId") ?? ""),
  };
}

export async function criarPosto(
  _estadoAnterior: CriarPostoState,
  formData: FormData,
): Promise<CriarPostoState> {
  await exigirAcesso(AREA);

  const valores = lerValoresDoPosto(formData);
  const resultado = criarPostoSchema.safeParse(valores);

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      valores,
    };
  }

  const posto = resultado.data;

  try {
    await db.insert(postos).values(posto);
  } catch (erro) {
    const erros = ehViolacaoDeUnicidade(erro) ? erroDePosto(erro) : null;

    if (erros) {
      return { status: "error", mensagem: "Confira os campos destacados.", erros, valores };
    }

    console.error("Falha ao cadastrar posto", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return { status: "success", mensagem: `Posto ${posto.codigo} cadastrado.` };
}

export async function atualizarPosto(
  _estadoAnterior: AtualizarPostoState,
  formData: FormData,
): Promise<AtualizarPostoState> {
  await exigirAcesso(AREA);

  const resultado = atualizarPostoSchema.safeParse({
    ...lerValoresDoPosto(formData),
    postoId: String(formData.get("postoId") ?? ""),
    ativo: formData.get("ativo") !== null,
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { postoId, ...posto } = resultado.data;

  try {
    await db.update(postos).set(posto).where(eq(postos.id, postoId));
  } catch (erro) {
    const erros = ehViolacaoDeUnicidade(erro) ? erroDePosto(erro) : null;

    if (erros) {
      return { status: "error", mensagem: "Confira os campos destacados.", erros };
    }

    console.error("Falha ao atualizar posto", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: `Posto ${posto.codigo} atualizado.` };
}

const NOME_DE_FUNCAO_EM_USO = "Este posto ja tem uma funcao com este nome";

function lerValoresDaFuncao(formData: FormData): ValoresDaFuncao {
  return {
    nome: String(formData.get("nome") ?? ""),
    eventoTrabalhoId: String(formData.get("eventoTrabalhoId") ?? ""),
    observacao: String(formData.get("observacao") ?? ""),
  };
}

export async function criarFuncao(
  _estadoAnterior: FuncaoState,
  formData: FormData,
): Promise<FuncaoState> {
  await exigirAcesso(AREA);

  const valores = lerValoresDaFuncao(formData);
  const campos = camposDaFuncaoSchema.safeParse(valores);
  const dono = criarFuncaoSchema.safeParse({ postoId: String(formData.get("postoId") ?? "") });

  if (!campos.success || !dono.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: campos.success ? undefined : z.flattenError(campos.error).fieldErrors,
      valores,
    };
  }

  const funcao = { ...campos.data, postoId: dono.data.postoId };

  try {
    // A ordem sai do proprio banco, e nao de um campo do formulario: quem
    // cadastra a quinta funcao de um posto nao deve ter de saber que ela e a
    // quinta. Reordenar depois e outro assunto — hoje se resolve pelo nome.
    await db.insert(funcoesPosto).values({
      ...funcao,
      ordem: sql`coalesce((
        select max(ordem) + 1 from ${funcoesPosto} irma where irma.posto_id = ${funcao.postoId}
      ), 0)`,
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { nome: [NOME_DE_FUNCAO_EM_USO] },
        valores,
      };
    }

    console.error("Falha ao cadastrar funcao do posto", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return {
    status: "success",
    mensagem: `Funcao ${funcao.nome} cadastrada.`,
    // Remonta o formulario limpo: os campos sao nao controlados, e sem trocar a
    // chave o nome recem-cadastrado continuaria na tela.
    chave: crypto.randomUUID(),
  };
}

export async function atualizarFuncao(
  _estadoAnterior: FuncaoState,
  formData: FormData,
): Promise<FuncaoState> {
  await exigirAcesso(AREA);

  const valores = lerValoresDaFuncao(formData);
  const campos = camposDaFuncaoSchema.safeParse(valores);
  const dono = atualizarFuncaoSchema.safeParse({
    funcaoId: String(formData.get("funcaoId") ?? ""),
    ativa: formData.get("ativa") !== null,
  });

  if (!campos.success || !dono.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: campos.success ? undefined : z.flattenError(campos.error).fieldErrors,
      valores,
    };
  }

  const { funcaoId, ativa } = dono.data;
  const funcao = { ...campos.data, ativa };

  try {
    await db.update(funcoesPosto).set(funcao).where(eq(funcoesPosto.id, funcaoId));
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: { nome: [NOME_DE_FUNCAO_EM_USO] },
        valores,
      };
    }

    console.error("Falha ao atualizar funcao do posto", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return { status: "success", mensagem: `Funcao ${funcao.nome} atualizada.` };
}

/* -------------------------------------------------------------------------- */
/* As vigencias do ciclo                                                       */
/* -------------------------------------------------------------------------- */

function lerValoresDaVigencia(formData: FormData): ValoresDaVigencia {
  return {
    turma: String(formData.get("turma") ?? "escala") as ValoresDaVigencia["turma"],
    vigenciaInicio: String(formData.get("vigenciaInicio") ?? ""),
    diasCiclo: String(formData.get("diasCiclo") ?? ""),
    folgas: String(formData.get("folgas") ?? ""),
    entrada: String(formData.get("entrada") ?? ""),
    saida: String(formData.get("saida") ?? ""),
    inicioCiclo: String(formData.get("inicioCiclo") ?? ""),
  };
}

/**
 * Grava uma vigencia do ciclo — nova ou ja existente.
 *
 * Uma action so para as duas, ao contrario de `criarFuncao`/`atualizarFuncao`:
 * aqui os campos sao exatamente os mesmos e nao ha nada que so a edicao possa
 * mexer (a funcao tem `ativa`). O que decide e a presenca de `vigenciaId`.
 *
 * Nao toca em celula nenhuma. Mudar o contrato muda o **previsto**, que e
 * derivado a cada leitura: o mes inteiro sai recalculado sozinho, e o realizado
 * ja gravado continua onde estava.
 */
export async function salvarVigencia(
  _estadoAnterior: VigenciaState,
  formData: FormData,
): Promise<VigenciaState> {
  await exigirAcesso(AREA);

  const valores = lerValoresDaVigencia(formData);
  const campos = camposDaVigenciaSchema.safeParse(valores);
  const dono = donoDaVigenciaSchema.safeParse({
    funcaoId: String(formData.get("funcaoId") ?? ""),
    vigenciaId: String(formData.get("vigenciaId") ?? ""),
  });

  if (!campos.success || !dono.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: campos.success ? undefined : z.flattenError(campos.error).fieldErrors,
      valores,
    };
  }

  const { folgas, ...resto } = campos.data;
  // `lerFolgas()` e a mesma funcao que o schema usou para recusar — aqui ela ja
  // nao pode falhar, e o `?? []` existe so para o tipo.
  const vigencia = { ...resto, folgas: lerFolgas(folgas, campos.data.diasCiclo) ?? [] };

  try {
    if (dono.data.vigenciaId) {
      await db
        .update(funcaoCiclos)
        .set(vigencia)
        .where(
          and(
            eq(funcaoCiclos.id, dono.data.vigenciaId),
            // O `funcao_id` no filtro nao e redundante: ele impede que um id
            // postado na mao alcance a vigencia de outra funcao.
            eq(funcaoCiclos.funcaoId, dono.data.funcaoId),
          ),
        );
    } else {
      await db.insert(funcaoCiclos).values({ ...vigencia, funcaoId: dono.data.funcaoId });
    }
  } catch (erro) {
    // Os dois indices parciais dizem a mesma coisa por caminhos diferentes: duas
    // vigencias da mesma turma no mesmo dia (ou duas iniciais) nao respondem
    // qual vale.
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: {
          vigenciaInicio: [
            valores.vigenciaInicio
              ? "Esta turma ja tem uma vigencia comecando neste dia"
              : "Esta turma ja tem uma configuracao inicial — informe a data em que esta passa a valer",
          ],
        },
        valores,
      };
    }

    console.error("Falha ao gravar a vigencia do ciclo", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return {
    status: "success",
    mensagem: dono.data.vigenciaId ? "Vigencia atualizada." : "Vigencia cadastrada.",
    chave: crypto.randomUUID(),
  };
}

/**
 * Apaga uma vigencia.
 *
 * E exclusao de verdade, e nao desativacao, pela mesma razao do afastamento e do
 * extra: e uma **entrada**, e nao um fato ja interpretado. Enquanto a linha
 * errada existir, ela continua gerando previsto errado — e o previsto nao esta
 * gravado em lugar nenhum, entao apagar a vigencia desfaz o engano por inteiro.
 */
export async function removerVigencia(
  _estadoAnterior: VigenciaState,
  formData: FormData,
): Promise<VigenciaState> {
  await exigirAcesso(AREA);

  const resultado = removerVigenciaSchema.safeParse({
    vigenciaId: String(formData.get("vigenciaId") ?? ""),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Vigencia invalida." };
  }

  try {
    await db.delete(funcaoCiclos).where(eq(funcaoCiclos.id, resultado.data.vigenciaId));
  } catch (erro) {
    console.error("Falha ao remover a vigencia do ciclo", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Vigencia removida." };
}

/* -------------------------------------------------------------------------- */
/* Responsavel e grupo de contato                                             */
/* -------------------------------------------------------------------------- */

/** O primeiro erro do Zod, para o toast — os formularios da aba tem um campo cada. */
function primeiroErro(erro: z.ZodError) {
  return erro.issues[0]?.message ?? "Confira o campo.";
}

/** O posto do grupo em que a pessoa ja esta, para a recusa dizer onde. */
async function grupoAtualDe(funcionarioId: string) {
  const [linha] = await db
    .select({ codigo: postos.codigo })
    .from(postoContatos)
    .innerJoin(postos, eq(postos.id, postoContatos.postoId))
    .where(eq(postoContatos.funcionarioId, funcionarioId));

  return linha?.codigo ?? null;
}

/**
 * Define (ou tira) o responsavel do posto.
 *
 * O responsavel nao pode estar no proprio grupo: a mensagem sobre o ponto dele
 * iria para ele mesmo, escrita como se fosse sobre outra pessoa. Ele pode,
 * sim, estar no grupo de **outro** posto — ai o ponto dele vai para aquele
 * responsavel.
 */
export async function definirResponsavel(
  _estadoAnterior: GrupoState,
  formData: FormData,
): Promise<GrupoState> {
  await exigirAcesso(AREA);

  const resultado = definirResponsavelSchema.safeParse({
    postoId: String(formData.get("postoId") ?? ""),
    responsavel: String(formData.get("responsavel") ?? ""),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: primeiroErro(resultado.error) };
  }

  const { postoId, responsavel } = resultado.data;

  if (responsavel) {
    const [pessoa] = await db
      .select({ nome: funcionarios.nome, ativo: funcionarios.ativo })
      .from(funcionarios)
      .where(eq(funcionarios.id, responsavel));

    if (!pessoa || !pessoa.ativo) {
      return { status: "error", mensagem: "O responsavel precisa ser um funcionario ativo." };
    }

    const [noGrupo] = await db
      .select({ id: postoContatos.id })
      .from(postoContatos)
      .where(and(eq(postoContatos.postoId, postoId), eq(postoContatos.funcionarioId, responsavel)));

    if (noGrupo) {
      return {
        status: "error",
        mensagem: `${pessoa.nome} esta no grupo deste posto. Retire-o do grupo antes de torna-lo responsavel.`,
      };
    }
  }

  try {
    const atualizados = await db
      .update(postos)
      .set({ responsavelId: responsavel })
      .where(eq(postos.id, postoId))
      .returning({ id: postos.id });

    if (atualizados.length === 0) {
      return { status: "error", mensagem: "Posto nao encontrado." };
    }
  } catch (erro) {
    console.error("Falha ao definir o responsavel do posto", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return {
    status: "success",
    mensagem: responsavel ? "Responsavel definido." : "Responsavel retirado do posto.",
    chave: crypto.randomUUID(),
  };
}

/**
 * Inclui uma pessoa no grupo de contato do posto.
 *
 * Quem ja esta em outro grupo e recusado, com o posto na mensagem, em vez de
 * ser movido: trocar a pessoa de responsavel e uma decisao sobre os dois
 * postos, e quem cuida de um nao necessariamente sabe do outro.
 */
export async function incluirNoGrupo(
  _estadoAnterior: GrupoState,
  formData: FormData,
): Promise<GrupoState> {
  const usuario = await exigirAcesso(AREA);

  const resultado = incluirNoGrupoSchema.safeParse({
    postoId: String(formData.get("postoId") ?? ""),
    pessoa: String(formData.get("pessoa") ?? ""),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: primeiroErro(resultado.error) };
  }

  const { postoId, pessoa: funcionarioId } = resultado.data;

  const [[posto], [pessoa]] = await Promise.all([
    db.select({ responsavelId: postos.responsavelId }).from(postos).where(eq(postos.id, postoId)),
    db
      .select({ nome: funcionarios.nome, ativo: funcionarios.ativo })
      .from(funcionarios)
      .where(eq(funcionarios.id, funcionarioId)),
  ]);

  if (!posto) {
    return { status: "error", mensagem: "Posto nao encontrado." };
  }

  if (!pessoa || !pessoa.ativo) {
    return { status: "error", mensagem: "Escolha um funcionario ativo." };
  }

  if (posto.responsavelId === funcionarioId) {
    return {
      status: "error",
      mensagem: `${pessoa.nome} e o responsavel deste posto e nao entra no proprio grupo.`,
    };
  }

  try {
    await db.insert(postoContatos).values({ postoId, funcionarioId, criadoPor: usuario.id });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      const codigo = await grupoAtualDe(funcionarioId);

      return {
        status: "error",
        mensagem: codigo
          ? `${pessoa.nome} ja esta no grupo do posto ${codigo}. Retire-o de la antes.`
          : `${pessoa.nome} ja esta em outro grupo.`,
      };
    }

    console.error("Falha ao incluir no grupo de contato", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return {
    status: "success",
    mensagem: `${pessoa.nome} incluido no grupo.`,
    chave: crypto.randomUUID(),
  };
}

/**
 * Tira a pessoa do grupo. Exclusao de verdade: o grupo e uma entrada, e
 * enquanto a linha errada existir a mensagem dela vai para o responsavel
 * errado. O historico das mensagens ja enviadas nao depende dela — cada uma
 * guarda o proprio destino e destinatario.
 */
export async function retirarDoGrupo(
  _estadoAnterior: GrupoState,
  formData: FormData,
): Promise<GrupoState> {
  await exigirAcesso(AREA);

  const resultado = retirarDoGrupoSchema.safeParse({
    postoId: String(formData.get("postoId") ?? ""),
    funcionarioId: String(formData.get("funcionarioId") ?? ""),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: primeiroErro(resultado.error) };
  }

  const { postoId, funcionarioId } = resultado.data;

  try {
    await db
      .delete(postoContatos)
      .where(
        and(eq(postoContatos.postoId, postoId), eq(postoContatos.funcionarioId, funcionarioId)),
      );
  } catch (erro) {
    console.error("Falha ao retirar do grupo de contato", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Retirado do grupo." };
}

/**
 * Atalho: inclui no grupo quem esta escalado neste posto na competencia em
 * vigor. E so um ponto de partida — o grupo continua sendo cadastro, e a grade
 * do mes seguinte nao o reescreve.
 *
 * Quem ja esta em outro grupo fica onde esta (`on conflict do nothing`), pela
 * mesma razao da recusa de `incluirNoGrupo()`; a resposta diz quantos e onde. O
 * responsavel do posto e os freelancers ficam de fora.
 */
export async function trazerDaGrade(
  _estadoAnterior: GrupoState,
  formData: FormData,
): Promise<GrupoState> {
  const usuario = await exigirAcesso(AREA);

  const postoId = idPostoSchema.safeParse(String(formData.get("postoId") ?? ""));

  if (!postoId.success) {
    return { status: "error", mensagem: "Posto invalido." };
  }

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return { status: "error", mensagem: "Nao ha competencia em vigor para ler a grade." };
  }

  const [posto] = await db
    .select({ responsavelId: postos.responsavelId })
    .from(postos)
    .where(eq(postos.id, postoId.data));

  if (!posto) {
    return { status: "error", mensagem: "Posto nao encontrado." };
  }

  const escalados = await db
    .selectDistinct({ funcionarioId: funcionarios.id })
    .from(preenchimentoLinhas)
    .innerJoin(funcoesPosto, eq(funcoesPosto.id, preenchimentoLinhas.funcaoId))
    .innerJoin(funcionarios, eq(funcionarios.id, preenchimentoLinhas.funcionarioId))
    .where(
      and(
        eq(preenchimentoLinhas.competenciaId, vigor.competencia.id),
        eq(funcoesPosto.postoId, postoId.data),
        eq(funcionarios.ativo, true),
      ),
    );

  const candidatos = escalados
    .map((linha) => linha.funcionarioId)
    .filter((id) => id !== posto.responsavelId);

  if (candidatos.length === 0) {
    return {
      status: "error",
      mensagem: "Ninguem da folha esta escalado neste posto na competencia em vigor.",
    };
  }

  let incluidos = 0;

  try {
    const inseridos = await db
      .insert(postoContatos)
      .values(
        candidatos.map((funcionarioId) => ({
          postoId: postoId.data,
          funcionarioId,
          criadoPor: usuario.id,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: postoContatos.id });

    incluidos = inseridos.length;
  } catch (erro) {
    console.error("Falha ao trazer a grade para o grupo de contato", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  // Quem ficou de fora por estar no grupo de outro posto.
  const emOutros = await db
    .select({ codigo: postos.codigo })
    .from(postoContatos)
    .innerJoin(postos, eq(postos.id, postoContatos.postoId))
    .where(
      and(
        inArray(postoContatos.funcionarioId, candidatos),
        ne(postoContatos.postoId, postoId.data),
      ),
    );

  refresh();

  const partes = [incluidos === 1 ? "1 pessoa incluida." : `${incluidos} pessoas incluidas.`];

  if (emOutros.length > 0) {
    const codigos = [...new Set(emOutros.map((linha) => linha.codigo))].sort().join(", ");
    partes.push(
      `${emOutros.length} ${emOutros.length === 1 ? "ja esta" : "ja estao"} no grupo de outro posto (${codigos}).`,
    );
  }

  return { status: "success", mensagem: partes.join(" "), chave: crypto.randomUUID() };
}
