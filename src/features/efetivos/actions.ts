"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { efetivoTipos, efetivos, freelancers, funcionarios, locais, postos } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { valorDoFreelancer, type ColaboradorEscolhido } from "@/features/extras/colaborador";
import { ehViolacaoDeUnicidade } from "@/lib/postgres";

import { descreverTurno, ehConflito, type Turno } from "./conflitos";
import { listarTurnosAoRedor } from "./queries";

import {
  confirmarRascunhoSchema,
  idLancamentoSchema,
  nomeFreelancerSchema,
  salvarLancamentoSchema,
  salvarLocalSchema,
  salvarTipoSchema,
  situacaoSchema,
} from "./schema";
import {
  AREA_EFETIVOS,
  type CamposDoLancamento,
  type CatalogoState,
  type FreelancerCadastrado,
  type LancamentoState,
} from "./types";

/**
 * Escritas do modulo de efetivos.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod e refaz a checagem de acesso — o formulario nao autoriza nada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";

function lerValores(formData: FormData) {
  return {
    id: String(formData.get("id") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    comportamento: String(formData.get("comportamento") ?? ""),
  };
}

function recusa(
  valores: ReturnType<typeof lerValores>,
  erros: CatalogoState["erros"],
  mensagem = "Confira os campos destacados.",
): CatalogoState {
  return { status: "error", mensagem, erros, valores, versao: Date.now() };
}

/**
 * Cadastra ou renomeia um local. A unicidade e do indice (`lower(nome)`), e nao
 * de um SELECT previo: duas requisicoes simultaneas passariam pelo "ja existe?"
 * as duas vezes.
 */
export async function salvarLocal(
  _estadoAnterior: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  await exigirAcesso(AREA_EFETIVOS);

  const valores = lerValores(formData);
  const resultado = salvarLocalSchema.safeParse(valores);

  if (!resultado.success) {
    return recusa(valores, z.flattenError(resultado.error).fieldErrors);
  }

  const { id, nome } = resultado.data;

  try {
    if (id) {
      await db.update(locais).set({ nome }).where(eq(locais.id, id));
    } else {
      await db.insert(locais).values({ nome });
    }
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return recusa(valores, { nome: ["Ja existe um local com este nome"] });
    }

    console.error("Falha ao salvar local", erro);
    return recusa(valores, undefined, FALHA_GENERICA);
  }

  refresh();

  return {
    status: "success",
    mensagem: id ? `Local ${nome} atualizado.` : `Local ${nome} cadastrado.`,
    versao: Date.now(),
  };
}

/**
 * Cadastra ou renomeia um tipo de excecao. Na edicao o comportamento nao e
 * gravado nem que chegue no POST: ele decide como os lancamentos ja feitos com
 * o tipo sao lidos.
 */
export async function salvarTipoDeExcecao(
  _estadoAnterior: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  await exigirAcesso(AREA_EFETIVOS);

  const valores = lerValores(formData);
  const resultado = salvarTipoSchema.safeParse(valores);

  if (!resultado.success) {
    return recusa(valores, z.flattenError(resultado.error).fieldErrors);
  }

  const { id, nome, comportamento } = resultado.data;

  try {
    if (id) {
      await db.update(efetivoTipos).set({ rotulo: nome }).where(eq(efetivoTipos.id, id));
    } else if (comportamento) {
      await db.insert(efetivoTipos).values({ rotulo: nome, comportamento });
    }
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return recusa(valores, { nome: ["Ja existe um tipo com este nome"] });
    }

    console.error("Falha ao salvar tipo de excecao", erro);
    return recusa(valores, undefined, FALHA_GENERICA);
  }

  refresh();

  return {
    status: "success",
    mensagem: id ? `Tipo ${nome} atualizado.` : `Tipo ${nome} cadastrado.`,
    versao: Date.now(),
  };
}

/**
 * Ativa ou desativa. Nada do modulo e apagado: o local e o tipo explicam os
 * lancamentos antigos, e desativar so os tira das listas do lancamento.
 */
