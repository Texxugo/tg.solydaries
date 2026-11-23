"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CampoCiclo } from "@/features/escalas/components/campo-ciclo";
import type { ErrosDaEscala, ValoresDaEscala } from "@/features/escalas/types";

/**
 * Os campos que descrevem a jornada, compartilhados pelo cadastro e pela
 * edicao: as duas telas descrevem a mesma escala, e o que muda entre elas
 * (situacao, id, botao) fica no formulario que envolve estes campos.
 *
 * Campos nao controlados (`defaultValue`), como no resto do portal — quem
 * remonta o formulario depois de uma gravacao e a `key` do lado de fora.
 */
export function CamposEscala({
  valores,
  erros,
}: {
  valores?: Partial<ValoresDaEscala>;
  erros?: ErrosDaEscala;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={valores?.nome}
          placeholder="12x36 Diurno"
          aria-invalid={Boolean(erros?.nome)}
          aria-describedby={erros?.nome ? "nome-erro" : undefined}
        />
        {erros?.nome ? (
          <p id="nome-erro" className="text-destructive text-sm">
            {erros.nome[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="descricao">Descricao</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={2}
          defaultValue={valores?.descricao}
          placeholder="Opcional: onde esta escala e usada, o que ela tem de particular."
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
          <Label htmlFor="entrada">Entrada</Label>
          <Input
            id="entrada"
            name="entrada"
            type="time"
            defaultValue={valores?.entrada}
            aria-invalid={Boolean(erros?.entrada)}
            aria-describedby={erros?.entrada ? "entrada-erro" : undefined}
          />
          {erros?.entrada ? (
            <p id="entrada-erro" className="text-destructive text-sm">
              {erros.entrada[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="saida">Saida</Label>
          <Input
            id="saida"
            name="saida"
            type="time"
            defaultValue={valores?.saida}
            aria-invalid={Boolean(erros?.saida)}
            aria-describedby={erros?.saida ? "saida-erro" : "saida-ajuda"}
          />
          {erros?.saida ? (
            <p id="saida-erro" className="text-destructive text-sm">
              {erros.saida[0]}
            </p>
          ) : (
            <p id="saida-ajuda" className="text-muted-foreground text-sm">
              Saida anterior a entrada marca a virada de turno: 22:00 as 06:00 termina no dia
              seguinte.
            </p>
          )}
        </div>
      </div>

      <Separator />

      <CampoCiclo valores={valores} erros={erros} />

      <Separator />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="intrajornadaMinutos">Intrajornada (min)</Label>
          <Input
            id="intrajornadaMinutos"
            name="intrajornadaMinutos"
            type="number"
            inputMode="numeric"
            min={0}
            max={720}
            step={5}
            defaultValue={valores?.intrajornadaMinutos ?? "60"}
            aria-invalid={Boolean(erros?.intrajornadaMinutos)}
            aria-describedby={
              erros?.intrajornadaMinutos ? "intrajornadaMinutos-erro" : "intrajornadaMinutos-ajuda"
            }
          />
          {erros?.intrajornadaMinutos ? (
            <p id="intrajornadaMinutos-erro" className="text-destructive text-sm">
              {erros.intrajornadaMinutos[0]}
            </p>
          ) : (
            <p id="intrajornadaMinutos-ajuda" className="text-muted-foreground text-sm">
              Descontada da jornada. Use 0 para jornada corrida.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="marcacoesEsperadas">Marcacoes por dia</Label>
          <Input
            id="marcacoesEsperadas"
            name="marcacoesEsperadas"
            type="number"
            inputMode="numeric"
            min={2}
            max={8}
            step={2}
            defaultValue={valores?.marcacoesEsperadas ?? "4"}
            aria-invalid={Boolean(erros?.marcacoesEsperadas)}
            aria-describedby={
              erros?.marcacoesEsperadas ? "marcacoesEsperadas-erro" : "marcacoesEsperadas-ajuda"
            }
          />
          {erros?.marcacoesEsperadas ? (
            <p id="marcacoesEsperadas-erro" className="text-destructive text-sm">
              {erros.marcacoesEsperadas[0]}
            </p>
          ) : (
            <p id="marcacoesEsperadas-ajuda" className="text-muted-foreground text-sm">
              Sempre par: 2 na jornada corrida, 4 quando o intervalo e marcado.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="horasExtrasMinutos">Extras previstas (min)</Label>
          <Input
            id="horasExtrasMinutos"
            name="horasExtrasMinutos"
            type="number"
            inputMode="numeric"
            min={0}
            max={720}
            step={5}
            defaultValue={valores?.horasExtrasMinutos ?? "0"}
            aria-invalid={Boolean(erros?.horasExtrasMinutos)}
            aria-describedby={
              erros?.horasExtrasMinutos ? "horasExtrasMinutos-erro" : "horasExtrasMinutos-ajuda"
            }
          />
          {erros?.horasExtrasMinutos ? (
            <p id="horasExtrasMinutos-erro" className="text-destructive text-sm">
              {erros.horasExtrasMinutos[0]}
            </p>
          ) : (
            <p id="horasExtrasMinutos-ajuda" className="text-muted-foreground text-sm">
              Hora extra ja combinada, por dia trabalhado. Use 0 quando nao houver.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
