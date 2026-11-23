"use client";

import { Check, ChevronsUpDown, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscarPessoas } from "@/features/preenchimento/busca";
import {
  ESPERA_DA_BUSCA,
  PESSOAS_POR_BUSCA,
  TERMO_MINIMO,
  type PessoaEncontrada,
} from "@/features/preenchimento/types";
import { cn } from "@/lib/utils";

/**
 * Quem cobriu o dia: um combobox que **pergunta ao servidor** conforme se
 * digita.
 *
 * E o segundo combobox do portal, e o primeiro assincrono — `CampoEscala`
 * filtra uma dezena de escalas que ja vieram com a pagina. Aqui sao trezentas e
 * tantas pessoas, e carrega-las junto com a grade era o grosso do travamento ao
 * abrir o dia: viravam `<option>` a cada abertura do modal. Nenhuma vem agora;
 * a lista so existe depois que alguem digita.
 *
 * Tres coisas seguram a conta:
 *
 * - **espera** (`ESPERA_DA_BUSCA`): a consulta sai depois do silencio, e nao a
 *   cada tecla — digitar "ADRIANO" e uma ida, e nao sete;
 * - **termo minimo** (`TERMO_MINIMO`): uma letra casaria com quase todo o
 *   cadastro, e o teto devolveria vinte nomes arbitrarios;
 * - **teto** (`PESSOAS_POR_BUSCA`), aplicado no proprio `select` do banco.
 *
 * O valor viaja num `input[type=hidden]`, como em `CampoEscala`: a action
 * continua recebendo `pessoa` no formato `f:<uuid>` / `l:<uuid>` e nao sabe que
 * o campo mudou. A consequencia e a mesma — este campo **depende de
 * JavaScript**, e esta registrada em "Pontos de atencao".
 *
 * O que ele nao herda de `CampoEscala` e o `required` do navegador: campo
 * escondido fica fora da validacao nativa. Quem cobra a sigla que exige pessoa
 * e o proprio modal, antes de enviar.
 *
 * `buscar` troca a origem da lista: a aba Responsavel do posto usa a busca so
 * de funcionarios (`postos/busca.ts`), com a checagem de acesso da area dela.
 * Tem de ser uma referencia estavel — uma Server Action importada no modulo,
 * e nao uma funcao criada no render, ou o efeito da busca dispara a cada tecla.
 */
