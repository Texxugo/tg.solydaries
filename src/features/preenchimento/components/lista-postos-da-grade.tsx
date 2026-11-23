import { MapPinOff } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PostoDaGrade } from "@/features/postos/types";
import { ROTA_PREENCHIMENTO } from "@/features/preenchimento/types";

/**
 * Os postos que a grade pode abrir — **so os postos**.
 *
 * As funcoes aparecem como etiquetas, e nao como links: a escala de um lugar se
 * le inteira, e um menu por turno obrigaria a abrir quatro telas para conferir
 * uma portaria. Cada posto e uma grade so, com as funcoes separadas dentro
 * dela.
 *
 * Server Component: so exibe.
 */
export function ListaPostosDaGrade({ postos }: { postos: readonly PostoDaGrade[] }) {
  if (postos.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          <MapPinOff className="size-6" aria-hidden />
          <p>
            Nenhum posto para montar. A grade abre um posto por vez, com as funcoes dele dentro —
            cadastre um posto e ao menos uma funcao para comecar.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/postos/novo">Cadastrar posto</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {postos.map((posto) => (
        <li key={posto.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="text-muted-foreground font-mono text-xs">{posto.codigo}</span>
              {posto.nome}
              <Badge variant={posto.pessoas > 0 ? "secondary" : "ghost"}>
                {posto.pessoas} {posto.pessoas === 1 ? "pessoa" : "pessoas"}
              </Badge>
            </p>
            <div className="flex flex-wrap gap-1">
              {posto.funcoes.map((funcao) => (
                <Badge key={funcao.id} variant="outline">
                  {funcao.nome}
                  {funcao.rotuloDoCiclo ? (
                    <span className="text-muted-foreground">{funcao.rotuloDoCiclo}</span>
                  ) : null}
                </Badge>
              ))}
            </div>
          </div>

          <Button asChild size="sm" variant="secondary">
            <Link href={`${ROTA_PREENCHIMENTO}/${posto.id}`}>Abrir grade</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
