"use client";

import { LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { FuncaoTurma } from "@/db/schema";
import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { classesDaCor } from "@/features/eventos/cores";
import type { EventoDaGrade } from "@/features/eventos/types";
import { definirPessoasDaFuncao, removerLinha } from "@/features/preenchimento/actions";
import { diaDoMes, ehFimDeSemana } from "@/features/preenchimento/grade";
import {
  derivarPrevisto,
  rotuloDasVigencias,
  rotuloDaTurma,
  siglasDaLinha,
  TURMAS,
  vigenciaDoDia,
} from "@/features/preenchimento/previsto";
import {
  estadoInicialLinha,
  type GrupoDaGrade,
  type LinhaDaGrade,
  type PrevistoDoDia,
} from "@/features/preenchimento/types";
import { cn } from "@/lib/utils";

/**
 * As pessoas do posto, uma tabela por funcao: qual turma cada uma segue, que
 * sigla o previsto dela escreve, a observacao da linha e a retirada.
 *
 * **A escolha se le nos dias, e nao num rotulo.** Cada linha mostra o previsto
 * do periodo inteiro com o que esta escolhido na tela — inclusive antes de
 * gravar —, alinhado com as outras pessoas da funcao, e o rodape conta quantas
 * trabalham em cada dia por sigla. E isso que responde "as duas se alternam?" e
 * "a noite do dia 22 ficou descoberta?", que eram as perguntas que "Turma:
 * Escala" e "Sigla: Da funcao" nao respondiam.
 *
 * **Uma gravacao por funcao**, com o que mudou. Montar a alternancia e mexer em
 * duas ou tres pessoas olhando a cobertura; gravar uma por vez redesenhava a
 * tela entre um ajuste e outro.
 *
 * O **ciclo** nao esta aqui — ele e da funcao, e se muda em Postos de trabalho.
 * Vive fora da grade porque retirar alguem por engano nao pode levar junto o que
 * estava sendo preenchido nela.
 */
export function PessoasDoPosto({
  grupos,
  dias,
  competenciaId,
  eventosDeTrabalho,
}: {
  grupos: readonly GrupoDaGrade[];
  /** As datas do periodo — as colunas da previa. */
  dias: readonly string[];
  /** A competencia em que a tela foi desenhada: a gravacao recusa se ela mudou. */
  competenciaId: string;
  /** As siglas que o previsto de uma linha pode escrever — as de natureza `trabalho`. */
  eventosDeTrabalho: readonly EventoDaGrade[];
}) {
  if (grupos.every((grupo) => grupo.linhas.length === 0)) {
    return (
      <p className="text-muted-foreground text-sm">
        Ninguem na escala deste posto ainda. Inclua alguem na aba <strong>Incluir</strong>.
      </p>
    );
  }

  // Agrupado pela funcao, na ordem da grade: quem procura alguem aqui acabou de
  // ve-lo naquela ordem, e reordenar so faria a lista discordar da tabela.
  return (
    <div className="space-y-10">
      {grupos.map((grupo) => (
        <PessoasDaFuncao
          key={grupo.funcaoId}
          grupo={grupo}
          dias={dias}
          competenciaId={competenciaId}
          eventosDeTrabalho={eventosDeTrabalho}
        />
      ))}
    </div>
  );
}

/** O que a tela diz de uma linha: o que esta gravado ou o rascunho. */
type Escolha = {
  turma: FuncaoTurma;
  /** `""` = a sigla da funcao. */
  eventoTrabalhoId: string;
  /** `HH:MM` ou `""`. So conta com sigla propria — ver `horarioEnviado()`. */
  horaEntrada: string;
  horaSaida: string;
  observacao: string;
};

function escolhaGravada(linha: LinhaDaGrade): Escolha {
  return {
    turma: linha.turma,
    eventoTrabalhoId: linha.eventoTrabalhoId ?? "",
    horaEntrada: linha.horario?.entrada ?? "",
    horaSaida: linha.horario?.saida ?? "",
    observacao: linha.observacao ?? "",
  };
}

/**
 * O horario que a escolha manda: o digitado, com sigla propria; vazio com a da
 * funcao, cujo horario e o da vigencia. A action faz a mesma conta.
 */
function horarioEnviado(escolha: Escolha) {
  return escolha.eventoTrabalhoId
    ? { entrada: escolha.horaEntrada, saida: escolha.horaSaida }
    : { entrada: "", saida: "" };
}

/**
 * Dono da gravacao, e nao do rascunho: o rascunho remonta quando a leitura nova
 * chega (`key`), e o estado da action nao pode ir junto — o aviso de sucesso se
 * perderia no mesmo commit que traz os dados gravados.
 */
function PessoasDaFuncao({
  grupo,
  dias,
  competenciaId,
  eventosDeTrabalho,
}: {
  grupo: GrupoDaGrade;
  dias: readonly string[];
  competenciaId: string;
  eventosDeTrabalho: readonly EventoDaGrade[];
}) {
  const [estado, formAction, pendente] = useActionState(definirPessoasDaFuncao, estadoInicialLinha);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  // Muda quando a leitura do servidor muda: o rascunho volta ao gravado depois
  // de gravar, e tambem quando outra pessoa grava esta funcao.
  const assinatura = grupo.linhas
    .map((linha) => `${linha.id}:${linha.turma}:${linha.eventoTrabalhoId}:${linha.observacao}`)
    .join("|");

  return (
    <Rascunho
      key={assinatura}
      grupo={grupo}
      dias={dias}
      competenciaId={competenciaId}
      eventosDeTrabalho={eventosDeTrabalho}
      formAction={formAction}
      pendente={pendente}
    />
  );
}

function Rascunho({
  grupo,
  dias,
  competenciaId,
  eventosDeTrabalho,
  formAction,
  pendente,
}: {
  grupo: GrupoDaGrade;
  dias: readonly string[];
  competenciaId: string;
  eventosDeTrabalho: readonly EventoDaGrade[];
  formAction: (formData: FormData) => void;
  pendente: boolean;
}) {
  const gravar = useRef<HTMLFormElement>(null);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>(() =>
    Object.fromEntries(grupo.linhas.map((linha) => [linha.id, escolhaGravada(linha)])),
  );

  const linhas = useMemo(
    () =>
      grupo.linhas.map((linha) => {
        const escolha = escolhas[linha.id] ?? escolhaGravada(linha);
        const gravada = escolhaGravada(linha);
        const horario = horarioEnviado(escolha);
        const horarioGravado = horarioEnviado(gravada);
        const previstoMudou =
          escolha.turma !== gravada.turma ||
          escolha.eventoTrabalhoId !== gravada.eventoTrabalhoId ||
          horario.entrada !== horarioGravado.entrada ||
          horario.saida !== horarioGravado.saida;

        return {
          linha,
          escolha,
          alterada: previstoMudou || escolha.observacao.trim() !== gravada.observacao,
          ...previstoDaEscolha(grupo, linha, escolha, previstoMudou, dias, eventosDeTrabalho),
        };
      }),
    [grupo, escolhas, dias, eventosDeTrabalho],
  );

  const alteradas = linhas.filter((linha) => linha.alterada);

  function escolher(linhaId: string, mudanca: Partial<Escolha>) {
    setEscolhas((atuais) => ({ ...atuais, [linhaId]: { ...atuais[linhaId], ...mudanca } }));
  }

  function descartar() {
    setEscolhas(Object.fromEntries(grupo.linhas.map((linha) => [linha.id, escolhaGravada(linha)])));
  }

  const usaContraescala = grupo.vigencias.some((vigencia) => vigencia.turma === "contraescala");

  /*
    As siglas que fazem sentido no previsto de um periodo inteiro: as de
    trabalho que nao pedem detalhe de dia. Substituicao, troca de turno ou de
    posto nomeiam outra pessoa ou outro bloco naquele dia, e um previsto de
    trinta dias de TT nao diria com quem.
  */
  const siglasOferecidas = eventosDeTrabalho.filter(
    (evento) =>
      evento.codigo !== grupo.siglas?.trabalho.codigo &&
      !evento.exigePessoa &&
      !evento.exigeDestino &&
      !evento.exigeDiaTrabalhado,
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{grupo.funcaoNome}</h3>
          <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 text-xs">
            {TURMAS.filter((turma) => turma.id === "escala" || usaContraescala).map((turma) => (
              <div key={turma.id} className="contents">
                <dt>{turma.rotulo}</dt>
                <dd>
                  {rotuloDasVigencias(
                    grupo.vigencias.filter((vigencia) => vigencia.turma === turma.id),
                  ) ?? "sem vigencia — defina em Postos de trabalho"}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/*
          Os campos da tabela nao pertencem a formulario nenhum: sao controlados,
          e o que vai para a action sao os campos escondidos daqui, so das linhas
          alteradas. Assim a retirada de cada linha pode ter o proprio `<form>`
          dentro da tabela, e a linha intocada nao e reenviada.
        */}
        <form ref={gravar} action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="competenciaId" value={competenciaId} />
          {alteradas.map(({ linha, escolha }) => (
            <div key={linha.id} hidden>
              <input type="hidden" name="linhaId" value={linha.id} />
              <input type="hidden" name="turma" value={escolha.turma} />
              <input type="hidden" name="eventoTrabalhoId" value={escolha.eventoTrabalhoId} />
              <input type="hidden" name="horaEntrada" value={horarioEnviado(escolha).entrada} />
              <input type="hidden" name="horaSaida" value={horarioEnviado(escolha).saida} />
              <input type="hidden" name="observacao" value={escolha.observacao} />
            </div>
          ))}

          {alteradas.length > 0 ? (
            <>
              <span className="text-muted-foreground text-xs">
                {alteradas.length === 1
                  ? "1 pessoa alterada"
                  : `${alteradas.length} pessoas alteradas`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={descartar}
                disabled={pendente}
              >
                Descartar
              </Button>
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente ? <LoaderCircle className="animate-spin" /> : null}
                Gravar
              </Button>
            </>
          ) : null}
        </form>
      </div>

      {grupo.linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ninguem nesta funcao. Inclua alguem na aba <strong>Incluir</strong>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th
                  scope="col"
                  className="bg-card sticky left-0 z-10 w-52 min-w-52 border-r border-b px-3 py-2 text-left font-medium"
                >
                  Pessoa
                </th>
                <th scope="col" className="border-r border-b px-2 py-2 text-left font-medium">
                  Turma e sigla
                </th>
                {dias.map((data) => (
                  <th
                    key={data}
                    scope="col"
                    className={cn(
                      "w-6 min-w-6 border-b py-1 text-center font-normal",
                      ehFimDeSemana(data) && "bg-muted/60",
                    )}
                    title={`${diaDaSemana(data)} ${formatarData(data)}`}
                  >
                    <span className="block text-[10px] leading-none">
                      {diaDaSemana(data).charAt(0)}
                    </span>
                    <span className="text-foreground block font-medium">{diaDoMes(data)}</span>
                  </th>
                ))}
                <th scope="col" className="border-b border-l px-2 py-2 text-left font-medium">
                  Observacao
                </th>
                <th scope="col" className="border-b px-1 py-2">
                  <span className="sr-only">Retirar</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {linhas.map(({ linha, escolha, alterada, previsto, horario, pedeHorario, aviso }) => {
                const fundo = alterada ? "bg-amber-50 dark:bg-amber-950/40" : "bg-card";

                return (
                  <tr key={linha.id}>
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 w-52 max-w-52 min-w-52 border-r border-b px-3 py-2 text-left align-middle font-normal",
                        fundo,
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {linha.nome}
                        {linha.freelancer ? <Badge variant="outline">Freelancer</Badge> : null}
                      </span>
                      <span className="text-muted-foreground flex gap-2 font-mono">
                        {linha.identificacao}
                        {alterada ? (
                          <span className="font-sans text-amber-800 dark:text-amber-300">
                            nao gravado
                          </span>
                        ) : null}
                      </span>
                    </th>

                    <td className={cn("space-y-1 border-r border-b px-2 py-2", fundo)}>
                      <EscolhaDaTurma
                        linha={linha}
                        valor={escolha.turma}
                        semVigencia={(turma) =>
                          !grupo.vigencias.some((vigencia) => vigencia.turma === turma)
                        }
                        aoEscolher={(turma) => escolher(linha.id, { turma })}
                      />
                      <div className="flex items-center gap-2">
                        <NativeSelect
                          aria-label={`Sigla do previsto de ${linha.nome}`}
                          value={escolha.eventoTrabalhoId}
                          onChange={(evento) =>
                            escolher(linha.id, {
                              eventoTrabalhoId: evento.target.value,
                              // Sigla propria sem horario ainda: sugere o turno
                              // complementar ao da vigencia (o 18:00-06:00 de uma
                              // portaria 06:00-18:00). E so sugestao, editavel.
                              ...(evento.target.value && !escolha.horaEntrada && !escolha.horaSaida
                                ? turnoComplementar(grupo, escolha.turma, dias)
                                : {}),
                            })
                          }
                          className="h-7 w-32 text-xs md:text-xs"
                        >
                          <option value="">
                            {grupo.siglas
                              ? `${grupo.siglas.trabalho.codigo} (da funcao)`
                              : "Da funcao"}
                          </option>
                          {siglasOferecidas.map((evento) => (
                            <option key={evento.id} value={evento.id}>
                              {evento.codigo} — {evento.rotulo}
                            </option>
                          ))}
                          {/* A sigla gravada que saiu da lista (desativada, ou
                              que pede detalhe por dia) continua aparecendo, senao
                              o campo mostraria outra. */}
                          {linha.eventoTrabalhoId &&
                          !siglasOferecidas.some(
                            (evento) => evento.id === linha.eventoTrabalhoId,
                          ) ? (
                            <option value={linha.eventoTrabalhoId}>
                              {eventosDeTrabalho.find(
                                (evento) => evento.id === linha.eventoTrabalhoId,
                              )?.codigo ?? "(sigla desativada)"}
                            </option>
                          ) : null}
                        </NativeSelect>
                        {pedeHorario ? (
                          <span className="flex items-center gap-1">
                            <Input
                              type="time"
                              aria-label={`Entrada do previsto de ${linha.nome}`}
                              value={escolha.horaEntrada}
                              onChange={(evento) =>
                                escolher(linha.id, { horaEntrada: evento.target.value })
                              }
                              className="h-7 w-[5.5rem] px-1.5 text-xs md:text-xs"
                            />
                            <span className="text-muted-foreground">a</span>
                            <Input
                              type="time"
                              aria-label={`Saida do previsto de ${linha.nome}`}
                              value={escolha.horaSaida}
                              onChange={(evento) =>
                                escolher(linha.id, { horaSaida: evento.target.value })
                              }
                              className="h-7 w-[5.5rem] px-1.5 text-xs md:text-xs"
                            />
                          </span>
                        ) : (
                          <span className="text-muted-foreground whitespace-nowrap">{horario}</span>
                        )}
                      </div>
                    </td>

                    {aviso ? (
                      <td colSpan={dias.length} className={cn("border-b px-3 py-2", fundo)}>
                        <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                          {aviso}
                        </span>
                      </td>
                    ) : (
                      dias.map((data) => (
                        <DiaDoPrevisto key={data} data={data} dia={previsto[data]} />
                      ))
                    )}

                    <td className={cn("border-b border-l px-2 py-2", fundo)}>
                      <Input
                        aria-label={`Observacao de ${linha.nome}`}
                        value={escolha.observacao}
                        maxLength={200}
                        onChange={(evento) =>
                          escolher(linha.id, { observacao: evento.target.value })
                        }
                        onKeyDown={(evento) => {
                          if (evento.key === "Enter" && alteradas.length > 0) {
                            evento.preventDefault();
                            gravar.current?.requestSubmit();
                          }
                        }}
                        placeholder="Ferias de 01/10 a 30/10..."
                        className="h-7 w-48 text-xs md:text-xs"
                      />
                    </td>

                    <td className={cn("border-b px-1 py-2", fundo)}>
                      <Retirar linha={linha} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * O previsto que a escolha da tela produz, e o que dizer quando ele sai vazio.
 *
 * Sem mudanca de turma nem de sigla, vale o previsto que veio do servidor: e o
 * que a grade mostra, e nenhuma conta a mais e feita. Com mudanca, a conta e a
 * mesma `derivarPrevisto()` da DAL, com as mesmas entradas.
 */
function previstoDaEscolha(
  grupo: GrupoDaGrade,
  linha: LinhaDaGrade,
  escolha: Escolha,
  previstoMudou: boolean,
  dias: readonly string[],
  eventosDeTrabalho: readonly EventoDaGrade[],
): {
  previsto: Record<string, PrevistoDoDia>;
  horario: string;
  /** Sigla propria: o horario e o da linha, e a tela desenha os dois campos. */
  pedeHorario: boolean;
  aviso: string | null;
} {
  const vigenciasDaTurma = grupo.vigencias.filter((vigencia) => vigencia.turma === escolha.turma);
  const evento = eventosDeTrabalho.find((atual) => atual.id === escolha.eventoTrabalhoId);
  const propria = evento ? { codigo: evento.codigo, cor: evento.cor } : null;
  const { siglas, horarioDaVigencia } = siglasDaLinha(grupo.siglas, propria);
  const enviado = horarioEnviado(escolha);
  const horarioDaLinha =
    enviado.entrada && enviado.saida && enviado.entrada !== enviado.saida
      ? { entrada: enviado.entrada, saida: enviado.saida }
      : null;

  const previsto = previstoMudou
    ? derivarPrevisto(vigenciasDaTurma, {
        dias,
        siglas,
        primeiroDia: dias[0] ?? "",
        horarioDaVigencia,
        horarioDaLinha,
      })
    : linha.previsto;

  // O horario do fim do periodo, que e o que vale daqui para a frente.
  const vigente = dias.length > 0 ? vigenciaDoDia(dias[dias.length - 1], vigenciasDaTurma) : null;
  const horario = !vigente
    ? ""
    : horarioDaVigencia
      ? `${vigente.entrada}-${vigente.saida}`
      : "sem horario no previsto";

  const aviso =
    vigenciasDaTurma.length === 0
      ? `${rotuloDaTurma(escolha.turma)} sem vigencia: defina em Postos de trabalho, ou escolha a outra turma.`
      : !grupo.siglas
        ? "Sem as siglas padrao de trabalho e de folga o previsto sai em branco: marque-as em Eventos."
        : null;

  return { previsto, horario, pedeHorario: !horarioDaVigencia, aviso };
}

/**
 * O turno do outro lado do relogio: a saida da vigencia vira a entrada, e a
 * entrada vira a saida. E a sugestao para quem passa a escrever `N` numa
 * funcao de `D` — num 12x36, exatamente o turno da noite.
 */
function turnoComplementar(grupo: GrupoDaGrade, turma: FuncaoTurma, dias: readonly string[]) {
  const vigente =
    dias.length > 0
      ? vigenciaDoDia(
          dias[dias.length - 1],
          grupo.vigencias.filter((vigencia) => vigencia.turma === turma),
        )
      : null;

  return vigente ? { horaEntrada: vigente.saida, horaSaida: vigente.entrada } : {};
}

/**
 * Escala ou contraescala, como botoes lado a lado: sao duas opcoes, e as duas
 * precisam estar a vista para a escolha ser lida sem abrir nada.
 */
function EscolhaDaTurma({
  linha,
  valor,
  semVigencia,
  aoEscolher,
}: {
  linha: LinhaDaGrade;
  valor: FuncaoTurma;
  semVigencia: (turma: FuncaoTurma) => boolean;
  aoEscolher: (turma: FuncaoTurma) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Turma de ${linha.nome}`}
      className="bg-muted inline-flex rounded-lg p-0.5"
    >
      {TURMAS.map((turma) => {
        const marcada = valor === turma.id;
        const vazia = semVigencia(turma.id);

        return (
          <label
            key={turma.id}
            title={vazia ? `${turma.rotulo} sem vigencia nesta funcao` : undefined}
            className={cn(
              "has-[input:focus-visible]:ring-ring/50 cursor-pointer rounded-md px-2 py-1 whitespace-nowrap has-[input:focus-visible]:ring-3",
              marcada
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              vazia && !marcada && "opacity-60",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={`turma-${linha.id}`}
              value={turma.id}
              checked={marcada}
              onChange={() => aoEscolher(turma.id)}
            />
            {turma.rotulo}
          </label>
        );
      })}
    </div>
  );
}

function DiaDoPrevisto({ data, dia }: { data: string; dia: PrevistoDoDia | undefined }) {
  const titulo = dia
    ? `${diaDaSemana(data)} ${formatarData(data)} — ${dia.eventoCodigo}${
        dia.entrada ? ` ${dia.entrada}-${dia.saida}` : ""
      }`
    : `${diaDaSemana(data)} ${formatarData(data)} — sem previsto`;

  return (
    <td className={cn("border-b p-0.5 text-center", ehFimDeSemana(data) && "bg-muted/40")}>
      <span
        title={titulo}
        className={cn(
          "block rounded-sm py-1 font-mono text-[11px] leading-none",
          dia
            ? dia.natureza === "trabalho"
              ? classesDaCor(dia.eventoCor)
              : "text-muted-foreground"
            : null,
        )}
      >
        {dia?.eventoCodigo ?? ""}
      </span>
    </td>
  );
}

/**
 * Quantas pessoas da funcao o previsto poe em cada dia, uma linha por sigla de
 * trabalho. E a conferencia da alternancia: num 12x36 com duas pessoas de dia,
 * todo dia tem um `D` — o zero aparece marcado, e e ali que a turma de alguem
 * esta trocada.
 */
function Retirar({ linha }: { linha: LinhaDaGrade }) {
  const [estado, formAction, pendente] = useActionState(removerLinha, estadoInicialLinha);
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
      <input type="hidden" name="linhaId" value={linha.id} />

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
          Retirar?
        </Button>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => setConfirmando(true)}
          title={`Retirar ${linha.nome} desta funcao`}
        >
          <Trash2 aria-hidden />
          <span className="sr-only">Retirar {linha.nome} desta funcao</span>
        </Button>
      )}
    </form>
  );
}