async function definirSituacao(tabela: typeof locais | typeof efetivoTipos, formData: FormData) {
  await exigirAcesso(AREA_EFETIVOS);

  const resultado = situacaoSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    ativo: String(formData.get("ativo") ?? ""),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Cadastro invalido.", versao: Date.now() } as const;
  }

  const { id, ativo } = resultado.data;

  try {
    await db.update(tabela).set({ ativo }).where(eq(tabela.id, id));
  } catch (erro) {
    console.error("Falha ao mudar a situacao", erro);
    return { status: "error", mensagem: FALHA_GENERICA, versao: Date.now() } as const;
  }

  refresh();

  return {
    status: "success",
    mensagem: ativo ? "Reativado." : "Desativado.",
    versao: Date.now(),
  } as const;
}

export async function definirSituacaoLocal(
  _estadoAnterior: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  return definirSituacao(locais, formData);
}

export async function definirSituacaoTipo(
  _estadoAnterior: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  return definirSituacao(efetivoTipos, formData);
}

// ---------------------------------------------------------------------------
// Lancamento do efetivo
// ---------------------------------------------------------------------------

function recusaDoLancamento(campo: CamposDoLancamento, mensagem: string): LancamentoState {
  return { status: "error", mensagem, erros: { [campo]: [mensagem] }, versao: Date.now() };
}

/**
 * Pessoa ativa, ou a mesma que a linha ja tinha (desativada depois de lancada).
 * Mesma folga da edicao de extras e movimentacoes: corrigir o horario de um
 * lancamento antigo nao pode esbarrar num cadastro que nada tem a ver com a
 * correcao. Trocar por outra continua exigindo cadastro ativo.
 */
async function pessoaValida(pessoa: ColaboradorEscolhido, mesmaDeAntes: boolean) {
  const tabela = pessoa.tipo === "funcionario" ? funcionarios : freelancers;

  const [encontrada] = await db
    .select({ id: tabela.id })
    .from(tabela)
    .where(
      mesmaDeAntes
        ? eq(tabela.id, pessoa.id)
        : and(eq(tabela.id, pessoa.id), eq(tabela.ativo, true)),
    );

  return Boolean(encontrada);
}

/** Mesma folga de `pessoaValida()`, para o posto e o local. */
async function cadastroValido(
  tabela: typeof postos | typeof locais,
  id: string,
  mesmoDeAntes: boolean,
) {
  const [encontrado] = await db
    .select({ id: tabela.id })
    .from(tabela)
    .where(mesmoDeAntes ? eq(tabela.id, id) : and(eq(tabela.id, id), eq(tabela.ativo, true)));

  return Boolean(encontrado);
}

/** O tipo de excecao ativo, ou o mesmo que a linha ja tinha. */
async function tipoValido(tipoId: string, mesmoDeAntes: boolean) {
  const [tipo] = await db
    .select({ comportamento: efetivoTipos.comportamento })
    .from(efetivoTipos)
    .where(
      mesmoDeAntes
        ? eq(efetivoTipos.id, tipoId)
        : and(eq(efetivoTipos.id, tipoId), eq(efetivoTipos.ativo, true)),
    );

  return tipo ?? null;
}

/**
 * Os conflitos de horario dos turnos que se quer gravar contra o que ja esta
 * lancado (D-1 a D+1, por causa do turno que vira o dia). `excetoId` e a linha
 * em edicao: ela nao conflita com a versao anterior dela mesma.
 */
async function conflitosDosTurnos(data: string, novos: Turno[], excetoId?: string) {
  const ids = (prefixo: string) =>
    novos.flatMap((turno) => (turno.pessoa.startsWith(prefixo) ? [turno.pessoa.slice(2)] : []));

  const existentes = (
    await listarTurnosAoRedor(data, { funcionarios: ids("f:"), freelancers: ids("l:") })
  ).filter((turno) => turno.lancamentoId !== excetoId);

  return novos.flatMap((novo) =>
    existentes
      .filter((existente) => ehConflito(novo, existente))
      .map(
        (existente) =>
          `${existente.nome} — ${descreverTurno(existente)}` +
          (novo.presente ? "" : ", mas aqui consta como falta"),
      ),
  );
}

