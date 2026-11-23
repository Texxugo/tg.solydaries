import "server-only";

import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { empresas, extras, freelancers, funcionarios, postos, usuarios } from "@/db/schema";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { duracaoEmMinutos, formatarHora } from "@/features/escalas/jornada";
import type { PostoParaEscolha } from "@/features/postos/types";

import { valorDoFreelancer, valorDoFuncionario } from "./colaborador";
import { idExtraSchema } from "./schema";
import {
  EXTRAS_POR_PAGINA,
  type ColaboradorDisponivel,
  type ExtraResumo,
  type FiltrosDeExtras,
  type PaginaDeExtras,
} from "./types";

/**
 * Leituras do modulo de horas extras: chamadas por Server Components, nunca
 * pelo client.
 *
 * `connection()` interrompe o prerender: sem ele o Next resolveria a query no
 * build e a pagina serviria dados congelados.
 *
 * **Toda consulta de extra filtra por `competenciaEmVigor()`**, ao contrario de
 * escalas, postos e funcionarios: o extra e dado datado, e pertence ao periodo
 * em que o dia caiu. `null` significa "nao ha o que mostrar", e nunca "mostre
 * tudo" — sem competencia aberta a tela e o aviso, e nao a lista de um periodo
 * qualquer.
 */

const colunas = {
  id: extras.id,
  data: extras.data,
  funcionarioId: extras.funcionarioId,
  funcionarioNome: funcionarios.nome,
  funcionarioMatricula: funcionarios.matricula,
  freelancerId: extras.freelancerId,
  freelancerNome: freelancers.nome,
  freelancerCodigo: freelancers.codigo,
  postoId: extras.postoId,
  postoCodigo: postos.codigo,
  postoNome: postos.nome,
  local: extras.local,
  horaEntrada: extras.horaEntrada,
  horaSaida: extras.horaSaida,
  observacao: extras.observacao,
  preenchimentoDiaId: extras.preenchimentoDiaId,
  registradoPor: usuarios.nome,
};

/** Uma linha do `select` acima, com os dois cadastros de pessoa lado a lado. */
type LinhaDeExtra = {
  id: string;
  data: string;
  funcionarioId: string | null;
  funcionarioNome: string | null;
  funcionarioMatricula: string | null;
  freelancerId: string | null;
  freelancerNome: string | null;
  freelancerCodigo: string | null;
  postoId: string;
  postoCodigo: string;
  postoNome: string;
  local: string;
  horaEntrada: string;
  horaSaida: string;
  observacao: string | null;
  preenchimentoDiaId: string | null;
  registradoPor: string | null;
};

/**
 * As duas origens de pessoa chegam pelo mesmo `left join` e so uma delas tem
 * linha — e o `check extras_uma_pessoa` que garante isso. Aqui elas voltam a
 * ser um colaborador so, no formato que o campo de escolha e a lista usam.
 */
function colaboradorDaLinha(linha: LinhaDeExtra): ColaboradorDisponivel {
  if (linha.funcionarioId) {
    return {
      valor: valorDoFuncionario(linha.funcionarioId),
      // O nome so falta se o cadastro sumiu, e a FK e `restrict`: e defesa
      // contra o impossivel, para a tela nao quebrar por causa dela.
      nome: linha.funcionarioNome ?? "(funcionario removido)",
      identificacao: linha.funcionarioMatricula,
      freelancer: false,
    };
  }

  return {
    valor: linha.freelancerId ? valorDoFreelancer(linha.freelancerId) : "",
    nome: linha.freelancerNome ?? "(freelancer removido)",
    identificacao: linha.freelancerCodigo,
    freelancer: true,
  };
}

/** O `time` do Postgres volta como `HH:MM:SS`; as telas leem `HH:MM`. */
function extraDaLinha(linha: LinhaDeExtra): ExtraResumo {
  return {
    id: linha.id,
    data: linha.data,
    colaborador: colaboradorDaLinha(linha),
    postoId: linha.postoId,
    postoCodigo: linha.postoCodigo,
    postoNome: linha.postoNome,
    local: linha.local,
    horaEntrada: formatarHora(linha.horaEntrada),
    horaSaida: formatarHora(linha.horaSaida),
    observacao: linha.observacao,
    registradoPor: linha.registradoPor,
    daGrade: linha.preenchimentoDiaId !== null,
  };
}

