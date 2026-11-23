"use server";

import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  empresas,
  funcionarios,
  importacoesPonto,
  marcacoes,
  mensagensPonto,
  tratativasPonto,
} from "@/db/schema";
import type { TratativaStatus } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { competenciaDeEscrita } from "@/features/competencias/queries";
import { formatarData, formatarPeriodo } from "@/features/competencias/periodo";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import { ehViolacaoDeUnicidade, restricaoViolada } from "@/lib/postgres";

import type { TipoDeDivergencia } from "./apuracao";
import {
  chaveDaMarcacao,
  planejarCarga,
  recortarPeriodo,
  substituicaoMudaAlgo,
  type PlanoDaCarga,
} from "./carga";
import { motivoDoBloqueio } from "./contato";
import { consolidadoDoResponsavel, obterOcorrencia, sugerirEscalasDoPonto } from "./queries";
import { lerRelatorioDePonto, periodoDosRegistros, type LinhaRecusada } from "./relatorio";
import {
  associarEmpresaSchema,
  confirmacaoDaCargaSchema,
  definirEscalasSugeridasSchema,
  enviarConsolidadoSchema,
  enviarMensagemSchema,
  registrarTratativaSchema,
} from "./schema";
import { rotuloDaTratativa } from "./tratativas";
import { enviarTextoNoWhatsapp, zapiConfigurada, ZAPI_NAO_CONFIGURADA } from "./zapi";
import {
  AREA_PONTO,
  ITENS_NA_PREVIA,
  RECUSAS_NA_PREVIA,
  TAMANHO_MAXIMO_ARQUIVO,
  type AplicarSugestoesState,
  type AssociarEmpresaState,
  type ConsolidadoState,
  type ImportacaoPontoState,
  type MensagemState,
  type ModoDaCarga,
  type TratativaState,
} from "./types";

/**
 * Escritas do modulo de ponto.
 *
 * Server Actions sao endpoints POST publicos: cada uma revalida a entrada com
 * Zod e refaz a checagem de acesso — o formulario nao autoriza nada.
 *
 * Este arquivo so pode exportar funcoes async (regra do "use server"); tipos e
 * constantes da feature ficam em `types.ts`.
 */

const FALHA_GENERICA = "Nao foi possivel concluir a operacao. Tente novamente.";
const CODIGO_EM_USO = "Este codigo ja esta associado a outra empresa";

/* -------------------------------------------------------------------------- */
/* Associacao de empresa                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Liga um codigo do relogio de ponto a uma empresa do portal.
 *
 * E o passo que destrava a leitura do arquivo, e e **cadastro**: uma vez feito,
 * vale para todas as cargas seguintes. Fica numa action propria, e nao embutido
 * na importacao, exatamente por isso — associar nao grava marcacao nenhuma, e
 * quem associa pode nem ser quem vai importar.
 *
 * A associacao e necessaria porque nenhum dos dois relatorios liga os dois
 * lados sozinho: o de ponto traz so o codigo (1144) e o da folha traz so a
 * razao social. Sem a ponte, a matricula nao identifica ninguem — o codigo 1335
 * existe em duas empresas e sao duas pessoas.
 */
