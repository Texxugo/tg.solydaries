import { History } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatarPeriodo, nomeDaCompetencia } from "@/features/competencias/periodo";
import type { CompetenciaEmVigor } from "@/features/competencias/types";

import { EncerrarConsultaForm } from "./encerrar-consulta-form";

/**
 * Faixa fixa no topo enquanto a sessao trabalha numa competencia encerrada.
 * O portal inteiro esta em outro periodo — o que se grava vai para ele —, entao
 * o aviso e a saida precisam estar sempre a mao, em qualquer tela.
 */
export function FaixaConsulta({ vigor }: { vigor: CompetenciaEmVigor }) {
  const { competencia } = vigor;

  return (
    <div className="border-b px-4 py-3">
      <Alert>
        <History aria-hidden />
        <AlertTitle>
          Trabalhando na competencia de {nomeDaCompetencia(competencia.dataFim)}
        </AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {formatarPeriodo(competencia.dataInicio, competencia.dataFim)}. O que for lancado agora
            entra nesta competencia. Para as outras pessoas o portal continua na competencia ativa.
          </span>
          <EncerrarConsultaForm competenciaId={competencia.id} />
        </AlertDescription>
      </Alert>
    </div>
  );
}