/**
 * Monta o padrao do `ilike` a partir do que foi digitado. `null` para busca
 * vazia — quem chama traduz isso como "sem filtro", nao como "nada bate".
 *
 * `%` e `_` sao curingas do LIKE: sem escapar, procurar por "%" traria a tabela
 * inteira e um termo com underline casaria com qualquer caractere. Mesmo escape
 * de `listarEscalas`.
 */
function padraoDeBusca(busca?: string) {
  const termo = busca?.trim();

  return termo ? `%${termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%` : null;
}

/**
 * Uma pagina de extras da competencia em vigor, do dia mais recente para o mais
 * antigo.
 *
 * A busca casa com **tudo o que a linha mostra**: o colaborador (nome,
 * matricula ou codigo), o posto (codigo e nome), o local, a observacao e a
 * propria data, no formato em que a tela a escreve. Filtrar por algo que a
 * linha nao mostra faria a lista encolher sem explicacao; deixar de fora algo
 * que ela mostra faria a busca parecer quebrada.
 *
 * Busca e recorte acontecem no banco, e nao na tela — ao contrario da
 * conferencia de ponto, aqui a ordem e a data, que existe como coluna: nao ha
 * conclusao nenhuma a calcular antes de ordenar.
 */
export async function listarExtras(filtros: FiltrosDeExtras): Promise<PaginaDeExtras> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return { extras: [], total: 0, minutos: 0, pagina: 1, paginas: 1 };
  }

  const padrao = padraoDeBusca(filtros.busca);

  // Os filtros somam com a competencia, e nunca a substituem: uma data de outro
  // periodo em `?de=` so nao encontra nada, e nao abre o historico.
  const filtro = and(
    eq(extras.competenciaId, vigor.competencia.id),
    filtros.postoId ? eq(extras.postoId, filtros.postoId) : undefined,
    filtros.de ? gte(extras.data, filtros.de) : undefined,
    filtros.ate ? lte(extras.data, filtros.ate) : undefined,
    // O tipo e a origem sao lidos das proprias colunas de `extras`, e nao dos
    // joins: o `check extras_uma_pessoa` ja diz que exatamente uma das duas
    // colunas de pessoa esta preenchida.
    filtros.tipo === "funcionario"
      ? isNotNull(extras.funcionarioId)
      : filtros.tipo === "freelancer"
        ? isNotNull(extras.freelancerId)
        : undefined,
    filtros.origem === "grade"
      ? isNotNull(extras.preenchimentoDiaId)
      : filtros.origem === "manual"
        ? isNull(extras.preenchimentoDiaId)
        : undefined,
    padrao
      ? or(
          ilike(funcionarios.nome, padrao),
          ilike(funcionarios.matricula, padrao),
          ilike(freelancers.nome, padrao),
          ilike(freelancers.codigo, padrao),
          ilike(postos.codigo, padrao),
          ilike(postos.nome, padrao),
          ilike(extras.local, padrao),
          ilike(extras.observacao, padrao),
          // A data como a tela a escreve: quem ve "12/09/2026" na coluna digita
          // isso, e nao `2026-09-12`.
          sql`to_char(${extras.data}, 'DD/MM/YYYY') ilike ${padrao}`,
        )
      : undefined,
  );

  /**
   * O total do filtro inteiro — quantos extras e quantas horas —, e nao o desta
   * pagina.
   *
   * Uma consulta so das duas horas de cada linha, somadas aqui com a mesma
   * `duracaoEmMinutos()` que a tela usa em cada extra: reescrever a virada da
   * meia-noite em SQL criaria uma segunda versao da regra, e um total que
   * discordasse das linhas seria pior do que nao ter total. Ela tambem faz as
   * vezes do `count(*)` — sao duas colunas por extra do periodo, a mesma ordem
   * de grandeza do cadastro, e uma consulta a menos do que contar em separado.
   */
  const horas = await db
    .select({ horaEntrada: extras.horaEntrada, horaSaida: extras.horaSaida })
    .from(extras)
    .leftJoin(funcionarios, eq(funcionarios.id, extras.funcionarioId))
    .leftJoin(freelancers, eq(freelancers.id, extras.freelancerId))
    .innerJoin(postos, eq(postos.id, extras.postoId))
    .where(filtro);

  const total = horas.length;
  const minutos = horas.reduce(
    (soma, linha) =>
      soma + duracaoEmMinutos(formatarHora(linha.horaEntrada), formatarHora(linha.horaSaida)),
    0,
  );

  const paginas = Math.max(1, Math.ceil(total / EXTRAS_POR_PAGINA));
  // Link velho (ou `?pagina=99`) cai na ultima pagina, e nao numa tela vazia.
  const paginaAtual = Math.min(filtros.pagina, paginas);

  const linhas = await db
    .select(colunas)
    .from(extras)
    .leftJoin(funcionarios, eq(funcionarios.id, extras.funcionarioId))
    .leftJoin(freelancers, eq(freelancers.id, extras.freelancerId))
    .innerJoin(postos, eq(postos.id, extras.postoId))
    .leftJoin(usuarios, eq(usuarios.id, extras.registradoPorId))
    // `criado_em` desempata: dois extras do mesmo dia e da mesma hora nao podem
    // trocar de lugar entre uma pagina e outra.
    .orderBy(desc(extras.data), asc(extras.horaEntrada), asc(extras.criadoEm))
    .where(filtro)
    .limit(EXTRAS_POR_PAGINA)
    .offset((paginaAtual - 1) * EXTRAS_POR_PAGINA);

  return {
    extras: linhas.map(extraDaLinha),
    total,
    minutos,
    pagina: paginaAtual,
    paginas,
  };
}