/**
 * Lanca (ou corrige) uma pessoa no posto, no dia — com a excecao, quando houver.
 *
 * Nao passa por `competenciaDeEscrita()`: o efetivo vale por data, como os
 * afastamentos (ver `efetivos` no schema). Quem lancou e quando ficam na linha
 * (`criado_por`/`criado_em`); quem corrigiu, em `atualizado_por`/`atualizado_em`.
 *
 * O formulario desenha todos os campos, inclusive os da excecao, entao a
 * edicao grava todos: desmarcar "Excecao" limpa tipo, contraparte, posto de
 * origem e observacao.
 *
 * O que a excecao pede sai do **comportamento** do tipo, lido do banco — e nao
 * de um campo do formulario, que e POST publico:
 * - cobertura: quem faltou (obrigatorio, e nao a propria pessoa);
 * - troca: com quem trocou **ou** de qual posto veio (ao menos um);
 * - falta sem cobertura e simples: nada alem do tipo e da observacao.
 */
export async function salvarLancamento(
  _estadoAnterior: LancamentoState,
  formData: FormData,
): Promise<LancamentoState> {
  const usuario = await exigirAcesso(AREA_EFETIVOS);

  const campo = (nome: string) => String(formData.get(nome) ?? "");
  const resultado = salvarLancamentoSchema.safeParse({
    id: campo("id"),
    data: campo("data"),
    postoId: campo("postoId"),
    pessoa: campo("pessoa"),
    localId: campo("localId"),
    entrada: campo("entrada"),
    saida: campo("saida"),
    excecao: campo("excecao"),
    tipoId: campo("tipoId"),
    contraparte: campo("contraparte"),
    postoOrigemId: campo("postoOrigemId"),
    observacao: campo("observacao"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      versao: Date.now(),
    };
  }

  const { id, data, postoId, pessoa, localId, entrada, saida, excecao } = resultado.data;

  // Na edicao, o que a linha ja tinha vale mesmo desativado.
  let anterior: {
    postoId: string;
    localId: string;
    pessoa: string;
    tipoId: string | null;
    contraparte: string | null;
    postoOrigemId: string | null;
  } | null = null;

  if (id) {
    const [linha] = await db
      .select({
        postoId: efetivos.postoId,
        localId: efetivos.localId,
        funcionarioId: efetivos.funcionarioId,
        freelancerId: efetivos.freelancerId,
        tipoId: efetivos.tipoId,
        contraparteFuncionarioId: efetivos.contraparteFuncionarioId,
        contraparteFreelancerId: efetivos.contraparteFreelancerId,
        postoOrigemId: efetivos.postoOrigemId,
      })
      .from(efetivos)
      .where(eq(efetivos.id, id));

    if (!linha) {
      return { status: "error", mensagem: "Este lancamento nao existe mais.", versao: Date.now() };
    }

    anterior = {
      postoId: linha.postoId,
      localId: linha.localId,
      pessoa: linha.funcionarioId ?? linha.freelancerId ?? "",
      tipoId: linha.tipoId,
      contraparte: linha.contraparteFuncionarioId ?? linha.contraparteFreelancerId,
      postoOrigemId: linha.postoOrigemId,
    };
  }

  const [postoOk, localOk, pessoaOk] = await Promise.all([
    cadastroValido(postos, postoId, anterior?.postoId === postoId),
    cadastroValido(locais, localId, anterior?.localId === localId),
    pessoaValida(pessoa, anterior?.pessoa === pessoa.id),
  ]);

  if (!postoOk) {
    return recusaDoLancamento("postoId", "Posto nao encontrado ou inativo");
  }

  if (!localOk) {
    return recusaDoLancamento("localId", "Local nao encontrado ou inativo");
  }

  if (!pessoaOk) {
    return recusaDoLancamento("pessoa", "Pessoa nao encontrada ou inativa");
  }

  // --- a excecao -----------------------------------------------------------
  let detalhe = {
    tipoId: null as string | null,
    contraparteFuncionarioId: null as string | null,
    contraparteFreelancerId: null as string | null,
    postoOrigemId: null as string | null,
    observacao: null as string | null,
  };

  if (excecao) {
    const { tipoId, contraparte, postoOrigemId, observacao } = resultado.data;

    if (!tipoId) {
      return recusaDoLancamento("tipoId", "Escolha o tipo de excecao");
    }

    const tipo = await tipoValido(tipoId, anterior?.tipoId === tipoId);

    if (!tipo) {
      return recusaDoLancamento("tipoId", "Tipo de excecao nao encontrado ou inativo");
    }

    const pedeContraparte = tipo.comportamento === "cobertura";
    const aceitaContraparte = pedeContraparte || tipo.comportamento === "troca";
    const aceitaOrigem = tipo.comportamento === "troca";
    const outra = aceitaContraparte ? contraparte : null;
    const origem = aceitaOrigem ? postoOrigemId : null;

    if (pedeContraparte && !outra) {
      return recusaDoLancamento("contraparte", "Informe quem faltou");
    }

    if (tipo.comportamento === "troca" && !outra && !origem) {
      return recusaDoLancamento("contraparte", "Informe com quem trocou ou de qual posto veio");
    }

    if (outra && outra.id === pessoa.id) {
      return recusaDoLancamento(
        "contraparte",
        pedeContraparte
          ? "Quem faltou nao pode ser quem esta cobrindo"
          : "A pessoa nao pode trocar com ela mesma",
      );
    }

    if (origem && origem === postoId) {
      return recusaDoLancamento("postoOrigemId", "O posto de origem e este mesmo posto");
    }

    const [contraparteOk, origemOk] = await Promise.all([
      outra ? pessoaValida(outra, anterior?.contraparte === outra.id) : true,
      origem ? cadastroValido(postos, origem, anterior?.postoOrigemId === origem) : true,
    ]);

    if (!contraparteOk) {
      return recusaDoLancamento("contraparte", "Pessoa nao encontrada ou inativa");
    }

    if (!origemOk) {
      return recusaDoLancamento("postoOrigemId", "Posto nao encontrado ou inativo");
    }

    detalhe = {
      tipoId,
      contraparteFuncionarioId: outra?.tipo === "funcionario" ? outra.id : null,
      contraparteFreelancerId: outra?.tipo === "freelancer" ? outra.id : null,
      postoOrigemId: origem,
      observacao,
    };
  }

  const valores = {
    data,
    postoId,
    funcionarioId: pessoa.tipo === "funcionario" ? pessoa.id : null,
    freelancerId: pessoa.tipo === "freelancer" ? pessoa.id : null,
    localId,
    horaEntrada: entrada,
    horaSaida: saida,
    ...detalhe,
  };

  // --- conflito de horario -------------------------------------------------
  // A pessoa da linha (ausente, na falta sem cobertura) e, na cobertura, quem
  // faltou. Conflito nao recusa: devolve a lista e espera a confirmacao.
  if (formData.get("confirmarConflito") !== "1") {
    const comportamento = detalhe.tipoId
      ? (await tipoValido(detalhe.tipoId, true))?.comportamento
      : null;
    const turno = {
      lancamentoId: id ?? "novo",
      data,
      entrada,
      saida,
      postoId,
      posto: "",
      local: "",
    };
    const novos: Turno[] = [
      {
        ...turno,
        pessoa: `${pessoa.tipo === "funcionario" ? "f" : "l"}:${pessoa.id}`,
        nome: "",
        presente: comportamento !== "falta_sem_cobertura",
      },
    ];
    const faltou = detalhe.contraparteFuncionarioId
      ? `f:${detalhe.contraparteFuncionarioId}`
      : detalhe.contraparteFreelancerId
        ? `l:${detalhe.contraparteFreelancerId}`
        : null;

    if (comportamento === "cobertura" && faltou) {
      novos.push({ ...turno, pessoa: faltou, nome: "", presente: false });
    }

    const conflitos = await conflitosDosTurnos(data, novos, id);

    if (conflitos.length > 0) {
      return {
        status: "error",
        mensagem: "Conflito de horario.",
        conflitos,
        versao: Date.now(),
      };
    }
  }

  try {
    if (id) {
      await db
        .update(efetivos)
        .set({ ...valores, atualizadoPor: usuario.id })
        .where(eq(efetivos.id, id));
    } else {
      await db.insert(efetivos).values({ ...valores, criadoPor: usuario.id });
    }
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return recusaDoLancamento(
        "pessoa",
        "Esta pessoa ja esta lancada neste posto, neste dia, com a mesma entrada",
      );
    }

    console.error("Falha ao salvar lancamento de efetivo", erro);
    return { status: "error", mensagem: FALHA_GENERICA, versao: Date.now() };
  }

  refresh();

  return {
    status: "success",
    mensagem: id ? "Lancamento atualizado." : "Lancamento adicionado.",
    versao: Date.now(),
  };
}

