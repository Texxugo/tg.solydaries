"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * A mesma pessoa em outro lugar no mesmo horario: nada foi gravado, e a tela
 * pede a decisao. "Lancar mesmo assim" vem com o foco — a dobra legitima e um
 * Enter; o engano e Esc ou "Corrigir".
 */
export function AvisoDeConflito({
  conflitos,
  aoConfirmar,
  aoCorrigir,
  enviando,
  rotuloConfirmar = "Lancar mesmo assim",
}: {
  conflitos: string[];
  aoConfirmar: () => void;
  aoCorrigir: () => void;
  enviando: boolean;
  rotuloConfirmar?: string;
}) {
  const botao = useRef<HTMLButtonElement>(null);

  // Foco explicito, e nao `autoFocus`: o aviso nasce dentro da resposta da
  // action, com o envio ainda pendente e o botao `disabled` — e botao
  // desabilitado nao recebe foco. Foca quando o envio termina.
  useEffect(() => {
    if (!enviando) {
      botao.current?.focus();
    }
  }, [conflitos, enviando]);

  return (
    <Alert
      variant="destructive"
      onKeyDown={(evento) => {
        if (evento.key === "Escape") {
          evento.stopPropagation();
          aoCorrigir();
        }
      }}
    >
      <TriangleAlert aria-hidden />
      <AlertTitle>Conflito de horario — nada foi gravado</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {conflitos.map((conflito) => (
            <li key={conflito}>{conflito}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            ref={botao}
            variant="destructive"
            disabled={enviando}
            onClick={aoConfirmar}
          >
            {rotuloConfirmar}
          </Button>
          <Button type="button" variant="outline" onClick={aoCorrigir}>
            Corrigir
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
