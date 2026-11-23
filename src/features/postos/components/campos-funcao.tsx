"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { EventoDaGrade } from "@/features/eventos/types";
import type { ErrosDaFuncao, ValoresDaFuncao } from "@/features/postos/types";

/**
 * Os campos de uma funcao de posto. Recebem `prefixo` porque a tela desenha
 * varios destes formularios lado a lado — um por funcao ja cadastrada, mais o
 * da funcao nova —, e `id` repetido faria o `<label>` apontar para o campo de
 * outra linha.
 *
 * O ciclo **nao** esta aqui: ele mudou de forma. Uma funcao tem escala e
 * contraescala, e cada uma muda de configuracao ao longo do tempo, entao o
 * contrato virou uma lista de vigencias com formulario proprio
 * (`VigenciasDaFuncao`), logo abaixo destes campos.
 *
 * Campos nao controlados, como no resto do portal.
 */
export function CamposFuncao({
  prefixo,
  eventosDeTrabalho,
  valores,
  erros,
}: {
  prefixo: string;
  /** So os de natureza `trabalho`: e o evento que marca "cobriu o posto". */
  eventosDeTrabalho: readonly EventoDaGrade[];
  valores?: Partial<ValoresDaFuncao>;
  erros?: ErrosDaFuncao;
}) {
  const id = (campo: string) => `${prefixo}-${campo}`;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={id("nome")}>Funcao</Label>
        <Input
          id={id("nome")}
          name="nome"
          defaultValue={valores?.nome}
          placeholder="Portaria remota"
          aria-invalid={Boolean(erros?.nome)}
          aria-describedby={erros?.nome ? id("nome-erro") : undefined}
        />
        {erros?.nome ? (
          <p id={id("nome-erro")} className="text-destructive text-sm">
            {erros.nome[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={id("eventoTrabalhoId")}>Evento de trabalho</Label>
        <NativeSelect
          id={id("eventoTrabalhoId")}
          name="eventoTrabalhoId"
          defaultValue={valores?.eventoTrabalhoId ?? ""}
          aria-invalid={Boolean(erros?.eventoTrabalhoId)}
          aria-describedby={
            erros?.eventoTrabalhoId ? id("eventoTrabalhoId-erro") : id("eventoTrabalhoId-ajuda")
          }
        >
          <option value="">Usar o evento padrao</option>
          {eventosDeTrabalho.map((evento) => (
            <option key={evento.id} value={evento.id}>
              {evento.codigo} — {evento.rotulo}
            </option>
          ))}
        </NativeSelect>
        {erros?.eventoTrabalhoId ? (
          <p id={id("eventoTrabalhoId-erro")} className="text-destructive text-sm">
            {erros.eventoTrabalhoId[0]}
          </p>
        ) : (
          <p id={id("eventoTrabalhoId-ajuda")} className="text-muted-foreground text-sm">
            A sigla que o previsto escreve nos dias de trabalho desta faixa — D num turno diurno, N
            num noturno.
          </p>
        )}
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={id("observacao")}>Observacao do bloco</Label>
        <Input
          id={id("observacao")}
          name="observacao"
          defaultValue={valores?.observacao}
          placeholder="Seg a qui 07:00 as 17:00 | sex folga"
          aria-invalid={Boolean(erros?.observacao)}
          aria-describedby={erros?.observacao ? id("observacao-erro") : undefined}
        />
        {erros?.observacao ? (
          <p id={id("observacao-erro")} className="text-destructive text-sm">
            {erros.observacao[0]}
          </p>
        ) : null}
      </div>
    </div>
  );
}
