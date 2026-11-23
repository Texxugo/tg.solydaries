import { CalendarDays, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { nomeDaCompetencia } from "@/features/competencias/periodo";
import type { CompetenciaEmVigor } from "@/features/competencias/types";

/**
 * Diz, em toda tela do portal, de que competencia sao os dados exibidos. Sem
 * isso a mesma tela mostra conteudos diferentes conforme o periodo, e nada na
 * pagina explica por que.
 */
export function IndicadorCompetencia({ vigor }: { vigor: CompetenciaEmVigor | null }) {
  if (!vigor) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <CalendarDays aria-hidden />
        Nenhuma competencia ativa
      </Badge>
    );
  }

  const nome = nomeDaCompetencia(vigor.competencia.dataFim);

  return (
    <Badge variant={vigor.temporaria ? "outline" : "secondary"} className="gap-1.5">
      {vigor.temporaria ? <History aria-hidden /> : <CalendarDays aria-hidden />}
      <span className="text-muted-foreground">
        {vigor.temporaria ? "Consultando" : "Competencia"}
      </span>
      {nome}
    </Badge>
  );
}
