import "server-only";

import { asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { escalaExcecoes, escalaFolgas, escalas } from "@/db/schema";

import { formatarHora, type ExcecaoDoCiclo } from "./jornada";
import { idEscalaSchema } from "./schema";
import {
  ESCALAS_POR_PAGINA,
  type EscalaParaAtribuicao,
  type EscalaResumo,
  type PaginaDeEscalas,
} from "./types";

/**
 * Leituras da feature: chamadas por Server Components, nunca pelo client.
 *
 * `connection()` interrompe o prerender: sem ele o Next resolveria a query no
 * build e a pagina serviria dados congelados.
 *
 * Nenhuma consulta aqui filtra por competencia: escala e cadastro, e nao dado
 * datado — a regra da jornada nao muda de significado ao virar o periodo.
 */

/**
 * As folgas do ciclo como um `int[]` na propria linha da escala, em vez de uma
 * segunda consulta e um agrupamento em memoria: elas nunca sao lidas sem a
 * escala, e sao no maximo algumas dezenas de numeros.
 *
 * O `::int` e necessario: `dia_ciclo` e `smallint`, e o driver `pg` nao tem
 * parser para `int2[]` — sem o cast o array voltaria como a string `{6,7}`.
 * Exportada porque `funcionarios` le a escala pelo mesmo caminho, e a folga
 * precisa viajar junto com o ciclo aonde ele for.
 */
export const folgasDaEscala = sql<number[]>`coalesce(
  (
    select array_agg(folga.dia_ciclo::int order by folga.dia_ciclo)
    from ${escalaFolgas} folga
    where folga.escala_id = ${escalas.id}
  ),
  '{}'
)`;

/**
 * O rotulo do ciclo montado em SQL, so para a busca: "5x2" quando as folgas
 * fecham o ciclo, "14 dias" quando a folga anda.
 *
 * E a mesma regra de `rotuloDoCiclo()` em `jornada.ts`, escrita duas vezes
 * porque a busca acontece no banco e o rotulo depende de linhas de outra
 * tabela — coluna gerada nao alcanca isso. As duas mudam juntas; se
 * divergirem, o efeito e uma busca que nao encontra, e nao um dado errado.
 */
const rotuloDoCicloEmSql = sql`(
  select case
    when count(*) = 0 then ${escalas.diasCiclo} || 'x0'
    when max(folga.dia_ciclo) = ${escalas.diasCiclo}
      and count(*) = max(folga.dia_ciclo) - min(folga.dia_ciclo) + 1
      then (${escalas.diasCiclo} - count(*)) || 'x' || count(*)
    else ${escalas.diasCiclo} || ' dias'
  end
  from ${escalaFolgas} folga
  where folga.escala_id = ${escalas.id}
)`;

const colunas = {
  id: escalas.id,
  nome: escalas.nome,
  descricao: escalas.descricao,
  entrada: escalas.entrada,
  saida: escalas.saida,
  diasCiclo: escalas.diasCiclo,
  folgas: folgasDaEscala,
  intrajornadaMinutos: escalas.intrajornadaMinutos,
  marcacoesEsperadas: escalas.marcacoesEsperadas,
  horasExtrasMinutos: escalas.horasExtrasMinutos,
  viradaTurno: escalas.viradaTurno,
  ativa: escalas.ativa,
};

const colunasExcecao = {
  diaCiclo: escalaExcecoes.diaCiclo,
  entrada: escalaExcecoes.entrada,
  saida: escalaExcecoes.saida,
  intrajornadaMinutos: escalaExcecoes.intrajornadaMinutos,
  marcacoesEsperadas: escalaExcecoes.marcacoesEsperadas,
  horasExtrasMinutos: escalaExcecoes.horasExtrasMinutos,
};

/** O `time` do Postgres volta como `HH:MM:SS`; as telas leem `HH:MM`. */
function comHorasFormatadas<T extends { entrada: string; saida: string }>(linha: T): T {
  return { ...linha, entrada: formatarHora(linha.entrada), saida: formatarHora(linha.saida) };
}

/** Recorta a excecao para o formato das telas — sem o `escala_id` do agrupamento. */
function excecaoDaLinha(linha: ExcecaoDoCiclo): ExcecaoDoCiclo {
  return comHorasFormatadas({
    diaCiclo: linha.diaCiclo,
    entrada: linha.entrada,
    saida: linha.saida,
    intrajornadaMinutos: linha.intrajornadaMinutos,
    marcacoesEsperadas: linha.marcacoesEsperadas,
    horasExtrasMinutos: linha.horasExtrasMinutos,
  });
}

/**
 * Monta o padrao do `ilike` a partir do que foi digitado. `null` para busca
 * vazia — quem chama traduz isso como "sem filtro", nao como "nada bate".
 *
 * `%` e `_` sao curingas do LIKE: sem escapar, procurar por "%" traria a tabela
 * inteira e um nome com underline casaria com qualquer caractere. A contrabarra
 * e o escape padrao do Postgres, e o termo viaja como parametro.
 */
function padraoDeBusca(busca?: string) {
  const termo = busca?.trim();

  return termo ? `%${termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%` : null;
}

/**
 * Uma pagina de escalas: as ativas primeiro, cada bloco em ordem alfabetica.
 *
 * Busca e recorte acontecem no banco, e nao na tela — carregar tudo para
 * mostrar dez seria o mesmo custo do primeiro dia ate a lista crescer, e
 * nenhum aviso quando crescesse.
 *
 * A busca casa com nome, descricao e o rotulo do ciclo: "5x2" e o que a coluna
 * mostra, entao e o que a pessoa digita.
 *
 * Paginacao por `offset` (e nao por cursor) porque a tela mostra numero de
 * pagina e total: as duas coisas que cursor nao da. O custo do `offset` cresce
 * com a pagina, e aqui a lista e de cadastro — dezenas de linhas, nao milhoes.
 */
export async function listarEscalas(busca?: string, pagina = 1): Promise<PaginaDeEscalas> {
  await connection();

  const padrao = padraoDeBusca(busca);

  const filtro = padrao
    ? or(
        ilike(escalas.nome, padrao),
        ilike(escalas.descricao, padrao),
        sql`${rotuloDoCicloEmSql} ilike ${padrao}`,
      )
    : undefined;

  // `count(*)` volta como bigint, que o driver entrega em string; o cast evita
  // que "10" > 9 seja comparacao de texto la na frente.
  const [contagem] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(escalas)
    .where(filtro);

  const total = contagem?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / ESCALAS_POR_PAGINA));
  // Link velho (ou `?pagina=99`) cai na ultima pagina, e nao numa tela vazia.
  const paginaAtual = Math.min(pagina, paginas);

  const linhas = await db
    .select(colunas)
    .from(escalas)
    // `nome` e unico, entao esta ordem e total: nenhuma linha muda de lugar
    // entre uma pagina e outra por empate de criterio.
    .orderBy(desc(escalas.ativa), asc(escalas.nome))
    .where(filtro)
    .limit(ESCALAS_POR_PAGINA)
    .offset((paginaAtual - 1) * ESCALAS_POR_PAGINA);

  if (linhas.length === 0) {
    return { escalas: [], total, pagina: paginaAtual, paginas };
  }

  // Duas consultas em vez de um join: o join repetiria a escala uma vez por dia
  // de excecao e o agrupamento teria de acontecer aqui de qualquer forma.
  const excecoes = await db
    .select({ escalaId: escalaExcecoes.escalaId, ...colunasExcecao })
    .from(escalaExcecoes)
    .where(
      inArray(
        escalaExcecoes.escalaId,
        linhas.map((linha) => linha.id),
      ),
    )
    .orderBy(asc(escalaExcecoes.diaCiclo));

  const porEscala = Map.groupBy(excecoes, (excecao) => excecao.escalaId);

  return {
    escalas: linhas.map((linha) => ({
      ...comHorasFormatadas(linha),
      excecoes: (porEscala.get(linha.id) ?? []).map(excecaoDaLinha),
    })),
    total,
    pagina: paginaAtual,
    paginas,
  };
}

