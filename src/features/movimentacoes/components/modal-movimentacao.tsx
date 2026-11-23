"use client";

import { LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import { startTransition, useActionState, useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/features/competencias/periodo";
import { excluirMovimentacao, salvarMovimentacao } from "@/features/movimentacoes/actions";
import { buscarPessoasDaMovimentacao } from "@/features/movimentacoes/busca";
import {
  CampoDocumentos,
  type ItemDaFila,
} from "@/features/movimentacoes/components/campo-documentos";
import {
  IDS_TIPO_DE_MOVIMENTACAO,
  JUSTIFICATIVA_MAXIMA,
  MAXIMO_NA_TROCA,
  MINIMO_NA_TROCA,
  ROTULOS_TIPO_DE_MOVIMENTACAO,
  ehTroca,
  estadoInicialExcluirMovimentacao,
  estadoInicialSalvarMovimentacao,
  type MovimentacaoResumo,
} from "@/features/movimentacoes/types";
import { CampoPessoa } from "@/features/preenchimento/components/campo-pessoa";

import type { TipoDeMovimentacao } from "@/db/schema";

type Escolha = { valor: string; nome: string | null };

const NINGUEM: Escolha = { valor: "", nome: null };

/**
 * O modal da movimentacao: registrar uma nova ou abrir uma existente.
 *
 * O conteudo so existe com o modal aberto (o Radix desmonta o `Content` ao
 * fechar), entao cada abertura comeca do zero — nada da movimentacao anterior
 * vaza para a seguinte.
 */
export function ModalMovimentacao({
  aberto,
  aoFechar,
  movimentacao,
  periodo,
  dataPadrao,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** `null` registra uma nova. */
  movimentacao: MovimentacaoResumo | null;
  periodo: { inicio: string; fim: string };
  dataPadrao: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(proximo) => (proximo ? null : aoFechar())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {movimentacao
              ? `${ROTULOS_TIPO_DE_MOVIMENTACAO[movimentacao.tipo]} de ${formatarData(movimentacao.data)}`
              : "Registrar movimentacao"}
          </DialogTitle>
          <DialogDescription>
            {movimentacao
              ? `Registrada${movimentacao.registradoPor ? ` por ${movimentacao.registradoPor}` : ""}.`
              : "Falta, troca interna ou troca de escala."}
          </DialogDescription>
        </DialogHeader>

        <Formulario
          movimentacao={movimentacao}
          periodo={periodo}
          dataPadrao={dataPadrao}
          aoConcluir={aoFechar}
        />
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  movimentacao,
  periodo,
  dataPadrao,
  aoConcluir,
}: {
  movimentacao: MovimentacaoResumo | null;
  periodo: { inicio: string; fim: string };
  dataPadrao: string;
  aoConcluir: () => void;
}) {
  const prefixo = useId();
  const pessoas = movimentacao?.pessoas ?? [];

  const [tipo, setTipo] = useState<TipoDeMovimentacao>(movimentacao?.tipo ?? "falta");

  // Os dois grupos de pessoa ficam vivos ao mesmo tempo: trocar o tipo e voltar
  // nao pode apagar quem ja tinha sido escolhido. Quem vai no envio e so o grupo
  // do tipo atual.
  const [ausente, setAusente] = useState<Escolha>(() => escolhaDoPapel(pessoas, "ausente"));
  const [cobertura, setCobertura] = useState<Escolha>(() => escolhaDoPapel(pessoas, "cobertura"));
  const [envolvidos, setEnvolvidos] = useState<(Escolha & { chave: string })[]>(() => {
    const gravados = pessoas
      .filter((pessoa) => pessoa.papel === "envolvido")
      .map((pessoa): Escolha & { chave: string } => ({
        chave: pessoa.valor,
        valor: pessoa.valor,
        nome: pessoa.nome,
      }));

    // Troca nasce com as duas vagas que ela sempre tem.
    while (gravados.length < MINIMO_NA_TROCA) {
      gravados.push({ chave: crypto.randomUUID(), ...NINGUEM });
    }

    return gravados;
  });

  const [fila, setFila] = useState<ItemDaFila[]>([]);
  const [removidos, setRemovidos] = useState<ReadonlySet<string>>(new Set());

  /*
    O envio chama a action pela mao (`onSubmit` + `startTransition`), e nao por
    `<form action>`: os arquivos moram no estado da fila, e nao num
    `input[type=file]` — so assim a imagem reduzida e a que vai. E, de quebra,
    o React nao reseta o formulario depois da action, entao a recusa deixa tudo
    o que foi digitado no lugar.
  */
  const [estado, despachar, pendente] = useActionState(
    async (anterior: typeof estadoInicialSalvarMovimentacao, dados: FormData) => {
      const resposta = await salvarMovimentacao(anterior, dados);

      if (resposta.status === "success") {
        toast.success(resposta.mensagem);
        aoConcluir();
      } else if (!resposta.erros) {
        toast.error(resposta.mensagem);
      }

      return resposta;
    },
    estadoInicialSalvarMovimentacao,
  );

  const processando = fila.some((item) => item.estado === "processando");
  const erros = estado.status === "error" ? estado.erros : undefined;

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (processando) {
      toast.info("Aguarde a reducao das imagens terminar.");
      return;
    }

    const dados = new FormData(evento.currentTarget);

    for (const item of fila) {
      if (item.estado === "pronto") {
        dados.append("documentos", item.arquivo, item.arquivo.name);
      }
    }

    startTransition(() => despachar(dados));
  }

  const troca = ehTroca(tipo);

  return (
    <>
      <form id={`${prefixo}-form`} onSubmit={enviar} className="space-y-5">
        {movimentacao ? (
          <input type="hidden" name="movimentacaoId" value={movimentacao.id} />
        ) : null}

        {[...removidos].map((id) => (
          <input key={id} type="hidden" name="removerDocumentos" value={id} />
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-tipo`}>Tipo</Label>
            <NativeSelect
              id={`${prefixo}-tipo`}
              name="tipo"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as TipoDeMovimentacao)}
            >
              {IDS_TIPO_DE_MOVIMENTACAO.map((id) => (
                <option key={id} value={id}>
                  {ROTULOS_TIPO_DE_MOVIMENTACAO[id]}
                </option>
              ))}
            </NativeSelect>
            <Erro id={`${prefixo}-tipo-erro`} mensagens={erros?.tipo} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-data`}>Data</Label>
            {/* `min`/`max` sao a competencia; quem posta outra data esbarra na action. */}
            <Input
              id={`${prefixo}-data`}
              name="data"
              type="date"
              required
              min={periodo.inicio}
              max={periodo.fim}
              defaultValue={movimentacao?.data ?? dataPadrao}
              aria-invalid={Boolean(erros?.data)}
            />
            <Erro id={`${prefixo}-data-erro`} mensagens={erros?.data} />
          </div>
        </div>

        {troca ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Pessoas envolvidas</legend>

            {envolvidos.map((pessoa, indice) => (
              <div key={pessoa.chave} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <CampoPessoa
                    id={`${prefixo}-envolvido-${pessoa.chave}`}
                    name="envolvidos"
                    valor={pessoa.valor}
                    nome={pessoa.nome}
                    aoEscolher={(escolha) =>
                      setEnvolvidos((atual) =>
                        atual.map((item) =>
                          item.chave === pessoa.chave ? { ...item, ...escolha } : item,
                        ),
                      )
                    }
                    buscar={buscarPessoasDaMovimentacao}
                    rotuloDaBusca={`Buscar a ${indice + 1}a pessoa da troca`}
                    textoVazio={`${indice + 1}a pessoa`}
                    textoLimpar="Limpar esta pessoa"
                  />
                </div>

                {envolvidos.length > MINIMO_NA_TROCA ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Tirar esta vaga"
                    onClick={() =>
                      setEnvolvidos((atual) => atual.filter((item) => item.chave !== pessoa.chave))
                    }
                  >
                    <X aria-hidden />
                    <span className="sr-only">Tirar a {indice + 1}a pessoa</span>
                  </Button>
                ) : null}
              </div>
            ))}

            {envolvidos.length < MAXIMO_NA_TROCA ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setEnvolvidos((atual) => [...atual, { chave: crypto.randomUUID(), ...NINGUEM }])
                }
              >
                <Plus aria-hidden />
                Adicionar pessoa
              </Button>
            ) : null}

            <Erro id={`${prefixo}-envolvidos-erro`} mensagens={erros?.envolvidos} />
          </fieldset>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${prefixo}-ausente`}>Quem faltou</Label>
              <CampoPessoa
                id={`${prefixo}-ausente`}
                name="ausente"
                valor={ausente.valor}
                nome={ausente.nome}
                aoEscolher={setAusente}
                erro={erros?.ausente?.[0]}
                buscar={buscarPessoasDaMovimentacao}
                rotuloDaBusca="Buscar quem faltou"
                textoVazio="Escolha quem faltou"
                textoLimpar="Limpar quem faltou"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${prefixo}-cobertura`}>
                Quem cobriu <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <CampoPessoa
                id={`${prefixo}-cobertura`}
                name="cobertura"
                valor={cobertura.valor}
                nome={cobertura.nome}
                aoEscolher={setCobertura}
                erro={erros?.cobertura?.[0]}
                buscar={buscarPessoasDaMovimentacao}
                rotuloDaBusca="Buscar quem cobriu"
                textoVazio="Ninguem"
                textoLimpar="Limpar quem cobriu"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`${prefixo}-justificativa`}>Justificativa</Label>
          <Textarea
            id={`${prefixo}-justificativa`}
            name="justificativa"
            required
            rows={3}
            maxLength={JUSTIFICATIVA_MAXIMA}
            defaultValue={movimentacao?.justificativa}
            aria-invalid={Boolean(erros?.justificativa)}
          />
          <Erro id={`${prefixo}-justificativa-erro`} mensagens={erros?.justificativa} />
        </div>

        <div className="space-y-2">
          {/* Texto, e nao `<Label>`: o alvo e uma area de soltar, e nao um campo. */}
          <p className="text-sm leading-none font-medium">Documentos</p>
          <CampoDocumentos
            fila={fila}
            setFila={setFila}
            gravados={movimentacao?.documentos ?? []}
            removidos={removidos}
            alternarRemocao={(id) =>
              setRemovidos((atual) => {
                const proximo = new Set(atual);

                if (!proximo.delete(id)) {
                  proximo.add(id);
                }

                return proximo;
              })
            }
            erro={erros?.documentos?.[0]}
          />
        </div>
      </form>

      <DialogFooter className="justify-between">
        {movimentacao ? <Excluir movimentacao={movimentacao} aoConcluir={aoConcluir} /> : <span />}

        <Button type="submit" form={`${prefixo}-form`} disabled={pendente || processando}>
          {pendente ? <LoaderCircle className="animate-spin" /> : <Save aria-hidden />}
          {pendente ? "Salvando..." : processando ? "Reduzindo imagens..." : "Salvar"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Excluir pede um segundo clique: e o unico gesto do modal sem desfazer, e leva
 * junto os documentos. Form proprio, fora do da movimentacao — `<form>` dentro
 * de `<form>` nao existe em HTML.
 */
function Excluir({
  movimentacao,
  aoConcluir,
}: {
  movimentacao: MovimentacaoResumo;
  aoConcluir: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [, despachar, pendente] = useActionState(
    async (anterior: typeof estadoInicialExcluirMovimentacao, dados: FormData) => {
      const resposta = await excluirMovimentacao(anterior, dados);

      if (resposta.status === "success") {
        toast.success(resposta.mensagem);
        aoConcluir();
      } else {
        toast.error(resposta.mensagem);
      }

      return resposta;
    },
    estadoInicialExcluirMovimentacao,
  );

  if (!confirmando) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirmando(true)}>
        <Trash2 aria-hidden />
        Excluir
      </Button>
    );
  }

  return (
    <form action={despachar} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="movimentacaoId" value={movimentacao.id} />
      <span className="text-muted-foreground text-sm">
        Excluir com {movimentacao.documentos.length} documento(s)?
      </span>
      <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Trash2 aria-hidden />}
        Confirmar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
        Cancelar
      </Button>
    </form>
  );
}

function escolhaDoPapel(
  pessoas: MovimentacaoResumo["pessoas"],
  papel: "ausente" | "cobertura",
): Escolha {
  const pessoa = pessoas.find((item) => item.papel === papel);
  return pessoa ? { valor: pessoa.valor, nome: pessoa.nome } : NINGUEM;
}

function Erro({ id, mensagens }: { id: string; mensagens?: string[] }) {
  return mensagens?.[0] ? (
    <p id={id} className="text-destructive text-sm">
      {mensagens[0]}
    </p>
  ) : null;
}
