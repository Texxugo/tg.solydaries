"use client";

import { ArrowLeft, ArrowRight, Check, Clock, LoaderCircle, Wand2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  IDS_GRAU_INSALUBRIDADE,
  ROTULOS_GRAU_INSALUBRIDADE,
  RUBRICAS,
  type DescricaoCompleta,
  type Rubrica,
} from "@/features/apontamentos/rubricas";
import type {
  CampoDoApontamento,
  SalvarApontamentoState,
  ValoresDoApontamento,
} from "@/features/apontamentos/types";
import { cn } from "@/lib/utils";

/**
 * O preenchimento do apontamento num modal, **um campo por vez**, na ordem do
 * catalogo (que e a ordem da folha) e com a observacao no fim.
 *
 * Um campo por vez porque e assim que se aponta com o relatorio da folha ao
 * lado: le-se uma coluna, digita-se um numero, Enter. Ao lado do campo vem so o
 * que conversa com ele — o numero do espelho de ponto e a sugestao das regras —,
 * e nao o espelho inteiro.
 *
 * Continua sendo **um envio para o apontamento inteiro**: o rascunho guarda
 * todos os campos, e "Salvar" pode ser apertado em qualquer passo — quem so
 * veio corrigir a HE 50% nao precisa atravessar as outras catorze.
 *
 * O `submit` do formulario e so o de gravar: avancar e o Enter tratado no
 * teclado. A presenca le o `submit` como "gravou nesta tela", e um aviso a cada
 * campo seria falso.
 */

export const PASSOS: readonly CampoDoApontamento[] = [
  ...RUBRICAS.map((rubrica) => rubrica.id),
  "observacao",
];

const DESCRICOES = new Map<CampoDoApontamento, DescricaoCompleta>(
  RUBRICAS.map((rubrica) => [rubrica.id, rubrica]),
);

/** Com que valores e em que passo o modal abre. `vez` remonta o conteudo. */
export type AberturaDoPreenchimento = {
  valores: ValoresDoApontamento;
  passo: number;
  vez: number;
};

