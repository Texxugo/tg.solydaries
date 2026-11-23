"use client";

import { ChevronLeft, ChevronRight, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FuncaoTurma } from "@/db/schema";
import { formatarData } from "@/features/competencias/periodo";
import { descricaoDoCiclo } from "@/features/escalas/jornada";
import { removerVigencia, salvarVigencia } from "@/features/postos/actions";
import { DiasDasTurmas } from "@/features/postos/components/dias-das-turmas";
import { estadoInicialVigencia, type PeriodoDaPrevia } from "@/features/postos/types";
import {
  ordenarVigencias,
  rotuloDaTurma,
  rotuloDaVigencia,
  TURMAS,
  type VigenciaDoCiclo,
} from "@/features/preenchimento/previsto";
import { cn } from "@/lib/utils";

/**
 * O contrato de uma turma ao longo do tempo: as vigencias dela, cada uma numa
 * linha em portugues, e o formulario de quem clicar em Editar ou em Adicionar.
 *
 * O formulario desenha, enquanto se digita, os dias que a turma passa a ter no
 * periodo — ao lado da outra turma, para a alternancia se conferir antes de
 * gravar. "Folgas: 2" e "ancora: 21/09" eram campos que so se entendiam depois
 * de abrir a grade.
 */
export function VigenciasDaTurma({
  funcaoId,
  turma,
  vigenciasDaFuncao,
  periodo,
  sigla,
  aoFechar,
}: {
  funcaoId: string;
  turma: FuncaoTurma;
  /** As das duas turmas: a outra aparece na previa, para comparar. */
  vigenciasDaFuncao: readonly VigenciaDoCiclo[];
  periodo: PeriodoDaPrevia;
  sigla: string;
  aoFechar: () => void;
}) {
  const vigencias = ordenarVigencias(
    vigenciasDaFuncao.filter((vigencia) => vigencia.turma === turma),
  );
  /** `"nova"`, o id da vigencia em edicao, ou `null`. Um formulario por vez. */
  const [editando, setEditando] = useState<string | null>(() =>
    vigencias.length === 0 ? "nova" : null,
  );

  return (
    <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{rotuloDaTurma(turma)}: vigencias</h4>
        <Button type="button" variant="ghost" size="sm" onClick={aoFechar}>
          <X aria-hidden />
          Fechar
        </Button>
      </div>

      {vigencias.length > 0 ? (
        <ul className="bg-card divide-y rounded-md border">
          {vigencias.map((vigencia, indice) => (
            <li key={vigencia.id} className="space-y-3 px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <DescricaoDaVigencia
                  vigencia={vigencia}
                  proxima={vigencias[indice + 1] ?? null}
                  periodo={periodo}
                />

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditando((atual) => (atual === vigencia.id ? null : vigencia.id))
                    }
                    aria-expanded={editando === vigencia.id}
                  >
                    {editando === vigencia.id ? <X aria-hidden /> : <Pencil aria-hidden />}
                    {editando === vigencia.id ? "Cancelar" : "Editar"}
                  </Button>
                  <RemoverVigencia vigenciaId={vigencia.id} />
                </div>
              </div>

              {editando === vigencia.id ? (
                <VigenciaForm
                  funcaoId={funcaoId}
                  turma={turma}
                  vigencia={vigencia}
                  vigenciasDaFuncao={vigenciasDaFuncao}
                  periodo={periodo}
                  sigla={sigla}
                  aoConcluir={() => setEditando(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editando === "nova" ? (
        <div className="bg-card space-y-3 rounded-md border p-3">
          <h5 className="text-sm font-medium">
            {vigencias.length === 0 ? "Definir a escala desta turma" : "Nova mudanca de escala"}
          </h5>
          <VigenciaForm
            funcaoId={funcaoId}
            turma={turma}
            vigenciasDaFuncao={vigenciasDaFuncao}
            periodo={periodo}
            sigla={sigla}
            aoConcluir={() => setEditando(null)}
          />
          {vigencias.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          ) : null}
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditando("nova")}>
          <Plus aria-hidden />
          {vigencias.length === 0 ? "Definir a escala" : "Mudanca de escala a partir de uma data"}
        </Button>
      )}
    </div>
  );
}

/**
 * A vigencia em portugues: a partir de quando, o padrao, o horario, quais dias
 * do ciclo sao folga e em que dia ele comeca. E avisa quando ela foi substituida
 * antes do periodo — vigencia que nao vale em dia nenhum confunde quem le a
 * lista achando que ela ainda manda.
 */
function DescricaoDaVigencia({
  vigencia,
  proxima,
  periodo,
}: {
  vigencia: VigenciaDoCiclo;
  proxima: VigenciaDoCiclo | null;
  periodo: PeriodoDaPrevia;
}) {
  const substituida =
    proxima?.vigenciaInicio !== null &&
    proxima?.vigenciaInicio !== undefined &&
    proxima.vigenciaInicio <= periodo.primeiroDia;

  return (
    <div className={cn("min-w-0 space-y-0.5", substituida && "opacity-60")}>
      <p className="text-sm">
        <span className="text-muted-foreground">
          {vigencia.vigenciaInicio
            ? `A partir de ${formatarData(vigencia.vigenciaInicio)}: `
            : "Desde sempre: "}
        </span>
        <span className="font-medium">{rotuloDaVigencia(vigencia)}</span>
      </p>
      <p className="text-muted-foreground text-xs">
        {descricaoDoCiclo(vigencia)} · folga no dia {vigencia.folgas.join(" e ")} do ciclo
        {vigencia.inicioCiclo
          ? ` · ciclo comeca em ${formatarData(vigencia.inicioCiclo)}`
          : vigencia.vigenciaInicio
            ? " · ciclo comeca no dia em que passa a valer"
            : " · ciclo comeca no 1o dia da competencia"}
      </p>
      {substituida ? (
        <p className="text-muted-foreground text-xs italic">
          Substituida antes deste periodo — nao vale em nenhum dia dele.
        </p>
      ) : null}
    </div>
  );
}

/** Os ciclos mais comuns. Atalho, e nao lista fechada: os campos continuam livres. */
const MODELOS = [
  { rotulo: "12x36", diasCiclo: 2, folgas: [2] },
  { rotulo: "5x2", diasCiclo: 7, folgas: [6, 7] },
  { rotulo: "6x1", diasCiclo: 7, folgas: [7] },
  { rotulo: "5x1", diasCiclo: 6, folgas: [6] },
  { rotulo: "4x2", diasCiclo: 6, folgas: [5, 6] },
  { rotulo: "6x1 folga alternada", diasCiclo: 14, folgas: [7, 13] },
] as const;

/** `YYYY-MM-DD` mais ou menos `n` dias, contado inteiro em UTC como em `diaSeguinte()`. */
function somarDias(data: string, n: number) {
  const dia = new Date(`${data}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + n);
  return dia.toISOString().slice(0, 10);
}

/**
 * Uma vigencia — a existente (com `vigencia`) ou a nova.
 *
 * Os campos sao controlados, ao contrario do resto do portal, porque a previa
 * acompanha cada tecla. Pelo mesmo motivo o envio monta o `FormData` a mao
 * (`onSubmit` + `startTransition`), como em movimentacoes: com `<form action>`
 * o React resetaria o formulario depois da action, e a recusa levaria junto o
 * que foi digitado. Os nomes dos campos sao os de sempre, entao
 * `salvarVigencia` nao muda.
 */
function VigenciaForm({
  funcaoId,
  turma,
  vigencia,
  vigenciasDaFuncao,
  periodo,
  sigla,
  aoConcluir,
}: {
  funcaoId: string;
  turma: FuncaoTurma;
  vigencia?: VigenciaDoCiclo;
  vigenciasDaFuncao: readonly VigenciaDoCiclo[];
  periodo: PeriodoDaPrevia;
  sigla: string;
  aoConcluir: () => void;
}) {
  const [estado, formAction, pendente] = useActionState(salvarVigencia, estadoInicialVigencia);

  const [vigenciaInicio, setVigenciaInicio] = useState(vigencia?.vigenciaInicio ?? "");
  const [diasCiclo, setDiasCiclo] = useState(vigencia?.diasCiclo ?? 2);
  const [folgas, setFolgas] = useState<number[]>(() => [...(vigencia?.folgas ?? [2])]);
  const [entrada, setEntrada] = useState(vigencia?.entrada ?? "06:00");
  const [saida, setSaida] = useState(vigencia?.saida ?? "18:00");
  const [inicioCiclo, setInicioCiclo] = useState(vigencia?.inicioCiclo ?? "");

  // Fechar o formulario e gesto do pai; como efeito de evento, a funcao nova
  // que ele passa a cada render nao reexecuta o aviso.
  const concluir = useEffectEvent(aoConcluir);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
      concluir();
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  // Folga marcada alem do tamanho atual continua no estado — encurtar e voltar a
  // crescer nao apaga o que foi marcado —, mas nao vai no envio nem na previa.
  const folgasNoCiclo = folgas.filter((dia) => dia <= diasCiclo).sort((a, b) => a - b);
  const cicloValido =
    diasCiclo >= 1 && diasCiclo <= 62 && folgasNoCiclo.length < diasCiclo && entrada && saida;

  // O dia em que a posicao 1 cai quando o campo fica em branco — o mesmo de
  // `ancoraDaVigencia()`.
  const ancoraPadrao = vigenciaInicio || periodo.primeiroDia;

  const rascunho: VigenciaDoCiclo = {
    id: vigencia?.id ?? "rascunho",
    turma,
    vigenciaInicio: vigenciaInicio || null,
    diasCiclo,
    folgas: folgasNoCiclo,
    entrada,
    saida,
    inicioCiclo: inicioCiclo || null,
  };

  const daTurma = vigenciasDaFuncao.filter(
    (atual) => atual.turma === turma && atual.id !== vigencia?.id,
  );
  const outra = TURMAS.find((atual) => atual.id !== turma)!;
  const daOutra = vigenciasDaFuncao.filter((atual) => atual.turma === outra.id);

  function alternarFolga(dia: number) {
    setFolgas((atuais) =>
      atuais.includes(dia) ? atuais.filter((marcado) => marcado !== dia) : [...atuais, dia],
    );
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => formAction(dados));
  }

  const erro = (campo: keyof NonNullable<typeof estado.erros>) => estado.erros?.[campo]?.[0];
  const id = (campo: string) => `${vigencia?.id ?? `nova-${turma}-${funcaoId}`}-${campo}`;

  return (
    <form onSubmit={enviar} className="space-y-4">
      <input type="hidden" name="funcaoId" value={funcaoId} />
      <input type="hidden" name="vigenciaId" value={vigencia?.id ?? ""} />
      <input type="hidden" name="turma" value={turma} />
      <input type="hidden" name="folgas" value={folgasNoCiclo.join(" ")} />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={id("vigenciaInicio")}>Vale a partir de</Label>
          <Input
            id={id("vigenciaInicio")}
            name="vigenciaInicio"
            type="date"
            className="h-8"
            value={vigenciaInicio}
            onChange={(evento) => setVigenciaInicio(evento.target.value)}
            aria-invalid={Boolean(erro("vigenciaInicio"))}
          />
          <Ajuda erro={erro("vigenciaInicio")}>
            Em branco: desde sempre. Use uma data quando a escala mudar no meio do periodo.
          </Ajuda>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={id("entrada")}>Entrada</Label>
            <Input
              id={id("entrada")}
              name="entrada"
              type="time"
              className="h-8"
              value={entrada}
              onChange={(evento) => setEntrada(evento.target.value)}
              aria-invalid={Boolean(erro("entrada"))}
            />
            <Ajuda erro={erro("entrada")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("saida")}>Saida</Label>
            <Input
              id={id("saida")}
              name="saida"
              type="time"
              className="h-8"
              value={saida}
              onChange={(evento) => setSaida(evento.target.value)}
              aria-invalid={Boolean(erro("saida"))}
            />
            <Ajuda erro={erro("saida")}>
              {saida && entrada && saida < entrada ? "Vira o dia." : null}
            </Ajuda>
          </div>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Ciclo</legend>

        <div className="flex flex-wrap gap-1.5">
          {MODELOS.map((modelo) => {
            const atual =
              modelo.diasCiclo === diasCiclo &&
              modelo.folgas.length === folgasNoCiclo.length &&
              modelo.folgas.every((dia) => folgasNoCiclo.includes(dia));

            return (
              <Button
                key={modelo.rotulo}
                type="button"
                size="xs"
                variant={atual ? "default" : "outline"}
                aria-pressed={atual}
                onClick={() => {
                  setDiasCiclo(modelo.diasCiclo);
                  setFolgas([...modelo.folgas]);
                }}
              >
                {modelo.rotulo}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-24 space-y-1.5">
            <Label htmlFor={id("diasCiclo")}>Dias do ciclo</Label>
            <Input
              id={id("diasCiclo")}
              name="diasCiclo"
              type="number"
              inputMode="numeric"
              min={1}
              max={62}
              className="h-8"
              value={diasCiclo}
              onChange={(evento) => setDiasCiclo(Number(evento.target.value))}
              aria-invalid={Boolean(erro("diasCiclo"))}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Folga em quais dias do ciclo</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Dias de folga do ciclo">
              {Array.from({ length: Math.min(Math.max(diasCiclo, 0), 62) }, (_, i) => i + 1).map(
                (dia) => {
                  const folga = folgasNoCiclo.includes(dia);

                  return (
                    <button
                      key={dia}
                      type="button"
                      aria-pressed={folga}
                      title={folga ? `Dia ${dia}: folga` : `Dia ${dia}: trabalho`}
                      onClick={() => alternarFolga(dia)}
                      className={cn(
                        "focus-visible:ring-ring/50 flex h-8 w-8 flex-col items-center justify-center rounded-md border text-[10px] leading-none outline-none focus-visible:ring-3",
                        folga
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/30 text-foreground border-primary/40",
                      )}
                    >
                      <span className="font-medium">{dia}</span>
                      <span>{folga ? "F" : sigla}</span>
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </div>
        <Ajuda erro={erro("diasCiclo") ?? erro("folgas")}>
          Clique no dia do ciclo para trocar entre trabalho e folga.
        </Ajuda>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={id("inicioCiclo")}>Dia 1 do ciclo cai em</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="Um dia antes"
            onClick={() => setInicioCiclo(somarDias(inicioCiclo || ancoraPadrao, -1))}
          >
            <ChevronLeft aria-hidden />
            <span className="sr-only">Um dia antes</span>
          </Button>
          <Input
            id={id("inicioCiclo")}
            name="inicioCiclo"
            type="date"
            className="h-8 w-40"
            value={inicioCiclo}
            onChange={(evento) => setInicioCiclo(evento.target.value)}
            aria-invalid={Boolean(erro("inicioCiclo"))}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="Um dia depois"
            onClick={() => setInicioCiclo(somarDias(inicioCiclo || ancoraPadrao, 1))}
          >
            <ChevronRight aria-hidden />
            <span className="sr-only">Um dia depois</span>
          </Button>
          {inicioCiclo ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setInicioCiclo("")}>
              Limpar
            </Button>
          ) : null}
        </div>
        <Ajuda erro={erro("inicioCiclo")}>
          {inicioCiclo
            ? "As setas empurram a escala um dia — e assim que escala e contraescala se alternam."
            : `Em branco: ${formatarData(ancoraPadrao)}${vigenciaInicio ? ", o dia em que passa a valer" : ", o 1o dia da competencia"}. As setas empurram a escala um dia.`}
        </Ajuda>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Como fica em {periodo.rotulo}</p>
        <div className="bg-card rounded-md border p-2">
          <DiasDasTurmas
            periodo={periodo}
            sigla={sigla}
            turmas={[
              {
                rotulo: rotuloDaTurma(turma),
                vigencias: cicloValido ? [...daTurma, rascunho] : daTurma,
                rascunho: true,
              },
              ...(daOutra.length > 0 ? [{ rotulo: outra.rotulo, vigencias: daOutra }] : []),
            ]}
          />
        </div>
      </div>

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Gravando..." : vigencia ? "Gravar vigencia" : "Adicionar vigencia"}
      </Button>
    </form>
  );
}

function Ajuda({ erro, children }: { erro?: string; children?: React.ReactNode }) {
  if (erro) {
    return <p className="text-destructive text-xs">{erro}</p>;
  }

  return children ? <p className="text-muted-foreground text-xs">{children}</p> : null;
}

/**
 * Formulario proprio, fora do de edicao, e com segundo clique: remover e outro
 * gesto, e a vigencia removida muda o previsto da grade inteira dessa turma.
 */
function RemoverVigencia({ vigenciaId }: { vigenciaId: string }) {
  const [estado, formAction, pendente] = useActionState(removerVigencia, estadoInicialVigencia);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction}>
      <input type="hidden" name="vigenciaId" value={vigenciaId} />

      {confirmando ? (
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={pendente}
          onBlur={() => setConfirmando(false)}
          autoFocus
        >
          {pendente ? <LoaderCircle className="animate-spin" /> : null}
          Remover?
        </Button>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          title="Remover vigencia"
          onClick={() => setConfirmando(true)}
        >
          <Trash2 aria-hidden />
          <span className="sr-only">Remover vigencia</span>
        </Button>
      )}
    </form>
  );
}