export async function associarEmpresa(
  _estadoAnterior: AssociarEmpresaState,
  formData: FormData,
): Promise<AssociarEmpresaState> {
  await exigirAcesso(AREA_PONTO);

  const resultado = associarEmpresaSchema.safeParse({
    codigo: formData.get("codigo"),
    empresaId: formData.get("empresaId"),
  });

  if (!resultado.success) {
    const erros = z.flattenError(resultado.error).fieldErrors;

    // Os dois campos vivem na mesma linha da previa, sem lugar para mensagem
    // por campo: a primeira explica melhor do que "confira os campos".
    return {
      status: "error",
      mensagem: erros.empresaId?.[0] ?? erros.codigo?.[0] ?? "Escolha a empresa.",
    };
  }

  const { codigo, empresaId } = resultado.data;

  try {
    const atualizadas = await db
      .update(empresas)
      .set({ codigo })
      .where(eq(empresas.id, empresaId))
      .returning({ nome: empresas.nome });

    if (atualizadas.length === 0) {
      return { status: "error", mensagem: "Empresa nao encontrada." };
    }

    refresh();

    return {
      status: "success",
      mensagem: `Codigo ${codigo} associado a ${atualizadas[0].nome}. Confira o arquivo de novo.`,
    };
  } catch (erro) {
    // Unicidade por indice, e nao por consulta previa: duas requisicoes
    // simultaneas passariam pelo "ja existe?" as duas vezes.
    if (ehViolacaoDeUnicidade(erro) && restricaoViolada(erro) === "empresas_codigo_unico") {
      return { status: "error", mensagem: CODIGO_EM_USO };
    }

    console.error("Falha ao associar o codigo da empresa", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }
}

/* -------------------------------------------------------------------------- */
/* Importacao das marcacoes                                                   */
/* -------------------------------------------------------------------------- */

function recusa(mensagem: string): ImportacaoPontoState {
  return { status: "error", mensagem };
}

/** Corta uma lista no teto, dizendo se cortou. */
function recortar<T>(itens: readonly T[], teto: number) {
  return { itens: itens.slice(0, teto), cortada: itens.length > teto };
}

type Planejamento =
  { ok: true; plano: PlanoDaCarga; competenciaId: string } | { ok: false; mensagem: string };

/**
 * Le o arquivo enviado e monta o plano. Compartilhada pela previa e pela
 * gravacao **de proposito**: uma previa calculada por um caminho e uma gravacao
 * por outro seria uma previa que nao promete nada.
 */
async function planejarArquivo(arquivo: File): Promise<Planejamento> {
  // Toda escrita datada comeca por aqui, do mesmo jeito que comeca por
  // `exigirAcesso()`: sem competencia aberta o portal nao grava nada, e durante
  // uma consulta a carga vai para a competencia consultada.
  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { ok: false, mensagem: escrita.mensagem };
  }

  const competencia = escrita.competencia;
  const leitura = lerRelatorioDePonto(await arquivo.text());

  if (leitura.registros.length === 0 && leitura.recusadas.length === 0) {
    return {
      ok: false,
      mensagem:
        "Nao encontramos nenhuma linha de marcacao no arquivo. Confira se e o relatorio " +
        "Lista de Marcacoes Realizadas Simplificadas, em .txt.",
    };
  }

  /**
   * O periodo do cabecalho manda; o coberto pelas linhas e a rede de seguranca.
   * A diferenca importa: um dia em que ninguem bateu ponto existe no cabecalho
   * e nao existe nas linhas, e apurar sem ele deixaria as faltas daquele dia de
   * fora sem que nada acusasse.
   */
  const periodo = leitura.periodo ?? periodoDosRegistros(leitura.registros);

  if (!periodo) {
    return { ok: false, mensagem: "O arquivo nao diz que periodo cobre, e nao tem marcacao." };
  }

  const janela = recortarPeriodo(periodo, competencia);

  if (!janela) {
    return {
      ok: false,
      mensagem:
        `O arquivo cobre ${formatarPeriodo(periodo.inicio, periodo.fim)} e a competencia em ` +
        `vigor vai de ${formatarPeriodo(competencia.dataInicio, competencia.dataFim)}. ` +
        "Nao ha um dia sequer em comum.",
    };
  }

  const [empresasCadastradas, cadastrados, gravadas] = await Promise.all([
    db.select({ id: empresas.id, nome: empresas.nome, codigo: empresas.codigo }).from(empresas),
    db
      .select({
        id: funcionarios.id,
        empresaId: funcionarios.empresaId,
        matricula: funcionarios.matricula,
      })
      .from(funcionarios),
    db
      .select({
        funcionarioId: marcacoes.funcionarioId,
        data: marcacoes.data,
        hora: marcacoes.hora,
        incluida: marcacoes.incluida,
      })
      .from(marcacoes)
      .where(
        and(
          eq(marcacoes.competenciaId, competencia.id),
          gte(marcacoes.data, competencia.dataInicio),
          lte(marcacoes.data, competencia.dataFim),
        ),
      ),
  ]);

  return {
    ok: true,
    competenciaId: competencia.id,
    plano: planejarCarga(
      leitura,
      competencia,
      periodo,
      janela,
      empresasCadastradas,
      cadastrados,
      gravadas,
    ),
  };
}

/** A previa como a tela a mostra: os numeros inteiros, o detalhe em amostra. */
function montarPrevia(arquivo: string, plano: PlanoDaCarga): ImportacaoPontoState {
  const naoEncontrados = recortar(plano.naoEncontrados, ITENS_NA_PREVIA);
  const recusadas = recortar<LinhaRecusada>(plano.recusadas, RECUSAS_NA_PREVIA);
  const diasAlterados = recortar(plano.diasAlterados, ITENS_NA_PREVIA);

  return {
    status: "previa",
    previa: {
      arquivo,
      periodo: plano.periodoDoArquivo,
      janela: plano.janela,
      registros: plano.registrosLidos,
      registrosDeclarados: plano.registrosDeclarados,
      marcacoesLidas: plano.marcacoesLidas,
      funcionarios: plano.funcionarios,
      marcacoesNovas: plano.aGravar.length,
      marcacoesJaGravadas: plano.jaGravadas,
      marcacoesARemover: plano.aRemover,
      marcacoesComMarcaTrocada: plano.comMarcaTrocada,
      diasAlterados: diasAlterados.itens,
      totalDiasAlterados: plano.diasAlterados.length,
      pessoasAlteradas: new Set(plano.diasAlterados.map((dia) => dia.funcionarioId)).size,
      diasAlteradosCortados: diasAlterados.cortada,
      foraDaCompetencia: plano.foraDaCompetencia,
      codigosDesconhecidos: plano.codigosDesconhecidos,
      naoEncontrados: naoEncontrados.itens,
      naoEncontradosCortados: naoEncontrados.cortada,
      recusadas: recusadas.itens,
      recusasCortadas: recusadas.cortada,
    },
  };
}

