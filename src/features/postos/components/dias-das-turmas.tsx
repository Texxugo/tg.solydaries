import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import type { PeriodoDaPrevia } from "@/features/postos/types";
import { diaDoMes, ehFimDeSemana } from "@/features/preenchimento/grade";
import {
  diasDaTurma,
  ordenarVigencias,
  rotuloDaVigencia,
  type VigenciaDoCiclo,
} from "@/features/preenchimento/previsto";
import { cn } from "@/lib/utils";

/** Uma linha do desenho: uma turma, com as vigencias que valem para ela. */
export type TurmaDesenhada = {
  rotulo: string;
  vigencias: readonly VigenciaDoCiclo[];
  /** Marca a linha que esta sendo editada, para a previa se destacar das outras. */
  rascunho?: boolean;
};

/**
 * As turmas de uma funcao desenhadas nos dias do periodo, uma embaixo da outra.
 *
 * E o que "12x36 · 06:30-18:30 desde 20/09 → 12x36 · 18:30-06:30 desde 21/09"
 * nao dizia: em que dias cada metade do posto trabalha, e se as duas se
 * alternam. A conta e a da grade (`diasDaTurma()`, ao lado de
 * `derivarPrevisto()`), entao o desenho e o que a faixa P vai mostrar.
 *
 * O dia em que uma vigencia nova comeca ganha um traco a esquerda: e la que o
 * horario ou o ciclo mudam no meio do periodo.
 */
export function DiasDasTurmas({
  periodo,
  turmas,
  sigla,
}: {
  periodo: PeriodoDaPrevia;
  turmas: readonly TurmaDesenhada[];
  /** A sigla dos dias de trabalho — a da funcao, ou "T" quando ela nao tem. */
  sigla: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-max border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="w-28 min-w-28">
              <span className="sr-only">Turma</span>
            </th>
            {periodo.dias.map((data) => (
              <th
                key={data}
                scope="col"
                title={`${diaDaSemana(data)} ${formatarData(data)}`}
                className={cn(
                  "w-5 min-w-5 pb-1 text-center font-normal",
                  ehFimDeSemana(data) && "bg-muted/60 rounded-t-sm",
                )}
              >
                <span className="block text-[9px] leading-none">{diaDaSemana(data).charAt(0)}</span>
                <span className="text-foreground block">{diaDoMes(data)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {turmas.map((turma) => (
            <LinhaDaTurma key={turma.rotulo} periodo={periodo} turma={turma} sigla={sigla} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaDaTurma({
  periodo,
  turma,
  sigla,
}: {
  periodo: PeriodoDaPrevia;
  turma: TurmaDesenhada;
  sigla: string;
}) {
  const dias = diasDaTurma(ordenarVigencias(turma.vigencias), periodo.dias, periodo.primeiroDia);
  const ultima = dias.at(-1)?.vigencia ?? null;

  return (
    <tr>
      <th scope="row" className="py-0.5 pr-2 text-left align-middle font-normal">
        <span className={cn("block text-xs font-medium", turma.rascunho && "text-foreground")}>
          {turma.rotulo}
        </span>
        <span className="text-muted-foreground block whitespace-nowrap">
          {ultima ? rotuloDaVigencia(ultima) : "sem vigencia"}
        </span>
      </th>
      {dias.map((dia, indice) => {
        const mudou =
          indice > 0 && dia.vigencia && dia.vigencia.id !== dias[indice - 1].vigencia?.id;

        return (
          <td
            key={dia.data}
            title={
              dia.vigencia
                ? `${diaDaSemana(dia.data)} ${formatarData(dia.data)} — ${
                    dia.trabalho
                      ? `trabalha ${dia.vigencia.entrada}-${dia.vigencia.saida}`
                      : "folga"
                  }${mudou ? " (vigencia nova a partir deste dia)" : ""}`
                : `${formatarData(dia.data)} — antes da primeira vigencia, sem previsto`
            }
            className={cn(
              "p-px text-center",
              ehFimDeSemana(dia.data) && "bg-muted/40",
              mudou && "border-foreground/60 border-l-2",
            )}
          >
            <span
              className={cn(
                "block rounded-sm py-1 font-mono leading-none",
                !dia.vigencia
                  ? "text-muted-foreground/50"
                  : dia.trabalho
                    ? "bg-primary/30 text-foreground font-medium"
                    : "text-muted-foreground",
                turma.rascunho && dia.trabalho && "bg-primary text-primary-foreground",
              )}
            >
              {!dia.vigencia ? "·" : dia.trabalho ? sigla : "F"}
            </span>
          </td>
        );
      })}
    </tr>
  );
}
