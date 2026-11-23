import { classesDaCor } from "@/features/eventos/cores";
import type { EventoDaGrade } from "@/features/eventos/types";
import { cn } from "@/lib/utils";

/**
 * A legenda das siglas aceitas na grade.
 *
 * Server Component: e so exibicao, e a lista sai do mesmo `listarEventosAtivos()`
 * que alimenta o `<datalist>` das celulas — uma leitura por requisicao para as
 * duas coisas, porque a query e memoizada.
 */
export function LegendaEventos({ eventos }: { eventos: readonly EventoDaGrade[] }) {
  if (eventos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum evento cadastrado: a grade nao vai reconhecer sigla nenhuma ate que exista ao menos
        um em Eventos.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {eventos.map((evento) => (
        <li key={evento.id} className="flex items-center gap-1.5 text-sm">
          <span
            className={cn("rounded-sm px-1.5 py-0.5 font-mono text-xs", classesDaCor(evento.cor))}
          >
            {evento.codigo}
          </span>
          <span className="text-muted-foreground">{evento.rotulo}</span>
        </li>
      ))}
    </ul>
  );
}
