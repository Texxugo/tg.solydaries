import "server-only";

import { and, isNull, sql } from "drizzle-orm";

import type { db } from "@/db";
import {
  freelancers,
  funcaoCiclos,
  funcionarios,
  funcoesPosto,
  postos,
  preenchimentoLinhas,
} from "@/db/schema";

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * O que a grade leva de uma competencia para a seguinte, na virada.
 *
 * A **escalacao** segue: quem esta em cada funcao de cada posto, em que turma,
 * com que sigla e em que ordem. E o que quem monta a escala refaria igual todo
 * mes — o efetivo do posto nao muda porque o periodo virou.
 *
 * O **preenchimento** fica: nenhuma celula de `preenchimento_dias` e copiada, e
 * a observacao da linha tambem nao ("FERIAS DE 01/09 A 30/09" e do mes em que
 * foi escrita). A grade nova nasce com o previsto inteiro e o realizado em
 * branco.
 *
 * Fica para tras quem nao tem mais onde estar: funcionario ou freelancer
 * desativado, funcao desativada, posto desativado. A competencia encerrada
 * continua com essas linhas — so a nova nao as recebe.
 *
 * Roda dentro da transacao de `abrirCompetencia()`: virada sem a grade, ou
 * grade sem a virada, deixaria a competencia nova pela metade.
 */
export async function levarGradeAdiante(
  tx: Transacao,
  anterior: { id: string; dataInicio: string },
  novaId: string,
) {
  const copia = await tx.execute(sql`
    insert into ${preenchimentoLinhas}
      (competencia_id, funcao_id, funcionario_id, freelancer_id, turma, evento_trabalho_id,
       hora_entrada, hora_saida, ordem)
    select ${novaId}, l.funcao_id, l.funcionario_id, l.freelancer_id, l.turma,
      l.evento_trabalho_id, l.hora_entrada, l.hora_saida, l.ordem
    from ${preenchimentoLinhas} l
    join ${funcoesPosto} f on f.id = l.funcao_id and f.ativa
    join ${postos} p on p.id = f.posto_id and p.ativo
    left join ${funcionarios} fu on fu.id = l.funcionario_id
    left join ${freelancers} fr on fr.id = l.freelancer_id
    where l.competencia_id = ${anterior.id}
      and (l.funcionario_id is null or fu.ativo)
      and (l.freelancer_id is null or fr.ativo)
  `);

  // A ordem da escala segue sem pular. A vigencia "desde sempre" sem ancora
  // ancora no primeiro dia da competencia em vigor (`ancoraDaVigencia()`), e por
  // isso recomecaria o ciclo a cada virada: um 12x36 que terminou setembro
  // trabalhando voltaria a trabalhar no dia 21 de outubro, dois dias seguidos.
  // Gravar como ancora o primeiro dia da competencia que se encerra nao muda
  // nada nela — era essa a ancora que ela ja usava — e faz a seguinte continuar
  // de onde a anterior parou.
  await tx
    .update(funcaoCiclos)
    .set({ inicioCiclo: anterior.dataInicio })
    .where(and(isNull(funcaoCiclos.vigenciaInicio), isNull(funcaoCiclos.inicioCiclo)));

  return copia.rowCount ?? 0;
}
