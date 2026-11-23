import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { afastamentos, empresas, escalas, funcionarios } from "@/db/schema";
import { formatarHora } from "@/features/escalas/jornada";
import { folgasDaEscala } from "@/features/escalas/queries";

import type { PeriodoDeAfastamento } from "./afastamentos";
import { digitosDoCpf } from "./cpf";
import { idFuncionarioSchema } from "./schema";
import {
  FUNCIONARIOS_POR_PAGINA,
  type EmpresaResumo,
  type FiltrosDeFuncionarios,
  type AfastamentoResumo,
  type FuncionarioResumo,
  type PaginaDeFuncionarios,
} from "./types";

/**
 * Leituras da feature: chamadas por Server Components, nunca pelo client.
 *
 * `connection()` interrompe o prerender: sem ele o Next resolveria a query no
 * build e a pagina serviria dados congelados.
 *
 * Nenhuma consulta aqui filtra por competencia. Funcionario e cadastro, e nao
 * dado datado — pela mesma razao das escalas: ninguem e recontratado ao virar o
 * periodo, e datar o cadastro faria cada competencia comecar com a lista vazia.
 */

const colunas = {
  id: funcionarios.id,
  empresaId: funcionarios.empresaId,
  empresaNome: empresas.nome,
  matricula: funcionarios.matricula,
  nome: funcionarios.nome,
  cpf: funcionarios.cpf,
  cargo: funcionarios.cargo,
  telefone: funcionarios.telefone,
  admissao: funcionarios.admissao,
  situacao: funcionarios.situacao,
  ativo: funcionarios.ativo,
  escalaId: funcionarios.escalaId,
  inicioCiclo: funcionarios.inicioCiclo,
  escalaNome: escalas.nome,
  entrada: escalas.entrada,
  saida: escalas.saida,
  diasCiclo: escalas.diasCiclo,
  folgas: folgasDaEscala,
};

/**
 * Uma linha do `select` acima. As colunas da escala sao anulaveis porque o join
 * e `left`: quem ainda nao tem escala definida traz `null` nas cinco.
 */
type LinhaDoBanco = {
  id: string;
  empresaId: string;
  empresaNome: string;
  matricula: string;
  nome: string;
  cpf: string;
  cargo: string | null;
  telefone: string | null;
  admissao: string | null;
  situacao: number;
  ativo: boolean;
  escalaId: string | null;
  inicioCiclo: string | null;
  escalaNome: string | null;
  entrada: string | null;
  saida: string | null;
  diasCiclo: number | null;
  /** Nunca `null`: o `coalesce` da subconsulta devolve `{}` quando nao ha escala. */
  folgas: number[];
};

/**
 * Junta as colunas da escala de volta em um objeto so — ou `null`.
 *
 * O `left join` traz cinco colunas anulaveis que na verdade sao inseparaveis: o
 * `check` da tabela garante que escala e inicio de ciclo existem juntos. A
 * conferencia dos dois aqui e o que permite ao resto do portal tratar
 * `escala` como um objeto inteiro, sem recombinar campos soltos a cada tela.
 */
function atribuicaoDaLinha(linha: LinhaDoBanco) {
  if (
    !linha.escalaId ||
    !linha.inicioCiclo ||
    !linha.escalaNome ||
    !linha.entrada ||
    !linha.saida ||
    linha.diasCiclo === null
  ) {
    return null;
  }

  return {
    escalaId: linha.escalaId,
    escalaNome: linha.escalaNome,
    // O `time` do Postgres volta como `HH:MM:SS`; as telas leem `HH:MM`.
    entrada: formatarHora(linha.entrada),
    saida: formatarHora(linha.saida),
    diasCiclo: linha.diasCiclo,
    folgas: linha.folgas,
    inicioCiclo: linha.inicioCiclo,
  };
}

function funcionarioDaLinha(linha: LinhaDoBanco): FuncionarioResumo {
  return {
    id: linha.id,
    empresaId: linha.empresaId,
    empresaNome: linha.empresaNome,
    matricula: linha.matricula,
    nome: linha.nome,
    cpf: linha.cpf,
    cargo: linha.cargo,
    telefone: linha.telefone,
    admissao: linha.admissao,
    situacao: linha.situacao,
    ativo: linha.ativo,
    escala: atribuicaoDaLinha(linha),
  };
}

