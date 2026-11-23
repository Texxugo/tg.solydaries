"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { registrarTratativa } from "@/features/ponto/actions";
import { STATUS_DE_TRATATIVA, descricaoDaTratativa } from "@/features/ponto/tratativas";
import {
  estadoInicialTratativa,
  type ChaveDaOcorrencia,
  type OcorrenciaDetalhada,
} from "@/features/ponto/types";

/**
 * O que foi feito a respeito desta ocorrencia.
 *
 * Formulario proprio, separado do de mensagem, porque sao duas escritas
 * diferentes: aqui se registra uma conclusao, ali se fala com alguem. Um
 * formulario so obrigaria quem quer apenas anotar "conversei por telefone" a
 * passar pela previa de envio — e, pior, um campo que a tela por acaso nao
 * desenhasse chegaria vazio e apagaria o outro lado. E o mesmo arranjo de dados
 * e jornada, em Funcionarios.
 */
export function TratativaForm({
  chave,
  ocorrencia,
}: {
  chave: ChaveDaOcorrencia;
  ocorrencia: OcorrenciaDetalhada;
}) {
  const [estado, formAction, pendente] = useActionState(registrarTratativa, estadoInicialTratativa);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  /**
   * Os campos sao nao controlados: mudar `defaultValue` nao mexe num campo ja
   * montado, e depois do `refresh()` da action o formulario ficaria exibindo o
   * estado anterior mesmo com a gravacao concluida. A chave derivada dos dados
   * do servidor o remonta quando (e so quando) eles mudam.
   */
  const assinatura = [ocorrencia.status, ocorrencia.observacao ?? "", ocorrencia.tratadoEm].join(
    "|",
  );

  return (
    <form key={assinatura} action={formAction} className="space-y-4">
      <input type="hidden" name="funcionarioId" value={chave.funcionarioId} />
      <input type="hidden" name="data" value={chave.data} />
      <input type="hidden" name="tipo" value={chave.tipo} />

      <div className="space-y-2">
        <Label htmlFor="status">Status da tratativa</Label>
        <NativeSelect id="status" name="status" defaultValue={ocorrencia.status}>
          {STATUS_DE_TRATATIVA.map((opcao) => (
            <option key={opcao.status} value={opcao.status}>
              {opcao.rotulo}
            </option>
          ))}
        </NativeSelect>
        <p className="text-muted-foreground text-sm">{descricaoDaTratativa(ocorrencia.status)}</p>
        {estado.erros?.status ? (
          <p className="text-destructive text-sm">{estado.erros.status[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="observacao">O que se apurou</Label>
        <Textarea
          id="observacao"
          name="observacao"
          rows={4}
          defaultValue={ocorrencia.observacao ?? ""}
          placeholder="Falei com o colaborador; ele estava no posto e o relogio nao registrou a saida."
          aria-invalid={Boolean(estado.erros?.observacao)}
          aria-describedby={estado.erros?.observacao ? "observacao-erro" : undefined}
        />
        {/* Obrigatoria so para descartar: um "isto nao era ocorrencia" sem motivo
            escrito e indistinguivel de alguem limpando a fila. */}
        {estado.erros?.observacao ? (
          <p id="observacao-erro" className="text-destructive text-sm">
            {estado.erros.observacao[0]}
          </p>
        ) : null}
      </div>

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Save aria-hidden />}
        Registrar tratativa
      </Button>
    </form>
  );
}
