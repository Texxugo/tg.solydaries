"use client";

import { Eraser, LoaderCircle, Pencil, Wand2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { limparApontamento, salvarApontamento } from "@/features/apontamentos/actions";
import {
  PASSOS,
  PreenchimentoDoApontamento,
  type AberturaDoPreenchimento,
} from "@/features/apontamentos/components/preenchimento-do-apontamento";
import type { SugestaoDeApontamento } from "@/features/apontamentos/regras/calculo";
import { rotuloDaRubricaDaRegra } from "@/features/apontamentos/regras/campos";
import {
  APONTAMENTO_VAZIO,
  mesmasRubricas,
  resumoDoApontamento,
  RUBRICAS,
  valorDaRubrica,
  type ApontamentoDaFolha,
  type Rubrica,
} from "@/features/apontamentos/rubricas";
import {
  estadoInicialLimparApontamento,
  estadoInicialSalvarApontamento,
  valoresDoApontamento,
  type ValoresDoApontamento,
} from "@/features/apontamentos/types";
import { cn } from "@/lib/utils";

/**
 * A ficha do apontamento: o que esta gravado, rubrica a rubrica na ordem da
 * folha, e o modal que preenche um campo por vez
 * (`PreenchimentoDoApontamento`).
 *
 * A ficha mostra **todas** as rubricas, e nao so as que tem valor: e a lista do
 * que se confere, e clicar numa linha abre o modal naquele campo. A sugestao
 * das regras continua aqui, e "Usar a sugestao" abre o modal com ela nos
 * campos — ela so e gravada quando alguem salva.
 *
 * O `useActionState` mora aqui, e nao no modal: o modal fecha no sucesso, e
 * quem desmonta nao pode ser quem guarda a resposta (mesma regra da grade).
 */
export function ApontamentoForm({
  funcionarioId,
  nome,
  apontamento,
  diasNoPeriodo,
  competenciaId,
  sugestao,
  referencias,
}: {
  funcionarioId: string;
  nome: string;
  apontamento: ApontamentoDaFolha | null;
  /** Tamanho da competencia: o teto dos campos em dias. */
  diasNoPeriodo: number;
  /** Competencia em que a tela foi desenhada; a action recusa se ela mudou. */
  competenciaId: string;
  /** O que as regras leem da grade desta pessoa. `null` quando nao ha o que sugerir. */
  sugestao: SugestaoDeApontamento | null;
  /** O espelho de ponto dito ao lado de cada campo do modal. */
  referencias: Partial<Record<Rubrica, string[]>>;
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarApontamento,
    estadoInicialSalvarApontamento,
  );

  const gravados = valoresDoApontamento(apontamento ?? APONTAMENTO_VAZIO);
  const sugeridos = sugestao
    ? // A observacao e do humano: a sugestao preenche as rubricas e deixa o
      // que estava escrito onde estava.
      { ...valoresDoApontamento(sugestao.apontamento), observacao: gravados.observacao }
    : null;

  const [aberto, setAberto] = useState(false);
  const [abertura, setAbertura] = useState<AberturaDoPreenchimento>({
    valores: gravados,
    passo: 0,
    vez: 0,
  });

  function abrir(valores: ValoresDoApontamento, passo = 0) {
    setAbertura((anterior) => ({ valores, passo, vez: anterior.vez + 1 }));
    setAberto(true);
  }

  /**
   * Gravou, fecha. Estado ajustado no render, e nao num efeito — mesma escolha
   * do menu lateral. A recusa deixa o modal aberto, no campo com erro.
   */
  const [estadoVisto, setEstadoVisto] = useState(estado);

  if (estado !== estadoVisto) {
    setEstadoVisto(estado);

    if (estado.status === "success") {
      setAberto(false);
    }
  }

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  /**
   * O `FormData` e montado a mao, como em movimentacoes: o rascunho mora no
   * estado do modal, e nao em campos com `name`.
   */
  function salvar(valores: ValoresDoApontamento) {
    const dados = new FormData();
    dados.set("funcionarioId", funcionarioId);
    dados.set("competenciaId", competenciaId);

    for (const [campo, valor] of Object.entries(valores)) {
      dados.set(campo, valor);
    }

    startTransition(() => formAction(dados));
  }

  return (
    <div className="space-y-6">
      {sugestao && sugeridos ? (
        <Sugestao sugestao={sugestao} gravado={apontamento} aoUsar={() => abrir(sugeridos)} />
      ) : null}

      <ul className="grid gap-x-6 sm:grid-cols-2">
        {RUBRICAS.map((rubrica, indice) => {
          const valor = apontamento ? valorDaRubrica(apontamento, rubrica.id) : null;

          return (
            <li key={rubrica.id} className="border-b">
              <button
                type="button"
                onClick={() => abrir(gravados, indice)}
                className="hover:bg-muted/60 flex w-full items-baseline justify-between gap-3 rounded-sm px-1 py-2 text-left text-sm"
              >
                <span className={cn(valor ? null : "text-muted-foreground")}>{rubrica.rotulo}</span>
                <span className="font-medium tabular-nums">
                  {valor ?? <span className="text-muted-foreground font-normal">—</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {apontamento?.observacao ? (
        <button
          type="button"
          onClick={() => abrir(gravados, PASSOS.length - 1)}
          className="hover:bg-muted/60 block w-full space-y-1 rounded-sm px-1 py-2 text-left text-sm"
        >
          <span className="text-muted-foreground block">Observacoes</span>
          <span className="block whitespace-pre-wrap">{apontamento.observacao}</span>
        </button>
      ) : null}

      <Button type="button" onClick={() => abrir(gravados)}>
        <Pencil aria-hidden />
        {apontamento ? "Editar apontamento" : "Preencher apontamento"}
      </Button>

      <PreenchimentoDoApontamento
        aberto={aberto}
        aoMudarAberto={setAberto}
        abertura={abertura}
        nome={nome}
        diasNoPeriodo={diasNoPeriodo}
        referencias={referencias}
        sugestao={sugeridos}
        estado={estado}
        pendente={pendente}
        aoSalvar={salvar}
      />

      {apontamento ? (
        <>
          <Separator />
          <LimparApontamento funcionarioId={funcionarioId} competenciaId={competenciaId} />
        </>
      ) : null}
    </div>
  );
}

/**
 * Formulario proprio, e nao um botao do modal: e outro gesto, com outra action.
 * Mesmo arranjo da exclusao de um extra.
 */
function LimparApontamento({
  funcionarioId,
  competenciaId,
}: {
  funcionarioId: string;
  competenciaId: string;
}) {
  const [estado, formAction, pendente] = useActionState(
    limparApontamento,
    estadoInicialLimparApontamento,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="funcionarioId" value={funcionarioId} />
      <input type="hidden" name="competenciaId" value={competenciaId} />

      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Eraser aria-hidden />}
        {pendente ? "Removendo..." : "Remover apontamento"}
      </Button>

      <p className="text-muted-foreground text-sm">
        Apaga o apontamento desta pessoa na competencia, e ela volta para a fila de quem falta
        apontar.
      </p>
    </form>
  );
}

/**
 * O que as regras leem da grade desta pessoa, ao lado dos campos.
 *
 * E referencia, como o espelho de ponto: aparece, explica de onde veio e so
 * entra nos campos do modal quando alguem clica — e mesmo ali, nos campos, e nao no
 * banco. Quem grava continua sendo o botao de salvar.
 */
function Sugestao({
  sugestao,
  gravado,
  aoUsar,
}: {
  sugestao: SugestaoDeApontamento;
  gravado: ApontamentoDaFolha | null;
  aoUsar: () => void;
}) {
  const itens = resumoDoApontamento(sugestao.apontamento);

  // Regra que nao rende nada nesta pessoa nao vira cartao: seria uma caixa
  // vazia dizendo que nao ha nada a dizer.
  if (itens.length === 0) {
    return null;
  }

  const igual = gravado ? mesmasRubricas(gravado, sugestao.apontamento) : null;

  return (
    <section className="space-y-3 rounded-md border border-dashed p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="flex items-center gap-2 font-medium">
            <Wand2 className="size-4" aria-hidden />
            Sugestao das regras
          </h3>
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={aoUsar}>
          Usar a sugestao
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {itens.map((item) => (
          <Badge key={item.id} variant={item.grupo === "ocorrencias" ? "destructive" : "secondary"}>
            {item.texto}
          </Badge>
        ))}
      </div>

      {igual === true ? (
        <p className="text-muted-foreground text-sm">O que esta gravado bate com a sugestao.</p>
      ) : igual === false ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          O que esta gravado difere da sugestao. Usar a sugestao a leva para os campos, e nada muda
          ate salvar; o bilhete das observacoes fica como esta.
        </p>
      ) : null}

      <details className="text-muted-foreground text-sm">
        <summary className="cursor-pointer">De onde veio</summary>
        <ul className="mt-2 space-y-1">
          {sugestao.contribuicoes.map((contribuicao) => (
            <li key={`${contribuicao.regraId}-${contribuicao.rubrica}`}>
              {contribuicao.nome} — {rotuloDaRubricaDaRegra(contribuicao.rubrica)}
              {contribuicao.vezes > 1 ? ` (${contribuicao.vezes} dias)` : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