/**
 * Monta o padrao do `ilike` a partir do que foi digitado. `null` para busca
 * vazia — quem chama traduz isso como "sem filtro", nao como "nada bate".
 *
 * `%` e `_` sao curingas do LIKE: sem escapar, procurar por "%" traria a tabela
 * inteira e um nome com underline casaria com qualquer caractere.
 */
function padraoDeBusca(termo: string) {
  return termo ? `%${termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%` : null;
}

/**
 * O filtro da lista. A busca cobre nome, matricula e cargo, e tambem o CPF —
 * este por um padrao proprio, so com os digitos: a coluna guarda
 * `43393138820` e quem procura digita `433.931.388-20`, entao buscar o texto
 * cru nunca acharia ninguem.
 */
function filtroDaLista(filtros: FiltrosDeFuncionarios) {
  const condicoes: SQL[] = [];
  const padrao = padraoDeBusca(filtros.busca);

  if (padrao) {
    const digitos = digitosDoCpf(filtros.busca);
    const alternativas = [
      ilike(funcionarios.nome, padrao),
      ilike(funcionarios.matricula, padrao),
      ilike(funcionarios.cargo, padrao),
    ];

    if (digitos.length >= 3) {
      alternativas.push(ilike(funcionarios.cpf, `%${digitos}%`));
    }

    condicoes.push(or(...alternativas)!);
  }

  if (filtros.empresaId) {
    condicoes.push(eq(funcionarios.empresaId, filtros.empresaId));
  }

  if (filtros.pendentes) {
    condicoes.push(isNull(funcionarios.escalaId));
  }

  return condicoes.length > 0 ? and(...condicoes) : undefined;
}

/**
 * Uma pagina de funcionarios, em ordem alfabetica.
 *
 * Busca, filtro e recorte acontecem no banco, e nao na tela: sao trezentas
 * pessoas hoje e nada avisaria quando passassem de mil.
 *
 * Paginacao por `offset` (e nao por cursor) porque a tela mostra numero de
 * pagina e total — as duas coisas que cursor nao da. Mesma escolha da lista de
 * escalas, e pela mesma razao.
 */
export async function listarFuncionarios(
  filtros: FiltrosDeFuncionarios,
): Promise<PaginaDeFuncionarios> {
  await connection();

  const filtro = filtroDaLista(filtros);

  const [contagem] = await db
    .select({ total: count() })
    .from(funcionarios)
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .where(filtro);

  // Independe do filtro de proposito: e o aviso de que ha trabalho pendente,
  // e ele nao pode sumir so porque a tela esta filtrada por uma empresa.
  const [pendencias] = await db
    .select({ total: count() })
    .from(funcionarios)
    .where(isNull(funcionarios.escalaId));

  const total = contagem?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / FUNCIONARIOS_POR_PAGINA));
  // Link velho (ou `?pagina=99`) cai na ultima pagina, e nao numa tela vazia.
  const pagina = Math.min(filtros.pagina, paginas);

  const linhas = await db
    .select(colunas)
    .from(funcionarios)
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .leftJoin(escalas, eq(escalas.id, funcionarios.escalaId))
    .where(filtro)
    // Nome nao e unico (homonimos existem); o CPF desempata e e unico, entao a
    // ordem e total: ninguem muda de lugar entre uma pagina e outra.
    .orderBy(asc(funcionarios.nome), asc(funcionarios.cpf))
    .limit(FUNCIONARIOS_POR_PAGINA)
    .offset((pagina - 1) * FUNCIONARIOS_POR_PAGINA);

  return {
    funcionarios: linhas.map(funcionarioDaLinha),
    total,
    pagina,
    paginas,
    semEscala: pendencias?.total ?? 0,
  };
}