export function CampoPessoa({
  id,
  name,
  valor,
  nome,
  aoEscolher,
  erro,
  buscar = buscarPessoas,
  rotuloDaBusca = "Buscar quem cobriu o dia",
  textoVazio = "Ninguem",
  textoLimpar = "Tirar a pessoa deste dia",
}: {
  id: string;
  name: string;
  /** `f:<uuid>`, `l:<uuid>` ou vazio. Controlado pelo modal. */
  valor: string;
  /** O nome de quem esta escolhido — ele vem da celula, e nao de uma busca. */
  nome: string | null;
  aoEscolher: (escolha: { valor: string; nome: string | null }) => void;
  erro?: string;
  buscar?: (termo: string) => Promise<PessoaEncontrada[]>;
  rotuloDaBusca?: string;
  textoVazio?: string;
  textoLimpar?: string;
}) {
  const listaId = useId();
  const campoBusca = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  /** Posicao em `resultados` sob as setas do teclado. `-1` = nenhuma. */
  const [destacado, setDestacado] = useState(-1);

  /**
   * A ultima resposta, **com o termo que a produziu**.
   *
   * Guardar os dois juntos e o que deixa "estou procurando" ser derivado
   * (`resposta.termo !== termo`) em vez de mais um estado a ligar e desligar —
   * e e o que impede o efeito de disparar de novo sobre o proprio resultado.
   */
  const [resposta, setResposta] = useState<{ termo: string; pessoas: PessoaEncontrada[] }>({
    termo: "",
    pessoas: [],
  });

  const termo = busca.trim();
  const curto = termo.length < TERMO_MINIMO;
  const buscando = !curto && resposta.termo !== termo;
  // Termo curto nao mostra resultado nenhum; digitando o proximo caractere, a
  // lista anterior fica a vista ate a nova chegar — piscar vazio a cada tecla
  // seria pior do que mostrar por um instante o que ja nao casa.
  const resultados = curto ? [] : resposta.pessoas;

  /**
   * O contador que descarta resposta atrasada.
   *
   * Duas buscas em voo podem voltar fora de ordem, e sem ele a resposta de
   * "adr" sobrescreveria a de "adriano" so por ter demorado mais.
   */
  const pedido = useRef(0);

  /*
    O `clearTimeout` da limpeza e o debounce em si: cada tecla cancela a ida que
    ainda nao saiu, e so o silencio de `ESPERA_DA_BUSCA` deixa a consulta
    escapar. Nada aqui chama `setState` direto no corpo do efeito — o que muda
    estado sao a resposta e o temporizador.
  */
  useEffect(() => {
    if (curto || resposta.termo === termo) {
      return;
    }

    const meu = ++pedido.current;
    const relogio = setTimeout(() => {
      buscar(termo)
        .then((pessoas) => {
          if (meu !== pedido.current) {
            return;
          }

          setResposta({ termo, pessoas });
          setDestacado(pessoas.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (meu === pedido.current) {
            setResposta({ termo, pessoas: [] });
          }
        });
    }, ESPERA_DA_BUSCA);

    return () => clearTimeout(relogio);
  }, [termo, curto, resposta.termo, buscar]);

  function aoAbrir(proximo: boolean) {
    setAberto(proximo);

    // Cada abertura comeca do zero: a busca anterior era de outro dia, e manter
    // o resultado velho a vista sugeriria que ele tem algo a ver com este.
    if (proximo) {
      setBusca("");
      setResposta({ termo: "", pessoas: [] });
      setDestacado(-1);
    }
  }

  function escolher(escolha: { valor: string; nome: string | null }) {
    aoEscolher(escolha);
    setAberto(false);
  }

  /** Move o destaque, dando a volta, e mantem a opcao destacada a vista. */
  function mover(passo: number) {
    if (resultados.length === 0) {
      return;
    }

    const proximo =
      destacado < 0
        ? passo > 0
          ? 0
          : resultados.length - 1
        : (((destacado + passo) % resultados.length) + resultados.length) % resultados.length;

    setDestacado(proximo);
    lista.current
      ?.querySelector(`[data-indice="${proximo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="space-y-2">
      {/* O valor real do formulario. A action recebe `pessoa` como sempre. */}
      <input type="hidden" name={name} value={valor} />

      <div className="flex gap-2">
        <Popover open={aberto} onOpenChange={aoAbrir}>
          <PopoverTrigger
            id={id}
            type="button"
            aria-invalid={Boolean(erro)}
            aria-describedby={erro ? `${id}-erro` : undefined}
            className={cn(
              "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none focus-visible:ring-3 aria-invalid:ring-3 md:text-sm",
              !valor && "text-muted-foreground",
            )}
          >
            <span className="truncate">{valor ? (nome ?? "Pessoa escolhida") : textoVazio}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
          </PopoverTrigger>

          <PopoverContent
            className="w-(--radix-popover-trigger-width) p-0"
            // O foco vai para a busca: este campo so tem lista depois que
            // alguem digita, entao abrir e digitar sao o mesmo gesto.
            onOpenAutoFocus={(evento) => {
              evento.preventDefault();
              campoBusca.current?.focus();
            }}
          >
            <div className="flex items-center gap-2 border-b px-2.5">
              {buscando ? (
                <LoaderCircle
                  className="text-muted-foreground size-3.5 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : (
                <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              )}
              <input
                ref={campoBusca}
                value={busca}
                onChange={(evento) => {
                  setBusca(evento.target.value);
                  setDestacado(-1);
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
                    const alvo = resultados[destacado];

                    if (alvo) {
                      escolher({ valor: alvo.valor, nome: alvo.nome });
                    }
                  }
                }}
                placeholder="Buscar por nome ou matricula"
                role="combobox"
                aria-expanded
                aria-controls={listaId}
                aria-autocomplete="list"
                aria-activedescendant={
                  resultados[destacado] ? `${listaId}-${destacado}` : undefined
                }
                aria-label={rotuloDaBusca}
                className="placeholder:text-muted-foreground h-9 w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div ref={lista} id={listaId} role="listbox" className="max-h-64 overflow-y-auto p-1">
              {resultados.map((pessoa, indice) => (
                <div
                  key={pessoa.valor}
                  id={`${listaId}-${indice}`}
                  data-indice={indice}
                  role="option"
                  aria-selected={pessoa.valor === valor}
                  onClick={() => escolher({ valor: pessoa.valor, nome: pessoa.nome })}
                  onPointerMove={() => setDestacado(indice)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                    indice === destacado && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      pessoa.valor === valor ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{pessoa.nome}</span>
                    {pessoa.identificacao || pessoa.freelancer ? (
                      <span
                        className={cn(
                          "block truncate text-xs",
                          indice === destacado
                            ? "text-accent-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {[pessoa.identificacao, pessoa.freelancer ? "freelancer" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}

              <Aviso
                curto={curto}
                buscando={buscando}
                vazio={resultados.length === 0}
                cheio={resultados.length === PESSOAS_POR_BUSCA}
                termo={termo}
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Botao a parte, e nao uma linha "Ninguem" na lista: a lista so existe
            depois de uma busca, e limpar o campo nao deveria exigir digitar. */}
        {valor ? (
          <button
            type="button"
            onClick={() => aoEscolher({ valor: "", nome: null })}
            title={textoLimpar}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring border-input flex h-8 shrink-0 items-center rounded-lg border px-2 outline-none focus-visible:ring-3"
          >
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">{textoLimpar}</span>
          </button>
        ) : null}
      </div>

      {erro ? (
        <p id={`${id}-erro`} className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/**
 * O que a lista diz quando nao tem opcao a mostrar — e o aviso do teto.
 *
 * Sao quatro estados diferentes ("digite mais", "procurando", "nada casou",
 * "ha mais do que cabe") e cada um pede uma acao diferente de quem le. Um texto
 * unico de "nenhum resultado" faria os quatro parecerem o mesmo problema.
 */
function Aviso({
  curto,
  buscando,
  vazio,
  cheio,
  termo,
}: {
  curto: boolean;
  buscando: boolean;
  vazio: boolean;
  cheio: boolean;
  termo: string;
}) {
  if (curto) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-center text-sm">
        Digite ao menos {TERMO_MINIMO} letras do nome ou a matricula.
      </p>
    );
  }

  if (vazio) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-center text-sm">
        {buscando ? (
          "Procurando..."
        ) : (
          <>
            Ninguem ativo casa com <span className="font-medium">{termo}</span>.
          </>
        )}
      </p>
    );
  }

  if (cheio) {
    return (
      <p className="text-muted-foreground border-t px-2 py-1.5 text-center text-xs">
        Mostrando os {PESSOAS_POR_BUSCA} primeiros — digite mais para estreitar.
      </p>
    );
  }

  return null;
}
