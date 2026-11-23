"use client";

import { Fragment, memo, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { classesDaCor } from "@/features/eventos/cores";
import type { EventoDaGrade } from "@/features/eventos/types";
import type { BlocoDaGrade } from "@/features/postos/types";
import {
  anotarSinalizacao,
  limparDia,
  marcarSinalizacao,
  salvarDia,
} from "@/features/preenchimento/actions";
import { ModalDoDia } from "@/features/preenchimento/components/modal-do-dia";
import { PreencherVariosDias } from "@/features/preenchimento/components/preencher-varios-dias";
import { chaveDaCelula, diaDoMes, ehFimDeSemana } from "@/features/preenchimento/grade";
import { rotuloDaTurma } from "@/features/preenchimento/previsto";
import {
  celulaParaSinal,
  rotuloDoSinal,
  sinalDoDia,
  type JanelaDoRelogio,
  type RelogioDoDia,
  type SinalDoRelogio,
} from "@/features/preenchimento/relogio";
import {
  estadoInicialDia,
  type CelulaDaGrade,
  type DiaState,
  type GradeDoPosto,
  type LinhaDaGrade,
  type SinalizacaoDaGrade,
  type SinalizacaoState,
} from "@/features/preenchimento/types";
import { cn } from "@/lib/utils";

/**
 * A grade do posto: uma coluna por dia da competencia, duas faixas por pessoa,
 * e as funcoes separadas por uma faixa dentro da **mesma** tabela.
 *
 * As duas faixas nao sao a mesma coisa:
 *
 * - **Previsto** e derivado das vigencias da funcao (o contrato do posto) e da
 *   turma que a linha segue. Nao se digita nem se grava: muda em Postos de
 *   trabalho, e o mes inteiro sai recalculado.
 * - **Realizado** e o que aconteceu, e se preenche clicando no dia — o modal
 *   abre com tudo o que aquele dia precisa dizer.
 *
 * **A gravacao mora aqui, e nao no modal.** Sao duas razoes, e as duas
 * importam:
 *
 * - a celula muda **na hora**, antes de o servidor responder. O que o dia passa
 *   a dizer ja e sabido no clique — esperar o roundtrip para desenha-lo e o que
 *   fazia cada dia preenchido custar trezentos milissegundos de tela parada;
 * - o conteudo do modal remonta no mesmo gesto (e pode ser fechado ou trocar de
 *   dia antes da resposta). Se o `useActionState` morasse dentro dele, a
 *   resposta se perderia junto.
 *
 * **E por isso que a grade guarda o que gravou nesta sessao.** Nao ha
 * `refresh()` na gravacao de um dia (ver `DiaState`): a action responde o que
 * mudou, e este componente e quem junta isso ao que veio do servidor. A camada
 * e descartada assim que uma leitura nova chega — ai o servidor ja sabe de
 * tudo, e continuar sobrepondo esconderia o que outra pessoa tenha mudado.
 */
export function GradePosto({
  grade,
  eventos,
  blocos,
  hoje,
  diaInicial,
}: {
  grade: GradeDoPosto;
  eventos: readonly EventoDaGrade[];
  blocos: readonly BlocoDaGrade[];
  /** `YYYY-MM-DD` do servidor: onde o intervalo de "preencher varios dias" termina. */
  hoje: string;
  /**
   * O dia que a tela abre ja aberto (`?dia=` na URL) — o "Abrir na grade" dos
   * dias sinalizados. Dia que nao esta nesta grade e ignorado.
   */
  diaInicial?: { linhaId: string; data: string } | null;
}) {
  const [aberta, setAberta] = useState<{ linha: LinhaDaGrade; data: string } | null>(() => {
    const linha = grade.grupos
      .flatMap((grupo) => grupo.linhas)
      .find((atual) => atual.id === diaInicial?.linhaId);

    return linha && diaInicial && grade.dias.includes(diaInicial.data)
      ? { linha, data: diaInicial.data }
      : null;
  });
  const [estado, gravar] = useActionState(salvarDia, estadoInicialDia);
  const [estadoLimpar, apagar] = useActionState(limparDia, estadoInicialDia);

  /** O que foi gravado nesta sessao, por cima do que veio do servidor. */
  const [celulas, setCelulas] = useState<CelulasDaSessao>({});

  /** As marcas do "!" mudadas nesta sessao, pelo mesmo motivo das celulas. */
  const [sinais, setSinais] = useState<SinaisDaSessao>({});

  /**
   * O que a celula dizia antes de cada gravacao em andamento.
   *
   * Fica num `ref`, e nao em estado: nada nele e desenhado. Existe para o caso
   * de o servidor recusar — a celula volta ao que estava.
   *
   * Cada entrada sai quando a resposta dela chega, entao o mapa nao cresce: nao
   * ha o que limpar quando uma leitura nova descarta a camada abaixo.
   */
  const pendentes = useRef<Record<string, Pendente>>({});

  /**
   * Leitura nova do servidor descarta a camada da sessao.
   *
   * `grade` so muda de identidade quando um `refresh()` de outra action (trocar
   * a turma, incluir alguem) traz a rota redesenhada — e essa leitura ja inclui
   * os dias gravados aqui. Continuar sobrepondo esconderia o que outra pessoa
   * tenha mudado no meio tempo. Estado ajustado no render, e nao efeito: mesmo
   * arranjo do modulo que abre sozinho no menu lateral.
   */
  const [gradeAnterior, setGradeAnterior] = useState(grade);

  if (grade !== gradeAnterior) {
    setGradeAnterior(grade);
    setCelulas({});
    setSinais({});
  }

  /**
   * O que fazer com a resposta da action — a mesma para gravar e para apagar.
   *
   * Sucesso confirma o que a tela ja desenhou. Recusa devolve a celula ao que
   * estava e vira aviso: o modal
   * pode ja estar em outro dia (ou fechado), entao nao ha campo garantido em
   * que pendurar o erro. Se ele continua no mesmo dia, volta junto com a celula.
   */
  function responder(resposta: DiaState) {
    const { chave } = resposta;

    if (!chave) {
      return;
    }

    const pendente = pendentes.current[chave];

    delete pendentes.current[chave];

    if (resposta.status === "error") {
      toast.error(mensagemDoErro(resposta.mensagem, resposta.erros));

      if (pendente) {
        setCelulas((atual) => ({ ...atual, [chave]: pendente.anterior }));
      }

      return;
    }

    toast.success(resposta.mensagem);
  }

  useRespostaDoDia(estado, responder);
  useRespostaDoDia(estadoLimpar, responder);

  /**
   * Desenha o dia antes de mandar grava-lo, guardando o que estava la.
   *
   * O modal nao precisa saber de chave nenhuma: ele conhece a celula que montou,
   * e o dia aberto e sempre este.
   */
  function aplicar(nova: CelulaDaGrade | null) {
    if (!aberta) {
      return;
    }

    const chave = chaveDaCelula(aberta.linha.id, aberta.data);

    pendentes.current[chave] = { anterior: celulaAtual(aberta.linha, aberta.data, celulas) };
    setCelulas((atual) => ({ ...atual, [chave]: nova }));
  }

  /**
   * O "!" do dia aberto: a marca muda na grade no clique, e a resposta confirma
   * o estado que ela passou a ter (ou o desfaz, com o aviso).
   *
   * Tirar a marca de um dia ja resolvido nao acontece: o modal so oferece
   * reabrir. Por isso o "antes" basta para desfazer a recusa.
   */
  function sinalizar(proximo: boolean) {
    if (!aberta) {
      return;
    }

    const { linha, data } = aberta;
    const anterior = sinalAtual(chaveDaCelula(linha.id, data), grade, sinais);

    mudarMarca(
      linha.id,
      data,
      proximo ? { estado: "pendente", observacao: anterior?.observacao ?? null } : null,
      () => marcarSinalizacao(linha.id, data, proximo),
      proximo ? "Dia sinalizado." : "Sinalizacao retirada.",
    );
  }

  /** A observacao do dia aberto — o que conferir. Mesmo arranjo do "!". */
  function anotar(observacao: string) {
    if (!aberta) {
      return;
    }

    const { linha, data } = aberta;
    const anterior = sinalAtual(chaveDaCelula(linha.id, data), grade, sinais);

    if (!anterior) {
      return;
    }

    mudarMarca(
      linha.id,
      data,
      { ...anterior, observacao: observacao.trim() || null },
      () => anotarSinalizacao(linha.id, data, observacao),
      "Observacao gravada.",
    );
  }

  /**
   * Desenha a marca nova na hora, chama a action e confirma (ou desfaz, com o
   * aviso) quando ela responde. Sem `refresh()`, como as gravacoes do dia.
   */
  function mudarMarca(
    linhaId: string,
    data: string,
    otimista: SinalizacaoDaGrade | null,
    gravarMarca: () => Promise<SinalizacaoState>,
    aviso: string,
  ) {
    const chave = chaveDaCelula(linhaId, data);
    const anterior = sinalAtual(chave, grade, sinais);
    const desfazer = () => setSinais((atual) => ({ ...atual, [chave]: anterior }));

    setSinais((atual) => ({ ...atual, [chave]: otimista }));

    gravarMarca().then(
      (resposta) => {
        if (!resposta.ok) {
          toast.error(resposta.mensagem);
          desfazer();
          return;
        }

        setSinais((atual) => ({ ...atual, [chave]: resposta.sinalizacao }));
        toast.success(aviso);
      },
      () => {
        toast.error("Nao foi possivel gravar a marca do dia. Tente de novo.");
        desfazer();
      },
    );
  }

  /**
   * Estavel de proposito: e ela que a tabela recebe, e uma funcao nova a cada
   * render derrubaria o `memo` que impede as seiscentas celulas de redesenharem
   * so porque um dia abriu.
   */
  const abrir = useCallback((linha: LinhaDaGrade, data: string) => setAberta({ linha, data }), []);

  /** As setas do modal: outro dia da mesma linha, sem fechar e reabrir. */
  const posicao = aberta ? grade.dias.indexOf(aberta.data) : -1;

  const dia = aberta
    ? {
        linhaId: aberta.linha.id,
        pessoaNome: aberta.linha.nome,
        data: aberta.data,
        diaAnterior: grade.dias[posicao - 1] ?? null,
        diaSeguinte: grade.dias[posicao + 1] ?? null,
        previsto: aberta.linha.previsto[aberta.data] ?? null,
        celula: celulaAtual(aberta.linha, aberta.data, celulas),
        relogio: relogioDoDia(grade.janelaDoRelogio, aberta.linha, aberta.data),
        // So para o dia aberto: e a lista de onde a TE escolhe o dia trabalhado,
        // e montar isso para as seiscentas celulas seria trabalho jogado fora.
        outrosDias: grade.dias
          .filter((data) => data !== aberta.data)
          .map((data) => ({
            data,
            previsto: aberta.linha.previsto[data] ?? null,
            celula: celulaAtual(aberta.linha, data, celulas),
            relogio: relogioDoDia(grade.janelaDoRelogio, aberta.linha, data),
          })),
        trocaQueTrabalhou: trocaQueTrabalhou(aberta.linha, aberta.data, grade.dias, celulas),
        sinalizacao: sinalAtual(chaveDaCelula(aberta.linha.id, aberta.data), grade, sinais),
      }
    : null;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <PreencherVariosDias
          postoId={grade.posto.id}
          grupos={grade.grupos}
          dias={grade.dias}
          eventos={eventos}
          hoje={hoje}
          jaPreenchido={(linha, data) =>
            celulaAtual(linha, data, celulas) !== null ||
            trocaQueTrabalhou(linha, data, grade.dias, celulas) !== null
          }
        />
      </div>

      <TabelaDaGrade
        grade={grade}
        celulas={celulas}
        sinais={sinais}
        eventos={eventos}
        aoAbrir={abrir}
      />

      <div className="space-y-1">
        <LegendaDoRelogio janela={grade.janelaDoRelogio} />
        <LegendaDaIntrajornada />
        <LegendaDaSinalizacao />
      </div>

      <ModalDoDia
        aoFechar={() => setAberta(null)}
        aoTrocarDeDia={(data) =>
          setAberta((atual) => (atual ? { linha: atual.linha, data } : atual))
        }
        dia={dia}
        eventos={eventos}
        blocos={blocos}
        gravar={gravar}
        apagar={apagar}
        aplicar={aplicar}
        aoSinalizar={sinalizar}
        aoAnotar={anotar}
      />
    </div>
  );
}