export function PreenchimentoDoApontamento({
  aberto,
  aoMudarAberto,
  abertura,
  nome,
  diasNoPeriodo,
  referencias,
  sugestao,
  estado,
  pendente,
  aoSalvar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  abertura: AberturaDoPreenchimento;
  nome: string;
  diasNoPeriodo: number;
  /** O espelho de ponto dito ao lado de cada campo (`referenciasDoEspelho`). */
  referencias: Partial<Record<Rubrica, string[]>>;
  /** A sugestao das regras no formato dos campos, ou `null`. */
  sugestao: ValoresDoApontamento | null;
  /** O estado da gravacao. Mora na ficha, e nao aqui: o modal fecha no sucesso. */
  estado: SalvarApontamentoState;
  pendente: boolean;
  aoSalvar: (valores: ValoresDoApontamento) => void;
}) {
  const painel = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent
        className="gap-0 p-0 sm:max-w-3xl"
        // O foco vai para o campo do passo, e nao para o primeiro botao da
        // lista de passos, que e o que o Radix escolheria.
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          focarCampo(painel.current);
        }}
      >
        <Conteudo
          key={abertura.vez}
          painel={painel}
          abertura={abertura}
          nome={nome}
          diasNoPeriodo={diasNoPeriodo}
          referencias={referencias}
          sugestao={sugestao}
          estado={estado}
          pendente={pendente}
          aoSalvar={aoSalvar}
        />
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({
  painel,
  abertura,
  nome,
  diasNoPeriodo,
  referencias,
  sugestao,
  estado,
  pendente,
  aoSalvar,
}: {
  painel: React.RefObject<HTMLFormElement | null>;
  abertura: AberturaDoPreenchimento;
  nome: string;
  diasNoPeriodo: number;
  referencias: Partial<Record<Rubrica, string[]>>;
  sugestao: ValoresDoApontamento | null;
  estado: SalvarApontamentoState;
  pendente: boolean;
  aoSalvar: (valores: ValoresDoApontamento) => void;
}) {
  const [rascunho, setRascunho] = useState(abertura.valores);
  const [passo, setPasso] = useState(abertura.passo);

  /**
   * A recusa que chega leva ao primeiro campo com erro. Estado ajustado no
   * render, e nao num efeito, como no menu lateral. A tentativa da abertura e
   * a linha de base: erro de uma abertura anterior nao reaparece nesta.
   */
  const [tentativaDaAbertura] = useState(estado.tentativa);
  const [tentativaVista, setTentativaVista] = useState(estado.tentativa);

  if (estado.tentativa !== tentativaVista) {
    setTentativaVista(estado.tentativa);
    const primeiro = PASSOS.findIndex((campo) => estado.erros?.[campo]);

    if (primeiro >= 0) {
      setPasso(primeiro);
    }
  }

  const errosValem = estado.status === "error" && estado.tentativa !== tentativaDaAbertura;

  /** O erro some do campo assim que ele muda: ja nao e o valor recusado. */
  function erroDe(campo: CampoDoApontamento) {
    if (!errosValem || rascunho[campo] !== estado.valores?.[campo]) {
      return undefined;
    }

    return estado.erros?.[campo]?.[0];
  }

  const campo = PASSOS[passo];
  const ultimo = passo === PASSOS.length - 1;

  useEffect(() => {
    focarCampo(painel.current);
  }, [passo, painel]);

  function definir(valor: string) {
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));
  }

  /** Avanca so com o campo valido (o `pattern` e o `max` do proprio campo). */
  function avancar() {
    const alvo = painel.current?.querySelector<HTMLInputElement>("[data-foco]");

    if (alvo && !alvo.reportValidity()) {
      return;
    }

    setPasso((atual) => Math.min(atual + 1, PASSOS.length - 1));
  }

  function voltar() {
    setPasso((atual) => Math.max(atual - 1, 0));
  }

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    aoSalvar(rascunho);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLFormElement>) {
    if (evento.key !== "Enter" || evento.nativeEvent.isComposing) {
      return;
    }

    const alvo = evento.target as HTMLElement;

    if (alvo instanceof HTMLTextAreaElement) {
      // Na observacao o Enter e quebra de linha; Ctrl+Enter grava.
      if (evento.ctrlKey || evento.metaKey) {
        evento.preventDefault();
        evento.currentTarget.requestSubmit();
      }
      return;
    }

    if (alvo instanceof HTMLButtonElement) {
      return;
    }

    evento.preventDefault();

    if (evento.shiftKey) {
      voltar();
    } else {
      avancar();
    }
  }

  const rubrica = DESCRICOES.get(campo);
  const sugerido = sugestao && rubrica ? sugestao[rubrica.id] : "";
  const mostrarSugestao = Boolean(sugerido) && sugerido !== rascunho[campo];
  const erro = erroDe(campo);
  const idErro = `passo-${campo}-erro`;

  return (
    <div className="grid min-h-0 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Campos do apontamento" className="hidden border-r sm:block">
        <ol className="max-h-[min(36rem,calc(100vh-4rem))] space-y-0.5 overflow-y-auto p-2">
          {PASSOS.map((id, indice) => {
            const valor = textoDoCampo(id, rascunho[id]);
            const comErro = Boolean(erroDe(id));

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setPasso(indice)}
                  aria-current={indice === passo ? "step" : undefined}
                  className={cn(
                    "hover:bg-muted flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                    indice === passo && "bg-muted font-medium",
                    comErro && "text-destructive",
                  )}
                >
                  <span className="truncate">{rotuloDoCampo(id)}</span>
                  {valor ? (
                    <span className="text-muted-foreground shrink-0 tabular-nums">{valor}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        ref={painel}
        onSubmit={aoEnviar}
        onKeyDown={aoTeclar}
        className="flex min-w-0 flex-col gap-5 p-5"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{nome}</DialogTitle>
          <DialogDescription>
            Campo {passo + 1} de {PASSOS.length}
          </DialogDescription>
          <div className="bg-muted mt-1 h-1 overflow-hidden rounded-full" aria-hidden>
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${((passo + 1) / PASSOS.length) * 100}%` }}
            />
          </div>
        </DialogHeader>

        <fieldset disabled={pendente} className="min-h-44 space-y-3">
          <div className="space-y-1">
            <label
              id={`passo-${campo}-rotulo`}
              htmlFor={`passo-${campo}`}
              className="text-lg font-medium"
            >
              {rotuloDoCampo(campo)}
            </label>
            {rubrica?.ajuda ? (
              <p className="text-muted-foreground text-sm">{rubrica.ajuda}</p>
            ) : null}
          </div>

          <CampoDoPasso
            key={campo}
            campo={campo}
            rubrica={rubrica}
            valor={rascunho[campo]}
            aoMudar={definir}
            diasNoPeriodo={diasNoPeriodo}
            erro={erro ? idErro : undefined}
          />

          {erro ? (
            <p id={idErro} className="text-destructive text-sm">
              {erro}
            </p>
          ) : null}

          {rubrica && referencias[rubrica.id] ? (
            <div className="text-muted-foreground flex gap-2 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="text-foreground text-xs font-medium">Espelho de ponto</p>
                {referencias[rubrica.id]!.map((linha) => (
                  <p key={linha}>{linha}</p>
                ))}
              </div>
            </div>
          ) : null}

          {mostrarSugestao ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Wand2 className="text-muted-foreground size-4" aria-hidden />
              <span>
                Sugestao das regras:{" "}
                <span className="font-medium">{textoDoCampo(campo, sugerido)}</span>
              </span>
              <Button type="button" variant="secondary" size="xs" onClick={() => definir(sugerido)}>
                Usar
              </Button>
            </div>
          ) : null}
        </fieldset>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={voltar} disabled={passo === 0 || pendente}>
            <ArrowLeft aria-hidden />
            Anterior
          </Button>

          <span className="text-muted-foreground hidden text-xs md:inline">
            {ultimo ? "Ctrl+Enter salva" : "Enter avanca · Shift+Enter volta"}
          </span>

          <div className="ml-auto flex gap-2">
            {ultimo ? null : (
              <>
                <Button type="submit" variant="outline" disabled={pendente}>
                  {pendente ? <LoaderCircle className="animate-spin" /> : null}
                  Salvar
                </Button>
                <Button type="button" onClick={avancar} disabled={pendente}>
                  Proximo
                  <ArrowRight aria-hidden />
                </Button>
              </>
            )}
            {ultimo ? (
              <Button type="submit" disabled={pendente}>
                {pendente ? <LoaderCircle className="animate-spin" /> : <Check aria-hidden />}
                {pendente ? "Salvando..." : "Salvar apontamento"}
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * O campo de um passo, controlado: o rascunho e do modal, e e ele que vai no
 * envio. Por isso nenhum campo tem `name` — o `FormData` e montado a mao.
 *
 * `data-foco` marca o que recebe o foco ao chegar no passo e o que e conferido
 * antes de avancar.
 */
function CampoDoPasso({
  campo,
  rubrica,
  valor,
  aoMudar,
  diasNoPeriodo,
  erro,
}: {
  campo: CampoDoApontamento;
  rubrica: DescricaoCompleta | undefined;
  valor: string;
  aoMudar: (valor: string) => void;
  diasNoPeriodo: number;
  /** O id da mensagem de erro, quando ha. */
  erro?: string;
}) {
  const id = `passo-${campo}`;
  const descricao = { "aria-invalid": Boolean(erro), "aria-describedby": erro };

  if (!rubrica) {
    return (
      <Textarea
        id={id}
        data-foco
        rows={4}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        placeholder="O que explica o apontamento: falta abonada, atestado entregue, acordo de compensacao."
        {...descricao}
      />
    );
  }

  switch (rubrica.unidade) {
    case "dias":
      return (
        <div className="flex items-center gap-3">
          <Input
            id={id}
            data-foco
            type="number"
            inputMode="numeric"
            min={0}
            max={diasNoPeriodo}
            step={1}
            placeholder="0"
            value={valor}
            onChange={(evento) => aoMudar(evento.target.value)}
            className="h-11 w-32 text-lg tabular-nums md:text-lg"
            {...descricao}
          />
          <span className="text-muted-foreground text-sm">
            dias, de {diasNoPeriodo} na competencia
          </span>
        </div>
      );

    case "horas":
      // Texto, e nao `type="time"`: o seletor de hora para em 23:59, e horas do
      // mes passam disso. Quem decide e o `lerHoras()` da action.
      return (
        <div className="flex items-center gap-3">
          <Input
            id={id}
            data-foco
            inputMode="numeric"
            placeholder="0:00"
            pattern="\d{1,3}(:[0-5]\d)?"
            title="Horas e minutos, como 12:30"
            value={valor}
            onChange={(evento) => aoMudar(evento.target.value)}
            className="h-11 w-32 text-lg tabular-nums md:text-lg"
            {...descricao}
          />
          <span className="text-muted-foreground text-sm">horas e minutos, como 12:30</span>
        </div>
      );

    case "percentual":
      return (
        <div className="relative w-32">
          <Input
            id={id}
            data-foco
            inputMode="decimal"
            placeholder="0"
            pattern="\d{1,3}([.,]\d{1,2})?"
            title="Percentual com ate duas casas, como 12,5"
            value={valor}
            onChange={(evento) => aoMudar(evento.target.value)}
            className="h-11 pr-8 text-lg tabular-nums md:text-lg"
            {...descricao}
          />
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
            %
          </span>
        </div>
      );

    case "sim_nao":
      return (
        <Opcoes
          nome={id}
          valor={valor}
          aoMudar={aoMudar}
          opcoes={[
            { valor: "on", rotulo: "Sim", tecla: "s" },
            { valor: "", rotulo: "Nao", tecla: "n" },
          ]}
          {...descricao}
        />
      );

    case "grau":
      return (
        <Opcoes
          nome={id}
          valor={valor}
          aoMudar={aoMudar}
          opcoes={[
            { valor: "", rotulo: "Nao tem", tecla: "0" },
            ...IDS_GRAU_INSALUBRIDADE.map((grau, indice) => ({
              valor: grau,
              rotulo: ROTULOS_GRAU_INSALUBRIDADE[grau],
              tecla: String(indice + 1),
            })),
          ]}
          {...descricao}
        />
      );
  }
}

/**
 * Sim/nao e grau como radios nativos, um ao lado do outro: as setas trocam a
 * opcao e o Enter avanca, como nos outros passos. A tecla de cada opcao
 * (S/N, 0 a 3) escolhe sem precisar do mouse.
 */
function Opcoes({
  nome,
  valor,
  aoMudar,
  opcoes,
  ...descricao
}: {
  nome: string;
  valor: string;
  aoMudar: (valor: string) => void;
  opcoes: { valor: string; rotulo: string; tecla: string }[];
  "aria-invalid": boolean;
  "aria-describedby"?: string;
}) {
  return (
    <div
      role="radiogroup"
      id={nome}
      aria-labelledby={`${nome}-rotulo`}
      className="flex flex-wrap gap-2"
      onKeyDown={(evento) => {
        const opcao = opcoes.find((atual) => atual.tecla === evento.key.toLowerCase());

        if (opcao && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
          evento.preventDefault();
          aoMudar(opcao.valor);
          // O foco acompanha a escolha, como faria a seta: senao o anel fica na
          // opcao antiga, ao lado da marcada.
          evento.currentTarget
            .querySelector<HTMLInputElement>(`input[value="${opcao.valor}"]`)
            ?.focus();
        }
      }}
      {...descricao}
    >
      {opcoes.map((opcao) => {
        const marcada = opcao.valor === valor;

        return (
          <label
            key={opcao.valor || "vazio"}
            className={cn(
              "has-focus-visible:ring-ring/50 flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm has-focus-visible:ring-3",
              marcada ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={marcada}
              onChange={() => aoMudar(opcao.valor)}
              className="sr-only"
              data-foco={marcada ? "" : undefined}
            />
            {opcao.rotulo}
            <kbd className="text-muted-foreground bg-muted rounded px-1 text-[10px] uppercase">
              {opcao.tecla}
            </kbd>
          </label>
        );
      })}
    </div>
  );
}

/** Foca (e seleciona, se for texto) o campo do passo aberto. */
function focarCampo(painel: HTMLElement | null) {
  const alvo = painel?.querySelector<HTMLElement>("[data-foco]");

  alvo?.focus();

  if (alvo instanceof HTMLInputElement && alvo.type !== "radio") {
    alvo.select();
  }
}

function rotuloDoCampo(campo: CampoDoApontamento) {
  return DESCRICOES.get(campo)?.rotulo ?? "Observacoes";
}

/** O valor do rascunho como a lista de passos o mostra; vazio e "nada". */
export function textoDoCampo(campo: CampoDoApontamento, valor: string) {
  const rubrica = DESCRICOES.get(campo);

  if (!valor) {
    return "";
  }

  if (!rubrica) {
    return "Escrita";
  }

  switch (rubrica.unidade) {
    case "dias":
      return valor === "0" ? "" : `${valor} d`;
    case "horas":
      return valor;
    case "percentual":
      return `${valor}%`;
    case "sim_nao":
      return "Sim";
    case "grau":
      return ROTULOS_GRAU_INSALUBRIDADE[valor as keyof typeof ROTULOS_GRAU_INSALUBRIDADE]
        .split(" (")[0]
        .replace("Grau ", "");
  }
}
