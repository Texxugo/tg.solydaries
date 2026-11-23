"use client";

import { Eraser, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { limparApontamentosDaCompetencia } from "@/features/apontamentos/actions";
import { estadoInicialLimparApontamento } from "@/features/apontamentos/types";

/**
 * Apaga todos os apontamentos da competencia, depois de uma confirmacao.
 *
 * O botao so abre o modal; quem apaga e o "Limpar N apontamentos" de dentro
 * dele. O modal **nao** fecha no clique, ao contrario do dia da grade: um
 * `<form>` desmontado no meio do envio nao chega a Server Action, e aqui nao ha
 * celula otimista que justifique fechar antes. Ele fecha quando a resposta
 * volta com sucesso — por isso o fechamento mora no callback do
 * `useActionState`, e nao num efeito que espia o estado.
 *
 * O numero viaja no formulario (`quantidade`) e a action recusa se a
 * competencia tiver outro: a confirmacao vale para o que a pessoa leu.
 */
export function LimparCompetencia({
  competenciaId,
  competencia,
  apontados,
  emConsulta,
}: {
  competenciaId: string;
  /** O nome da competencia, como o titulo da tela o mostra (Agosto/2026). */
  competencia: string;
  /** Quantos apontamentos a competencia tem — o que vai ser apagado. */
  apontados: number;
  /** Consulta de competencia encerrada: o aviso diz que e ela, e nao a aberta. */
  emConsulta: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  const [, formAction, pendente] = useActionState(
    async (anterior: typeof estadoInicialLimparApontamento, dados: FormData) => {
      const resposta = await limparApontamentosDaCompetencia(anterior, dados);

      if (resposta.status === "success") {
        toast.success(resposta.mensagem);
        setAberto(false);
      } else {
        toast.error(resposta.mensagem);
      }

      return resposta;
    },
    estadoInicialLimparApontamento,
  );

  const rotulo = apontados === 1 ? "1 apontamento" : `${apontados} apontamentos`;

  return (
    <Dialog
      open={aberto}
      // Durante o envio o modal fica: fechar desmontaria o formulario.
      onOpenChange={(proximo) => {
        if (!pendente) {
          setAberto(proximo);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={apontados === 0}>
          <Eraser aria-hidden />
          Limpar competencia
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={!pendente}>
        <DialogHeader>
          <DialogTitle>Limpar os apontamentos de {competencia}?</DialogTitle>
          <DialogDescription>
            {rotulo} {apontados === 1 ? "sera apagado" : "serao apagados"}
            {emConsulta ? " desta competencia em consulta" : ""}, de todas as empresas, mesmo com a
            lista filtrada. Nao ha como desfazer.
          </DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Regras, grade e ponto continuam como estao: depois, &quot;Gerar pelas regras&quot; refaz o
          lote.
        </p>

        <form action={formAction}>
          <input type="hidden" name="competenciaId" value={competenciaId} />
          <input type="hidden" name="quantidade" value={apontados} />

          <DialogFooter className="justify-end">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pendente}>
                Cancelar
              </Button>
            </DialogClose>

            <Button type="submit" variant="destructive" disabled={pendente}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <Eraser aria-hidden />}
              {pendente ? "Limpando..." : `Limpar ${rotulo}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
