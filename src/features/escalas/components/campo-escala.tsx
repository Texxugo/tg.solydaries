"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { rotuloDoCiclo } from "@/features/escalas/jornada";
import type { EscalaParaAtribuicao } from "@/features/escalas/types";
import { cn } from "@/lib/utils";

/**
 * Campo de escolha de escala: um combobox com a busca **dentro** da lista.
 *
 * Mora em `escalas/` porque descreve como se escolhe uma escala — quem escolhe
 * (hoje o cadastro de funcionarios, amanha outra tela) e so quem consome, mesma
 * razao de `EscalaParaAtribuicao` viver em `escalas/types.ts`.
 *
 * Diferente do resto dos formularios do portal, este campo **depende de
 * JavaScript**: `<select>` nativo nao comporta um campo de busca dentro, entao
 * a lista e desenhada a mao sobre o `Popover` do Radix. O valor viaja num
 * `input[type=hidden]`, de modo que a Server Action continua recebendo
 * `escalaId` exatamente como antes — validacao e gravacao nao mudam em nada.
 * A consequencia esta em "Pontos de atencao" do `CLAUDE.md`, junto do menu
 * lateral e dos checkboxes, que ja dependem de JS pela mesma razao.
 */
export function CampoEscala({
  escalas,
  id,
  name,
  defaultValue = "",
  rotulo = "Escala",
  rotuloVazio,
  ajuda,
  erro,
  disabled,
}: {
  escalas: readonly EscalaParaAtribuicao[];
  id: string;
  name: string;
  defaultValue?: string;
  rotulo?: string;
  /** Texto do estado vazio — "Sem escala definida" ou "Selecione a escala". */
  rotuloVazio: string;
  ajuda?: string;
  erro?: string;
  disabled?: boolean;
}) {
  const listaId = useId();
  const campoBusca = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [valor, setValor] = useState(defaultValue);
  /** Posicao em `opcoes` sob as setas do teclado. `-1` = nenhuma. */
  const [destacado, setDestacado] = useState(-1);

  const termo = normalizar(busca);
  const selecionada = escalas.find((escala) => escala.id === valor) ?? null;

  /**
   * A lista inteira, ja filtrada — inclusive a opcao que devolve ao estado
   * vazio. Ela entra como item da lista, e nao como um botao a parte, para que
   * a navegacao por teclado a alcance: separada, so o mouse chegaria nela.
   *
   * Some quando ha termo digitado: quem procurou "12x36" nao esta procurando
   * "sem escala", e a linha so atrapalharia a contagem do que casou.
   */
  const opcoes: { valor: string; texto: string; detalhe?: string; neutra?: boolean }[] = [
    ...(termo === "" ? [{ valor: "", texto: rotuloVazio, neutra: true }] : []),
    ...escalas
      .filter((escala) => termo === "" || normalizar(textoDeBusca(escala)).includes(termo))
      .map((escala) => ({
        valor: escala.id,
        texto: escala.nome,
        detalhe: detalheDaEscala(escala),
      })),
  ];

  const nenhumaCasa = termo !== "" && opcoes.length === 0;

  function aoAbrir(proximo: boolean) {
    setAberto(proximo);

    if (proximo) {
      // Cada abertura comeca do zero: a lista inteira a vista e o destaque na
      // escala atual, que e o ponto de partida de quem vai trocar. Como a busca
      // acabou de ser limpa, a posicao em `escalas` e a mesma em `opcoes`,
      // deslocada pela linha neutra que abre a lista.
      setBusca("");
      setDestacado(selecionada ? escalas.indexOf(selecionada) + 1 : 0);
    }
  }

  function escolher(proximo: string) {
    setValor(proximo);
    setAberto(false);
  }

  /** Move o destaque, dando a volta, e mantem a opcao destacada a vista. */
  function mover(passo: number) {
    if (opcoes.length === 0) {
      return;
    }

    const proximo =
      destacado < 0
        ? passo > 0
          ? 0
          : opcoes.length - 1
        : (((destacado + passo) % opcoes.length) + opcoes.length) % opcoes.length;

    setDestacado(proximo);
    lista.current
      ?.querySelector(`[data-indice="${proximo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>

      {/* O valor real do formulario. A action recebe `escalaId` como sempre. */}
      <input type="hidden" name={name} value={valor} />

      <Popover open={aberto} onOpenChange={aoAbrir}>
        <PopoverTrigger
          id={id}
          type="button"
          disabled={disabled || escalas.length === 0}
          aria-invalid={Boolean(erro)}
          aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
          className={cn(
            "border-input focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
            !selecionada && "text-muted-foreground",
          )}
        >
          {/* Fechado, o campo mostra so o nome: e ele que identifica a escala, e
              o detalhe nao caberia sem truncar justamente o nome. */}
          <span className="truncate">{selecionada ? selecionada.nome : rotuloVazio}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </PopoverTrigger>

        <PopoverContent
          className="p-0"
          // O foco vai para a busca, e nao para a primeira opcao: quem abre este
          // campo com uma dezena de escalas na lista abre para digitar.
          onOpenAutoFocus={(evento) => {
            evento.preventDefault();
            campoBusca.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <input
              ref={campoBusca}
              value={busca}
              onChange={(evento) => {
                setBusca(evento.target.value);
                // Filtrou, o destaque volta para a primeira: manter o indice
                // antigo apontaria para outra escala depois do recorte.
                setDestacado(0);
              }}
              onKeyDown={(evento) => {
                if (evento.key === "ArrowDown") {
                  evento.preventDefault();
                  mover(1);
                } else if (evento.key === "ArrowUp") {
                  evento.preventDefault();
                  mover(-1);
                } else if (evento.key === "Enter") {
                  evento.preventDefault();
                  const alvo = opcoes[destacado];

                  if (alvo) {
                    escolher(alvo.valor);
                  }
                }
              }}
              placeholder="Buscar por nome, ciclo (5x2) ou horario"
              // O `combobox` e o input, e nao o gatilho: e ele que tem o cursor
              // enquanto a lista esta aberta, e e dele que o leitor de tela
              // anuncia a opcao destacada.
              role="combobox"
              aria-expanded
              aria-controls={listaId}
              aria-autocomplete="list"
              aria-activedescendant={opcoes[destacado] ? `${listaId}-${destacado}` : undefined}
              aria-label={`Buscar escala em ${rotulo.toLowerCase()}`}
              className="placeholder:text-muted-foreground h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div ref={lista} id={listaId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {opcoes.map((opcao, indice) => (
              <div
                key={opcao.valor || "vazio"}
                id={`${listaId}-${indice}`}
                data-indice={indice}
                role="option"
                aria-selected={opcao.valor === valor}
                onClick={() => escolher(opcao.valor)}
                onPointerMove={() => setDestacado(indice)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                  indice === destacado && "bg-accent text-accent-foreground",
                  opcao.neutra && "text-muted-foreground",
                )}
              >
                <Check
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    opcao.valor === valor ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate">{opcao.texto}</span>
                  {/* Ciclo e horarios em segundo plano: quem le procura o nome,
                      e o detalhe so responde quando o nome nao basta. */}
                  {opcao.detalhe ? (
                    <span
                      className={cn(
                        "block truncate text-xs",
                        indice === destacado
                          ? "text-accent-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {opcao.detalhe}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}

            {nenhumaCasa ? (
              <p className="text-muted-foreground px-2 py-4 text-center text-sm">
                Nenhuma escala ativa casa com <span className="font-medium">{busca}</span>.
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {erro ? (
        <p id={`${id}-erro`} className="text-destructive text-sm">
          {erro}
        </p>
      ) : ajuda ? (
        <p id={`${id}-ajuda`} className="text-muted-foreground text-sm">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ciclo e horarios, na linha de baixo da opcao.
 *
 * Ficam **separados do nome**, e nao concatenados nele, pelo mesmo motivo de a
 * lista de escalas os manter em colunas proprias: o nome e o que identifica a
 * escala, e o resto e consequencia das colunas. Emendar os dois faz o rotulo se
 * repetir em nomes como "05x02 - 08:00 as 17:00" — que ja dizem tudo isso — e
 * ainda diverge na grafia (`5x2` contra `05x02`), como se fosse outra escala.
 *
 * Continua aparecendo porque nem todo nome carrega a jornada: numa escala
 * chamada "Turma A" esta e a unica linha que diz que jornada e aquela.
 */
function detalheDaEscala(escala: EscalaParaAtribuicao) {
  return `${rotuloDoCiclo(escala)} · ${escala.entrada} as ${escala.saida}`;
}

/**
 * O texto contra o qual a busca casa: tudo que a opcao exibe, nas duas linhas.
 * Filtrar por algo que a opcao nao mostra faria a lista encolher sem explicacao.
 */
function textoDeBusca(escala: EscalaParaAtribuicao) {
  return `${escala.nome} ${detalheDaEscala(escala)}`;
}

/**
 * Texto comparavel: sem acento, sem caixa. Os nomes cadastrados misturam as duas
 * formas ("12x36 - 18:00 ás 06:00"), e quem procura digita do jeito mais facil.
 */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
