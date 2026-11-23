"use client";

import { LoaderCircle, Pencil, Trash2, UserCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarInstante } from "@/features/apontamentos/components/formatar-instante";
import { excluirLancamento } from "@/features/efetivos/actions";
import {
  estadoInicialLancamento,
  type ExcecaoDoLancamento,
  type LancamentoDoDia,
  type LancamentoState,
} from "@/features/efetivos/types";
import { formatarDuracao } from "@/features/escalas/jornada";
import { cn } from "@/lib/utils";

/** O que ja foi lancado no posto, no dia — com editar e excluir por linha. */
export function ListaDoDia({
  lancamentos,
  temPosto,
  editandoId,
  aoEditar,
  atualizando,
}: {
  lancamentos: LancamentoDoDia[];
  temPosto: boolean;
  editandoId: string | null;
  aoEditar: (lancamento: LancamentoDoDia) => void;
  /** Trocando de posto ou de dia: a lista ainda e a do anterior. */
  atualizando: boolean;
}) {
  if (!temPosto) {
    return null;
  }

  if (lancamentos.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center text-sm">
        <UserCheck className="size-6" aria-hidden />
        <p>Nenhum lancamento neste posto, neste dia.</p>
      </div>
    );
  }

  return (
    // `w-0 min-w-full`: a tabela rola dentro da secao, e nao alarga a pagina. O
    // `main` do layout e item de flex, e sem isso cresceria ate a largura minima
    // da tabela, empurrando o cabecalho para fora da tela.
    <section
      className={cn("w-0 min-w-full space-y-2 transition-opacity", atualizando && "opacity-50")}
    >
      <h2 className="text-sm font-medium">
        {lancamentos.length} {lancamentos.length === 1 ? "pessoa lancada" : "pessoas lancadas"}
      </h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Funcionario</TableHead>
            <TableHead>Local</TableHead>
            <TableHead>Horario</TableHead>
            <TableHead>Excecao</TableHead>
            <TableHead>Lancado por</TableHead>
            <TableHead className="sr-only">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lancamentos.map((lancamento) => (
            <Linha
              key={lancamento.id}
              lancamento={lancamento}
              editando={lancamento.id === editandoId}
              aoEditar={aoEditar}
            />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Linha({
  lancamento,
  editando,
  aoEditar,
}: {
  lancamento: LancamentoDoDia;
  editando: boolean;
  aoEditar: (lancamento: LancamentoDoDia) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const falta = lancamento.excecao?.comportamento === "falta_sem_cobertura";
  const [, excluir, excluindo] = useActionState(
    async (anterior: LancamentoState, formData: FormData) => {
      const resultado = await excluirLancamento(anterior, formData);

      if (resultado.status === "success") {
        toast.success(resultado.mensagem);
      } else {
        toast.error(resultado.mensagem);
        setConfirmando(false);
      }

      return resultado;
    },
    estadoInicialLancamento,
  );

  return (
    <TableRow
      className={cn(
        // A falta sem cobertura e o posto descoberto: e o que mais importa ver.
        falta && "bg-red-50 dark:bg-red-950/40",
        editando && "bg-accent/50",
      )}
    >
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("font-medium", falta && "line-through decoration-1")}>
            {lancamento.nome}
          </span>
          {lancamento.freelancer ? <Badge variant="secondary">freelancer</Badge> : null}
        </div>
        {lancamento.identificacao ? (
          <span className="text-muted-foreground text-xs">{lancamento.identificacao}</span>
        ) : null}
      </TableCell>
      <TableCell>{lancamento.local}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {lancamento.entrada} – {lancamento.saida}
        <span className="text-muted-foreground ml-2 text-xs">
          {formatarDuracao(lancamento.duracao)}
          {lancamento.viraODia ? (
            <span className="text-amber-700 dark:text-amber-400"> · vira o dia</span>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="max-w-72 text-sm">
        <Excecao excecao={lancamento.excecao} />
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        <span className="block">
          {lancamento.criado.nome ?? "Usuario removido"} ·{" "}
          {formatarInstante(new Date(lancamento.criado.em))}
        </span>
        {lancamento.alterado ? (
          <span className="block">
            editado por {lancamento.alterado.nome} ·{" "}
            {formatarInstante(new Date(lancamento.alterado.em))}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => aoEditar(lancamento)}
            disabled={editando}
          >
            <Pencil aria-hidden />
            Editar
          </Button>

          {/*
            Dois cliques: o primeiro arma, o segundo apaga. O botao e sempre
            `submit` e o primeiro clique cancela o envio — trocar o `type` no
            clique nao serve: o React redesenha o botao como `submit` antes de o
            navegador executar o clique, e o primeiro clique ja apagava.
          */}
          <form action={excluir} onBlur={() => setConfirmando(false)}>
            <input type="hidden" name="id" value={lancamento.id} />
            <Button
              type="submit"
              variant={confirmando ? "destructive" : "ghost"}
              size="sm"
              disabled={excluindo}
              onClick={(evento) => {
                if (!confirmando) {
                  evento.preventDefault();
                  setConfirmando(true);
                }
              }}
            >
              {excluindo ? <LoaderCircle className="animate-spin" /> : <Trash2 aria-hidden />}
              {confirmando ? "Confirmar" : "Excluir"}
            </Button>
          </form>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** O que a excecao diz, numa frase: o tipo e quem (ou de onde) ela envolve. */
function Excecao({ excecao }: { excecao: ExcecaoDoLancamento | null }) {
  if (!excecao) {
    return <span className="text-muted-foreground">—</span>;
  }

  const { comportamento, contraparte, postoOrigem } = excecao;

  const envolve =
    comportamento === "cobertura" && contraparte
      ? `Faltou: ${contraparte.nome}`
      : comportamento === "troca"
        ? [
            contraparte ? `Trocou com ${contraparte.nome}` : null,
            postoOrigem ? `Veio de ${postoOrigem.codigo}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : comportamento === "falta_sem_cobertura"
          ? "Faltou · posto descoberto"
          : null;

  return (
    <div className="space-y-0.5">
      <Badge
        variant={comportamento === "falta_sem_cobertura" ? "destructive" : "secondary"}
        className="whitespace-normal"
      >
        {excecao.tipo}
      </Badge>
      {envolve ? <p className="text-xs">{envolve}</p> : null}
      {excecao.observacao ? (
        <p className="text-muted-foreground text-xs">{excecao.observacao}</p>
      ) : null}
    </div>
  );
}
