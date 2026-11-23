"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CORES_EVENTO, NATUREZAS_EVENTO, classesDaCor } from "@/features/eventos/cores";
import type { ErrosDoEvento, ValoresDoEvento } from "@/features/eventos/types";
import { cn } from "@/lib/utils";

/**
 * Os campos que descrevem um evento, compartilhados pelo cadastro e pela
 * edicao: as duas telas descrevem a mesma coisa, e o que muda entre elas
 * (situacao, id, botao) fica no formulario que envolve estes campos.
 *
 * Campos nao controlados (`defaultValue`), como no resto do portal — quem
 * remonta o formulario depois de uma gravacao e a `key` do lado de fora.
 */
export function CamposEvento({
  valores,
  erros,
}: {
  valores?: Partial<ValoresDoEvento>;
  erros?: ErrosDoEvento;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="codigo">Sigla</Label>
          <Input
            id="codigo"
            name="codigo"
            defaultValue={valores?.codigo}
            placeholder="D"
            maxLength={6}
            className="font-mono uppercase"
            aria-invalid={Boolean(erros?.codigo)}
            aria-describedby={erros?.codigo ? "codigo-erro" : "codigo-ajuda"}
          />
          {erros?.codigo ? (
            <p id="codigo-erro" className="text-destructive text-sm">
              {erros.codigo[0]}
            </p>
          ) : (
            <p id="codigo-ajuda" className="text-muted-foreground text-sm">
              O que se digita na celula.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="rotulo">Nome</Label>
          <Input
            id="rotulo"
            name="rotulo"
            defaultValue={valores?.rotulo}
            placeholder="Diurno"
            aria-invalid={Boolean(erros?.rotulo)}
            aria-describedby={erros?.rotulo ? "rotulo-erro" : undefined}
          />
          {erros?.rotulo ? (
            <p id="rotulo-erro" className="text-destructive text-sm">
              {erros.rotulo[0]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="descricao">Descricao</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={2}
          defaultValue={valores?.descricao}
          placeholder="Opcional: quando usar esta sigla."
          aria-invalid={Boolean(erros?.descricao)}
          aria-describedby={erros?.descricao ? "descricao-erro" : undefined}
        />
        {erros?.descricao ? (
          <p id="descricao-erro" className="text-destructive text-sm">
            {erros.descricao[0]}
          </p>
        ) : null}
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="natureza">Natureza</Label>
          {/* `<select>` nativo, e nao o menu do Radix: e o campo de um
              formulario que funciona por progressive enhancement. */}
          <NativeSelect
            id="natureza"
            name="natureza"
            defaultValue={valores?.natureza ?? ""}
            aria-invalid={Boolean(erros?.natureza)}
            aria-describedby={erros?.natureza ? "natureza-erro" : "natureza-ajuda"}
          >
            <option value="" disabled>
              Selecione
            </option>
            {NATUREZAS_EVENTO.map((natureza) => (
              <option key={natureza.id} value={natureza.id}>
                {natureza.rotulo}
              </option>
            ))}
          </NativeSelect>
          {erros?.natureza ? (
            <p id="natureza-erro" className="text-destructive text-sm">
              {erros.natureza[0]}
            </p>
          ) : (
            <p id="natureza-ajuda" className="text-muted-foreground text-sm">
              E o que decide em qual coluna do rodape o dia sera somado.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cor">Cor da celula</Label>
          <NativeSelect
            id="cor"
            name="cor"
            defaultValue={valores?.cor ?? "cinza"}
            aria-invalid={Boolean(erros?.cor)}
            aria-describedby={erros?.cor ? "cor-erro" : "cor-amostra"}
          >
            {CORES_EVENTO.map((cor) => (
              <option key={cor.id} value={cor.id}>
                {cor.rotulo}
              </option>
            ))}
          </NativeSelect>
          {erros?.cor ? (
            <p id="cor-erro" className="text-destructive text-sm">
              {erros.cor[0]}
            </p>
          ) : (
            <div id="cor-amostra" className="flex flex-wrap gap-1">
              {CORES_EVENTO.map((cor) => (
                <span
                  key={cor.id}
                  title={cor.rotulo}
                  className={cn("rounded-sm px-1.5 py-0.5 font-mono text-xs", classesDaCor(cor.id))}
                >
                  {valores?.codigo ? valores.codigo.slice(0, 3).toUpperCase() : "D"}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Checkbox
            id="exigeHorario"
            name="exigeHorario"
            defaultChecked={valores?.exigeHorario}
            value="1"
          />
          <div className="space-y-1">
            <Label htmlFor="exigeHorario">Pede horario na celula</Label>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="exigePessoa"
            name="exigePessoa"
            defaultChecked={valores?.exigePessoa}
            value="1"
          />
          <div className="space-y-1">
            <Label htmlFor="exigePessoa">Nomeia outra pessoa</Label>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="exigeDestino"
            name="exigeDestino"
            defaultChecked={valores?.exigeDestino}
            value="1"
          />
          <div className="space-y-1">
            <Label htmlFor="exigeDestino">Nomeia outro posto</Label>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="exigeDiaTrabalhado"
            name="exigeDiaTrabalhado"
            defaultChecked={valores?.exigeDiaTrabalhado}
            value="1"
          />
          <div className="space-y-1">
            <Label htmlFor="exigeDiaTrabalhado">Pede o dia trabalhado</Label>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox id="padrao" name="padrao" defaultChecked={valores?.padrao} value="1" />
          <div className="space-y-1">
            <Label htmlFor="padrao">Usar como padrao desta natureza</Label>
            <p className="text-muted-foreground text-sm">
              So um por natureza: marcar aqui desmarca o anterior.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
