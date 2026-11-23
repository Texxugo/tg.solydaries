"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { atualizarExtra, excluirExtra } from "@/features/extras/actions";
import { CamposExtra } from "@/features/extras/components/campos-extra";
import {
  estadoInicialAtualizarExtra,
  estadoInicialExcluirExtra,
  type ColaboradorDisponivel,
  type ExtraResumo,
} from "@/features/extras/types";
import type { PostoParaEscolha } from "@/features/postos/types";

/**
 * Edicao de um extra ja registrado, com a exclusao ao lado.
 *
 * Aqui a exclusao existe — ao contrario de escalas, postos e eventos — pela
 * mesma razao da do afastamento: o extra e uma **entrada**, e nao um fato ja
 * interpretado. Lancar a pessoa errada e engano de digitacao, e enquanto a
 * linha existir ela continua somando horas que ninguem fez.
 */
export function EditarExtraForm({
  extra,
  colaboradores,
  postos,
  periodo,
}: {
  extra: ExtraResumo;
  colaboradores: readonly ColaboradorDisponivel[];
  postos: readonly PostoParaEscolha[];
  periodo: { inicio: string; fim: string };
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarExtra,
    estadoInicialAtualizarExtra,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  /**
   * Os campos sao nao controlados: mudar `defaultValue` nao mexe em um campo ja
   * montado, e depois do `refresh()` da action o formulario ficaria exibindo o
   * estado anterior mesmo com a gravacao concluida. A chave derivada dos dados
   * do servidor remonta o formulario quando (e so quando) eles mudam.
   */
  const assinatura = [
    extra.data,
    extra.colaborador.valor,
    extra.postoId,
    extra.local,
    extra.horaEntrada,
    extra.horaSaida,
    extra.observacao,
  ].join("|");

  return (
    <div className="space-y-6">
      <form key={assinatura} action={formAction} className="space-y-6">
        <input type="hidden" name="extraId" value={extra.id} />

        <CamposExtra
          colaboradores={colaboradores}
          postos={postos}
          periodo={periodo}
          valores={{
            data: extra.data,
            colaborador: extra.colaborador.valor,
            // O campo de freelancer novo abre vazio: quem ja esta gravado vem
            // pela lista, e repetir o nome aqui seria dizer as duas coisas.
            freelancerNome: "",
            postoId: extra.postoId,
            local: extra.local,
            horaEntrada: extra.horaEntrada,
            horaSaida: extra.horaSaida,
            observacao: extra.observacao ?? "",
          }}
          erros={estado.erros}
        />

        {estado.status === "error" && !estado.erros ? (
          <p role="alert" className="text-destructive text-sm">
            {estado.mensagem}
          </p>
        ) : null}

        <Button type="submit" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : null}
          {pendente ? "Salvando..." : "Salvar alteracoes"}
        </Button>
      </form>

      <Separator />

      <ExcluirExtra extra={extra} />
    </div>
  );
}

/**
 * Formulario proprio, e nao um botao dentro do de cima: dois `<form>` aninhados
 * nao existem em HTML, e o de cima e o de salvar. Mesmo arranjo do botao de
 * remover afastamento.
 */
function ExcluirExtra({ extra }: { extra: ExtraResumo }) {
  const [estado, formAction, pendente] = useActionState(excluirExtra, estadoInicialExcluirExtra);

  // So o erro chega aqui: a exclusao bem-sucedida termina em `redirect()`
  // dentro da action, porque a tela aberta e a do extra que deixou de existir —
  // recarrega-la no lugar mostraria o 404 dele.
  useEffect(() => {
    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="extraId" value={extra.id} />

      <Button type="submit" variant="destructive" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Trash2 aria-hidden />}
        {pendente ? "Excluindo..." : "Excluir extra"}
      </Button>
    </form>
  );
}
