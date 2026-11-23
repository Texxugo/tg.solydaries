import Link from "next/link";

import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import {
  resumoDaExcecao,
  type PostoDaSemana,
  type RegistroDoDia,
} from "@/features/efetivos/semana";
import { ROTA_EFETIVOS } from "@/features/efetivos/types";
import { cn } from "@/lib/utils";

/**
 * A grade de um posto na semana: uma linha por pessoa, uma coluna por dia. E o
 * que se le para preencher a planilha de escala — por isso a celula diz
 * horario, local e a excecao por extenso, e a falta aparece na linha de quem
 * faltou.
 *
 * Server Component: so le. O cabecalho de cada dia leva ao lancamento daquele
 * posto naquele dia, para corrigir o que a semana mostrou errado.
 */
export function GradeDaSemana({
  semana,
  dias,
  hoje,
}: {
  semana: PostoDaSemana;
  dias: string[];
  hoje: string;
}) {
  const { posto, linhas, presentes, descobertos } = semana;

  return (
    // `w-0 min-w-full`: a tabela rola dentro da secao, e nao alarga a pagina
    // (mesma razao da lista do dia).
    <section aria-labelledby={`semana-${posto.id}`} className="w-0 min-w-full space-y-2">
      <h2 id={`semana-${posto.id}`} className="font-medium">
        <span className="font-mono">{posto.codigo}</span>{" "}
        <span className="text-muted-foreground font-normal">{posto.nome}</span>
      </h2>

      <div className="overflow-x-auto rounded-xl border">
        {/* `table-fixed`: as colunas dos dias tem a mesma largura em todos os
            postos, e a semana se le de cima a baixo sem o olho reajustar. */}
        <table className="w-full min-w-[60rem] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th
                scope="col"
                className="bg-muted sticky left-0 z-10 w-56 border-b px-2 py-1.5 text-left font-medium"
              >
                Funcionario
              </th>
              {dias.map((dia) => (
                <th
                  key={dia}
                  scope="col"
                  className={cn(
                    "border-b border-l px-2 py-1.5 text-left font-medium",
                    dia === hoje && "bg-accent",
                  )}
                >
                  <Link
                    href={`${ROTA_EFETIVOS}?${new URLSearchParams({ data: dia, posto: posto.id })}`}
                    className="hover:underline"
                    title="Abrir o lancamento deste dia"
                  >
                    {diaDaSemana(dia)} {formatarData(dia).slice(0, 5)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.pessoa} className="align-top">
                <th
                  scope="row"
                  className="bg-background sticky left-0 z-10 border-b px-2 py-1.5 text-left font-normal"
                >
                  <span className="block font-medium">{linha.nome}</span>
                  <span className="text-muted-foreground text-xs">
                    {[linha.identificacao, linha.freelancer ? "freelancer" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </th>
                {linha.dias.map((registros, indice) => (
                  <td
                    key={dias[indice]}
                    className={cn(
                      "border-b border-l px-2 py-1.5",
                      dias[indice] === hoje && "bg-accent/30",
                    )}
                  >
                    {registros.map((registro, posicao) => (
                      <Registro key={posicao} registro={registro} />
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 text-xs">
              <th
                scope="row"
                className="bg-muted sticky left-0 z-10 px-2 py-1.5 text-left font-medium"
              >
                Efetivo do dia
              </th>
              {dias.map((dia, indice) => (
                <td key={dia} className="border-l px-2 py-1.5 tabular-nums">
                  {presentes[indice]}
                  {descobertos[indice] > 0 ? (
                    <span className="text-destructive font-medium">
                      {" "}
                      · {descobertos[indice]} descoberto{descobertos[indice] > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Registro({ registro }: { registro: RegistroDoDia }) {
  if (registro.tipo === "falta") {
    const descoberto = !registro.cobertoPor;

    return (
      <div
        className={cn(
          "mb-1 rounded-md px-1.5 py-1 text-xs last:mb-0",
          descoberto
            ? "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200"
            : "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
        )}
      >
        <span className="block font-semibold">FALTA{descoberto ? " · descoberto" : ""}</span>
        <span className="block">
          {registro.entrada}–{registro.saida} · {registro.local}
        </span>
        {registro.cobertoPor ? (
          <span className="block">coberto por {registro.cobertoPor}</span>
        ) : null}
        {registro.observacao ? <span className="block">{registro.observacao}</span> : null}
      </div>
    );
  }

  return (
    <div className="mb-1 last:mb-0">
      <span className="block tabular-nums">
        {registro.entrada}–{registro.saida}
        {registro.viraODia ? (
          <span className="text-amber-700 dark:text-amber-400" title="Vira o dia">
            {" "}
            +1
          </span>
        ) : null}
      </span>
      <span className="text-muted-foreground block text-xs">{registro.local}</span>
      {registro.excecao ? (
        <span className="mt-0.5 block rounded-md bg-violet-100 px-1.5 py-0.5 text-xs text-violet-900 dark:bg-violet-950/60 dark:text-violet-200">
          {resumoDaExcecao(registro.excecao)}
        </span>
      ) : null}
    </div>
  );
}
