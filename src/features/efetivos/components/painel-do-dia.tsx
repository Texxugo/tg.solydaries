import { CircleAlert, CircleCheck, ShieldAlert, TriangleAlert, UserX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatarData } from "@/features/competencias/periodo";
import { ROTA_EFETIVOS, type FaltaDoDia, type PainelDoDia } from "@/features/efetivos/types";
import { cn } from "@/lib/utils";

function hrefDoPosto(data: string, postoId: string) {
  return `${ROTA_EFETIVOS}?${new URLSearchParams({ data, posto: postoId })}`;
}

/**
 * O que o dia ainda pede: postos sem nenhum lancamento, faltas (as sem
 * cobertura em destaque) e conflitos de horario que alguem confirmou.
 *
 * Server Component: so le. Cada posto e cada falta e um link para o lancamento
 * daquele posto no dia — achar o buraco e ja estar onde se tapa.
 */
export function PainelDoDia({
  data,
  painel,
  totalDePostos,
}: {
  data: string;
  painel: PainelDoDia;
  totalDePostos: number;
}) {
  const { postosSemEfetivo, faltasSemCobertura, faltasCobertas, conflitos } = painel;
  const lancados = totalDePostos - postosSemEfetivo.length;

  return (
    <section
      aria-label={`Painel de ${formatarData(data)}`}
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      <Bloco
        icone={
          postosSemEfetivo.length === 0 ? (
            <CircleCheck className="text-emerald-700 dark:text-emerald-400" aria-hidden />
          ) : (
            <CircleAlert className="text-amber-700 dark:text-amber-400" aria-hidden />
          )
        }
        titulo={`Postos com efetivo: ${lancados} de ${totalDePostos}`}
      >
        {postosSemEfetivo.length === 0 ? (
          <p className="text-muted-foreground">Todos os postos tem efetivo lancado.</p>
        ) : (
          <>
            <p className="text-muted-foreground mb-1.5">Sem nenhum lancamento:</p>
            <ul className="flex flex-wrap gap-1.5">
              {postosSemEfetivo.map((posto) => (
                <li key={posto.id}>
                  <Link
                    href={hrefDoPosto(data, posto.id)}
                    title={posto.nome}
                    className="hover:bg-muted focus-visible:ring-ring/50 inline-block rounded-md border px-1.5 py-0.5 font-mono text-xs outline-none focus-visible:ring-3"
                  >
                    {posto.codigo}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloco>

      <Bloco
        icone={
          <UserX className={cn(faltasSemCobertura.length > 0 && "text-destructive")} aria-hidden />
        }
        titulo={`Faltas sem cobertura: ${faltasSemCobertura.length}`}
        destaque={faltasSemCobertura.length > 0}
      >
        <ListaDeFaltas data={data} faltas={faltasSemCobertura} vazio="Nenhum posto descoberto." />
      </Bloco>

      <Bloco
        icone={<ShieldAlert aria-hidden />}
        titulo={`Faltas cobertas: ${faltasCobertas.length}`}
      >
        <ListaDeFaltas data={data} faltas={faltasCobertas} vazio="Nenhuma falta coberta." />
      </Bloco>

      <Bloco
        icone={
          <TriangleAlert
            className={cn(conflitos.length > 0 && "text-amber-700 dark:text-amber-400")}
            aria-hidden
          />
        }
        titulo={`Conflitos de horario: ${conflitos.length}`}
      >
        {conflitos.length === 0 ? (
          <p className="text-muted-foreground">Ninguem em dois lugares ao mesmo tempo.</p>
        ) : (
          <ul className="space-y-1">
            {conflitos.map((conflito) => (
              <li key={`${conflito.pessoa}-${conflito.descricao}`}>
                <span className="font-medium">{conflito.nome}</span>: {conflito.descricao}
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </section>
  );
}

function Bloco({
  icone,
  titulo,
  destaque = false,
  children,
}: {
  icone: ReactNode;
  titulo: string;
  destaque?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-card space-y-2 rounded-xl border p-3 text-sm [&_svg]:size-4 [&_svg]:shrink-0",
        destaque && "border-destructive/50 bg-red-50 dark:bg-red-950/40",
      )}
    >
      <h2 className="flex items-center gap-2 font-medium">
        {icone}
        {titulo}
      </h2>
      <div className="max-h-40 overflow-y-auto">{children}</div>
    </div>
  );
}

function ListaDeFaltas({
  data,
  faltas,
  vazio,
}: {
  data: string;
  faltas: FaltaDoDia[];
  vazio: string;
}) {
  if (faltas.length === 0) {
    return <p className="text-muted-foreground">{vazio}</p>;
  }

  return (
    <ul className="space-y-1">
      {faltas.map((falta) => (
        <li key={`${falta.postoId}-${falta.nome}-${falta.entrada}`}>
          <Link
            href={hrefDoPosto(data, falta.postoId)}
            className="hover:underline focus-visible:underline focus-visible:outline-none"
          >
            <span className="font-mono text-xs">{falta.posto}</span>{" "}
            <span className="font-medium">{falta.nome}</span>
          </Link>
          <span className="text-muted-foreground block text-xs">
            {falta.local} · {falta.entrada}–{falta.saida}
            {falta.cobertoPor ? ` · coberto por ${falta.cobertoPor}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
