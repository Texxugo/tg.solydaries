"use server";

import { eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { afastamentos, empresas, escalas, funcionarios } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { formatarData } from "@/features/competencias/periodo";
import { ehViolacaoDeUnicidade, restricaoViolada } from "@/lib/postgres";

import { periodosSeSobrepoem } from "./afastamentos";
import { planejarImportacao, type DadosDaFolha, type PlanoDeImportacao } from "./importacao";
import { SITUACAO_TRABALHANDO } from "./situacoes";
import { lerRelatorio, type LeituraDoRelatorio, type LinhaRecusada } from "./planilha";
import {
  atribuirEscalaSchema,
  atualizarFuncionarioSchema,
  criarFuncionarioSchema,
  definirJornadaSchema,
  registrarAfastamentoSchema,
  removerAfastamentoSchema,
} from "./schema";
import {
  AREA_FUNCIONARIOS,
  ITENS_NA_PREVIA,
  RECUSAS_NA_PREVIA,
  TAMANHO_MAXIMO_ARQUIVO,
  type AtribuirEscalaState,
  type AtualizarFuncionarioState,
  type CriarFuncionarioState,
  type DefinirJornadaState,
  type ImportacaoState,
  type ItemDaPrevia,
  type RegistrarAfastamentoState,
  type RemoverAfastamentoState,
  type ValoresDoFuncionario,
} from "./types";
import { lerPlanilha, PlanilhaInvalidaError } from "./xlsx";

/**
 * Escritas do modulo de funcionarios.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod e refaz a checagem de acesso — o formulario nao autoriza nada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";
const CPF_EM_USO = "Ja existe um funcionario com este CPF";
const MATRICULA_EM_USO = "Ja existe alguem com esta matricula nesta empresa";

/**
 * Traduz a recusa do banco para o campo certo do formulario. A tabela tem dois
 * indices unicos, e "ja existe" sem dizer o que ja existe manda a pessoa
 * procurar o erro no campo errado.
 */
function errosDeUnicidade(erro: unknown) {
  const restricao = restricaoViolada(erro);

  if (restricao === "funcionarios_cpf_unico") {
    return { cpf: [CPF_EM_USO] };
  }

  if (restricao === "funcionarios_matricula_unica") {
    return { matricula: [MATRICULA_EM_USO] };
  }

  // Unicidade que este codigo nao conhece: melhor a mensagem geral do que
  // apontar um campo por chute.
  return null;
}

/**
 * O formulario chega inteiro como texto. Ler tudo antes de validar tambem e o
 * que permite devolver os valores digitados quando o Zod recusa.
 */
function lerValores(formData: FormData): ValoresDoFuncionario {
  return {
    empresaId: String(formData.get("empresaId") ?? ""),
    matricula: String(formData.get("matricula") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    cpf: String(formData.get("cpf") ?? ""),
    cargo: String(formData.get("cargo") ?? ""),
    telefone: String(formData.get("telefone") ?? ""),
    admissao: String(formData.get("admissao") ?? ""),
    situacao: String(formData.get("situacao") ?? ""),
    escalaId: String(formData.get("escalaId") ?? ""),
    inicioCiclo: String(formData.get("inicioCiclo") ?? ""),
  };
}

export async function criarFuncionario(
  _estadoAnterior: CriarFuncionarioState,
  formData: FormData,
): Promise<CriarFuncionarioState> {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const valores = lerValores(formData);
  const resultado = criarFuncionarioSchema.safeParse(valores);

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
      valores,
    };
  }

  const funcionario = resultado.data;

  try {
    await db.insert(funcionarios).values(funcionario);
  } catch (erro) {
    // Unicidade por indice, e nao por consulta previa: duas requisicoes
    // simultaneas passariam pelo "ja existe?" as duas vezes.
    if (ehViolacaoDeUnicidade(erro)) {
      const erros = errosDeUnicidade(erro);

      if (erros) {
        return { status: "error", mensagem: "Confira os campos destacados.", erros, valores };
      }
    }

    console.error("Falha ao cadastrar funcionario", erro);
    return { status: "error", mensagem: FALHA_GENERICA, valores };
  }

  refresh();

  return { status: "success", mensagem: `${funcionario.nome} cadastrado.` };
}