/**
 * A tabela em si — memoizada, e essa e a razao de ela ser um componente.
 *
 * Abrir e fechar o modal mexe em estado que **so** o modal usa, e sem o `memo`
 * cada clique redesenhava as seiscentas e vinte celulas junto: medido em
 * desenvolvimento, 87ms de tarefa longa por abertura, contra 0 numa grade
 * pequena. As props que sobraram sao exatamente as que a tabela desenha, entao
 * a comparacao rasa do `memo` basta — desde que `aoAbrir` seja estavel.
 */
const TabelaDaGrade = memo(function TabelaDaGrade({
  grade,
  celulas,
  sinais,
  eventos,
  aoAbrir,
}: {
  grade: GradeDoPosto;
  celulas: CelulasDaSessao;
  sinais: SinaisDaSessao;
  eventos: readonly EventoDaGrade[];
  aoAbrir: (linha: LinhaDaGrade, data: string) => void;
}) {
  return (
    <>
      {/* A tabela rola dentro do proprio container: com trinta e uma colunas o
          documento inteiro rolaria na horizontal, e a coluna do nome sairia da
          tela junto. Mas so rola quando nao cabe: com `table-fixed` e
          `w-full`, as colunas dos dias dividem a largura que sobra do nome e
          da faixa, e o `minWidth` (36px por dia) e o ponto em que a rolagem
          comeca. Largura fixa por dia sobrava numa tela e rolava na outra. */}
      <div className="overflow-x-auto rounded-lg border">
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-xs"
          style={{
            minWidth: `calc(13rem + 1.5rem + ${grade.dias.length} * ${LARGURA_MINIMA_DO_DIA})`,
          }}
        >
          <thead>
            <tr>
              <th
                rowSpan={2}
                scope="col"
                className="bg-muted sticky left-0 z-20 w-52 min-w-52 border-r border-b p-2 text-left font-medium"
              >
                Pessoa
              </th>
              <th
                rowSpan={2}
                scope="col"
                className="bg-muted sticky left-52 z-20 w-6 border-r border-b px-1 py-2 font-medium"
              >
                <span className="sr-only">Faixa</span>
              </th>
              {grade.dias.map((data) => (
                <th
                  key={data}
                  scope="col"
                  className={cn(
                    "text-muted-foreground border-b px-1 pt-1 text-center font-normal",
                    ehFimDeSemana(data) && "bg-muted/60",
                  )}
                >
                  {diaDaSemana(data)}
                </th>
              ))}
            </tr>
            <tr>
              {grade.dias.map((data) => (
                <th
                  key={data}
                  scope="col"
                  className={cn(
                    "border-b px-1 pb-1 text-center font-medium",
                    ehFimDeSemana(data) && "bg-muted/60",
                  )}
                >
                  {diaDoMes(data)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grade.grupos.map((grupo) => (
              <Fragment key={grupo.funcaoId}>
                {/* A funcao vira uma faixa dentro da mesma tabela, e nao uma
                    tabela propria: as colunas dos dias precisam continuar
                    alinhadas de cima a baixo para a escala do posto se ler
                    inteira. */}
                <tr>
                  <th
                    colSpan={grade.dias.length + 2}
                    scope="colgroup"
                    className="bg-muted/70 border-y p-0 text-left text-xs font-medium"
                  >
                    {/* Quem gruda e o **conteudo**, e nao a celula: com `colSpan`
                        a celula ocupa a largura inteira da tabela, e prende-la em
                        `left-0` nao segura nada — o nome da funcao sairia pela
                        esquerda ao rolar ate o dia 20. */}
                    <span className="sticky left-0 flex w-fit items-baseline gap-2 px-2 py-1.5">
                      {grupo.funcaoNome}
                      <span className="text-muted-foreground font-normal">
                        {grupo.rotuloDoCiclo ?? "sem vigencia definida"}
                      </span>
                    </span>
                  </th>
                </tr>

                {grupo.linhas.map((linha) => (
                  <Fragment key={linha.id}>
                    <tr>
                      <th
                        rowSpan={2}
                        scope="row"
                        className="bg-card sticky left-0 z-10 w-52 min-w-52 border-r border-b p-2 text-left align-top font-normal"
                      >
                        <CabecalhoDaPessoa linha={linha} />
                      </th>
                      <td
                        className="bg-card text-muted-foreground sticky left-52 z-10 border-r border-b px-1 text-center"
                        title="Previsto — vem das vigencias da funcao"
                      >
                        P
                      </td>
                      {grade.dias.map((data) => {
                        const previsto = linha.previsto[data];

                        return (
                          <td
                            key={data}
                            className={cn(
                              "border-b p-0 text-center",
                              ehFimDeSemana(data) && "bg-muted/40",
                            )}
                          >
                            {/* Somente leitura: o previsto muda pelas vigencias
                                da funcao, e nao celula a celula. Cinza, e nao a
                                cor do evento: a cor fica so no realizado, que e
                                o que se preenche, e as duas faixas deixam de se
                                confundir. Em token, para acompanhar o tema. */}
                            <span
                              className={cn(
                                "block px-0.5 py-2.5 font-mono",
                                previsto && "bg-muted text-foreground",
                                siglaLonga(previsto?.eventoCodigo),
                              )}
                              title={
                                previsto?.entrada
                                  ? `${previsto.entrada}-${previsto.saida}`
                                  : undefined
                              }
                            >
                              {previsto?.eventoCodigo ?? ""}
                            </span>
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td
                        className="bg-card text-muted-foreground sticky left-52 z-10 border-r border-b px-1 text-center"
                        title="Realizado — clique no dia para preencher"
                      >
                        R
                      </td>
                      {grade.dias.map((data) => {
                        const celula = celulaAtual(linha, data, celulas);
                        const troca = trocaQueTrabalhou(linha, data, grade.dias, celulas);
                        // Com a celula **atual**: o sinal some no mesmo clique
                        // que preenche o dia, sem esperar leitura nova. O dia
                        // trabalhado de uma TE diz trabalho, mesmo sem celula.
                        const sinal = linha.batidas
                          ? sinalDoDia({
                              data,
                              janela: grade.janelaDoRelogio,
                              batidas: linha.batidas[data] ?? [],
                              celula: troca
                                ? { natureza: "trabalho", temContraparte: false }
                                : celula
                                  ? celulaParaSinal(
                                      eventos.find((evento) => evento.id === celula.eventoId)
                                        ?.natureza ?? null,
                                      linha.previsto[data]?.natureza ?? null,
                                      celula.pessoa !== "",
                                    )
                                  : null,
                            })
                          : null;
                        const sinalizado =
                          sinalAtual(chaveDaCelula(linha.id, data), grade, sinais)?.estado ===
                          "pendente";
                        const diferente =
                          celula?.eventoCodigo &&
                          celula.eventoCodigo !== linha.previsto[data]?.eventoCodigo;

                        return (
                          <td
                            key={data}
                            className={cn("border-b p-0", ehFimDeSemana(data) && "bg-muted/40")}
                          >
                            <button
                              type="button"
                              onClick={() => aoAbrir(linha, data)}
                              // O dia inteiro e o alvo do clique, e nao um
                              // icone dentro dele: a celula tem uns 40px e
                              // mirar um ponto nela seria pior que digitar.
                              className={cn(
                                "focus-visible:ring-ring hover:bg-accent relative w-full cursor-pointer px-0.5 py-2.5 text-center font-mono outline-none focus-visible:ring-2 focus-visible:ring-inset",
                                celula?.eventoCor && classesDaCor(celula.eventoCor),
                                siglaLonga(celula?.eventoCodigo ?? troca?.eventoCodigo),
                                // O que difere do previsto e o que quem
                                // confere procura: sublinhado, e nao mais uma
                                // cor, para nao brigar com a do evento.
                                diferente && "underline decoration-2 underline-offset-2",
                              )}
                              title={tituloDaCelula(celula, sinal, troca, sinalizado)}
                            >
                              {celula?.eventoCodigo ??
                                (troca ? (
                                  // A sigla da TE em contorno: o dia nao tem
                                  // celula propria, e e a TE que o conta.
                                  <span className="rounded-sm border border-dashed border-current px-0.5">
                                    {troca.eventoCodigo}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">+</span>
                                ))}
                              <MarcaDoRelogio sinal={sinal} />
                              {celula?.intrajornada ? <MarcaDaIntrajornada /> : null}
                              {sinalizado ? <MarcaDaSinalizacao /> : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
});

/** Abaixo disso por dia a grade rola na horizontal, em vez de espremer a sigla. */
const LARGURA_MINIMA_DO_DIA = "2.25rem";

/**
 * Sigla de cinco letras ou mais (FALTA, FERIAS) sai menor e mais junta: em
 * `text-xs` ela nao cabe nos 36px minimos do dia, e numa tabela `table-fixed` a
 * coluna nao alarga para acomoda-la — o texto vazaria para o vizinho.
 */
function siglaLonga(codigo: string | null | undefined) {
  return codigo && codigo.length > 4 ? "text-[10px] tracking-tighter" : null;
}

/** O que a celula diz agora: o gravado nesta sessao, ou o que veio do servidor. */
function celulaAtual(linha: LinhaDaGrade, data: string, celulas: CelulasDaSessao) {
  const chave = chaveDaCelula(linha.id, data);

  return chave in celulas ? celulas[chave] : (linha.realizado[data] ?? null);
}

/** As celulas gravadas nesta sessao, por `chaveDaCelula()`. `null` = dia apagado. */
type CelulasDaSessao = Record<string, CelulaDaGrade | null>;

/**
 * As marcas do "!" mudadas nesta sessao, por `chaveDaCelula()`. `null` = marca
 * retirada; chave ausente = vale o que veio do servidor.
 */
type SinaisDaSessao = Record<string, SinalizacaoDaGrade | null>;

/** A marca do dia: a da sessao, se mudou aqui, ou a que veio com a grade. */
function sinalAtual(chave: string, grade: GradeDoPosto, sinais: SinaisDaSessao) {
  return chave in sinais ? sinais[chave] : (grade.sinalizacoes[chave] ?? null);
}

/** Uma gravacao em andamento: o que a celula dizia antes dela. */
type Pendente = { anterior: CelulaDaGrade | null };

/**
 * Chama `responder` uma vez por resposta da action.
 *
 * O `ref` guarda o ultimo estado **por identidade**: `useActionState` devolve um
 * objeto novo a cada resposta, entao comparar referencias basta — e impede que o
 * React, que reexecuta efeitos em desenvolvimento, mostre o mesmo aviso duas
 * vezes.
 */
function useRespostaDoDia(estado: DiaState, responder: (resposta: DiaState) => void) {
  const ultimo = useRef<DiaState | null>(null);

  useEffect(() => {
    if (estado === ultimo.current) {
      return;
    }

    ultimo.current = estado;
    responder(estado);
    // `responder` fecha sobre estado que muda a cada render; a guarda acima e
    // quem garante uma execucao por resposta, e nao a lista de dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);
}

/**
 * A celula de TE que aponta este dia como trabalhado, ou `null`.
 *
 * Varre os dias da linha a cada celula desenhada, e nao um indice montado uma
 * vez: com a camada da sessao, o indice teria de ser refeito a cada gravacao, e
 * trinta e um dias por celula cabem folgados no render da tabela memoizada.
 */
function trocaQueTrabalhou(
  linha: LinhaDaGrade,
  data: string,
  dias: readonly string[],
  celulas: CelulasDaSessao,
) {
  for (const outro of dias) {
    const celula = celulaAtual(linha, outro, celulas);

    if (celula?.dataTrabalhada === data) {
      return celula;
    }
  }

  return null;
}

/**
 * O que o relogio sabe do dia aberto — ou por que nao sabe nada.
 *
 * As tres ausencias sao ditas separadas porque pedem coisas diferentes:
 * freelancer nunca vai ter batida, competencia sem carga pede o arquivo, e dia
 * fora da janela so pede o proximo arquivo.
 */
function relogioDoDia(
  janela: JanelaDoRelogio | null,
  linha: LinhaDaGrade,
  data: string,
): RelogioDoDia {
  if (!linha.batidas) {
    return { situacao: "freelancer" };
  }

  if (!janela) {
    return { situacao: "sem_carga" };
  }

  if (data < janela.inicio || data > janela.fim) {
    return { situacao: "fora_da_janela", janela };
  }

  return { situacao: "apurado", janela, batidas: linha.batidas[data] ?? [] };
}

/**
 * O ponto no canto da celula quando a grade e o relogio discordam.
 *
 * Duas cores, porque sao dois trabalhos: **azul** e dia a preencher (houve
 * batida e o realizado esta em branco); **ambar** e contradicao (o dia diz uma
 * coisa e o relogio outra). Um ponto, e nao a cor da celula: ela ja e a do
 * evento, e o sublinhado ja e "difere do previsto" — uma terceira informacao na
 * mesma dimensao brigaria com as duas.
 */
function MarcaDoRelogio({ sinal }: { sinal: SinalDoRelogio | null }) {
  if (!sinal) {
    return null;
  }

  return (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 right-0.5 size-1.5 rounded-full",
          sinal === "batida_sem_registro" ? "bg-sky-500" : "bg-amber-500",
        )}
      />
      <span className="sr-only">{rotuloDoSinal(sinal)}</span>
    </>
  );
}

/**
 * O dia com a intrajornada nao usufruida: um triangulo no canto inferior
 * esquerdo, como o canto de comentario da planilha de origem.
 *
 * Canto, e nao cor nem sublinhado: a cor ja e a do evento, o sublinhado e
 * "difere do previsto" e o canto de cima e o ponto do relogio. Em
 * `foreground`, e nao numa cor da paleta, para aparecer sobre o fundo de
 * qualquer evento nos dois temas.
 */
function MarcaDaIntrajornada() {
  return (
    <>
      <span
        aria-hidden
        className="border-l-foreground/70 absolute bottom-0 left-0 size-0 border-t-[7px] border-l-[7px] border-t-transparent"
      />
      <span className="sr-only">Intrajornada nao usufruida</span>
    </>
  );
}

/**
 * O dia sinalizado e ainda pendente: um "!" no canto inferior direito, o unico
 * canto livre (o de cima e o ponto do relogio, o de baixo a esquerda e a
 * intrajornada). O resolvido nao aparece: ja foi conferido.
 */
function MarcaDaSinalizacao() {
  return (
    <>
      <span
        aria-hidden
        className="absolute right-0.5 bottom-0 font-sans text-[10px] leading-none font-bold text-red-600 dark:text-red-400"
      >
        !
      </span>
      <span className="sr-only">Dia sinalizado</span>
    </>
  );
}

function LegendaDaSinalizacao() {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <span aria-hidden className="font-bold text-red-600 dark:text-red-400">
        !
      </span>
      dia sinalizado, pendente em Dias sinalizados
    </p>
  );
}

function LegendaDaIntrajornada() {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className="border-l-foreground/70 inline-block size-0 border-t-[8px] border-l-[8px] border-t-transparent"
      />
      intrajornada nao usufruida
    </p>
  );
}

/** A legenda dos pontos, com o periodo que o relogio cobre. */
function LegendaDoRelogio({ janela }: { janela: JanelaDoRelogio | null }) {
  if (!janela) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum arquivo de ponto importado nesta competencia: a grade ainda nao cruza os dias com o
        relogio.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>
        Relogio de ponto, de {formatarData(janela.inicio)} a {formatarData(janela.fim)}:
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full bg-sky-500" />
        bateu ponto e o dia esta em branco
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full bg-amber-500" />o dia e o relogio se
        contradizem
      </span>
    </p>
  );
}

function tituloDaCelula(
  celula: CelulaDaGrade | null,
  sinal: SinalDoRelogio | null,
  troca: CelulaDaGrade | null,
  sinalizado: boolean,
) {
  // O dia trabalhado de uma TE nao tem sigla propria: o titulo diz de onde ele
  // vem, e o sinal do relogio continua ao lado — ele e o que se quer conferir.
  const dia =
    troca && !celula?.eventoCodigo
      ? `Trabalhado no lugar de ${formatarData(troca.data)} (${troca.eventoCodigo ?? "troca"})`
      : rotuloDoDia(celula);

  return [dia, sinal ? rotuloDoSinal(sinal) : null, sinalizado ? "Dia sinalizado" : null]
    .filter(Boolean)
    .join(" — ");
}

/** O que o `title` da celula do realizado conta sem abrir o modal. */
function rotuloDoDia(celula: CelulaDaGrade | null) {
  if (!celula) {
    return "Sem registro — clique para preencher";
  }

  return [
    celula.eventoCodigo,
    celula.horaEntrada ? `${celula.horaEntrada}-${celula.horaSaida}` : null,
    celula.pessoaNome,
    celula.destinoNome,
    celula.extra ? "hora extra" : null,
    celula.intrajornada ? "sem intrajornada" : null,
    celula.observacao,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * O erro da gravacao numa linha so.
 *
 * Erro por campo vira texto porque o modal nao espera a resposta: quando ela
 * chega, ele pode estar em outro dia ou fechado, e o aviso precisa dizer o que
 * houve de qualquer lugar.
 */
function mensagemDoErro(mensagem: string | undefined, erros: Record<string, string[]> | undefined) {
  const doCampo = Object.values(erros ?? {}).flat();

  return doCampo.length > 0 ? doCampo.join(" · ") : (mensagem ?? "Nao foi possivel gravar o dia.");
}

function CabecalhoDaPessoa({ linha }: { linha: LinhaDaGrade }) {
  return (
    /**
     * A coluna do nome tem largura fixa (`w-52`), porque e ela que o `left-52`
     * da coluna da faixa toma como referencia: deixada crescer com o nome, a
     * faixa passaria a flutuar por cima do proprio nome ao rolar na horizontal.
     * Nome longo entao quebra em duas linhas, em vez de alargar a coluna.
     */
    <div className="space-y-0.5 break-words">
      <p className="font-medium">{linha.nome}</p>
      <p className="text-muted-foreground flex flex-wrap items-center gap-1">
        {linha.identificacao ? <span className="font-mono">{linha.identificacao}</span> : null}
        {linha.freelancer ? <span>· freelancer</span> : null}
        {/* So a contraescala aparece: a escala e o caso comum, e marcar os dois
            encheria a coluna do nome de rotulo que nao distingue nada. */}
        {linha.turma === "contraescala" ? <span>· {rotuloDaTurma(linha.turma)}</span> : null}
        {/* Mesma logica: so quem escreve outra sigla que nao a da funcao. */}
        {linha.eventoTrabalhoRotulo ? <span>· {linha.eventoTrabalhoRotulo}</span> : null}
      </p>
      {linha.observacao ? <p className="text-muted-foreground italic">{linha.observacao}</p> : null}
    </div>
  );
}
