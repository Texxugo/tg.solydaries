"use client";

import { CalendarCheck, LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatarData } from "@/features/competencias/periodo";
import { diaDoCiclo, ehDiaTrabalhado, rotuloDoCiclo } from "@/features/escalas/jornada";
import type { EscalaParaAtribuicao } from "@/features/escalas/types";
import { definirJornada } from "@/features/funcionarios/actions";
import { CamposJornada } from "@/features/funcionarios/components/campos-jornada";
import { estadoInicialDefinirJornada, type FuncionarioResumo } from "@/features/funcionarios/types";

/**
 * A jornada de uma pessoa: qual escala ela segue e em que dia o ciclo comeca a
 * valer para ela.
 *
 * Formulario proprio, ao lado do de dados e com o seu proprio botao. Os dados
 * vem da folha (a mao ou por importacao) e a jornada nasce no portal, entao
 * corrigir um cargo nao deveria reenviar a escala — e vice-versa.
 *
 * Logo abaixo dos campos, o que eles dizem sobre **hoje**. E a unica forma de
 * conferir a atribuicao sem esperar a folha do mes, e fica junto do formulario
 * de proposito: e a resposta a pergunta que os dois campos existem para
 * responder.
 */
export function JornadaFuncionarioForm({
  funcionario,
  escalas,
  hoje,
}: {
  funcionario: FuncionarioResumo;
  escalas: readonly EscalaParaAtribuicao[];
  /** `YYYY-MM-DD` no fuso do portal, calculado no servidor. */
  hoje: string;
}) {
  const [estado, formAction, pendente] = useActionState(
    definirJornada,
    estadoInicialDefinirJornada,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  const escala = funcionario.escala;

  /**
   * Mesma razao da `key` do formulario de dados: os campos sao nao controlados,
   * e depois do `refresh()` da action eles continuariam exibindo o estado
   * anterior sem uma remontagem amarrada aos dados do servidor.
   */
  const assinatura = [escala?.escalaId ?? "", escala?.inicioCiclo ?? ""].join("|");

  return (
    <div className="space-y-6">
      <form key={assinatura} action={formAction} className="space-y-6">
        <input type="hidden" name="funcionarioId" value={funcionario.id} />

        <CamposJornada
          escalas={escalas}
          valores={{
            escalaId: escala?.escalaId ?? "",
            inicioCiclo: escala?.inicioCiclo ?? "",
          }}
          erros={estado.erros}
        />

        {estado.status === "error" && !estado.erros ? (
          <p role="alert" className="text-destructive text-sm">
            {estado.mensagem}
          </p>
        ) : null}

        <Button type="submit" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : <CalendarCheck aria-hidden />}
          {pendente ? "Salvando..." : "Salvar jornada"}
        </Button>
      </form>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Jornada de hoje</h3>

        {escala ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  ehDiaTrabalhado(hoje, escala.inicioCiclo, escala) ? "default" : "secondary"
                }
              >
                {ehDiaTrabalhado(hoje, escala.inicioCiclo, escala) ? "Dia de trabalho" : "Folga"}
              </Badge>
              <span className="text-sm">
                {formatarData(hoje)} · dia {diaDoCiclo(hoje, escala.inicioCiclo, escala)} do ciclo{" "}
                {rotuloDoCiclo(escala)}
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              Segue a escala {escala.escalaNome} ({escala.entrada} as {escala.saida}), com o ciclo
              comecando em {formatarData(escala.inicioCiclo)}.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Sem escala definida: esta pessoa nao e apurada no ponto.
          </p>
        )}
      </div>
    </div>
  );
}
