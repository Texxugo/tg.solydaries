"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { definirDiasDoCiclo } from "@/features/escalas/actions";
import {
  diasTrabalhadosDoCiclo,
  formatarDuracao,
  jornadaLiquidaEmMinutos,
} from "@/features/escalas/jornada";
import { estadoInicialDiasDoCiclo, type EscalaResumo } from "@/features/escalas/types";

/**
 * Os dias do ciclo, um por linha: o 5o dia do 5x2 que sai uma hora mais cedo, o
 * dia de meio periodo.
 *
 * Todos os dias trabalhados aparecem, ja preenchidos com o que vale hoje
 * (o padrao da escala ou a excecao daquele dia), e todos sao enviados. Quem
 * decide o que virou excecao e a action, comparando com o padrao — deixar o dia
 * igual a escala e como se apaga um ajuste, sem checkbox nenhum para marcar.
 */
export function DiasDoCicloForm({ escala }: { escala: EscalaResumo }) {
  const [estado, formAction, pendente] = useActionState(
    definirDiasDoCiclo,
    estadoInicialDiasDoCiclo,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  // So os dias de trabalho: dia de folga nao tem horario a ajustar, e num ciclo
  // de folga alternada eles nem sao os ultimos do ciclo.
  const dias = diasTrabalhadosDoCiclo(escala).map((diaCiclo) => {
    const excecao = escala.excecoes.find((dia) => dia.diaCiclo === diaCiclo);

    return { diaCiclo, jornada: excecao ?? escala, ajustado: Boolean(excecao) };
  });

  /**
   * Campos nao controlados: sem remontar, o formulario continuaria exibindo os
   * valores anteriores depois do `refresh()` da action. A chave derivada do
   * servidor troca quando (e so quando) os dias mudam de verdade.
   */
  const assinatura = [
    escala.diasCiclo,
    escala.folgas.join(","),
    escala.entrada,
    escala.saida,
    escala.intrajornadaMinutos,
    escala.marcacoesEsperadas,
    escala.horasExtrasMinutos,
    ...escala.excecoes.map((dia) =>
      [
        dia.diaCiclo,
        dia.entrada,
        dia.saida,
        dia.intrajornadaMinutos,
        dia.marcacoesEsperadas,
        dia.horasExtrasMinutos,
      ].join(","),
    ),
  ].join("|");

  return (
    <form key={assinatura} action={formAction} className="space-y-6">
      <input type="hidden" name="escalaId" value={escala.id} />

      {/* Cabecalho so no desktop; no mobile cada campo carrega o proprio rotulo. */}
      <div className="text-muted-foreground hidden gap-2 text-xs font-medium md:grid md:grid-cols-[4rem_repeat(5,minmax(0,1fr))]">
        <span>Dia</span>
        <span>Entrada</span>
        <span>Saida</span>
        <span>Intervalo</span>
        <span>Marcacoes</span>
        <span>Extras</span>
      </div>

      <div className="space-y-6 md:space-y-3">
        {dias.map(({ diaCiclo, jornada, ajustado }) => {
          const erros = estado.erros?.[diaCiclo];
          const campo = (nome: string) => `dia-${diaCiclo}-${nome}`;

          return (
            <div key={diaCiclo} className="space-y-2">
              <div className="grid gap-3 md:grid-cols-[4rem_repeat(5,minmax(0,1fr))] md:items-center md:gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  Dia {diaCiclo}
                  {ajustado ? (
                    <Badge variant="outline" className="md:hidden">
                      Ajustado
                    </Badge>
                  ) : null}
                </div>

                <Campo
                  nome={campo("entrada")}
                  rotulo="Entrada"
                  diaCiclo={diaCiclo}
                  tipo="time"
                  valor={jornada.entrada}
                  invalido={Boolean(erros?.entrada)}
                />
                <Campo
                  nome={campo("saida")}
                  rotulo="Saida"
                  diaCiclo={diaCiclo}
                  tipo="time"
                  valor={jornada.saida}
                  invalido={Boolean(erros?.saida)}
                />
                <Campo
                  nome={campo("intrajornadaMinutos")}
                  rotulo="Intervalo (min)"
                  diaCiclo={diaCiclo}
                  tipo="number"
                  valor={String(jornada.intrajornadaMinutos)}
                  invalido={Boolean(erros?.intrajornadaMinutos)}
                />
                <Campo
                  nome={campo("marcacoesEsperadas")}
                  rotulo="Marcacoes"
                  diaCiclo={diaCiclo}
                  tipo="number"
                  valor={String(jornada.marcacoesEsperadas)}
                  invalido={Boolean(erros?.marcacoesEsperadas)}
                />
                <Campo
                  nome={campo("horasExtrasMinutos")}
                  rotulo="Extras (min)"
                  diaCiclo={diaCiclo}
                  tipo="number"
                  valor={String(jornada.horasExtrasMinutos)}
                  invalido={Boolean(erros?.horasExtrasMinutos)}
                />
              </div>

              {erros ? (
                <p className="text-destructive text-sm">{Object.values(erros)[0]?.[0]}</p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {ajustado
                    ? `Ajustado: ${jornada.entrada} as ${jornada.saida}, ${formatarDuracao(
                        jornadaLiquidaEmMinutos(
                          jornada.entrada,
                          jornada.saida,
                          jornada.intrajornadaMinutos,
                        ),
                      )} de jornada.`
                    : "Segue o padrao da escala."}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Salvando..." : "Salvar dias do ciclo"}
      </Button>
    </form>
  );
}

/**
 * Uma celula da grade. O rotulo fica visivel no mobile (onde os campos
 * empilham) e vira `sr-only` no desktop, onde o cabecalho da grade ja nomeia a
 * coluna — o leitor de tela continua ouvindo de qual campo se trata.
 */
function Campo({
  nome,
  rotulo,
  diaCiclo,
  tipo,
  valor,
  invalido,
}: {
  nome: string;
  rotulo: string;
  diaCiclo: number;
  tipo: "time" | "number";
  valor: string;
  invalido: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={nome} className="text-muted-foreground text-xs md:sr-only">
        {rotulo} <span className="sr-only">do dia {diaCiclo}</span>
      </Label>
      <Input
        id={nome}
        name={nome}
        type={tipo}
        inputMode={tipo === "number" ? "numeric" : undefined}
        min={tipo === "number" ? 0 : undefined}
        defaultValue={valor}
        aria-invalid={invalido}
      />
    </div>
  );
}
