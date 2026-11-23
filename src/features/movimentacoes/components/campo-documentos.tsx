"use client";

import { CircleAlert, FileText, ImageIcon, LoaderCircle, Undo2, Upload, X } from "lucide-react";
import { useId, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import {
  ACCEPT_DO_CAMPO,
  MAXIMO_DE_DOCUMENTOS,
  TAMANHO_MAXIMO,
  formatarTamanho,
} from "@/features/movimentacoes/arquivos";
import { ArquivoRecusado, prepararArquivo } from "@/features/movimentacoes/compressao";
import { hrefDoDocumento, type DocumentoResumo } from "@/features/movimentacoes/types";
import { cn } from "@/lib/utils";

/**
 * Um arquivo solto no campo, a caminho do envio.
 *
 * `processando` enquanto o navegador reduz a imagem; `pronto` com o arquivo
 * que vai no envio; `recusado` com o motivo — fica a vista ate a pessoa tirar,
 * para nao sumir sem explicacao.
 */
export type ItemDaFila =
  | { chave: string; nome: string; tamanhoAntes: number; estado: "processando" }
  | {
      chave: string;
      nome: string;
      tamanhoAntes: number;
      estado: "pronto";
      arquivo: File;
    }
  | { chave: string; nome: string; tamanhoAntes: number; estado: "recusado"; motivo: string };

/**
 * Os documentos da movimentacao: os ja gravados (na edicao) e os novos, que
 * entram **arrastando e soltando** — ou colando um print (Ctrl+V), ou pelo
 * seletor de arquivos, para quem nao tem onde arrastar. Nunca por link: o
 * documento precisa estar guardado no portal, e um link para fora apodrece.
 *
 * Cada imagem e reduzida no navegador assim que entra (`compressao.ts`), e a
 * tela mostra o tamanho antes e depois. O formulario so envia quando nenhum
 * arquivo esta em processamento.
 *
 * Controlado pelo modal: a fila e os removidos moram la, porque e o envio que
 * precisa deles.
 */
export function CampoDocumentos({
  fila,
  setFila,
  gravados,
  removidos,
  alternarRemocao,
  erro,
}: {
  fila: ItemDaFila[];
  setFila: Dispatch<SetStateAction<ItemDaFila[]>>;
  gravados: readonly DocumentoResumo[];
  removidos: ReadonlySet<string>;
  alternarRemocao: (id: string) => void;
  erro?: string;
}) {
  const id = useId();
  const seletor = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  const gravadosQueFicam = gravados.filter((documento) => !removidos.has(documento.id)).length;
  const prontos = fila.filter((item) => item.estado === "pronto").length;
  const cheio = gravadosQueFicam + prontos >= MAXIMO_DE_DOCUMENTOS;

  function receber(arquivos: readonly File[]) {
    if (arquivos.length === 0) {
      return;
    }

    const novos = arquivos.map((arquivo) => ({ arquivo, chave: crypto.randomUUID() }));

    setFila((atual) => [
      ...atual,
      ...novos.map(({ arquivo, chave }): ItemDaFila => ({
        chave,
        nome: arquivo.name,
        tamanhoAntes: arquivo.size,
        estado: "processando",
      })),
    ]);

    for (const { arquivo, chave } of novos) {
      prepararArquivo(arquivo)
        .then(({ arquivo: preparado, tamanhoAntes }) =>
          aceitar(chave, {
            chave,
            nome: preparado.name,
            tamanhoAntes,
            estado: "pronto",
            arquivo: preparado,
          }),
        )
        .catch((falha: unknown) =>
          trocar(chave, {
            chave,
            nome: arquivo.name,
            tamanhoAntes: arquivo.size,
            estado: "recusado",
            motivo:
              falha instanceof ArquivoRecusado ? falha.message : "Nao foi possivel ler o arquivo.",
          }),
        );
    }
  }

  /** Troca o item da fila — se ele ainda estiver la (a pessoa pode te-lo tirado). */
  function trocar(chave: string, item: ItemDaFila) {
    setFila((atual) => atual.map((antigo) => (antigo.chave === chave ? item : antigo)));
  }

  /**
   * O limite e conferido quando o arquivo fica pronto, e nao quando ele entra:
   * um `.txt` ou um PDF grande demais seria recusado depois, e contar com ele
   * de saida recusaria um arquivo bom no lugar. O que passou do limite fica
   * na lista como recusado — sumir em silencio faria parecer que foi aceito.
   */
  function aceitar(chave: string, item: ItemDaFila & { estado: "pronto" }) {
    setFila((atual) => {
      const aceitos = atual.filter((antigo) => antigo.estado === "pronto").length;
      const cabe = gravadosQueFicam + aceitos < MAXIMO_DE_DOCUMENTOS;

      return atual.map((antigo) =>
        antigo.chave !== chave
          ? antigo
          : cabe
            ? item
            : {
                chave,
                nome: item.nome,
                tamanhoAntes: item.tamanhoAntes,
                estado: "recusado",
                motivo: `Limite de ${MAXIMO_DE_DOCUMENTOS} documentos por movimentacao.`,
              },
      );
    });
  }

  function tirar(chave: string) {
    setFila((atual) => atual.filter((item) => item.chave !== chave));
  }

  return (
    <div className="space-y-3">
      {/*
        A area inteira e o alvo: arrastar, soltar, clicar ou colar. `tabIndex`
        para que o Ctrl+V tenha onde cair, e Enter/espaco abrem o seletor.
      */}
      <div
        id={id}
        role="button"
        tabIndex={0}
        aria-describedby={`${id}-ajuda${erro ? ` ${id}-erro` : ""}`}
        onClick={() => seletor.current?.click()}
        onKeyDown={(evento) => {
          if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault();
            seletor.current?.click();
          }
        }}
        onDragEnter={(evento) => {
          evento.preventDefault();
          setArrastando(true);
        }}
        onDragOver={(evento) => {
          // Sem o `preventDefault` aqui, o navegador nao dispara o `drop` — e
          // abre o arquivo na aba, saindo do portal.
          evento.preventDefault();
          evento.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(evento) => {
          // Sair para um filho dispara `dragleave` no pai; so conta quando o
          // ponteiro deixa a area de verdade.
          if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
            setArrastando(false);
          }
        }}
        onDrop={(evento) => {
          evento.preventDefault();
          setArrastando(false);
          receber(Array.from(evento.dataTransfer.files));
        }}
        onPaste={(evento) => {
          const arquivos = Array.from(evento.clipboardData.files);

          if (arquivos.length > 0) {
            evento.preventDefault();
            receber(arquivos);
          }
        }}
        className={cn(
          "border-input text-muted-foreground hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors outline-none focus-visible:ring-3",
          erro && "border-destructive",
          arrastando && "border-primary bg-primary/10 text-foreground",
          cheio && "pointer-events-none opacity-60",
        )}
      >
        <Upload className="size-5" aria-hidden />
        <p>
          <span className="text-foreground font-medium">Arraste o atestado ou o print aqui</span>,
          cole com Ctrl+V ou clique para escolher.
        </p>
        <p id={`${id}-ajuda`} className="text-xs">
          Imagem ou PDF · ate {MAXIMO_DE_DOCUMENTOS} arquivos · imagens sao reduzidas
          automaticamente · PDF ate {formatarTamanho(TAMANHO_MAXIMO)}
        </p>
      </div>

      <input
        ref={seletor}
        type="file"
        multiple
        accept={ACCEPT_DO_CAMPO}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(evento) => {
          receber(Array.from(evento.target.files ?? []));
          // Limpa para que escolher o mesmo arquivo de novo dispare `change`.
          evento.target.value = "";
        }}
      />

      {gravados.length > 0 || fila.length > 0 ? (
        <ul className="space-y-1.5">
          {gravados.map((documento) => {
            const saindo = removidos.has(documento.id);

            return (
              <li
                key={documento.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                  saindo && "opacity-60",
                )}
              >
                <IconeDoTipo tipo={documento.tipoMime} />
                <a
                  href={hrefDoDocumento(documento.id)}
                  target="_blank"
                  rel="noopener"
                  className={cn(
                    "min-w-0 flex-1 truncate hover:underline",
                    saindo && "line-through",
                  )}
                >
                  {documento.nome}
                </a>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {saindo ? "sai ao salvar" : formatarTamanho(documento.tamanho)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => alternarRemocao(documento.id)}
                  title={saindo ? "Manter este documento" : "Remover este documento"}
                >
                  {saindo ? <Undo2 aria-hidden /> : <X aria-hidden />}
                  <span className="sr-only">
                    {saindo ? "Manter" : "Remover"} {documento.nome}
                  </span>
                </Button>
              </li>
            );
          })}

          {fila.map((item) => (
            <li
              key={item.chave}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                item.estado === "recusado" && "border-destructive/40",
              )}
            >
              {item.estado === "processando" ? (
                <LoaderCircle className="text-muted-foreground size-4 shrink-0 animate-spin" />
              ) : item.estado === "recusado" ? (
                <CircleAlert className="text-destructive size-4 shrink-0" aria-hidden />
              ) : (
                <IconeDoTipo tipo={item.arquivo.type} />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate">{item.nome}</p>
                {item.estado === "recusado" ? (
                  <p className="text-destructive text-xs">{item.motivo}</p>
                ) : null}
              </div>

              <span className="text-muted-foreground shrink-0 text-xs">
                {item.estado === "processando"
                  ? "reduzindo..."
                  : item.estado === "pronto"
                    ? item.arquivo.size < item.tamanhoAntes
                      ? `${formatarTamanho(item.tamanhoAntes)} → ${formatarTamanho(item.arquivo.size)}`
                      : formatarTamanho(item.arquivo.size)
                    : null}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => tirar(item.chave)}
                title="Tirar este arquivo"
              >
                <X aria-hidden />
                <span className="sr-only">Tirar {item.nome}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {erro ? (
        <p id={`${id}-erro`} className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function IconeDoTipo({ tipo }: { tipo: string }) {
  return tipo === "application/pdf" ? (
    <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
  ) : (
    <ImageIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
  );
}