/** `null` para id inexistente — e tambem para id que nem uuid e. */
export async function obterFuncionario(id: string): Promise<FuncionarioResumo | null> {
  await connection();

  // Sem essa validacao, um id fora do formato uuid faria o Postgres lancar erro
  // de cast em vez de simplesmente nao encontrar nada.
  const idValido = idFuncionarioSchema.safeParse(id);

  if (!idValido.success) {
    return null;
  }

  const [linha] = await db
    .select(colunas)
    .from(funcionarios)
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .leftJoin(escalas, eq(escalas.id, funcionarios.escalaId))
    .where(eq(funcionarios.id, idValido.data))
    .limit(1);

  return linha ? funcionarioDaLinha(linha) : null;
}

/**
 * As empresas com quantos funcionarios cada uma tem. Serve ao filtro da lista e
 * ao campo de empresa do cadastro, entao traz as inativas tambem — quem ja esta
 * cadastrado em uma delas precisa continuar podendo ser editado.
 */
export async function listarEmpresas(): Promise<EmpresaResumo[]> {
  await connection();

  return db
    .select({
      id: empresas.id,
      nome: empresas.nome,
      cnpj: empresas.cnpj,
      ativa: empresas.ativa,
      // `count(coluna)` e nao `count(*)`: com o left join, `count(*)` contaria
      // a linha nula da empresa sem ninguem e diria que ela tem 1 funcionario.
      funcionarios: count(funcionarios.id),
    })
    .from(empresas)
    .leftJoin(funcionarios, eq(funcionarios.empresaId, empresas.id))
    .groupBy(empresas.id)
    .orderBy(asc(sql`lower(${empresas.nome})`));
}

/* -------------------------------------------------------------------------- */
/* Afastamentos                                                               */
/* -------------------------------------------------------------------------- */

const colunasAfastamento = {
  id: afastamentos.id,
  tipo: afastamentos.tipo,
  dataInicio: afastamentos.dataInicio,
  dataFim: afastamentos.dataFim,
  observacao: afastamentos.observacao,
};

/**
 * Os afastamentos de uma pessoa, do mais recente para o mais antigo — que e a
 * ordem em que se confere: o que acabou de ser lancado e o que interessa.
 *
 * Nao filtra por competencia. Um afastamento do INSS atravessa meses, e some-lo
 * ao periodo em vigor o faria desaparecer justo enquanto ainda vale.
 */
export async function listarAfastamentos(funcionarioId: string): Promise<AfastamentoResumo[]> {
  await connection();

  const idValido = idFuncionarioSchema.safeParse(funcionarioId);

  if (!idValido.success) {
    return [];
  }

  return db
    .select(colunasAfastamento)
    .from(afastamentos)
    .where(eq(afastamentos.funcionarioId, idValido.data))
    .orderBy(desc(afastamentos.dataInicio));
}

/**
 * Os afastamentos que tocam uma janela, agrupados por funcionario — o formato
 * que a apuracao do ponto consome.
 *
 * O filtro e **sobreposicao**, e nao "comeca dentro da janela": um INSS que
 * comecou em julho e termina em setembro cobre agosto inteiro sem ter nenhuma
 * das duas pontas la dentro. `inicio <= fim da janela and fim >= inicio da
 * janela` e a mesma conta de `periodosSeSobrepoem()`, escrita em SQL.
 */
export async function afastamentosNaJanela(
  funcionarioIds: readonly string[],
  janela: { inicio: string; fim: string },
): Promise<Map<string, PeriodoDeAfastamento[]>> {
  await connection();

  if (funcionarioIds.length === 0) {
    return new Map();
  }

  const linhas = await db
    .select({
      funcionarioId: afastamentos.funcionarioId,
      tipo: afastamentos.tipo,
      dataInicio: afastamentos.dataInicio,
      dataFim: afastamentos.dataFim,
    })
    .from(afastamentos)
    .where(
      and(
        inArray(afastamentos.funcionarioId, [...funcionarioIds]),
        lte(afastamentos.dataInicio, janela.fim),
        gte(afastamentos.dataFim, janela.inicio),
      ),
    )
    .orderBy(asc(afastamentos.dataInicio));

  return Map.groupBy(linhas, (linha) => linha.funcionarioId) as Map<string, PeriodoDeAfastamento[]>;
}
