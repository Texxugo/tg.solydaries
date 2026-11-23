"use client";

import { CopyPlus, LoaderCircle, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { confirmarRascunho } from "@/features/efetivos/actions";
import { AvisoDeConflito } from "@/features/efetivos/components/aviso-de-conflito";
import { montarRascunhoDaEquipe } from "@/features/efetivos/rascunho";
import {
  estadoInicialLancamento,
  type ItemDoRascunho,
  type LancamentoState,
  type RascunhoDaEquipe,
} from "@/features/efetivos/types";
import { cn } from "@/lib/utils";

type Rascunho = Extract<RascunhoDaEquipe, { ok: true }>;

/**
 * O botao "Copiar da mesma equipe (D-2)" e o rascunho que ele abre.
 *
 * Nada e gravado ao copiar: o rascunho aparece aqui, com uma caixa por pessoa,
 * e so "Confirmar" lanca. Quem ja esta lancado hoje vem desmarcado, e quem foi
 * desativado vem bloqueado. Depois de confirmar, cada linha se corrige na lista
 * como qualquer outra.
 *
 * Vive fora do `<form>` do lancamento: e outro envio, e um `<form>` dentro do
 * outro nao existe em HTML.
 */
export function CopiarD2({
  data,
  postoId,
  aoConcluir,
}: {
  data: string;
  postoId: string;
  /** Depois de confirmar ou descartar: o foco volta para o lancamento. */
  aoConcluir: () => void;
}) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [conflitos, setConflitos] = useState<string[] | null>(null);
  const [montando, iniciarMontagem] = useTransition();
  const [, iniciarConfirmacao] = useTransition();

  function copiar() {
    iniciarMontagem(async () => {
      const resposta = await montarRascunhoDaEquipe(data, postoId);

      if (!resposta.ok) {
        toast.warning(resposta.mensagem);
        return;
      }

      setRascunho(resposta);
      setMarcados(
        new Set(
          resposta.itens
            .filter((item) => !item.jaLancada && !item.bloqueio)
            .map((item) => item.chave),
        ),
      );
    });
  }

  function descartar() {
    setConflitos(null);
    setRascunho(null);
    setMarcados(new Set());
    aoConcluir();
  }

  const [, confirmar, confirmando] = useActionState(
    async (anterior: LancamentoState, formData: FormData) => {
      const resultado = await confirmarRascunho(anterior, formData);

      if (resultado.status === "success") {
        toast.success(resultado.mensagem);
        setConflitos(null);
        setRascunho(null);
        setMarcados(new Set());
        aoConcluir();
      } else if (resultado.conflitos) {
        setConflitos(resultado.conflitos);
      } else {
        toast.error(resultado.mensagem);
      }

      return resultado;
    },
    estadoInicialLancamento,
  );

  function aoConfirmar(apesarDoConflito = false) {
    if (!rascunho) {
      return;
    }

    const itens = rascunho.itens
      .filter((item) => marcados.has(item.chave))
      .map((item) => ({
        pessoa: item.pessoa,
        localId: item.localId,
        entrada: item.entrada,
        saida: item.saida,
      }));

    const formData = new FormData();
    formData.set("data", data);
    formData.set("postoId", postoId);
    formData.set("itens", JSON.stringify(itens));

    if (apesarDoConflito) {
      formData.set("confirmarConflito", "1");
    }

    setConflitos(null);

    iniciarConfirmacao(() => confirmar(formData));
  }

  function alternar(item: ItemDoRascunho, marcado: boolean) {
    setMarcados((atuais) => {
      const proximos = new Set(atuais);

      if (marcado) {
        proximos.add(item.chave);
      } else {
        proximos.delete(item.chave);
      }

      return proximos;
    });
  }

  if (!rascunho) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={copiar} disabled={montando}>
          {montando ? <LoaderCircle className="animate-spin" /> : <CopyPlus aria-hidden />}
          Copiar da mesma equipe (D-2)
        </Button>
      </div>
    );
  }

  const quantos = marcados.size;
  const origem = `${diaDaSemana(rascunho.dataOrigem)} ${formatarData(rascunho.dataOrigem)}`;

  return (
    <section
      aria-labelledby="rascunho-d2"
      className="w-0 min-w-full space-y-3 rounded-xl border border-dashed p-4"
      onKeyDown={(evento) => {
        if (evento.key === "Escape") {
          descartar();
        }
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rascunho-d2" className="font-medium">
          Rascunho: equipe de {origem}
        </h2>
        <p className="text-muted-foreground text-sm">Nada e gravado sem confirmar.</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">Lancar</span>
            </TableHead>
            <TableHead>Funcionario</TableHead>
            <TableHead>Local</TableHead>
            <TableHead>Horario</TableHead>
            <TableHead>Observacao</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rascunho.itens.map((item) => {
            const id = `rascunho-${item.chave}`;
            const marcado = marcados.has(item.chave);

            return (
              <TableRow key={item.chave} className={cn(!marcado && "text-muted-foreground")}>
                <TableCell>
                  <Checkbox
                    id={id}
                    checked={marcado}
                    disabled={Boolean(item.bloqueio)}
                    onCheckedChange={(valor) => alternar(item, valor === true)}
                  />
                </TableCell>
                <TableCell>
                  <label htmlFor={id} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{item.nome}</span>
                    {item.freelancer ? <Badge variant="secondary">freelancer</Badge> : null}
                  </label>
                </TableCell>
                <TableCell>{item.local}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {item.entrada} – {item.saida}
                  {item.viraODia ? (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                      vira o dia
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs">
                  {item.bloqueio ? (
                    <span className="text-destructive">{item.bloqueio}</span>
                  ) : item.jaLancada ? (
                    "Ja lancado hoje neste posto"
                  ) : (
                    (item.nota ?? null)
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {rascunho.ignorados.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          Nao copiados (estavam por excecao):{" "}
          {rascunho.ignorados.map((item) => `${item.nome} (${item.tipo})`).join(", ")}.
        </p>
      ) : null}

      {conflitos ? (
        <AvisoDeConflito
          conflitos={conflitos}
          aoConfirmar={() => aoConfirmar(true)}
          aoCorrigir={() => setConflitos(null)}
          enviando={confirmando}
          rotuloConfirmar="Confirmar mesmo assim"
        />
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={descartar}>
          <X aria-hidden />
          Descartar
        </Button>
        {/* `autoFocus`: o botao nasce junto com o rascunho, pronto para o Enter
            de quem conferiu. */}
        <Button
          type="button"
          autoFocus
          onClick={() => aoConfirmar()}
          disabled={confirmando || quantos === 0}
        >
          {confirmando ? <LoaderCircle className="animate-spin" /> : <CopyPlus aria-hidden />}
          {quantos === 0
            ? "Nenhuma pessoa marcada"
            : `Confirmar ${quantos} ${quantos === 1 ? "lancamento" : "lancamentos"}`}
        </Button>
      </div>
    </section>
  );
}