/**
 * Apaga um lancamento. E entrada, como o extra e a movimentacao: enquanto a
 * linha errada existir, ela diz que alguem esteve no posto. O botao pede
 * segundo clique.
 */
export async function excluirLancamento(
  _estadoAnterior: LancamentoState,
  formData: FormData,
): Promise<LancamentoState> {
  await exigirAcesso(AREA_EFETIVOS);

  const resultado = idLancamentoSchema.safeParse(String(formData.get("id") ?? ""));

  if (!resultado.success) {
    return { status: "error", mensagem: "Lancamento invalido.", versao: Date.now() };
  }

  try {
    await db.delete(efetivos).where(eq(efetivos.id, resultado.data));
  } catch (erro) {
    console.error("Falha ao excluir lancamento de efetivo", erro);
    return { status: "error", mensagem: FALHA_GENERICA, versao: Date.now() };
  }

  refresh();

  return { status: "success", mensagem: "Lancamento excluido.", versao: Date.now() };
}

/**
 * "Inserir como freelancer", direto do campo de pessoa: cadastra e devolve o
 * valor pronto para o campo, e o lancamento segue.
 *
 * Nome que ja existe (sem diferenciar maiusculas) reaproveita o cadastro, como
 * na grade e nos extras — dois "Joao Silva" freelancers so confundiriam. Se o
 * existente estiver desativado, a action avisa em vez de reativar por conta
 * propria.
 */
