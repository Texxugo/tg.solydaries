"use client";

import type { AreaPortal } from "@/db/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AREAS_PORTAL } from "@/features/acessos/areas";

/**
 * Grupo de checkboxes com as areas do portal. Todos compartilham o `name`
 * "areas": o FormData chega como lista e a action le com `getAll("areas")`.
 *
 * Nao ha perfis nem cargos — esta selecao e a definicao de acesso do usuario.
 */
export function CampoAreas({
  selecionadas = [],
  obrigatorias = [],
  erro,
}: {
  selecionadas?: readonly AreaPortal[];
  /** Areas que nao podem ser desmarcadas nesta tela (ver `EditarUsuarioForm`). */
  obrigatorias?: readonly AreaPortal[];
  erro?: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Areas liberadas</legend>

      <div className="space-y-3">
        {AREAS_PORTAL.map((area) => {
          const id = `area-${area.id}`;
          const obrigatoria = obrigatorias.includes(area.id);

          return (
            <div key={area.id} className="flex items-start gap-3">
              <Checkbox
                id={id}
                name="areas"
                value={area.id}
                defaultChecked={obrigatoria || selecionadas.includes(area.id)}
                disabled={obrigatoria}
                className="mt-0.5"
                aria-describedby={`${id}-descricao`}
              />
              {/* Checkbox desabilitado nao vai no FormData. */}
              {obrigatoria ? <input type="hidden" name="areas" value={area.id} /> : null}
              <div className="space-y-0.5">
                <Label htmlFor={id}>{area.rotulo}</Label>
                <p id={`${id}-descricao`} className="text-muted-foreground text-sm">
                  {area.descricao}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {erro ? <p className="text-destructive text-sm">{erro}</p> : null}
    </fieldset>
  );
}
