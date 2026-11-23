import "server-only";

import { and, asc, count, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { apontamentos, empresas, funcionarios, usuarios } from "@/db/schema";
import { competenciaEmVigor } from "@/features/competencias/queries";
import { digitosDoCpf } from "@/features/funcionarios/cpf";

import type { ApontamentoDaFolha } from "./rubricas";
import { idFuncionarioSchema } from "./schema";
import {
  APONTAMENTOS_POR_PAGINA,
  type ApontamentoGravado,
  type FiltrosDeApontamentos,
  type FuncionarioDoApontamento,
  type PaginaDeApontamentos,
} from "./types";

/**
 * Leituras do modulo de apontamentos: chamadas por Server Components, nunca
 * pelo client.
 *
 * **Toda consulta de apontamento filtra por `competenciaEmVigor()`**: o
 * apontamento e dado datado, e a lista de uma competencia nao pode mostrar o
 * de outra. `null` significa "nao ha o que mostrar" — sem competencia, a lista
 * volta vazia e a tela e o aviso.
 */

const colunasDoFuncionario = {
  id: funcionarios.id,
  nome: funcionarios.nome,
  matricula: funcionarios.matricula,
  cargo: funcionarios.cargo,
  empresaNome: empresas.nome,
  situacao: funcionarios.situacao,
  ativo: funcionarios.ativo,
};

const colunas = {
  funcionario: colunasDoFuncionario,
  // O objeto aninhado volta `null` inteiro quando o `left join` nao encontra
  // linha — e e assim que "sem apontamento" chega a tela, sem campo a conferir.
  apontamento: {
    vtDias: apontamentos.vtDias,
    vrDias: apontamentos.vrDias,
    cestaBasica: apontamentos.cestaBasica,
    he50Minutos: apontamentos.he50Minutos,
    he60Minutos: apontamentos.he60Minutos,
    he100Minutos: apontamentos.he100Minutos,
    adicionalNoturnoMinutos: apontamentos.adicionalNoturnoMinutos,
    intrajornadaMinutos: apontamentos.intrajornadaMinutos,
    insalubridade: apontamentos.insalubridade,
    periculosidade: apontamentos.periculosidade,
    assiduidade: apontamentos.assiduidade,
    gratificacaoPercentual: apontamentos.gratificacaoPercentual,
    faltasEscala: apontamentos.faltasEscala,
    faltasFolga: apontamentos.faltasFolga,
    dsrDescontados: apontamentos.dsrDescontados,
    observacao: apontamentos.observacao,
    atualizadoEm: apontamentos.atualizadoEm,
  },
  // Fora do objeto aninhado: vem de outra tabela, e misturada ali faria o
  // Drizzle deixar de tratar o apontamento como um bloco que existe ou nao.
  atualizadoPor: usuarios.nome,
};

type LinhaDoSelect = {
  funcionario: FuncionarioDoApontamento;
  apontamento: (ApontamentoDaFolha & { atualizadoEm: Date }) | null;
  atualizadoPor: string | null;
};

function linhaDoSelect({ funcionario, apontamento, atualizadoPor }: LinhaDoSelect): {
  funcionario: FuncionarioDoApontamento;
  apontamento: ApontamentoGravado | null;
} {
  return { funcionario, apontamento: apontamento ? { ...apontamento, atualizadoPor } : null };
}

/** Mesmo escape de `listarEscalas`: `%` e `_` sao curingas do LIKE. */
function padraoDeBusca(termo: string) {
  return termo ? `%${termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%` : null;
}

/**
 * Busca e empresa sobre `funcionarios` — o recorte que a lista e as exportacoes
 * dividem. Um lugar so, para que o arquivo baixado com a lista filtrada traga
 * exatamente as pessoas que a tela mostrava.
 */
export function recorteDaBusca(
  filtros: Pick<FiltrosDeApontamentos, "busca" | "empresaId">,
): SQL | undefined {
  const padrao = padraoDeBusca(filtros.busca);
  const digitos = digitosDoCpf(filtros.busca);

  return and(
    filtros.empresaId ? eq(funcionarios.empresaId, filtros.empresaId) : undefined,
    padrao
      ? or(
          ilike(funcionarios.nome, padrao),
          ilike(funcionarios.matricula, padrao),
          ilike(funcionarios.cargo, padrao),
          // O CPF e guardado so em digitos, e quem procura digita com mascara.
          digitos.length >= 3 ? ilike(funcionarios.cpf, `%${digitos}%`) : undefined,
        )
      : undefined,
  );
}

/**
 * A lista do fechamento: uma linha por funcionario, com o apontamento dele na
 * competencia em vigor ao lado.
 *
 * Parte de `funcionarios`, e nao de `apontamentos`: a pergunta da tela e "quem
 * falta apontar?", e quem falta e justamente quem nao tem linha. Busca, filtro
 * e recorte acontecem no banco, como na lista de funcionarios.
 */
export async function listarApontamentos(
  filtros: FiltrosDeApontamentos,
): Promise<PaginaDeApontamentos> {
  await connection();

  const vigor = await competenciaEmVigor();

  if (!vigor) {
    return { linhas: [], total: 0, pagina: 1, paginas: 1, apontados: 0, pendentes: 0 };
  }

  const competenciaId = vigor.competencia.id;
  const juncao = and(
    eq(apontamentos.funcionarioId, funcionarios.id),
    eq(apontamentos.competenciaId, competenciaId),
  );

  const filtro = and(
    filtros.inativos ? undefined : or(eq(funcionarios.ativo, true), isNotNull(apontamentos.id)),
    filtros.status === "apontados"
      ? isNotNull(apontamentos.id)
      : filtros.status === "pendentes"
        ? isNull(apontamentos.id)
        : undefined,
    recorteDaBusca(filtros),
  );

  const [[contagem], [andamento]] = await Promise.all([
    db
      .select({ total: count() })
      .from(funcionarios)
      .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
      .leftJoin(apontamentos, juncao)
      .where(filtro),
    // Independe do filtro: e o andamento do fechamento. Pendente e quem esta
    // ativo e sem apontamento — o inativo sem nada a receber nao e fila.
    db
      .select({
        apontados: count(apontamentos.id),
        pendentes: count(
          sql`case when ${funcionarios.ativo} and ${apontamentos.id} is null then 1 end`,
        ),
      })
      .from(funcionarios)
      .leftJoin(apontamentos, juncao),
  ]);

  const total = contagem?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / APONTAMENTOS_POR_PAGINA));
  // Link velho (ou `?pagina=99`) cai na ultima pagina, e nao numa tela vazia.
  const pagina = Math.min(filtros.pagina, paginas);

  const linhas = await db
    .select(colunas)
    .from(funcionarios)
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .leftJoin(apontamentos, juncao)
    .leftJoin(usuarios, eq(usuarios.id, apontamentos.atualizadoPorId))
    .where(filtro)
    // O CPF desempata homonimos e e unico: ninguem muda de lugar entre paginas.
    .orderBy(asc(funcionarios.nome), asc(funcionarios.cpf))
    .limit(APONTAMENTOS_POR_PAGINA)
    .offset((pagina - 1) * APONTAMENTOS_POR_PAGINA);

  return {
    linhas: linhas.map(linhaDoSelect),
    total,
    pagina,
    paginas,
    apontados: andamento?.apontados ?? 0,
    pendentes: andamento?.pendentes ?? 0,
  };
}

/**
 * Um funcionario e o apontamento dele na competencia em vigor. `null` para id
 * inexistente, id que nem uuid e, ou sem competencia — nos tres casos nao ha
 * tela a abrir. Funcionario inativo abre: quem saiu no meio do periodo ainda
 * pode ter o que receber.
 */
export async function obterApontamento(funcionarioId: string) {
  await connection();

  const idValido = idFuncionarioSchema.safeParse(funcionarioId);
  const vigor = await competenciaEmVigor();

  if (!idValido.success || !vigor) {
    return null;
  }

  const [linha] = await db
    .select(colunas)
    .from(funcionarios)
    .innerJoin(empresas, eq(empresas.id, funcionarios.empresaId))
    .leftJoin(
      apontamentos,
      and(
        eq(apontamentos.funcionarioId, funcionarios.id),
        eq(apontamentos.competenciaId, vigor.competencia.id),
      ),
    )
    .leftJoin(usuarios, eq(usuarios.id, apontamentos.atualizadoPorId))
    .where(eq(funcionarios.id, idValido.data))
    .limit(1);

  return linha ? linhaDoSelect(linha) : null;
}