/**
 * As escalas que ainda podem ser atribuidas a alguem: so as ativas, e so os
 * campos que o campo de escolha mostra.
 *
 * Sem paginacao nem busca de proposito — e um `select` para preencher um campo,
 * nao uma tela. Escala inativa fica de fora porque desativar significa
 * exatamente "nao ofereca mais esta em atribuicao nova"; quem ja a tem
 * continua com ela, e por isso a lista de funcionarios le a escala pelo join, e
 * nao por esta funcao.
 */
export async function listarEscalasAtivas(): Promise<EscalaParaAtribuicao[]> {
  await connection();

  const linhas = await db
    .select({
      id: escalas.id,
      nome: escalas.nome,
      entrada: escalas.entrada,
      saida: escalas.saida,
      diasCiclo: escalas.diasCiclo,
      folgas: folgasDaEscala,
    })
    .from(escalas)
    .where(eq(escalas.ativa, true))
    .orderBy(asc(escalas.nome));

  return linhas.map(comHorasFormatadas);
}

/** `null` para id inexistente — e tambem para id que nem uuid e. */
export async function obterEscala(id: string): Promise<EscalaResumo | null> {
  await connection();

  // Sem essa validacao, um id fora do formato uuid faria o Postgres lancar
  // erro de cast em vez de simplesmente nao encontrar nada.
  const idValido = idEscalaSchema.safeParse(id);

  if (!idValido.success) {
    return null;
  }

  const [linha] = await db.select(colunas).from(escalas).where(eq(escalas.id, idValido.data));

  if (!linha) {
    return null;
  }

  const excecoes = await db
    .select(colunasExcecao)
    .from(escalaExcecoes)
    .where(eq(escalaExcecoes.escalaId, linha.id))
    .orderBy(asc(escalaExcecoes.diaCiclo));

  return { ...comHorasFormatadas(linha), excecoes: excecoes.map(excecaoDaLinha) };
}