export async function cadastrarFreelancerDoEfetivo(nome: string): Promise<FreelancerCadastrado> {
  await exigirAcesso(AREA_EFETIVOS);

  const resultado = nomeFreelancerSchema.safeParse(nome);

  if (!resultado.success) {
    return { ok: false, mensagem: resultado.error.issues[0]?.message ?? "Nome invalido" };
  }

  const limpo = resultado.data;

  try {
    const [existente] = await db
      .select({ id: freelancers.id, nome: freelancers.nome, ativo: freelancers.ativo })
      .from(freelancers)
      .where(eq(sql`lower(${freelancers.nome})`, limpo.toLowerCase()));

    if (existente) {
      if (!existente.ativo) {
        return { ok: false, mensagem: `O freelancer ${existente.nome} esta desativado.` };
      }

      return {
        ok: true,
        valor: valorDoFreelancer(existente.id),
        nome: existente.nome,
        novo: false,
      };
    }

    const [criado] = await db
      .insert(freelancers)
      .values({ nome: limpo })
      .returning({ id: freelancers.id, nome: freelancers.nome });

    return { ok: true, valor: valorDoFreelancer(criado.id), nome: criado.nome, novo: true };
  } catch (erro) {
    // Duas pessoas cadastrando o mesmo nome ao mesmo tempo: a segunda esbarra no
    // indice e e so tentar de novo para cair no "ja existe".
    console.error("Falha ao cadastrar freelancer", erro);
    return { ok: false, mensagem: FALHA_GENERICA };
  }
}

/**
 * Grava o rascunho "Copiar da mesma equipe (D-2)" que a pessoa conferiu.
 *
 * Tudo numa transacao, e cada linha com `on conflict do nothing`: quem ja foi
 * lancado hoje com a mesma entrada (pelo formulario, por outra aba) fica como
 * esta, e o resto entra. Pessoa ou local desativado e pulado — o rascunho ja os
 * mostra bloqueados, e chegar aqui e POST forjado ou cadastro mudado no meio.
 * Nenhuma excecao e gravada: o rascunho nao as tem.
 */
