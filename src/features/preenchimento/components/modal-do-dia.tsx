"use client";

import { ChevronLeft, ChevronRight, CircleAlert, Save, Trash2, Wand2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/features/competencias/periodo";
import { duracaoEmMinutos } from "@/features/escalas/jornada";
import { cn } from "@/lib/utils";
import type { EventoDaGrade } from "@/features/eventos/types";
import { formatarMinutos } from "@/features/ponto/apuracao";
import type { BlocoDaGrade } from "@/features/postos/types";
import { CampoPessoa } from "@/features/preenchimento/components/campo-pessoa";
import { chaveDaCelula } from "@/features/preenchimento/grade";
import { minutosTrabalhados, type RelogioDoDia } from "@/features/preenchimento/relogio";
import type {
  CelulaDaGrade,
  PrevistoDoDia,
  SinalizacaoDaGrade,
} from "@/features/preenchimento/types";
import { OBSERVACAO_DA_SINALIZACAO_MAX } from "@/features/preenchimento/types";

/**
 * O dia aberto: um modal com tudo o que o **realizado** daquela data precisa
 * dizer — a sigla, o horario, quem cobriu, para onde a pessoa foi e o bilhete.
 *
 * Um unico modal para a grade toda, montado no nivel de cima e alimentado pela
 * celula aberta: um por celula seriam centenas de dialogos no DOM.
 *
 * **Ele nao grava: manda gravar.** O `useActionState` mora na grade, porque o
 * conteudo do modal e remontado no mesmo clique do "Gravar dia" (e pode ser
 * fechado ou trocado de dia antes da resposta) — o estado da action tem de
 * sobreviver a isso, e a celula tem de mudar antes de o servidor responder. O
 * que este componente faz e montar a celula que a grade vai desenhar na hora
 * (`aplicar`) e despachar o formulario.
 *
 * **Gravar nao fecha o modal.** O dia continua aberto, ja com o que foi
 * gravado, e as setas levam ao vizinho: preencher o mes nao cobra fechar e
 * reabrir a cada dia.
 *
 * O previsto nao entra aqui. Ele e derivado das vigencias da funcao — muda em
 * Postos de trabalho, e nao dia a dia —, e aparece so como referencia no topo.
 */
export function ModalDoDia({
  aoFechar,
  aoTrocarDeDia,
  dia,
  eventos,
  blocos,
  gravar,
  apagar,
  aplicar,
  aoSinalizar,
  aoAnotar,
}: {
  aoFechar: () => void;
  /** Abre outro dia da mesma linha (as setas), sem fechar o modal. */
  aoTrocarDeDia: (data: string) => void;
  /** `null` enquanto nenhum dia foi aberto — o modal nao desenha nada. */
  dia: {
    linhaId: string;
    pessoaNome: string;
    data: string;
    /** O dia vizinho no periodo; `null` nas pontas. */
    diaAnterior: string | null;
    diaSeguinte: string | null;
    previsto: PrevistoDoDia | null;
    celula: CelulaDaGrade | null;
    /** O que o relogio de ponto registrou neste dia — so leitura, ao lado do realizado. */
    relogio: RelogioDoDia;
    /** Os outros dias da linha — de onde a TE escolhe o dia trabalhado. */
    outrosDias: readonly OutroDiaDaLinha[];
    /** A TE que aponta **este** dia como trabalhado, quando ha uma. */
    trocaQueTrabalhou: CelulaDaGrade | null;
    /** A marca do "!" deste dia; `null` sem marca. */
    sinalizacao: SinalizacaoDaGrade | null;
  } | null;
  eventos: readonly EventoDaGrade[];
  blocos: readonly BlocoDaGrade[];
  gravar: (formData: FormData) => void;
  apagar: (formData: FormData) => void;
  aplicar: (celula: CelulaDaGrade | null) => void;
  /** O "!": `true` sinaliza (ou reabre), `false` tira a marca pendente. */
  aoSinalizar: (sinalizado: boolean) => void;
  /** A observacao da marca: o que conferir. */
  aoAnotar: (observacao: string) => void;
}) {
  return (
    <Dialog open={dia !== null} onOpenChange={(proximo) => (proximo ? null : aoFechar())}>
      <DialogContent
        className="outline-none"
        /*
          O foco abre no proprio modal, e nao no primeiro campo. No campo da
          sigla as setas trocariam a sigla (e o que um `<select>` fechado faz com
          elas), e o atalho de trocar de dia so funcionaria depois de um clique
          fora. O Tab continua levando ao primeiro campo.
        */
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          (evento.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        {dia ? (
          /*
            `key` no proprio conteudo: os campos guardam estado local. Ela leva
            o dia **e o que a celula diz**, porque as duas mudancas pedem
            remontar: trocar de dia sem isso mostraria o anterior, e gravar sem
            isso deixaria os campos nao controlados voltarem ao valor antigo — o
            React reseta o formulario depois da action. Pelo mesmo caminho, a
            recusa do servidor (que devolve a celula ao que estava) devolve
            tambem os campos.
          */
          <Conteudo
            key={`${chaveDaCelula(dia.linhaId, dia.data)}:${JSON.stringify(dia.celula)}`}
            dia={dia}
            eventos={eventos}
            blocos={blocos}
            gravar={gravar}
            apagar={apagar}
            aplicar={aplicar}
            aoTrocarDeDia={aoTrocarDeDia}
            aoSinalizar={aoSinalizar}
            aoAnotar={aoAnotar}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({
  dia,
  eventos,
  blocos,
  gravar,
  apagar,
  aplicar,
  aoTrocarDeDia,
  aoSinalizar,
  aoAnotar,
}: {
  dia: NonNullable<Parameters<typeof ModalDoDia>[0]["dia"]>;
  eventos: readonly EventoDaGrade[];
  blocos: readonly BlocoDaGrade[];
  gravar: (formData: FormData) => void;
  apagar: (formData: FormData) => void;
  aplicar: (celula: CelulaDaGrade | null) => void;
  aoTrocarDeDia: (data: string) => void;
  aoSinalizar: (sinalizado: boolean) => void;
  aoAnotar: (observacao: string) => void;
}) {
  const { celula, previsto } = dia;

  /*
    Trocar de dia pelas setas remonta este conteudo (a `key` e o dia), e o que
    estava digitado e nao gravado iria junto. Por isso a troca compara o
    formulario com o retrato tirado ao abrir: diferente, a primeira seta so
    avisa, e a segunda troca sem gravar. O retrato e do `FormData`, e nao de
    cada estado, para alcancar tambem os campos nao controlados (destino e
    observacao) sem que cada um precise se lembrar de avisar.
  */
  const formulario = useRef<HTMLFormElement>(null);
  const retrato = useRef<string | null>(null);
  const [avisoDeTroca, setAvisoDeTroca] = useState(false);

  useEffect(() => {
    retrato.current = formulario.current ? retratoDoFormulario(formulario.current) : null;

    /*
      Gravar e trocar de dia remontam este conteudo, e o botao clicado sai do
      DOM levando o foco junto. Sem devolve-lo ao modal, o Tab recomecaria do
      topo da pagina, por tras dele.
    */
    const modal = formulario.current?.closest<HTMLElement>("[data-slot=dialog-content]");

    if (modal && !modal.contains(document.activeElement)) {
      modal.focus();
    }
  }, []);

  /** A seta e o botao do cabecalho passam pelo mesmo lugar. */
  function trocarPara(destino: string | null) {
    if (!destino) {
      return;
    }

    const alterado =
      formulario.current !== null &&
      retrato.current !== null &&
      retratoDoFormulario(formulario.current) !== retrato.current;

    if (alterado && !avisoDeTroca) {
      setAvisoDeTroca(true);
      return;
    }

    aoTrocarDeDia(destino);
  }

  // Sem lista de dependencias: o ouvinte e refeito a cada render e sempre ve o
  // `trocarPara` atual. Custa um add/remove por render de um modal.
  useEffect(() => {
    function aoTeclar(tecla: KeyboardEvent) {
      if (tecla.key !== "ArrowLeft" && tecla.key !== "ArrowRight") {
        return;
      }

      if (
        tecla.defaultPrevented ||
        tecla.altKey ||
        tecla.ctrlKey ||
        tecla.metaKey ||
        tecla.shiftKey
      ) {
        return;
      }

      // Dentro de um campo a seta e do campo: anda no texto, muda o horario,
      // troca a opcao do `<select>`.
      if (ehCampoDeDigitacao(tecla.target)) {
        return;
      }

      tecla.preventDefault();
      trocarPara(tecla.key === "ArrowLeft" ? dia.diaAnterior : dia.diaSeguinte);
    }

    window.addEventListener("keydown", aoTeclar);

    return () => window.removeEventListener("keydown", aoTeclar);
  });

  /*
    Sigla e horario sao controlados; o resto e nao controlado.

    Nao e capricho: e a sigla que decide se o dia precisa dizer quem cobriu ou
    para onde a pessoa foi, e sao os dois horarios que se exigem um ao outro.
    Com o valor em estado, essas exigencias viram `required` do proprio
    navegador — o dia incompleto para de custar um roundtrip para ser recusado.
  */
  const [eventoId, setEventoId] = useState(celula?.eventoId ?? "");
  const [horaEntrada, setHoraEntrada] = useState(celula?.horaEntrada ?? "");
  const [horaSaida, setHoraSaida] = useState(celula?.horaSaida ?? "");
  const [erroDoHorario, setErroDoHorario] = useState<string | null>(null);

  /*
    Quem cobriu o dia guarda **o valor e o nome**, e nao so o id.

    O nome vem da celula ja gravada (ou da opcao escolhida na busca), porque a
    lista de pessoas nao existe mais aqui: o campo pergunta ao servidor conforme
    se digita, e nada disso vem com a grade. Sem guardar o nome, o campo
    fechado nao teria o que mostrar de um dia que ja nomeia alguem.
  */
  const [pessoa, setPessoa] = useState<{ valor: string; nome: string | null }>({
    valor: celula?.pessoa ?? "",
    nome: celula?.pessoaNome ?? null,
  });
  const [erroDaPessoa, setErroDaPessoa] = useState<string | null>(null);

  /*
    A cobertura que virou hora extra.

    Controlado como a sigla e o horario, e pela mesma razao: o que ele lanca sao
    os dois horarios do dia, entao a tela precisa saber se eles existem antes de
    mandar. O valor viaja num campo escondido porque a caixa do Radix e um
    `button` — o mesmo motivo pelo qual a tela de acessos posta os seus assim.
  */
  const [extra, setExtra] = useState(celula?.extra ?? false);
  const [erroDoExtra, setErroDoExtra] = useState<string | null>(null);

  /*
    O intervalo que nao houve.

    Controlada e postada num campo escondido como a do extra, e pelo mesmo
    motivo: a caixa do Radix e um `button`, e botao nao posta valor. O que ela
    nao tem e recusa nenhuma — ela nao depende de horario, porque nao diz quanto
    o intervalo teria durado, e sim que ele nao aconteceu.
  */
  const [intrajornada, setIntrajornada] = useState(celula?.intrajornada ?? false);

  /*
    A folga em que a pessoa trabalhou no lugar deste dia — so quando a sigla
    pede (a TE). Controlado porque e ele que decide de que dia o quadro abaixo
    mostra as marcacoes.
  */
  const [dataTrabalhada, setDataTrabalhada] = useState(celula?.dataTrabalhada ?? "");

  const evento = eventos.find((atual) => atual.id === eventoId) ?? null;

  /**
   * Copia o previsto para os campos — o caso mais comum de todos, que e o dia
   * ter acontecido como estava previsto.
   *
   * Escreve nos campos em vez de gravar direto: quem clica ainda pode ajustar o
   * horario antes de salvar, e o dia so vira registro quando alguem confirma.
   */
  function copiarDoPrevisto() {
    if (!previsto) {
      return;
    }

    setEventoId(eventos.find((atual) => atual.codigo === previsto.eventoCodigo)?.id ?? "");
    setHoraEntrada(previsto.entrada ?? "");
    setHoraSaida(previsto.saida ?? "");
    setErroDoHorario(null);
    setErroDoExtra(null);
  }

  /**
   * Grava o dia: a celula muda **antes** do servidor responder e o modal fecha
   * no mesmo gesto.
   *
   * As duas coisas juntas sao o que faz preencher um mes inteiro nao custar um
   * roundtrip por dia. A action continua conferindo tudo do outro lado: o que
   * ela recusar volta como aviso, e a celula desfeita volta ao que estava.
   */
  /**
   * O que a tela consegue recusar sozinha, antes de qualquer ida ao servidor.
   *
   * Sao as tres exigencias que o `required` do navegador nao alcanca: o par de
   * horarios (que ele so sabe exigir um do outro), a sigla que pede pessoa (o
   * campo viaja num `input[type=hidden]`, fora da validacao nativa) e o extra
   * (que precisa dos dois horarios para virar lancamento). O destino continua
   * sendo um `<select>` de verdade, e esse o navegador barra sozinho.
   *
   * A action confere as tres de novo — ela e um POST publico.
   */
  function conferir() {
    if (horaEntrada && horaEntrada === horaSaida) {
      setErroDoHorario("Entrada e saida iguais: seriam 24h ou nenhuma");
      return false;
    }

    if (evento?.exigePessoa && !pessoa.valor) {
      setErroDaPessoa("Esta sigla precisa dizer quem cobriu ou com quem foi a troca");
      return false;
    }

    /*
      O extra e um horario, e nao um aviso: e dele que sai a duracao que alguem
      vai conferir e pagar. Sem os dois campos nao ha lancamento a fazer — e
      quem quer o horario da funcao tem o "Igual ao previsto" a um clique.
    */
    if (extra && (!horaEntrada || !horaSaida)) {
      setErroDoExtra("Informe a entrada e a saida: e o horario que vira hora extra");
      return false;
    }

    return true;
  }

  // Nenhum dos dois fecha o modal: a celula nova muda a `key` do conteudo, e ele
  // remonta mostrando o dia como ficou.
  function enviar(formData: FormData) {
    aplicar(montarCelula(formData));
    gravar(formData);
  }

  function apagarEsteDia(formData: FormData) {
    aplicar(null);
    apagar(formData);
  }

  /**
   * A celula como ela vai ficar — desenhada na grade antes da resposta.
   *
   * O que o formulario manda ja e o dia inteiro, entao nada aqui e adivinhacao:
   * a sigla e a cor saem da lista de eventos, o bloco de destino da de blocos, e
   * o nome de quem cobriu do proprio campo — que o guardou junto do valor,
   * porque a lista de pessoas nao vive mais nesta tela. Tudo vazio significa dia
   * apagado — a mesma conta que a action faz para decidir entre gravar e apagar.
   */
  function montarCelula(formData: FormData): CelulaDaGrade | null {
    const texto = (campo: string) => String(formData.get(campo) ?? "").trim() || null;

    const escolhido = texto("eventoId");
    const entrada = texto("horaEntrada");
    const saida = texto("horaSaida");
    const destinoId = texto("destino");
    const observacao = texto("observacao");

    if (
      !escolhido &&
      !entrada &&
      !saida &&
      !pessoa.valor &&
      !destinoId &&
      !observacao &&
      // A intrajornada sozinha mantem o dia: "nao teve intervalo" e uma coisa a
      // dizer sobre ele. A action faz a mesma conta.
      !intrajornada
    ) {
      return null;
    }

    const sigla = eventos.find((atual) => atual.id === escolhido) ?? null;
    const bloco = blocos.find((atual) => atual.funcaoId === destinoId) ?? null;

    return {
      data: dia.data,
      eventoId: escolhido,
      eventoCodigo: sigla?.codigo ?? null,
      eventoCor: sigla?.cor ?? null,
      horaEntrada: entrada,
      horaSaida: saida,
      pessoa: pessoa.valor,
      pessoaNome: pessoa.nome,
      destinoId,
      destinoNome: bloco ? `${bloco.postoCodigo} · ${bloco.funcaoNome}` : null,
      observacao,
      extra,
      intrajornada,
      dataTrabalhada: sigla?.exigeDiaTrabalhado ? texto("dataTrabalhada") : null,
    };
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8">{dia.pessoaNome}</DialogTitle>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!dia.diaAnterior}
            onClick={() => trocarPara(dia.diaAnterior)}
            title="Dia anterior (seta para a esquerda)"
          >
            <ChevronLeft aria-hidden />
            <span className="sr-only">Dia anterior</span>
          </Button>
          <span className="text-foreground text-sm font-medium tabular-nums">
            {formatarData(dia.data)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!dia.diaSeguinte}
            onClick={() => trocarPara(dia.diaSeguinte)}
            title="Dia seguinte (seta para a direita)"
          >
            <ChevronRight aria-hidden />
            <span className="sr-only">Dia seguinte</span>
          </Button>
        </div>
        {avisoDeTroca ? (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
            Este dia tem alteracoes nao gravadas. Grave o dia, ou use a seta de novo para trocar sem
            gravar.
          </p>
        ) : null}
        <DialogDescription>
          Realizado.{" "}
          {previsto ? (
            <>
              Previsto: <strong>{previsto.eventoCodigo}</strong>
              {previsto.entrada ? ` ${previsto.entrada}-${previsto.saida}` : null}.
            </>
          ) : (
            "Esta funcao nao declara vigencia, entao nao ha previsto para comparar."
          )}
        </DialogDescription>
      </DialogHeader>

      <Relogio
        relogio={dia.relogio}
        previsto={previsto}
        sinalizacao={dia.sinalizacao}
        aoSinalizar={aoSinalizar}
        aoAnotar={aoAnotar}
      />

      {/*
        A recusa mora no `onSubmit`, e nao dentro da action.

        O React reseta o formulario depois de **toda** action — inclusive a que
        devolveu sem enviar nada. Recusar la dentro limparia justamente o que a
        pessoa acabou de digitar: os campos nao controlados voltariam ao valor
        inicial e a caixa do extra se desmarcaria sozinha (o Radix repassa o
        `reset` do formulario para o `onCheckedChange`), levando junto o aviso
        que explicava a recusa. Com `preventDefault`, a action nem comeca.
      */}
      <form
        ref={formulario}
        action={enviar}
        onSubmit={(envio) => {
          if (!conferir()) {
            envio.preventDefault();
          }
        }}
        className="space-y-4"
      >
        <input type="hidden" name="linhaId" value={dia.linhaId} />
        <input type="hidden" name="data" value={dia.data} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dia-eventoId">O que aconteceu</Label>
            <NativeSelect
              id="dia-eventoId"
              name="eventoId"
              value={eventoId}
              onChange={(campo) => setEventoId(campo.target.value)}
              // O dia trabalhado de uma TE ja tem o que dizer: e trabalho, e quem
              // o diz e a TE. Outra sigla aqui contaria o mesmo dia duas vezes.
              disabled={dia.trocaQueTrabalhou !== null}
              aria-describedby={dia.trocaQueTrabalhou ? "dia-eventoId-troca" : undefined}
            >
              <option value="">Sem sigla</option>
              {eventos.map((atual) => (
                <option key={atual.id} value={atual.id}>
                  {atual.codigo} — {atual.rotulo}
                </option>
              ))}
            </NativeSelect>
            {dia.trocaQueTrabalhou ? (
              <p id="dia-eventoId-troca" className="text-muted-foreground text-sm">
                Dia trabalhado no lugar de {formatarData(dia.trocaQueTrabalhou.data)} (
                {dia.trocaQueTrabalhou.eventoCodigo}). Para mudar, abra aquele dia.
              </p>
            ) : null}
          </div>

          {evento?.exigeDiaTrabalhado ? (
            <CampoDiaTrabalhado
              valor={dataTrabalhada}
              aoEscolher={setDataTrabalhada}
              outrosDias={dia.outrosDias}
              eventos={eventos}
              aoUsarMarcacoes={(entrada, saida) => {
                setHoraEntrada(entrada);
                setHoraSaida(saida);
                setErroDoHorario(null);
                setErroDoExtra(null);
              }}
            />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="dia-horaEntrada">Entrada</Label>
            <Input
              id="dia-horaEntrada"
              name="horaEntrada"
              type="time"
              value={horaEntrada}
              onChange={(campo) => {
                setHoraEntrada(campo.target.value);
                setErroDoHorario(null);
                // O aviso do extra fala justamente destes dois campos: deixa-lo
                // na tela depois de preenchidos seria cobrar o que ja foi feito.
                setErroDoExtra(null);
              }}
              // Um horario sem o outro nao mede jornada nenhuma — mesma regra do
              // `check preenchimento_dias_horario_completo`. Aqui ela e so o
              // atalho: a action confere de novo.
              required={horaSaida !== ""}
              aria-invalid={Boolean(erroDoHorario)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dia-horaSaida">Saida</Label>
            <Input
              id="dia-horaSaida"
              name="horaSaida"
              type="time"
              value={horaSaida}
              onChange={(campo) => {
                setHoraSaida(campo.target.value);
                setErroDoHorario(null);
                setErroDoExtra(null);
              }}
              required={horaEntrada !== ""}
              aria-invalid={Boolean(erroDoHorario)}
              aria-describedby={erroDoHorario ? "dia-horario-erro" : "dia-horario-ajuda"}
            />
          </div>

          <div className="sm:col-span-2">
            {erroDoHorario ? (
              <p id="dia-horario-erro" className="text-destructive text-sm">
                {erroDoHorario}
              </p>
            ) : (
              <p id="dia-horario-ajuda" className="text-muted-foreground text-sm">
                So quando o horario difere do previsto. Em branco, o dia seguiu a jornada da funcao.
              </p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dia-pessoa">
              Quem cobriu / com quem trocou
              {evento?.exigePessoa ? <span className="text-destructive"> *</span> : null}
            </Label>
            <CampoPessoa
              id="dia-pessoa"
              name="pessoa"
              valor={pessoa.valor}
              nome={pessoa.nome}
              aoEscolher={(escolha) => {
                setPessoa(escolha);
                setErroDaPessoa(null);
              }}
              erro={erroDaPessoa ?? undefined}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dia-destino">
              Posto de destino
              {evento?.exigeDestino ? <span className="text-destructive"> *</span> : null}
            </Label>
            <NativeSelect
              id="dia-destino"
              name="destino"
              defaultValue={celula?.destinoId ?? ""}
              required={evento?.exigeDestino}
            >
              <option value="">Nenhum</option>
              {blocos.map((bloco) => (
                <option key={bloco.funcaoId} value={bloco.funcaoId}>
                  {bloco.postoCodigo} · {bloco.funcaoNome}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* O valor num campo escondido: a caixa do Radix e um `button`, e
              botao nao posta valor nenhum. */}
          <input type="hidden" name="extra" value={extra ? "on" : ""} />

          {/* O que as duas caixas fazem esta na ajuda; aqui so o erro do extra,
              que e o que a pessoa precisa ler para conseguir gravar. */}
          <div
            className={cn(
              "flex gap-3 rounded-md border p-3",
              erroDoExtra ? "items-start" : "items-center",
            )}
          >
            <Checkbox
              id="dia-extra"
              checked={extra}
              onCheckedChange={(marcado) => {
                setExtra(marcado === true);
                setErroDoExtra(null);
              }}
              aria-invalid={Boolean(erroDoExtra)}
              aria-describedby={erroDoExtra ? "dia-extra-erro" : undefined}
              className={erroDoExtra ? "mt-0.5" : undefined}
            />
            <div className="space-y-1">
              <Label htmlFor="dia-extra">Extra</Label>
              {erroDoExtra ? (
                <p id="dia-extra-erro" className="text-destructive text-sm">
                  {erroDoExtra}
                </p>
              ) : null}
            </div>
          </div>

          <input type="hidden" name="intrajornada" value={intrajornada ? "on" : ""} />

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Checkbox
              id="dia-intrajornada"
              checked={intrajornada}
              onCheckedChange={(marcado) => setIntrajornada(marcado === true)}
            />
            <Label htmlFor="dia-intrajornada">Intrajornada nao usufruida</Label>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dia-observacao">Observacao</Label>
            <Textarea
              id="dia-observacao"
              name="observacao"
              rows={2}
              maxLength={200}
              defaultValue={celula?.observacao ?? ""}
              placeholder="Cobriu em TI, sem cobertura, atestado entregue..."
            />
          </div>
        </div>

        <DialogFooter>
          {/* Sem estado de "gravando": o dia ja esta desenhado na grade e no
              modal. O aviso so aparece se o servidor recusar. */}
          <Button type="submit">
            <Save aria-hidden />
            Gravar dia
          </Button>

          {previsto ? (
            <Button type="button" variant="secondary" onClick={copiarDoPrevisto}>
              <Wand2 aria-hidden />
              Igual ao previsto
            </Button>
          ) : null}

          {/* Na mesma linha dos outros botoes, e sempre desenhado: numa linha
              propria, que so existia com o dia gravado, o modal crescia no
              primeiro "Gravar dia" e encolhia no "Apagar". Sem registro ele fica
              desabilitado — nao ha o que apagar. O botao pertence ao formulario
              de baixo pelo atributo `form`: `<form>` dentro de `<form>` nao
              existe em HTML. */}
          <Button
            type="submit"
            form="dia-apagar"
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={!celula}
          >
            <Trash2 aria-hidden />
            Apagar este dia
          </Button>
        </DialogFooter>
      </form>

      {/* Formulario proprio, vazio de campos visiveis: apagar o dia e outro
          gesto, e nao salvar cinco campos vazios. */}
      <form id="dia-apagar" action={apagarEsteDia} hidden>
        <input type="hidden" name="linhaId" value={dia.linhaId} />
        <input type="hidden" name="data" value={dia.data} />
      </form>
    </>
  );
}

/** O formulario inteiro numa string — o que se compara para saber se algo mudou. */
function retratoDoFormulario(formulario: HTMLFormElement) {
  return JSON.stringify(
    [...new FormData(formulario).entries()].map(([nome, valor]) => [nome, String(valor)]),
  );
}

/** Campo em que as setas ja querem dizer alguma coisa. */
function ehCampoDeDigitacao(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) {
    return false;
  }

  if (
    alvo.isContentEditable ||
    alvo instanceof HTMLTextAreaElement ||
    alvo instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (alvo instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "submit", "reset", "hidden"].includes(alvo.type);
  }

  // A lista de quem cobriu e outros comboboxes andam pelas setas.
  return alvo.closest("[role=listbox], [role=combobox], [role=menu]") !== null;
}

/**
 * O que o relogio de ponto registrou neste dia, ao lado do que a grade diz.
 *
 * So leitura: nada aqui preenche o dia. Serve para quem esta preenchendo ver na
 * hora se a pessoa bateu ponto, se o horario fugiu do previsto e se vale marcar
 * Extra.
 */
function Relogio({
  relogio,
  previsto,
  sinalizacao,
  aoSinalizar,
  aoAnotar,
}: {
  relogio: RelogioDoDia;
  previsto: PrevistoDoDia | null;
  sinalizacao: SinalizacaoDaGrade | null;
  aoSinalizar: (sinalizado: boolean) => void;
  aoAnotar: (observacao: string) => void;
}) {
  return (
    <section aria-labelledby="dia-relogio" className="bg-muted/40 space-y-1 rounded-md px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="dia-relogio" className="text-muted-foreground text-xs font-medium">
          Relogio de ponto
        </h3>
        <BotaoDeSinalizar estado={sinalizacao?.estado ?? null} aoSinalizar={aoSinalizar} />
      </div>
      {sinalizacao ? (
        <ObservacaoDaMarca
          // A observacao gravada e o valor inicial: mudou por fora (resposta da
          // action, recusa desfeita), o campo remonta com ela.
          key={sinalizacao.observacao ?? ""}
          observacao={sinalizacao.observacao}
          editavel={sinalizacao.estado === "pendente"}
          aoAnotar={aoAnotar}
        />
      ) : null}
      {/* Sem a frase do sinal ("o relogio tem batida e o dia esta em branco"):
          ela aparecia e sumia conforme o dia, e o modal mudava de altura a cada
          seta. O ponto colorido da celula, na grade, continua dizendo isso. */}
      <ConteudoDoRelogio relogio={relogio} previsto={previsto} />
    </section>
  );
}

/**
 * O "!" do dia: sinaliza para a tela "Dias sinalizados", ao lado das
 * marcacoes — que e o que costuma motivar a marca.
 *
 * Fora do formulario do dia, e `type="button"`: sinalizar nao grava nem exige o
 * que estiver digitado nos campos. Pendente, o clique tira a marca; resolvida,
 * o clique a devolve aos pendentes (tirar uma resolvida apagaria o registro de
 * que o dia foi conferido).
 */
function BotaoDeSinalizar({
  estado,
  aoSinalizar,
}: {
  estado: SinalizacaoDaGrade["estado"] | null;
  aoSinalizar: (sinalizado: boolean) => void;
}) {
  const pendente = estado === "pendente";

  return (
    <Button
      type="button"
      variant={pendente ? "destructive" : "ghost"}
      size="xs"
      onClick={() => aoSinalizar(!pendente)}
      aria-pressed={pendente}
      title={
        pendente
          ? "Dia sinalizado — clique para tirar a marca"
          : estado === "resolvida"
            ? "Sinalizacao resolvida — clique para sinalizar de novo"
            : "Sinalizar este dia para conferir em Dias sinalizados"
      }
    >
      <CircleAlert aria-hidden />
      {pendente ? (
        "Sinalizado"
      ) : estado === "resolvida" ? (
        "Resolvido"
      ) : (
        <span className="sr-only">Sinalizar este dia</span>
      )}
    </Button>
  );
}

/**
 * O que conferir no dia sinalizado, em uma frase: vai na tela "Dias
 * sinalizados" e na mensagem ao responsavel do posto.
 *
 * Fora do formulario do dia, como o "!": grava sozinha ao sair do campo (ou no
 * Enter), e nao no "Gravar dia" — senao anotar exigiria gravar o dia junto. Sair
 * do campo e o que acontece antes de trocar de dia pelas setas ou pelos botoes,
 * entao o que se escreveu nao fica para tras. Na marca resolvida e so leitura:
 * reabrir pelo "!" volta a deixar editar.
 */
function ObservacaoDaMarca({
  observacao,
  editavel,
  aoAnotar,
}: {
  observacao: string | null;
  editavel: boolean;
  aoAnotar: (observacao: string) => void;
}) {
  const [texto, setTexto] = useState(observacao ?? "");

  if (!editavel) {
    return observacao ? (
      <p className="text-muted-foreground text-sm">Conferir: {observacao}</p>
    ) : null;
  }

  function gravarSeMudou() {
    if (texto.trim() !== (observacao ?? "")) {
      aoAnotar(texto);
    }
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="dia-sinalizacao-observacao" className="text-muted-foreground text-xs">
        O que conferir (opcional)
      </Label>
      <Input
        id="dia-sinalizacao-observacao"
        value={texto}
        maxLength={OBSERVACAO_DA_SINALIZACAO_MAX}
        onChange={(evento) => setTexto(evento.target.value)}
        onBlur={gravarSeMudou}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            evento.preventDefault();
            gravarSeMudou();
          }
        }}
        placeholder="Bateu so a entrada, cobriu sem avisar..."
      />
    </div>
  );
}

function ConteudoDoRelogio({
  relogio,
  previsto,
}: {
  relogio: RelogioDoDia;
  previsto: PrevistoDoDia | null;
}) {
  switch (relogio.situacao) {
    case "freelancer":
      return <p className="text-muted-foreground text-sm">Freelancer nao bate ponto.</p>;

    case "sem_carga":
      return (
        <p className="text-muted-foreground text-sm">
          Nenhum arquivo de ponto importado nesta competencia.
        </p>
      );

    case "fora_da_janela":
      return (
        <p className="text-muted-foreground text-sm">
          O ponto importado vai de {formatarData(relogio.janela.inicio)} a{" "}
          {formatarData(relogio.janela.fim)} — este dia ainda nao tem arquivo.
        </p>
      );

    case "apurado": {
      const { batidas } = relogio;

      if (batidas.length === 0) {
        return <p className="text-sm">Nenhuma batida neste dia.</p>;
      }

      const trabalhado = minutosTrabalhados(batidas);
      const previstoMinutos =
        previsto?.entrada && previsto.saida
          ? duracaoEmMinutos(previsto.entrada, previsto.saida)
          : null;

      return (
        <>
          <p className="font-mono text-sm">
            {batidas.map((batida, indice) => (
              <Fragment key={indice}>
                {indice > 0 ? " · " : null}
                {batida.hora}
                {batida.incluida ? "*" : null}
                {batida.diaSeguinte ? (
                  <span className="text-muted-foreground font-sans text-xs"> (dia seguinte)</span>
                ) : null}
              </Fragment>
            ))}
          </p>
          <p className="text-muted-foreground text-sm">
            {trabalhado === null
              ? "Marcacao impar: as batidas nao fecham pares, e as horas nao se somam."
              : `${formatarMinutos(trabalhado)} trabalhadas${
                  previstoMinutos !== null
                    ? ` de ${formatarMinutos(previstoMinutos)} previstas`
                    : ""
                }.`}
            {batidas.some((batida) => batida.incluida)
              ? " * incluida a mao no sistema de ponto."
              : null}
          </p>
        </>
      );
    }
  }
}

/** Um dia da mesma linha, como o campo do dia trabalhado precisa le-lo. */
export type OutroDiaDaLinha = {
  data: string;
  previsto: PrevistoDoDia | null;
  celula: CelulaDaGrade | null;
  relogio: RelogioDoDia;
};

/**
 * O dia trabalhado da TE e as marcacoes dele.
 *
 * So entram dias que a TE pode apontar: em branco ou com uma sigla de folga (o F
 * do "Preencher varios dias", que a gravacao substitui), e que nenhuma outra TE
 * ja apontou. Um dia com outra sigla ja diz o que aconteceu, e conta-lo de novo
 * como trabalho seria contar o mesmo dia duas vezes.
 *
 * As marcacoes sao do relogio, e nao viram nada sozinhas: "Usar as marcacoes"
 * escreve a primeira e a ultima nos campos de horario, e o dia so e gravado ao
 * confirmar — o mesmo gesto do "Igual ao previsto".
 */
function CampoDiaTrabalhado({
  valor,
  aoEscolher,
  outrosDias,
  eventos,
  aoUsarMarcacoes,
}: {
  valor: string;
  aoEscolher: (data: string) => void;
  outrosDias: readonly OutroDiaDaLinha[];
  eventos: readonly EventoDaGrade[];
  aoUsarMarcacoes: (entrada: string, saida: string) => void;
}) {
  const apontados = new Set(outrosDias.flatMap((outro) => outro.celula?.dataTrabalhada ?? []));
  const disponiveis = outrosDias.filter((outro) => {
    const natureza = eventos.find((atual) => atual.id === outro.celula?.eventoId)?.natureza;
    const livre = !outro.celula?.eventoId || natureza === "folga";

    return livre && !outro.celula?.dataTrabalhada && !apontados.has(outro.data);
  });
  const escolhido = outrosDias.find((outro) => outro.data === valor) ?? null;
  const relogio = escolhido?.relogio ?? null;
  const batidas = relogio?.situacao === "apurado" ? relogio.batidas : [];

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor="dia-dataTrabalhada">
        Dia trabalhado<span className="text-destructive"> *</span>
      </Label>
      <NativeSelect
        id="dia-dataTrabalhada"
        name="dataTrabalhada"
        value={valor}
        onChange={(campo) => aoEscolher(campo.target.value)}
        required
      >
        <option value="">Escolha a folga em que a pessoa trabalhou</option>
        {disponiveis.map((outro) => (
          <option key={outro.data} value={outro.data}>
            {formatarData(outro.data)} — previsto {outro.previsto?.eventoCodigo ?? "em branco"}
            {outro.celula?.eventoCodigo ? ` · lancado ${outro.celula.eventoCodigo}` : ""}
          </option>
        ))}
      </NativeSelect>

      {escolhido && relogio ? (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
          {relogio.situacao === "apurado" && batidas.length > 0 ? (
            <>
              <span>
                Marcacoes de {formatarData(escolhido.data)}:{" "}
                <span className="font-mono">
                  {batidas.map((batida) => batida.hora).join(" · ")}
                </span>
              </span>
              {batidas.length >= 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => aoUsarMarcacoes(batidas[0].hora, batidas[batidas.length - 1].hora)}
                >
                  Usar as marcacoes
                </Button>
              ) : null}
            </>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              {relogio.situacao === "apurado"
                ? `Nenhuma marcacao em ${formatarData(escolhido.data)}.`
                : relogio.situacao === "fora_da_janela"
                  ? `O relogio ainda nao foi importado para ${formatarData(escolhido.data)}.`
                  : relogio.situacao === "sem_carga"
                    ? "Nenhum arquivo de ponto importado nesta competencia."
                    : "Freelancer nao bate ponto."}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