/**
 * Grava a carga: as marcacoes novas e a linha que registra o periodo coberto.
 *
 * As duas na mesma transacao porque uma sem a outra mente. Marcacoes sem a
 * carga deixariam a janela apurada menor do que os dados — dias com batida
 * fora do periodo apurado. Carga sem marcacoes faria o contrario, e pior:
 * o periodo passaria a ser apurado e todo dia dele viraria falta.
 *
 * Em `substituir`, a mesma transacao antes esvazia o recorte do arquivo — as
 * pessoas que ele alcanca, nas datas da janela — e regrava todas as batidas
 * dele. E `delete` seguido de `insert`, e nao um `delete` so do que saiu,
 * porque o que vale e o arquivo da confirmacao: se outra carga mexeu no recorte
 * entre a previa e o clique, o resultado continua sendo exatamente o arquivo.
 * Batida de quem o arquivo nao traz, ou de dia fora da janela, nao e tocada.
 */
async function gravarPlano(
  plano: PlanoDaCarga,
  modo: ModoDaCarga,
  competenciaId: string,
  arquivo: string,
  usuarioId: string,
) {
  const chave = (linha: { funcionarioId: string; data: string; hora: string }) =>
    chaveDaMarcacao(linha.funcionarioId, linha.data, linha.hora);
  const novas = new Set(plano.aGravar.map(chave));
  const doArquivo = new Set(plano.doArquivo.map(chave));

  return db.transaction(async (tx) => {
    let removidas = 0;
    let gravadas = 0;

    if (modo === "substituir" && plano.funcionariosAlcancados.length > 0) {
      const apagadas = await tx
        .delete(marcacoes)
        .where(
          and(
            eq(marcacoes.competenciaId, competenciaId),
            inArray(marcacoes.funcionarioId, plano.funcionariosAlcancados),
            gte(marcacoes.data, plano.janela.inicio),
            lte(marcacoes.data, plano.janela.fim),
          ),
        )
        .returning({
          funcionarioId: marcacoes.funcionarioId,
          data: marcacoes.data,
          hora: marcacoes.hora,
        });

      // Saiu de verdade so o que o arquivo nao devolve; o resto volta logo abaixo.
      removidas = apagadas.filter((linha) => !doArquivo.has(chave(linha))).length;
    }

    const aInserir = modo === "substituir" ? plano.doArquivo : plano.aGravar;

    /**
     * `onConflictDoNothing` sobre `marcacoes_unica`: reenviar o mesmo arquivo,
     * ou um que se sobreponha ao anterior, nao duplica nem exige apagar o que
     * ja estava la. O plano ja conta o que existe, mas a corrida entre duas
     * cargas simultaneas so o banco resolve. Em lotes, porque o Postgres aceita
     * no maximo 65535 parametros por comando, e cada batida leva cinco.
     */
    for (let inicio = 0; inicio < aInserir.length; inicio += LOTE_DE_MARCACOES) {
      const inseridas = await tx
        .insert(marcacoes)
        .values(
          aInserir.slice(inicio, inicio + LOTE_DE_MARCACOES).map((marcacao) => ({
            competenciaId,
            funcionarioId: marcacao.funcionarioId,
            data: marcacao.data,
            hora: `${marcacao.hora}:00`,
            incluida: marcacao.incluida,
          })),
        )
        .onConflictDoNothing()
        .returning({
          funcionarioId: marcacoes.funcionarioId,
          data: marcacoes.data,
          hora: marcacoes.hora,
        });

      // Na substituicao a batida que ja existia volta; nova e so a que nao existia.
      gravadas += inseridas.filter((linha) => novas.has(chave(linha))).length;
    }

    await tx.insert(importacoesPonto).values({
      competenciaId,
      arquivo,
      periodoInicio: plano.janela.inicio,
      periodoFim: plano.janela.fim,
      marcacoesLidas: plano.marcacoesLidas,
      marcacoesGravadas: gravadas,
      importadoPor: usuarioId,
    });

    return { gravadas, removidas };
  });
}

/** Batidas por `insert`: 2000 x 5 parametros fica longe do teto do Postgres. */
const LOTE_DE_MARCACOES = 2000;

/**
 * Importa o relatorio de marcacoes, em duas etapas na mesma action: sem
 * `confirmar`, devolve a previa; com ele, grava — acrescentando o que falta
 * (`acrescentar`) ou fazendo o arquivo valer no recorte que ele cobre
 * (`substituir`), que e o caso do relatorio corrigido no relogio.
 *
 * A confirmacao reenvia o **arquivo**, e nao o plano que a previa mostrou. Duas
 * razoes: o que o cliente devolve nao e evidencia (a action e um POST publico,
 * e um plano forjado gravaria o que quisesse), e o cadastro pode ter mudado
 * entre uma tela e outra. Aqui a segunda razao e a regra e nao a excecao:
 * associar um codigo de empresa e justamente o que se faz entre as duas telas.
 */
