"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState, type Ref } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type OpcaoDaBusca = {
  valor: string;
  rotulo: string;
  detalhe?: string | null;
  /**
   * Opcao que **faz** algo em vez de escolher (o "Inserir como freelancer").
   * Ela nunca e escolhida pelo Tab — so por Enter ou clique, que sao gestos de
   * quem leu o que esta escolhendo.
   */
  acao?: boolean;
};

/**
 * Campo de texto que e a propria busca, com a lista logo abaixo.
 *
 * Diferente de `CampoPessoa` e `CampoEscala` (um botao que abre um popover com
 * a busca dentro): no lancamento do efetivo o campo e digitado dezenas de vezes
 * seguidas, e abrir antes de digitar seria uma tecla a mais por pessoa. Aqui o
 * foco chega e ja se digita.
 *
 * Teclado:
 * - setas movem o destaque;
 * - **Enter** escolhe o destacado (e nao envia o formulario enquanto a lista
 *   esta aberta). Em campo ja preenchido em que nada se digitou, o Enter e do
 *   formulario;
 * - **Tab** escolhe o destacado e segue para o proximo campo — digitar "port"
 *   e Tab escolhe Portaria (quem usa o campo leva o foco adiante em
 *   `aoEscolher`);
 * - Esc fecha a lista.
 *
 * O componente nao filtra nada: quem o usa entrega as opcoes ja recortadas
 * (lista local para posto e local, resposta do servidor para pessoa).
 */
export function CaixaDeBusca({
  id,
  texto,
  aoDigitar,
  opcoes,
  aoEscolher,
  aviso,
  carregando = false,
  aoEnterSemOpcao,
  abrirAoFocar = false,
  placeholder,
  invalido = false,
  descritoPor,
  autoFocus,
  ref,
}: {
  id: string;
  texto: string;
  aoDigitar: (texto: string) => void;
  opcoes: OpcaoDaBusca[];
  aoEscolher: (opcao: OpcaoDaBusca) => void;
  /** O que a lista diz quando nao ha opcao (ou o rodape, quando ha). */
  aviso?: string | null;
  carregando?: boolean;
  /** Enter com a lista ainda chegando: quem usa decide o que fazer quando chegar. */
  aoEnterSemOpcao?: () => void;
  abrirAoFocar?: boolean;
  placeholder?: string;
  invalido?: boolean;
  descritoPor?: string;
  autoFocus?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  const listaId = useId();
  const lista = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [destacado, setDestacado] = useState(0);
  /**
   * Digitou ou andou com as setas desde que entrou no campo. Sem isso, so
   * atravessar com Tab um campo ja preenchido (na edicao, por exemplo) trocaria
   * o valor pelo primeiro da lista, que abre sozinha ao focar.
   */
  const [interagiu, setInteragiu] = useState(false);

  // O destaque e recortado no render: a lista encolhe a cada tecla, e um indice
  // guardado de uma lista maior apontaria para fora dela.
  const atual = opcoes.length === 0 ? -1 : Math.min(destacado, opcoes.length - 1);
  const visivel = aberto && (opcoes.length > 0 || Boolean(aviso) || carregando);

  function escolher(opcao: OpcaoDaBusca) {
    setAberto(false);
    setInteragiu(false);
    aoEscolher(opcao);
  }

  function mover(passo: number) {
    if (opcoes.length === 0) {
      return;
    }

    const proximo = atual < 0 ? 0 : (atual + passo + opcoes.length) % opcoes.length;

    setDestacado(proximo);
    setInteragiu(true);
    lista.current
      ?.querySelector(`[data-indice="${proximo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="relative">
      <Input
        ref={ref}
        id={id}
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={visivel}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={visivel && atual >= 0 ? `${listaId}-${atual}` : undefined}
        aria-invalid={invalido}
        aria-describedby={descritoPor}
        onChange={(evento) => {
          aoDigitar(evento.target.value);
          setAberto(true);
          setDestacado(0);
          setInteragiu(true);
        }}
        onFocus={(evento) => {
          // Selecionar tudo ao entrar: corrigir o campo e digitar por cima, e
          // nao apagar letra por letra.
          evento.target.select();
          setInteragiu(false);
          setDestacado(0);

          if (abrirAoFocar) {
            setAberto(true);
          }
        }}
        onBlur={() => setAberto(false)}
        onKeyDown={(evento) => {
          switch (evento.key) {
            case "ArrowDown":
              evento.preventDefault();

              if (!aberto) {
                setAberto(true);
              } else {
                mover(1);
              }
              break;
            case "ArrowUp":
              evento.preventDefault();
              mover(-1);
              break;
            case "Enter":
              if (!aberto) {
                // Lista fechada: o Enter e do formulario.
                break;
              }

              // Campo ja preenchido e nada mexido: o Enter e do formulario, e
              // nao da lista. Campo vazio escolhe o destacado — no local, Enter
              // direto pega o mais usado do posto.
              if (!interagiu && texto.trim()) {
                break;
              }

              if (atual >= 0) {
                evento.preventDefault();
                escolher(opcoes[atual]);
              } else if (texto.trim()) {
                // Ainda procurando, ou nada casou: enviar agora mandaria o
                // campo vazio.
                evento.preventDefault();

                if (carregando) {
                  aoEnterSemOpcao?.();
                }
              }
              break;
            case "Tab":
              // Quem escolhe tambem leva o foco ao campo seguinte; deixar o Tab
              // do navegador andar depois disso pularia um campo.
              if (
                !evento.shiftKey &&
                aberto &&
                interagiu &&
                atual >= 0 &&
                texto.trim() &&
                !opcoes[atual].acao
              ) {
                evento.preventDefault();
                escolher(opcoes[atual]);
              }
              break;
            case "Escape":
              if (aberto) {
                evento.preventDefault();
                setAberto(false);
              }
              break;
          }
        }}
      />

      {visivel ? (
        <div
          ref={lista}
          id={listaId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border p-1 shadow-md"
        >
          {opcoes.map((opcao, indice) => (
            <div
              key={opcao.valor}
              id={`${listaId}-${indice}`}
              data-indice={indice}
              role="option"
              aria-selected={indice === atual}
              // `mousedown` com `preventDefault` segura o foco no campo: sem
              // isso o `blur` fecharia a lista antes de o clique chegar nela.
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => escolher(opcao)}
              onPointerMove={() => setDestacado(indice)}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                indice === atual && "bg-accent text-accent-foreground",
                opcao.acao && "font-medium",
              )}
            >
              <span className="min-w-0 truncate">{opcao.rotulo}</span>
              {opcao.detalhe ? (
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    indice === atual ? "text-accent-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {opcao.detalhe}
                </span>
              ) : null}
            </div>
          ))}

          {carregando && opcoes.length === 0 ? (
            <p className="text-muted-foreground flex items-center justify-center gap-2 px-2 py-3 text-sm">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              Procurando...
            </p>
          ) : aviso ? (
            <p
              className={cn(
                "text-muted-foreground px-2 text-center",
                opcoes.length > 0 ? "border-t py-1.5 text-xs" : "py-3 text-sm",
              )}
            >
              {aviso}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Sao Joao", "sao joao" e "SAO JOÃO" casam: ninguem digita acento num lancamento corrido. */
export function normalizarBusca(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