export async function confirmarRascunho(
  _estadoAnterior: LancamentoState,
  formData: FormData,
): Promise<LancamentoState> {
  const usuario = await exigirAcesso(AREA_EFETIVOS);

  let itens: unknown;

  try {
    itens = JSON.parse(String(formData.get("itens") ?? "[]"));
  } catch {
    itens = [];
  }

  const resultado = confirmarRascunhoSchema.safeParse({
    data: String(formData.get("data") ?? ""),
    postoId: String(formData.get("postoId") ?? ""),
    itens,
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: resultado.error.issues[0]?.message ?? "Rascunho invalido.",
      versao: Date.now(),
    };
  }

  const { data, postoId } = resultado.data;

  if (!(await cadastroValido(postos, postoId, false))) {
    return { status: "error", mensagem: "Posto nao encontrado ou inativo.", versao: Date.now() };
  }

  const idsDe = (tipo: "funcionario" | "freelancer") =>
    resultado.data.itens.flatMap((item) => (item.pessoa.tipo === tipo ? [item.pessoa.id] : []));
  const idsFuncionarios = idsDe("funcionario");
  const idsFreelancers = idsDe("freelancer");
  const idsLocais = [...new Set(resultado.data.itens.map((item) => item.localId))];

  const [funcionariosAtivos, freelancersAtivos, locaisAtivos] = await Promise.all([
    idsFuncionarios.length
      ? db
          .select({ id: funcionarios.id })
          .from(funcionarios)
          .where(and(inArray(funcionarios.id, idsFuncionarios), eq(funcionarios.ativo, true)))
      : [],
    idsFreelancers.length
      ? db
          .select({ id: freelancers.id })
          .from(freelancers)
          .where(and(inArray(freelancers.id, idsFreelancers), eq(freelancers.ativo, true)))
      : [],
    db
      .select({ id: locais.id })
      .from(locais)
      .where(and(inArray(locais.id, idsLocais), eq(locais.ativo, true))),
  ]);

  const pessoasOk = new Set([
    ...funcionariosAtivos.map((linha) => linha.id),
    ...freelancersAtivos.map((linha) => linha.id),
  ]);
  const locaisOk = new Set(locaisAtivos.map((linha) => linha.id));
  const validos = resultado.data.itens.filter(
    (item) => pessoasOk.has(item.pessoa.id) && locaisOk.has(item.localId),
  );

  if (formData.get("confirmarConflito") !== "1") {
    const conflitos = await conflitosDosTurnos(
      data,
      validos.map((item) => ({
        lancamentoId: "novo",
        pessoa: `${item.pessoa.tipo === "funcionario" ? "f" : "l"}:${item.pessoa.id}`,
        nome: "",
        data,
        entrada: item.entrada,
        saida: item.saida,
        postoId,
        posto: "",
        local: "",
        presente: true,
      })),
    );

    if (conflitos.length > 0) {
      return { status: "error", mensagem: "Conflito de horario.", conflitos, versao: Date.now() };
    }
  }

  let gravados = 0;

  try {
    await db.transaction(async (tx) => {
      for (const item of validos) {
        const linhas = await tx
          .insert(efetivos)
          .values({
            data,
            postoId,
            funcionarioId: item.pessoa.tipo === "funcionario" ? item.pessoa.id : null,
            freelancerId: item.pessoa.tipo === "freelancer" ? item.pessoa.id : null,
            localId: item.localId,
            horaEntrada: item.entrada,
            horaSaida: item.saida,
            criadoPor: usuario.id,
          })
          .onConflictDoNothing()
          .returning({ id: efetivos.id });

        gravados += linhas.length;
      }
    });
  } catch (erro) {
    console.error("Falha ao confirmar rascunho de efetivo", erro);
    return { status: "error", mensagem: FALHA_GENERICA, versao: Date.now() };
  }

  refresh();

  const pulados = resultado.data.itens.length - gravados;

  return {
    status: "success",
    mensagem:
      `${gravados} ${gravados === 1 ? "lancamento adicionado" : "lancamentos adicionados"}` +
      (pulados > 0
        ? ` (${pulados} ja lancado${pulados === 1 ? "" : "s"} ou inativo${pulados === 1 ? "" : "s"}).`
        : "."),
    versao: Date.now(),
  };
}
