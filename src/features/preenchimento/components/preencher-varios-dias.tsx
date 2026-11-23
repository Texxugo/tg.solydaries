"use client";

import { CalendarRange, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { EventoDaGrade } from "@/features/eventos/types";
import { preencherDias } from "@/features/preenchimento/actions";
import {
  estadoInicialPreencherDias,
  type GrupoDaGrade,
  type LinhaDaGrade,
} from "@/features/preenchimento/types";

type Props = {
  postoId: string;
  grupos: readonly GrupoDaGrade[];
  /** As datas da competencia — os limites do intervalo. */
  dias: readonly string[];
  eventos: readonly EventoDaGrade[];
  /** `YYYY-MM-DD` do servidor, para o "ate" nascer em hoje. */
  hoje: string;
  /** Se o dia ja tem registro, contando o que foi gravado nesta sessao. */
  jaPreenchido: (linha: LinhaDaGrade, data: string) => boolean;
};

/**
 * Preenche o realizado de varios dias de uma vez: o dia a dia sem novidade, que
 * pelo modal custava abrir e gravar celula por celula.
 *
 * So dia em branco e preenchido — a action garante, e a tela ja conta assim
 * antes de enviar. O que mudou num dia continua sendo feito no modal daquele
 * dia.
 */
export function PreencherVariosDias(props: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <CalendarRange aria-hidden />
        Preencher varios dias
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          {/* Montado so aberto: cada abertura recomeca com todas as pessoas e o
              intervalo padrao, em vez de herdar a escolha da vez anterior. */}
          {aberto ? <Conteudo {...props} aoFechar={() => setAberto(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Conteudo({
  postoId,
  grupos,
  dias,
  eventos,
  hoje,
  jaPreenchido,
  aoFechar,
}: Props & { aoFechar: () => void }) {
  const primeiro = dias[0] ?? "";
  const ultimo = dias[dias.length - 1] ?? "";
  const todas = grupos.flatMap((grupo) => grupo.linhas);

  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(
    () => new Set(todas.map((linha) => linha.id)),
  );
  const [de, setDe] = useState(primeiro);
  // Ate hoje, e nao ate o fim do periodo: o realizado e do que ja aconteceu.
  const [ate, setAte] = useState(hoje < primeiro ? primeiro : hoje > ultimo ? ultimo : hoje);
  const [sigla, setSigla] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // Sigla que pede quem cobriu ou para onde a pessoa foi e detalhe de um dia, e
  // nao de um intervalo — a action recusa, entao a lista nem oferece.
  const siglas = eventos.filter((evento) => !evento.exigePessoa && !evento.exigeDestino);
  const intervaloValido = Boolean(de && ate && de <= ate);

  /*
    A mesma conta que a action faz, com o que a tela ja tem: dia com registro
    fica como esta, e sem sigla escolhida so o dia com previsto tem o que copiar.
    E o numero no botao — quem confirma sabe quantas celulas vao mudar.
  */
  let aPreencher = 0;
  let ocupados = 0;

  if (intervaloValido) {
    for (const linha of todas) {
      if (!selecionadas.has(linha.id)) {
        continue;
      }

      for (const data of dias) {
        if (data < de || data > ate) {
          continue;
        }

        if (jaPreenchido(linha, data)) {
          ocupados += 1;
        } else if (sigla || linha.previsto[data]) {
          aPreencher += 1;
        }
      }
    }
  }

  function alternar(id: string, marcado: boolean) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);

      if (marcado) {
        proximo.add(id);
      } else {
        proximo.delete(id);
      }

      return proximo;
    });
    setErro(null);
  }

  /*
    `onSubmit` com `preventDefault`, e nao `action={...}`: o React reseta o
    formulario depois de toda action, e o Radix repassa esse reset para as
    caixas — uma recusa voltaria a marcar todo mundo. Aqui nao ha reset nenhum.
  */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);

    setErro(null);
    iniciar(async () => {
      const resposta = await preencherDias(estadoInicialPreencherDias, formData);

      if (resposta.status === "success" && resposta.preenchidos) {
        toast.success(resposta.mensagem);
        aoFechar();
        return;
      }

      setErro(resposta.mensagem ?? "Nao foi possivel preencher os dias.");
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Preencher varios dias</DialogTitle>
        <DialogDescription>
          Grava de uma vez o realizado dos dias <strong>em branco</strong>. Dia que ja tem registro
          fica como esta — o que mudou continua sendo feito no proprio dia.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={enviar} className="space-y-4">
        <input type="hidden" name="postoId" value={postoId} />
        {[...selecionadas].map((id) => (
          <input key={id} type="hidden" name="linhaId" value={id} />
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="varios-de">De</Label>
            <Input
              id="varios-de"
              name="de"
              type="date"
              min={primeiro}
              max={ultimo}
              value={de}
              onChange={(campo) => {
                setDe(campo.target.value);
                setErro(null);
              }}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="varios-ate">Ate</Label>
            <Input
              id="varios-ate"
              name="ate"
              type="date"
              min={de || primeiro}
              max={ultimo}
              value={ate}
              onChange={(campo) => {
                setAte(campo.target.value);
                setErro(null);
              }}
              required
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="varios-sigla">O que gravar</Label>
            <NativeSelect
              id="varios-sigla"
              name="sigla"
              value={sigla}
              onChange={(campo) => {
                setSigla(campo.target.value);
                setErro(null);
              }}
              aria-describedby="varios-sigla-ajuda"
            >
              <option value="">Igual ao previsto</option>
              {siglas.map((evento) => (
                <option key={evento.id} value={evento.id}>
                  {evento.codigo} — {evento.rotulo}
                </option>
              ))}
            </NativeSelect>
            <p id="varios-sigla-ajuda" className="text-muted-foreground text-sm">
              {sigla
                ? "A mesma sigla em todos os dias em branco do intervalo."
                : "A sigla que a faixa P de cada pessoa mostra, sem horario: em branco, o dia seguiu a jornada da funcao."}
            </p>
          </div>
        </div>

        <div role="group" aria-labelledby="varios-quem" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span id="varios-quem" className="text-sm font-medium">
              Quem ({selecionadas.size} de {todas.length})
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelecionadas(new Set(todas.map((linha) => linha.id)))}
              >
                Todos
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelecionadas(new Set())}
              >
                Nenhum
              </Button>
            </div>
          </div>

          <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border p-3">
            {grupos
              .filter((grupo) => grupo.linhas.length > 0)
              .map((grupo) => (
                <div key={grupo.funcaoId} className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium">{grupo.funcaoNome}</p>
                  {grupo.linhas.map((linha) => (
                    <div key={linha.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`varios-${linha.id}`}
                        checked={selecionadas.has(linha.id)}
                        onCheckedChange={(marcado) => alternar(linha.id, marcado === true)}
                      />
                      <Label htmlFor={`varios-${linha.id}`} className="font-normal">
                        {linha.nome}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>

        {erro ? (
          <p role="alert" className="text-destructive text-sm">
            {erro}
          </p>
        ) : null}

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-muted-foreground text-sm">
            {intervaloValido
              ? ocupados > 0
                ? `${ocupados} ja preenchidos ficam como estao`
                : "Nenhum dia do intervalo tem registro ainda"
              : "O ultimo dia precisa vir depois do primeiro"}
          </p>

          <Button type="submit" disabled={pendente || aPreencher === 0}>
            {pendente ? <LoaderCircle className="animate-spin" /> : null}
            Preencher {aPreencher} {aPreencher === 1 ? "dia" : "dias"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