/**
 * Os postos que tem extra na competencia em vigor — as opcoes do filtro de
 * posto.
 *
 * So os que aparecem nos extras, e nao `listarPostosAtivos()`: um filtro que
 * oferece posto sem extra nenhum so leva a tela vazia, e um posto desativado
 * depois de receber extras precisa continuar filtravel — e justamente o que a
 * lista de ativos esconderia.
 */
export async function listarPostosComExtra(): Promise<PostoParaEscolha[]> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return [];
  }

  return db
    .selectDistinct({ id: postos.id, codigo: postos.codigo, nome: postos.nome })
    .from(extras)
    .innerJoin(postos, eq(postos.id, extras.postoId))
    .where(eq(extras.competenciaId, vigor.competencia.id))
    .orderBy(asc(postos.codigo));
}

/**
 * Um extra da competencia em vigor. `null` para id inexistente — e tambem para
 * id que nem uuid e, e para extra de outro periodo: a tela de edicao nao abre o
 * que a competencia em vigor nao mostra, do mesmo jeito que a lista nao o
 * lista.
 */
export async function obterExtra(id: string): Promise<ExtraResumo | null> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return null;
  }

  // Sem essa validacao, um id fora do formato uuid faria o Postgres lancar erro
  // de cast em vez de simplesmente nao encontrar nada.
  const idValido = idExtraSchema.safeParse(id);

  if (!idValido.success) {
    return null;
  }

  const [linha] = await db
    .select(colunas)
    .from(extras)
    .leftJoin(funcionarios, eq(funcionarios.id, extras.funcionarioId))
    .leftJoin(freelancers, eq(freelancers.id, extras.freelancerId))
    .innerJoin(postos, eq(postos.id, extras.postoId))
    .leftJoin(usuarios, eq(usuarios.id, extras.registradoPorId))
    .where(and(eq(extras.id, idValido.data), eq(extras.competenciaId, vigor.competencia.id)));

  return linha ? extraDaLinha(linha) : null;
}

/**
 * Quem pode ter feito um extra: **todos** os funcionarios e freelancers ativos,
 * numa lista so.
 *
 * As duas origens vem com a origem embutida no valor (`f:` e `l:`) porque o
 * campo do formulario e um so; o `check extras_uma_pessoa` diz a mesma coisa no
 * banco. E cadastro, e nao dado datado: quem esta na lista nao muda ao virar a
 * competencia.
 */
export async function listarColaboradores(): Promise<ColaboradorDisponivel[]> {
  await connection();

  const daFolha = await db
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

  const avulsos = await db
    .select({ id: freelancers.id, nome: freelancers.nome, identificacao: freelancers.codigo })
    .from(freelancers)
    .where(eq(freelancers.ativo, true))
    .orderBy(asc(sql`lower(${freelancers.nome})`));

  return [
    ...daFolha.map((pessoa) => ({
      valor: valorDoFuncionario(pessoa.id),
      nome: pessoa.nome,
      // A empresa entra na identificacao porque a matricula sozinha se repete
      // entre elas — o codigo 1335 existe em duas, e sao duas pessoas.
      identificacao: [pessoa.identificacao, pessoa.empresaNome].filter(Boolean).join(" · ") || null,
      freelancer: false,
    })),
    ...avulsos.map((pessoa) => ({
      valor: valorDoFreelancer(pessoa.id),
      nome: pessoa.nome,
      identificacao: pessoa.identificacao,
      freelancer: true,
    })),
  ];
}