export async function atualizarFuncionario(
  _estadoAnterior: AtualizarFuncionarioState,
  formData: FormData,
): Promise<AtualizarFuncionarioState> {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const resultado = atualizarFuncionarioSchema.safeParse({
    ...lerValores(formData),
    funcionarioId: formData.get("funcionarioId"),
    // Checkbox nao marcado nao vai no FormData: a presenca do campo e o valor.
    ativo: formData.has("ativo"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { funcionarioId, ...funcionario } = resultado.data;

  try {
    const atualizados = await db
      .update(funcionarios)
      .set(funcionario)
      .where(eq(funcionarios.id, funcionarioId))
      .returning({ id: funcionarios.id });

    if (atualizados.length === 0) {
      return { status: "error", mensagem: "Funcionario nao encontrado." };
    }
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      const erros = errosDeUnicidade(erro);

      if (erros) {
        return { status: "error", mensagem: "Confira os campos destacados.", erros };
      }
    }

    console.error("Falha ao atualizar funcionario", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Funcionario atualizado." };
}

/**
 * Define (ou tira) a escala e o inicio de ciclo de **uma** pessoa, na tela
 * propria da jornada.
 *
 * Separada de `atualizarFuncionario()` porque as duas telas sao separadas: os
 * dados vem da folha e a jornada nasce no portal. Uma action so obrigaria o
 * formulario de cargo a reenviar escala e inicio de ciclo, e um campo que ele
 * por acaso nao desenhasse chegaria vazio — apagando a jornada de quem ja tinha.
 *
 * Aceita o par vazio: e assim que se corrige uma atribuicao feita por engano.
 */
export async function definirJornada(
  _estadoAnterior: DefinirJornadaState,
  formData: FormData,
): Promise<DefinirJornadaState> {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const resultado = definirJornadaSchema.safeParse({
    funcionarioId: formData.get("funcionarioId"),
    escalaId: formData.get("escalaId"),
    inicioCiclo: formData.get("inicioCiclo"),
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { funcionarioId, escalaId, inicioCiclo } = resultado.data;

  try {
    // Mesma trava do lote: desativar uma escala significa "nao ofereca mais em
    // atribuicao nova". Quem ja a tem continua com ela — isso e historico.
    if (escalaId) {
      const [escala] = await db
        .select({ nome: escalas.nome, ativa: escalas.ativa })
        .from(escalas)
        .where(eq(escalas.id, escalaId))
        .limit(1);

      if (!escala) {
        return { status: "error", mensagem: "Escala nao encontrada." };
      }

      if (!escala.ativa) {
        return { status: "error", mensagem: `A escala ${escala.nome} esta inativa.` };
      }
    }

    const atualizados = await db
      .update(funcionarios)
      .set({ escalaId, inicioCiclo })
      .where(eq(funcionarios.id, funcionarioId))
      .returning({ id: funcionarios.id });

    if (atualizados.length === 0) {
      return { status: "error", mensagem: "Funcionario nao encontrado." };
    }
  } catch (erro) {
    console.error("Falha ao definir a jornada", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return {
    status: "success",
    mensagem: escalaId ? "Jornada definida." : "Jornada removida.",
  };
}

/**
 * Define a mesma escala e o mesmo inicio de ciclo para varias pessoas.
 *
 * E o caminho normal depois de uma importacao: o relatorio da folha traz
 * centenas de pessoas e nenhuma escala, e quem faz a mesma jornada costuma
 * comecar o ciclo no mesmo dia. Um por um seria a mesma informacao digitada
 * trezentas vezes.
 *
 * A escala precisa estar ativa: desativar significa "nao ofereca mais em
 * atribuicao nova", e o lote e a atribuicao mais larga que existe. Quem ja tem
 * a escala inativa continua com ela — isso e historico, nao atribuicao.
 */
export async function atribuirEscala(
  _estadoAnterior: AtribuirEscalaState,
  formData: FormData,
): Promise<AtribuirEscalaState> {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const resultado = atribuirEscalaSchema.safeParse({
    escalaId: formData.get("escalaId"),
    inicioCiclo: formData.get("inicioCiclo"),
    funcionarios: formData.getAll("funcionarios").map(String),
  });

  if (!resultado.success) {
    const erros = z.flattenError(resultado.error).fieldErrors;

    return {
      status: "error",
      // Os tres campos deste formulario vivem na mesma barra, sem lugar para
      // mensagem por campo: a primeira explica melhor do que "confira os campos".
      mensagem:
        erros.funcionarios?.[0] ??
        erros.escalaId?.[0] ??
        erros.inicioCiclo?.[0] ??
        "Confira a escala e a data.",
    };
  }

  const { escalaId, inicioCiclo, funcionarios: ids } = resultado.data;

  try {
    const [escala] = await db
      .select({ nome: escalas.nome, ativa: escalas.ativa })
      .from(escalas)
      .where(eq(escalas.id, escalaId))
      .limit(1);

    if (!escala) {
      return { status: "error", mensagem: "Escala nao encontrada." };
    }

    if (!escala.ativa) {
      return { status: "error", mensagem: `A escala ${escala.nome} esta inativa.` };
    }

    const atribuidos = await db
      .update(funcionarios)
      .set({ escalaId, inicioCiclo })
      .where(inArray(funcionarios.id, ids))
      .returning({ id: funcionarios.id });

    refresh();

    return {
      status: "success",
      mensagem:
        atribuidos.length === 1
          ? `1 funcionario passou a seguir a escala ${escala.nome}.`
          : `${atribuidos.length} funcionarios passaram a seguir a escala ${escala.nome}.`,
    };
  } catch (erro) {
    console.error("Falha ao atribuir escala", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }
}

/* -------------------------------------------------------------------------- */
/* Importacao                                                                 */
/* -------------------------------------------------------------------------- */

function recusa(mensagem: string): ImportacaoState {
  return { status: "error", mensagem };
}

/** Corta a lista de recusas no teto, dizendo se cortou. */
function recortarRecusas(recusadas: readonly LinhaRecusada[]) {
  return {
    recusadas: recusadas.slice(0, RECUSAS_NA_PREVIA),
    recusasCortadas: recusadas.length > RECUSAS_NA_PREVIA,
  };
}

function itemDaPrevia(linha: number, nome: string, empresa: string, detalhe: string): ItemDaPrevia {
  return { linha, nome, empresa, detalhe };
}

/**
 * Le o arquivo enviado e monta o plano. Compartilhada pela previa e pela
 * gravacao **de proposito**: uma previa calculada por um caminho e uma gravacao
 * por outro seria uma previa que nao promete nada.
 */
type Planejamento =
  | { ok: true; leitura: LeituraDoRelatorio; plano: PlanoDeImportacao }
  | { ok: false; mensagem: string };

async function planejarArquivo(arquivo: File): Promise<Planejamento> {
  const linhas = lerPlanilha(Buffer.from(await arquivo.arrayBuffer()));
  const leitura = lerRelatorio(linhas);

  if (!leitura.cabecalhoEncontrado) {
    return {
      ok: false,
      mensagem:
        "Nao encontramos as colunas Codigo, Nome e CPF no arquivo. " +
        "Confira se e o relatorio Relacao de Empregados.",
    };
  }

  if (leitura.funcionarios.length === 0 && leitura.recusadas.length === 0) {
    return { ok: false, mensagem: "O arquivo nao tem nenhuma linha de funcionario." };
  }

  const [empresasCadastradas, existentes] = await Promise.all([
    db.select({ id: empresas.id, nome: empresas.nome }).from(empresas),
    db
      .select({
        id: funcionarios.id,
        cpf: funcionarios.cpf,
        empresaId: funcionarios.empresaId,
        matricula: funcionarios.matricula,
        nome: funcionarios.nome,
        cargo: funcionarios.cargo,
        admissao: funcionarios.admissao,
        situacao: funcionarios.situacao,
      })
      .from(funcionarios),
  ]);

  return {
    ok: true,
    leitura,
    plano: planejarImportacao(
      leitura.funcionarios,
      existentes,
      empresasCadastradas,
      leitura.recusadas,
    ),
  };
}

/** A previa como a tela a mostra: os numeros inteiros, o detalhe em amostra. */
function montarPrevia(
  arquivo: string,
  leitura: LeituraDoRelatorio,
  plano: PlanoDeImportacao,
): ImportacaoState {
  return {
    status: "previa",
    previa: {
      arquivo,
      lidas: leitura.funcionarios.length,
      empresasNovas: plano.empresasNovas,
      criar: plano.aCriar.length,
      atualizar: plano.aAtualizar.length,
      inalterados: plano.inalterados,
      amostraCriar: plano.aCriar
        .slice(0, ITENS_NA_PREVIA)
        .map((item) =>
          itemDaPrevia(item.linha, item.dados.nome, item.dados.empresa, item.dados.cargo ?? "—"),
        ),
      amostraAtualizar: plano.aAtualizar
        .slice(0, ITENS_NA_PREVIA)
        .map((item) =>
          itemDaPrevia(item.linha, item.dados.nome, item.dados.empresa, item.mudancas.join(" · ")),
        ),
      ...recortarRecusas(plano.recusadas),
    },
  };
}

/**
 * Grava o plano. Empresas novas primeiro, na mesma transacao: os funcionarios
 * que entram nelas precisam do `empresa_id`, e uma empresa criada sem que os
 * funcionarios entrem seria lixo deixado por uma importacao que falhou.
 */
async function gravarPlano(plano: PlanoDeImportacao) {
  return db.transaction(async (tx) => {
    const idPorEmpresa = new Map<string, string>();

    if (plano.empresasNovas.length > 0) {
      const criadas = await tx
        .insert(empresas)
        .values(plano.empresasNovas.map((nome) => ({ nome })))
        .returning({ id: empresas.id, nome: empresas.nome });

      for (const empresa of criadas) {
        idPorEmpresa.set(empresa.nome.toLowerCase(), empresa.id);
      }
    }

    /**
     * O `empresa_id` do item: o que ja existia, ou o da empresa recem-criada.
     *
     * O plano garante que toda empresa citada esta em uma das duas listas, mas
     * lancar aqui e o que transforma um descompasso futuro entre planejar e
     * gravar em transacao desfeita, e nao em funcionario gravado na empresa
     * errada.
     */
    const empresaDo = (dados: DadosDaFolha) => {
      const id = dados.empresaId ?? idPorEmpresa.get(dados.empresa.trim().toLowerCase());

      if (!id) {
        throw new Error(`Empresa nao resolvida na importacao: ${dados.empresa}`);
      }

      return id;
    };

    if (plano.aCriar.length > 0) {
      // Um `insert` so: trezentas idas ao banco para trezentas linhas seria o
      // custo da importacao inteira concentrado em latencia.
      //
      // `escala_id` e `inicio_ciclo` ficam de fora, e nao nulos por descuido:
      // o relatorio da folha nao conhece escala, e quem entra por aqui entra
      // como pendencia na lista.
      await tx.insert(funcionarios).values(
        plano.aCriar.map((item) => ({
          cpf: item.cpf,
          empresaId: empresaDo(item.dados),
          matricula: item.dados.matricula,
          nome: item.dados.nome,
          cargo: item.dados.cargo,
          admissao: item.dados.admissao,
          // Arquivo sem a coluna Situacao entra como "Trabalhando": quem esta
          // sendo cadastrado agora nao tem situacao anterior a preservar.
          situacao: item.dados.situacao ?? SITUACAO_TRABALHANDO,
        })),
      );
    }

    for (const item of plano.aAtualizar) {
      // Um `update` por pessoa porque cada uma recebe valores diferentes. E
      // aqui que a promessa da reimportacao se cumpre: o `set` lista os campos
      // da folha e **nenhum** dos dois campos de jornada.
      await tx
        .update(funcionarios)
        .set({
          empresaId: empresaDo(item.dados),
          matricula: item.dados.matricula,
          nome: item.dados.nome,
          cargo: item.dados.cargo,
          admissao: item.dados.admissao,
          // Aqui o `null` **omite** o campo, em vez de virar 1: o modelo de uma
          // empresa so nao traz Situacao, e sobrescrever com o padrao diria que
          // quem estava de ferias ou no INSS voltou a trabalhar. O que o arquivo
          // nao informa, a carga nao toca — mesma regra de escala e telefone.
          ...(item.dados.situacao === null ? {} : { situacao: item.dados.situacao }),
        })
        .where(eq(funcionarios.id, item.id));
    }

    return { criados: plano.aCriar.length, atualizados: plano.aAtualizar.length };
  });
}

/**
 * Importa o relatorio da folha, em duas etapas na mesma action: sem
 * `confirmar`, devolve a previa; com ele, grava.
 *
 * A confirmacao reenvia o **arquivo**, e nao o plano que a previa mostrou. Duas
 * razoes: o que o cliente devolve nao e evidencia (a action e um POST publico,
 * e um plano forjado gravaria o que quisesse), e o cadastro pode ter mudado
 * entre uma tela e outra — quem foi criado nesse meio tempo precisa aparecer
 * como atualizacao, e nao como um `insert` que o indice unico vai recusar.
 */
export async function importarFuncionarios(
  _estadoAnterior: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const arquivo = formData.get("arquivo");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return recusa("Escolha o arquivo .xlsx do relatorio da folha.");
  }

  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    return recusa("O arquivo passa de 5 MB. Confira se e o relatorio certo.");
  }

  let planejamento: Planejamento;

  try {
    planejamento = await planejarArquivo(arquivo);
  } catch (erro) {
    // A mensagem do leitor ja diz o que ha de errado com o arquivo ("nao e um
    // .xlsx", "esta corrompido") e e util a quem enviou; qualquer outra falha
    // e problema nosso e vira a mensagem geral.
    if (erro instanceof PlanilhaInvalidaError) {
      return recusa(erro.message);
    }

    console.error("Falha ao ler a planilha de funcionarios", erro);
    return recusa(FALHA_GENERICA);
  }

  if (!planejamento.ok) {
    return recusa(planejamento.mensagem);
  }

  const { leitura, plano } = planejamento;

  if (formData.get("confirmar") !== "1") {
    return montarPrevia(arquivo.name, leitura, plano);
  }

  try {
    const { criados, atualizados } = await gravarPlano(plano);

    refresh();

    return {
      status: "success",
      mensagem: `Importacao concluida: ${criados} cadastrados e ${atualizados} atualizados.`,
      resultado: {
        criados,
        atualizados,
        inalterados: plano.inalterados,
        empresasCriadas: plano.empresasNovas,
        ...recortarRecusas(plano.recusadas),
      },
    };
  } catch (erro) {
    console.error("Falha ao gravar a importacao de funcionarios", erro);
    return recusa(FALHA_GENERICA);
  }
}

/* -------------------------------------------------------------------------- */
/* Afastamentos                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Registra um periodo em que a pessoa nao devia bater ponto.
 *
 * A sobreposicao com um afastamento ja lancado e recusada aqui, e nao pelo
 * banco: exigiria a extensao `btree_gist` para um problema que nao corrompe
 * nada — um dia coberto duas vezes continua coberto. Recusamos porque duas
 * ausencias simultaneas quase sempre sao data digitada errada, e deixar passar
 * transformaria o engano em silencio.
 *
 * Ha uma corrida entre a conferencia e o insert (duas requisicoes simultaneas
 * passariam as duas), e ela e aceita: o pior caso e o dia coberto em dobro, que
 * a apuracao ja resolve pegando o primeiro.
 */
export async function registrarAfastamento(
  _estadoAnterior: RegistrarAfastamentoState,
  formData: FormData,
): Promise<RegistrarAfastamentoState> {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const resultado = registrarAfastamentoSchema.safeParse({
    funcionarioId: formData.get("funcionarioId"),
    tipo: formData.get("tipo"),
    dataInicio: formData.get("dataInicio"),
    dataFim: formData.get("dataFim"),
    observacao: formData.get("observacao") ?? "",
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { funcionarioId, ...periodo } = resultado.data;

  try {
    const existentes = await db
      .select({
        tipo: afastamentos.tipo,
        dataInicio: afastamentos.dataInicio,
        dataFim: afastamentos.dataFim,
      })
      .from(afastamentos)
      .where(eq(afastamentos.funcionarioId, funcionarioId));

    const conflito = existentes.find((atual) => periodosSeSobrepoem(atual, periodo));

    if (conflito) {
      return {
        status: "error",
        mensagem: "Confira os campos destacados.",
        erros: {
          dataInicio: [
            `Ja ha um afastamento de ${formatarData(conflito.dataInicio)} a ${formatarData(
              conflito.dataFim,
            )}`,
          ],
        },
      };
    }

    await db.insert(afastamentos).values({ funcionarioId, ...periodo });
  } catch (erro) {
    console.error("Falha ao registrar afastamento", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Afastamento registrado." };
}

/**
 * Apaga um afastamento — e a unica exclusao do modulo.
 *
 * Aqui apagar e certo, ao contrario de escalas e funcionarios: o afastamento e
 * uma **entrada**, e nao um fato ja interpretado. Uma data errada nao se corrige
 * desativando, porque enquanto a linha existir ela continua tirando dias da
 * apuracao. Mesma logica de `definirJornada()` aceitar o par vazio.
 */
export async function removerAfastamento(
  _estadoAnterior: RemoverAfastamentoState,
  formData: FormData,
): Promise<RemoverAfastamentoState> {
  await exigirAcesso(AREA_FUNCIONARIOS);

  const resultado = removerAfastamentoSchema.safeParse({
    afastamentoId: formData.get("afastamentoId"),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Afastamento invalido." };
  }

  try {
    const removidos = await db
      .delete(afastamentos)
      .where(eq(afastamentos.id, resultado.data.afastamentoId))
      .returning({ id: afastamentos.id });

    if (removidos.length === 0) {
      return { status: "error", mensagem: "Afastamento nao encontrado." };
    }
  } catch (erro) {
    console.error("Falha ao remover afastamento", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  refresh();

  return { status: "success", mensagem: "Afastamento removido." };
}