export async function importarMarcacoes(
  _estadoAnterior: ImportacaoPontoState,
  formData: FormData,
): Promise<ImportacaoPontoState> {
  const usuario = await exigirAcesso(AREA_PONTO);

  const arquivo = formData.get("arquivo");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return recusa("Escolha o arquivo .txt do relatorio de marcacoes.");
  }

  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    return recusa("O arquivo passa de 5 MB. Confira se e o relatorio certo.");
  }

  let planejamento: Planejamento;

  try {
    planejamento = await planejarArquivo(arquivo);
  } catch (erro) {
    console.error("Falha ao ler o relatorio de marcacoes", erro);
    return recusa(FALHA_GENERICA);
  }

  if (!planejamento.ok) {
    return recusa(planejamento.mensagem);
  }

  const { plano, competenciaId } = planejamento;
  const modo = confirmacaoDaCargaSchema.parse(formData.get("confirmar"));

  if (!modo) {
    return montarPrevia(arquivo.name, plano);
  }

  /**
   * Gravar uma carga que nao alcanca ninguem registraria um periodo como
   * apurado sem ter apurado nada — e cada dia dele viraria falta para o
   * cadastro inteiro. Melhor recusar e mandar resolver os codigos primeiro.
   */
  if (plano.aGravar.length === 0 && plano.jaGravadas === 0) {
    return recusa(
      plano.codigosDesconhecidos.length > 0
        ? "Nenhuma linha do arquivo pertence a uma empresa conhecida. Associe os codigos abaixo " +
            "e confira o arquivo de novo."
        : "Nenhuma marcacao do arquivo corresponde a alguem do cadastro.",
    );
  }

  /**
   * Substituir quando o arquivo nao tira nem troca nada e so acrescentar com
   * outro nome. A recusa aparece quando o que a previa mostrou ja nao vale —
   * outra pessoa aplicou o mesmo arquivo entre a previa e o clique.
   */
  if (modo === "substituir" && !substituicaoMudaAlgo(plano)) {
    return recusa(
      "O arquivo nao tira nem troca nenhuma batida do portal no periodo dele. Confira o " +
        "arquivo de novo: o que ele traz de novo entra pelo Gravar.",
    );
  }

  try {
    const { gravadas, removidas } = await gravarPlano(
      plano,
      modo,
      competenciaId,
      arquivo.name,
      usuario.id,
    );

    refresh();

    return {
      status: "success",
      mensagem:
        modo === "substituir"
          ? `Marcacoes substituidas: ${gravadas} entraram e ${removidas} sairam.`
          : `Carga concluida: ${gravadas} marcacoes gravadas.`,
      resultado: {
        modo,
        periodo: plano.janela,
        funcionarios: plano.funcionarios,
        marcacoesGravadas: gravadas,
        marcacoesJaGravadas: plano.jaGravadas,
        marcacoesRemovidas: removidas,
        ignoradas:
          plano.foraDaCompetencia +
          plano.codigosDesconhecidos.reduce((soma, item) => soma + item.linhas, 0) +
          plano.naoEncontrados.reduce((soma, item) => soma + item.dias, 0),
      },
    };
  } catch (erro) {
    console.error("Falha ao gravar as marcacoes", erro);
    return recusa(FALHA_GENERICA);
  }
}

/* -------------------------------------------------------------------------- */
/* Tratativas                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A competencia em que a ocorrencia cai, ou a recusa a mostrar.
 *
 * Duas conferencias, e nao uma. `competenciaDeEscrita()` responde "em que
 * competencia esta sessao grava?" — a consultada, durante uma consulta. A
 * comparacao de datas logo abaixo responde "esta ocorrencia e deste periodo?":
 * uma tela deixada aberta durante a virada da competencia, ou antes de a
 * consulta ser encerrada, postaria um dia que ja nao pertence a ela, e a
 * tratativa nasceria no periodo errado.
 */
async function competenciaDaOcorrencia(data: string) {
  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { ok: false as const, mensagem: escrita.mensagem };
  }

  const { competencia } = escrita;

  if (data < competencia.dataInicio || data > competencia.dataFim) {
    return {
      ok: false as const,
      mensagem:
        `O dia ${formatarData(data)} nao pertence a competencia em vigor ` +
        `(${formatarPeriodo(competencia.dataInicio, competencia.dataFim)}).`,
    };
  }

  return { ok: true as const, competencia };
}

/**
 * Registra o que foi feito a respeito de uma ocorrencia.
 *
 * E a **unica** escrita do modulo que nao vem de um arquivo: tudo o mais aqui e
 * marcacao importada, e a leitura dela e calculada. O que se grava e o trabalho
 * humano — quem falou com quem, o que se apurou, em que pe ficou.
 *
 * A gravacao e um upsert sobre `(funcionario, data, tipo)`, que e a identidade
 * da ocorrencia: nao ha id porque nao ha tabela de ocorrencias. Reabrir o mesmo
 * dia encontra a linha que ja existe em vez de empilhar uma segunda opiniao
 * sobre o mesmo fato.
 */
