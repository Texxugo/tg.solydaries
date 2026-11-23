"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { descricaoDoCiclo, rotuloDoCiclo } from "@/features/escalas/jornada";
import type { ErrosDaEscala, ValoresDaEscala } from "@/features/escalas/types";

/**
 * O ciclo de trabalho: quantos dias ate o padrao se repetir e quais deles sao
 * folga.
 *
 * Marcar a posicao da folga (em vez de "N dias de trabalho x M de folga") e o
 * que permite a escala em que a folga anda — o 6x1 que folga domingo numa
 * semana e sabado na outra e um ciclo de 14 dias com folga nos dias 7 e 13.
 * Nenhum par de numeros descreve isso, porque as duas folgas nao sao vizinhas.
 *
 * Os modelos so preenchem os campos: o que vale e o que estiver marcado na
 * grade na hora de enviar. E o unico campo controlado do formulario, porque
 * mudar o tamanho do ciclo precisa acrescentar e tirar dias da grade.
 *
 * A data em que o ciclo comeca a valer nao esta aqui: ela e de cada
 * funcionario, e nao da escala. A mesma 12x36 serve todas as turmas.
 */

/** Os ciclos que o portal ja conhece — atalho, nao lista fechada. */
const MODELOS = [
  { rotulo: "5x2", diasCiclo: 7, folgas: [6, 7] },
  { rotulo: "6x1", diasCiclo: 7, folgas: [7] },
  { rotulo: "6x1 folga alternada", diasCiclo: 14, folgas: [7, 13] },
  { rotulo: "12x36", diasCiclo: 2, folgas: [2] },
] as const;

export function CampoCiclo({
  valores,
  erros,
}: {
  valores?: Partial<ValoresDaEscala>;
  erros?: ErrosDaEscala;
}) {
  const [diasCiclo, setDiasCiclo] = useState(() => Number(valores?.diasCiclo ?? 7) || 7);
  const [folgas, setFolgas] = useState<number[]>(() => [...(valores?.folgas ?? [6, 7])]);

  const dias = Array.from({ length: diasCiclo }, (_, indice) => indice + 1);
  // Folga marcada acima do tamanho atual continua no estado (encurtar e voltar
  // a crescer nao apaga o que a pessoa marcou), mas nao conta no resumo.
  const folgasNoCiclo = folgas.filter((dia) => dia <= diasCiclo).sort((a, b) => a - b);
  const ciclo = { diasCiclo, folgas: folgasNoCiclo };

  function aplicarModelo(modelo: (typeof MODELOS)[number]) {
    setDiasCiclo(modelo.diasCiclo);
    setFolgas([...modelo.folgas]);
  }

  function alternarFolga(dia: number, folga: boolean) {
    setFolgas((atuais) => (folga ? [...atuais, dia] : atuais.filter((marcado) => marcado !== dia)));
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Ciclo de trabalho</legend>

      <div className="flex flex-wrap gap-2">
        {MODELOS.map((modelo) => (
          <Button
            key={modelo.rotulo}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => aplicarModelo(modelo)}
          >
            {modelo.rotulo}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label htmlFor="diasCiclo">Dias do ciclo</Label>
          <Input
            id="diasCiclo"
            name="diasCiclo"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={diasCiclo}
            onChange={(evento) => setDiasCiclo(Number(evento.target.value))}
            aria-invalid={Boolean(erros?.diasCiclo)}
            aria-describedby={erros?.diasCiclo ? "diasCiclo-erro" : undefined}
          />
          {erros?.diasCiclo ? (
            <p id="diasCiclo-erro" className="text-destructive text-sm">
              {erros.diasCiclo[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Dias de folga</span>

          {dias.length === 0 ? (
            <p className="text-muted-foreground text-sm">Informe quantos dias o ciclo tem.</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {dias.map((dia) => {
                const id = `folga-${dia}`;
                const folga = folgasNoCiclo.includes(dia);

                return (
                  <div key={dia} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      name="folgas"
                      value={dia}
                      checked={folga}
                      onCheckedChange={(marcado) => alternarFolga(dia, marcado === true)}
                    />
                    <Label htmlFor={id} className="text-muted-foreground font-normal">
                      {dia}
                    </Label>
                  </div>
                );
              })}
            </div>
          )}

          {erros?.folgas ? (
            <p className="text-destructive text-sm">{erros.folgas[0]}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Ciclo {rotuloDoCiclo(ciclo)}: {descricaoDoCiclo(ciclo)}.
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );
}