export async function registrarTratativa(
  _estadoAnterior: TratativaState,
  formData: FormData,
): Promise<TratativaState> {
  const usuario = await exigirAcesso(AREA_PONTO);

  const resultado = registrarTratativaSchema.safeParse({
    funcionarioId: formData.get("funcionarioId"),
    data: formData.get("data"),
    tipo: formData.get("tipo"),
    status: formData.get("status"),
    observacao: formData.get("observacao") ?? "",
  });

  if (!resultado.success) {
    return {
      status: "error",
      mensagem: "Confira os campos destacados.",
      erros: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const { funcionarioId, data, tipo, status, observacao } = resultado.data;
  const escrita = await competenciaDaOcorrencia(data);

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  /**
   * A ocorrencia e relida do zero, e nao aceita como o formulario a descreve: a
   * action e um POST publico, e uma chave forjada abriria tratativa para um dia
   * que nunca teve divergencia nenhuma. `obterOcorrencia()` devolve `null` so
   * quando nao ha nem divergencia hoje nem tratativa gravada — e o caso em que
   * de fato nao ha o que tratar.
   */
  const ocorrencia = await obterOcorrencia({ funcionarioId, data, tipo });

  if (!ocorrencia) {
    return {
      status: "error",
      mensagem: "Esta ocorrencia nao aparece na leitura atual do periodo.",
    };
  }

  try {
    await db
      .insert(tratativasPonto)
      .values({
        competenciaId: escrita.competencia.id,
        funcionarioId,
        data,
        tipo,
        status,
        observacao,
        responsavelId: usuario.id,
      })
      .onConflictDoUpdate({
        target: [tratativasPonto.funcionarioId, tratativasPonto.data, tratativasPonto.tipo],
        set: {
          status,
          observacao,
          responsavelId: usuario.id,
          // `$onUpdate` so vale para `db.update()`; num upsert o `set` e SQL cru
          // e a coluna ficaria com a data da criacao.
          atualizadoEm: new Date(),
        },
      });

    refresh();

    return {
      status: "success",
      mensagem: `Tratativa registrada como ${rotuloDaTratativa(status)}.`,
    };
  } catch (erro) {
    console.error("Falha ao registrar a tratativa", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }
}

/* -------------------------------------------------------------------------- */
/* Mensagem ao colaborador                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A linha de tratativa desta ocorrencia, criando-a se ainda nao existir.
 *
 * A mensagem se prende a tratativa, e nao a ocorrencia: e o que faz o historico
 * sobreviver a uma mudanca de escala que apague a divergencia. Por isso o envio
 * comeca criando a linha — em `aberta`, que e o estado que ela ja tinha
 * implicitamente.
 */
async function garantirTratativa(
  competenciaId: string,
  { funcionarioId, data, tipo }: { funcionarioId: string; data: string; tipo: TipoDeDivergencia },
) {
  const [criada] = await db
    .insert(tratativasPonto)
    .values({ competenciaId, funcionarioId, data, tipo })
    .onConflictDoNothing()
    .returning({ id: tratativasPonto.id, status: tratativasPonto.status });

  if (criada) {
    return criada;
  }

  const [existente] = await db
    .select({ id: tratativasPonto.id, status: tratativasPonto.status })
    .from(tratativasPonto)
    .where(
      and(
        eq(tratativasPonto.funcionarioId, funcionarioId),
        eq(tratativasPonto.data, data),
        eq(tratativasPonto.tipo, tipo),
      ),
    )
    .limit(1);

  return existente;
}

/**
 * Manda a mensagem da ocorrencia para o colaborador — ou para o responsavel
 * pelo posto, quando o colaborador esta no grupo de contato de um —, em duas
 * etapas na mesma action: sem `confirmar`, devolve a previa; com ele, envia.
 *
 * As duas etapas existem pelo motivo mais simples possivel: **envio de WhatsApp
 * nao tem desfazer**. A previa mostra destinatario, numero, ocorrencia e o texto
 * inteiro, e nada sai antes de alguem confirmar.
 *
 * O que a confirmacao reenvia e so o **texto** — que e do usuario, e ele pode
 * te-lo editado. Destinatario, numero e ocorrencia sao relidos do cadastro no
 * momento do envio: o que o cliente devolve nao e evidencia (a action e um POST
 * publico), e o numero pode ter sido corrigido entre uma tela e outra. E o mesmo
 * raciocinio da importacao, que reenvia o arquivo e nao o plano.
 *
 * O **destino** tambem e relido, e comparado com o da previa: o texto e
 * escrito para quem vai le-lo, e um responsavel atribuido (ou tirado) entre as
 * duas etapas faria o texto do colaborador chegar ao responsavel, ou o
 * contrario. Nesse caso nada sai, e a tela volta com o texto novo.
 */
export async function enviarMensagem(
  _estadoAnterior: MensagemState,
  formData: FormData,
): Promise<MensagemState> {
  const usuario = await exigirAcesso(AREA_PONTO);

  // Lido antes de validar para poder devolver ao campo quando o Zod recusar —
  // ninguem deve perder o texto que escreveu por causa de um erro de formato.
  const digitado = String(formData.get("conteudo") ?? "");

  const resultado = enviarMensagemSchema.safeParse({
    funcionarioId: formData.get("funcionarioId"),
    data: formData.get("data"),
    tipo: formData.get("tipo"),
    conteudo: digitado,
  });

  if (!resultado.success) {
    const erros = z.flattenError(resultado.error).fieldErrors;

    return {
      status: "error",
      mensagem: erros.conteudo?.[0] ?? "Confira a mensagem antes de enviar.",
      conteudo: digitado,
    };
  }

  const { funcionarioId, data, tipo, conteudo } = resultado.data;

  const ocorrencia = await obterOcorrencia({ funcionarioId, data, tipo });

  if (!ocorrencia) {
    return {
      status: "error",
      mensagem: "Esta ocorrencia nao aparece na leitura atual do periodo.",
      conteudo,
    };
  }

  const { destino } = ocorrencia;
  const telefone = destino.telefone;

  if (destino.bloqueio || !telefone) {
    return {
      status: "error",
      mensagem: motivoDoBloqueio(destino.bloqueio ?? "sem_telefone"),
      conteudo,
    };
  }

  if (formData.get("confirmar") !== "1") {
    return {
      status: "previa",
      conteudo,
      previa: {
        destino: destino.via,
        destinatarioId: destino.funcionarioId,
        destinatario: destino.nome,
        posto: destino.posto ? `${destino.posto.codigo} - ${destino.posto.nome}` : null,
        sobre: destino.via === "responsavel" ? ocorrencia.funcionario.nome : null,
        telefone: formatarTelefone(telefone),
        empresa: ocorrencia.funcionario.empresaNome,
        ocorrencia: {
          data,
          tipo,
          descricao: ocorrencia.divergencia?.descricao ?? "",
        },
        conteudo,
      },
    };
  }

  if (
    formData.get("destino") !== destino.via ||
    formData.get("destinatarioId") !== destino.funcionarioId
  ) {
    // A tela foi desenhada para outro destino: redesenha com o texto novo, e o
    // que se tinha digitado nao volta — ele foi escrito para outra pessoa.
    refresh();

    return {
      status: "error",
      mensagem:
        destino.via === "responsavel"
          ? `O destinatario mudou: a mensagem agora vai para ${destino.nome}, responsavel pelo posto. Revise o texto antes de enviar.`
          : "O destinatario mudou: a mensagem agora vai para o proprio colaborador. Revise o texto antes de enviar.",
    };
  }

  if (!zapiConfigurada()) {
    return { status: "error", mensagem: ZAPI_NAO_CONFIGURADA, conteudo };
  }

  const escrita = await competenciaDaOcorrencia(data);

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem, conteudo };
  }

  let tratativa: { id: string; status: TratativaStatus } | undefined;

  try {
    tratativa = await garantirTratativa(escrita.competencia.id, { funcionarioId, data, tipo });
  } catch (erro) {
    console.error("Falha ao abrir a tratativa antes do envio", erro);
    return { status: "error", mensagem: FALHA_GENERICA, conteudo };
  }

  if (!tratativa) {
    return { status: "error", mensagem: FALHA_GENERICA, conteudo };
  }

  const envio = await enviarTextoNoWhatsapp({ telefone, mensagem: conteudo });

  /**
   * O registro vem **depois** da chamada, e por isso fica fora de qualquer
   * transacao com ela: uma chamada HTTP nao volta atras com `rollback`. Se a
   * gravacao daqui falhasse, a mensagem teria saido sem rastro — dai o log em
   * voz alta no `catch`, que e o unico lugar onde isso apareceria.
   */
  try {
    await db.transaction(async (tx) => {
      await tx.insert(mensagensPonto).values({
        tratativaId: tratativa.id,
        // O numero, o texto e o destino sao gravados **como foram enviados**:
        // os tres mudam, e o historico precisa dizer quem recebeu o que naquele dia.
        destino: destino.via,
        destinatarioId: destino.via === "responsavel" ? destino.funcionarioId : null,
        telefone,
        conteudo,
        status: envio.ok ? "enviada" : "falhou",
        mensagemExternaId: envio.ok ? envio.mensagemExternaId : null,
        erro: envio.ok ? null : envio.erro,
        enviadoPor: usuario.id,
      });

      /**
       * Avisar o colaborador **e** iniciar a tratativa: o status sai de `aberta`
       * sozinho. Ele so avanca a partir dali — quem ja marcou `justificada` nao
       * volta para `em_tratativa` por mandar mais uma mensagem, e um envio que
       * falhou nao move nada, porque ninguem foi avisado.
       */
      if (envio.ok && tratativa.status === "aberta") {
        await tx
          .update(tratativasPonto)
          .set({ status: "em_tratativa", responsavelId: usuario.id })
          .where(eq(tratativasPonto.id, tratativa.id));
      }
    });
  } catch (erro) {
    console.error("Mensagem processada, mas o registro falhou", { envio, erro });

    return {
      status: "error",
      mensagem:
        "O envio foi processado, mas nao conseguimos registrar o historico. " +
        "Confira a conversa antes de reenviar.",
      conteudo,
    };
  }

  refresh();

  if (!envio.ok) {
    // A falha ja virou linha no historico: a tela mostra o motivo e o botao
    // continua ali para tentar de novo.
    return { status: "error", mensagem: envio.erro, conteudo };
  }

  return {
    status: "success",
    mensagem:
      destino.via === "responsavel"
        ? `Mensagem enviada para ${destino.nome} (${formatarTelefone(telefone)}).`
        : `Mensagem enviada para ${formatarTelefone(telefone)}.`,
  };
}

/**
 * Grava, para quem foi conferido na tela, a escala que o ponto sugeriu.
 *
 * A sugestao e **recalculada aqui**, e nao lida do formulario: ele e um POST
 * publico, e um plano forjado gravaria a escala que quisesse na pessoa que
 * quisesse. Do cliente vem apenas **quem** foi marcado — a mesma razao pela
 * qual a importacao reenvia o arquivo em vez do plano exibido.
 *
 * So grava em quem continua sem escala: quem foi cadastrado a mao entre a
 * conferencia e a confirmacao vale mais que o lote, como em `preencherDias()`.
 */
export async function definirEscalasSugeridas(
  _estadoAnterior: AplicarSugestoesState,
  formData: FormData,
): Promise<AplicarSugestoesState> {
  // As duas areas: a tela mostra batidas de ponto e grava cadastro de pessoal.
  await exigirAcesso(AREA_PONTO);
  await exigirAcesso("funcionarios");

  const resultado = definirEscalasSugeridasSchema.safeParse({
    competenciaId: formData.get("competenciaId"),
    funcionarioIds: formData.getAll("funcionarioId"),
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Selecione ao menos um funcionario." };
  }

  const { competenciaId, funcionarioIds } = resultado.data;

  try {
    const leitura = await sugerirEscalasDoPonto();

    // A sugestao sai da competencia em vigor. Se ela mudou entre desenhar a
    // tela e confirmar (outra aba encerrou a consulta), o que esta na tela nao
    // e mais o que seria gravado.
    if (leitura.competencia?.id !== competenciaId) {
      return {
        status: "error",
        mensagem: "A competencia em vigor mudou. Abra a tela de novo para conferir as sugestoes.",
      };
    }

    const escolhidas = new Set(funcionarioIds);
    const aplicar = leitura.sugestoes.filter((sugestao) => escolhidas.has(sugestao.funcionarioId));

    if (aplicar.length === 0) {
      return { status: "error", mensagem: "Nenhuma das pessoas marcadas tem sugestao do ponto." };
    }

    const gravadas = await db.transaction(async (tx) => {
      const ids: string[] = [];

      for (const sugestao of aplicar) {
        const [linha] = await tx
          .update(funcionarios)
          .set({ escalaId: sugestao.escalaId, inicioCiclo: sugestao.inicioCiclo })
          .where(and(eq(funcionarios.id, sugestao.funcionarioId), isNull(funcionarios.escalaId)))
          .returning({ id: funcionarios.id });

        if (linha) {
          ids.push(linha.id);
        }
      }

      return ids.length;
    });

    refresh();

    if (gravadas === 0) {
      return {
        status: "error",
        mensagem: "Ninguem foi alterado: as pessoas marcadas ja tinham escala definida.",
      };
    }

    const ignoradas = aplicar.length - gravadas;

    return {
      status: "success",
      mensagem:
        ignoradas > 0
          ? `${gravadas} ${gravadas === 1 ? "escala definida" : "escalas definidas"}; ${ignoradas} ja tinha escala e ficou como estava.`
          : `${gravadas} ${gravadas === 1 ? "escala definida" : "escalas definidas"} pelo ponto.`,
    };
  } catch (erro) {
    console.error("Falha ao definir as escalas sugeridas", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }
}

/**
 * Manda ao responsavel, numa mensagem so, todas as ocorrencias do grupo dele
 * que ainda nao foram enviadas a ele. Duas etapas, como `enviarMensagem()`:
 * sem `confirmar`, devolve a previa; com ele, envia.
 *
 * O texto **nao** e editavel e nao volta do formulario: ele e a lista das
 * ocorrencias que vao ser marcadas como avisadas, e um texto editado poderia
 * tirar da mensagem uma ocorrencia que o historico daria como enviada. O que
 * volta e a assinatura dele; a action refaz o envio inteiro
 * (`consolidadoDoResponsavel()`, a mesma funcao da previa) e recusa se o texto
 * mudou — carga nova, tratativa encerrada, responsavel trocado ou a virada do
 * dia, que muda o prazo.
 *
 * Aceito o envio, cada ocorrencia ganha a sua linha em `mensagens_ponto`, com
 * o mesmo texto e o mesmo `lote_id`: o historico, o prazo e o "ja foi
 * enviado?" de cada uma continuam saindo dali, como na mensagem avulsa.
 */
export async function enviarConsolidado(
  _estadoAnterior: ConsolidadoState,
  formData: FormData,
): Promise<ConsolidadoState> {
  const usuario = await exigirAcesso(AREA_PONTO);

  const resultado = enviarConsolidadoSchema.safeParse({
    responsavelId: formData.get("responsavelId"),
    assinatura: formData.get("assinatura") || null,
  });

  if (!resultado.success) {
    return { status: "error", mensagem: "Envio invalido. Recarregue a pagina." };
  }

  const { responsavelId, assinatura } = resultado.data;
  const envio = await consolidadoDoResponsavel(responsavelId);

  if (!envio) {
    refresh();
    return {
      status: "error",
      mensagem: "Nao ha ocorrencia pendente a enviar a este responsavel.",
    };
  }

  const { destino } = envio;
  const telefone = destino.telefone;

  if (destino.bloqueio || !telefone) {
    return { status: "error", mensagem: motivoDoBloqueio(destino.bloqueio ?? "sem_telefone") };
  }

  if (formData.get("confirmar") !== "1") {
    return {
      status: "previa",
      previa: {
        responsavelId,
        destinatario: destino.nome,
        telefone: formatarTelefone(telefone),
        ocorrencias: envio.incluidas.length,
        restantes: envio.restantes,
        conteudo: envio.conteudo,
        assinatura: envio.assinatura,
      },
    };
  }

  if (assinatura !== envio.assinatura) {
    // Algo mudou entre a previa e a confirmacao. A tela refaz a previa com o
    // texto novo, e nada sai ate alguem conferir de novo.
    refresh();
    return {
      status: "error",
      mensagem:
        "O texto mudou desde a previa (carga nova, tratativa encerrada, o dia virou ou a " +
        "saudacao passou de bom dia para boa tarde ou boa noite). Pre-visualize de novo " +
        "antes de enviar.",
    };
  }

  if (!zapiConfigurada()) {
    return { status: "error", mensagem: ZAPI_NAO_CONFIGURADA };
  }

  const escrita = await competenciaDeEscrita();

  if (!escrita.ok) {
    return { status: "error", mensagem: escrita.mensagem };
  }

  const { competencia } = escrita;

  // As ocorrencias vem da competencia em vigor, e a escrita vai para a mesma —
  // mas a sessao pode ter encerrado a consulta noutra aba entre as etapas.
  if (
    competencia.id !== envio.competencia.id ||
    envio.incluidas.some(
      (chave) => chave.data < competencia.dataInicio || chave.data > competencia.dataFim,
    )
  ) {
    refresh();
    return {
      status: "error",
      mensagem: "A competencia em vigor mudou desde a previa. Pre-visualize de novo.",
    };
  }

  const tratativas: { id: string; status: TratativaStatus }[] = [];

  try {
    for (const chave of envio.incluidas) {
      const tratativa = await garantirTratativa(competencia.id, chave);

      if (!tratativa) {
        return { status: "error", mensagem: FALHA_GENERICA };
      }

      tratativas.push(tratativa);
    }
  } catch (erro) {
    console.error("Falha ao abrir as tratativas antes do envio consolidado", erro);
    return { status: "error", mensagem: FALHA_GENERICA };
  }

  const resposta = await enviarTextoNoWhatsapp({ telefone, mensagem: envio.conteudo });
  const loteId = crypto.randomUUID();

  // Fora de transacao com o HTTP, pela mesma razao de `enviarMensagem()`.
  try {
    await db.transaction(async (tx) => {
      await tx.insert(mensagensPonto).values(
        tratativas.map((tratativa) => ({
          tratativaId: tratativa.id,
          destino: "responsavel" as const,
          destinatarioId: destino.funcionarioId,
          loteId,
          telefone,
          conteudo: envio.conteudo,
          status: resposta.ok ? ("enviada" as const) : ("falhou" as const),
          mensagemExternaId: resposta.ok ? resposta.mensagemExternaId : null,
          erro: resposta.ok ? null : resposta.erro,
          enviadoPor: usuario.id,
        })),
      );

      // So `aberta` avanca, como na mensagem avulsa; falha nao move nada.
      const abertas = tratativas
        .filter((tratativa) => tratativa.status === "aberta")
        .map((tratativa) => tratativa.id);

      if (resposta.ok && abertas.length > 0) {
        await tx
          .update(tratativasPonto)
          .set({ status: "em_tratativa", responsavelId: usuario.id })
          .where(and(inArray(tratativasPonto.id, abertas), eq(tratativasPonto.status, "aberta")));
      }
    });
  } catch (erro) {
    console.error("Mensagem consolidada processada, mas o registro falhou", {
      resposta,
      erro,
    });

    return {
      status: "error",
      mensagem:
        "O envio foi processado, mas nao conseguimos registrar o historico. " +
        "Confira a conversa antes de reenviar.",
    };
  }

  refresh();

  if (!resposta.ok) {
    return { status: "error", mensagem: resposta.erro };
  }

  const quantas =
    envio.incluidas.length === 1 ? "1 ocorrencia" : `${envio.incluidas.length} ocorrencias`;

  return {
    status: "success",
    mensagem: `Mensagem enviada para ${destino.nome} com ${quantas}.`,
  };
}
