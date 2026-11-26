"use client";

import {
  CheckCircle2,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  TriangleAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarDuracao } from "@/features/escalas/jornada";
import type { LinhaRecusada } from "@/features/funcionarios/planilha";

import { ROTA_APONTAMENTOS } from "../../types";
import { importarHorasExtras } from "../actions";
import type { NomeSemCadastro } from "../plano";
import {
  estadoInicialImportacaoDeHoras,
  PREFIXO_ASSOCIACAO,
  type ItemDaImportacaoDeHoras,
  type PreviaDaImportacaoDeHoras,
} from "../types";

/**
 * Importacao do relatorio de horas extras, em duas etapas: conferir mostra o
 * que muda em cada apontamento, importar grava.
 *
 * Com a pagina hidratada, o envio monta o `FormData` a mao (`onSubmit` +
 * `startTransition`): o React reseta o formulario depois de toda action
 * disparada pelo `<form action>`, e isso apagaria o arquivo escolhido (que
 * nenhum navegador deixa repovoar) e as associacoes feitas na previa. Mesmo
 * arranjo de movimentacoes. O `action` continua no `<form>` para o clique que
 * chega antes da hidratacao: sem ele, o navegador faria um GET da propria
 * pagina com o nome do arquivo na URL.
 */
export function ImportarHorasForm({ competenciaId }: { competenciaId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [arquivoEscolhido, setArquivoEscolhido] = useState<string | null>(null);
  /** As associacoes escolhidas, presas a previa em que foram feitas. */
  const [escolhas, setEscolhas] = useState<{ token: string; valores: Record<string, string> }>({
    token: "",
    valores: {},
  });
  const [estado, formAction, pendente] = useActionState(
    importarHorasExtras,
    estadoInicialImportacaoDeHoras,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
      formRef.current?.reset();
    } else if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  const previa = estado.status === "previa" ? estado.previa : undefined;
  const resultado = estado.status === "success" ? estado.resultado : undefined;
  const associacoes = previa && escolhas.token === previa.token ? escolhas.valores : {};
  const associados = Object.values(associacoes).filter(Boolean).length;
  const aGravar = (previa?.gravar.length ?? 0) + associados;
  /**
   * Importar so aparece quando a previa na tela descreve o arquivo do campo:
   * trocar o arquivo depois de conferir deixaria um botao que grava um e uma
   * tela que descreve outro.
   */
  const previaConfere = Boolean(previa && arquivoEscolhido === previa.arquivo);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    // O botao clicado vai junto (`confirmar`), como num envio do navegador.
    const submitter = (evento.nativeEvent as SubmitEvent).submitter;
    const dados = new FormData(evento.currentTarget, submitter);

    startTransition(() => formAction(dados));
  }

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} onSubmit={enviar} className="space-y-6">
        <input type="hidden" name="competenciaId" value={competenciaId} />

        <div className="space-y-2">
          <Label htmlFor="arquivo">Relatorio de horas extras</Label>
          <Input
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={(evento) => setArquivoEscolhido(evento.target.files?.[0]?.name ?? null)}
            className="h-auto py-1.5"
            aria-describedby="arquivo-ajuda"
          />
          <p id="arquivo-ajuda" className="text-muted-foreground text-sm">
            Planilha .xlsx com as colunas Nome, Horas e Verba (e Matricula, se houver). Entram a
            verba 150 (HE 50%) e a 200 (HE 100%).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant={previaConfere ? "secondary" : "default"}
            disabled={pendente}
          >
            {pendente ? <LoaderCircle className="animate-spin" /> : <Upload aria-hidden />}
            {previaConfere ? "Conferir de novo" : "Conferir arquivo"}
          </Button>

          {previaConfere && aGravar > 0 ? (
            <Button type="submit" name="confirmar" value="1" disabled={pendente}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 aria-hidden />}
              Importar {aGravar} {aGravar === 1 ? "apontamento" : "apontamentos"}
            </Button>
          ) : null}
        </div>

        {previa ? (
          <Previa
            previa={previa}
            previaConfere={previaConfere}
            arquivoEscolhido={arquivoEscolhido}
            associacoes={associacoes}
            aoAssociar={(chave, funcionarioId) =>
              setEscolhas({
                token: previa.token,
                valores: { ...associacoes, [chave]: funcionarioId },
              })
            }
          />
        ) : null}
      </form>

      {estado.status === "error" ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Nao foi possivel importar</AlertTitle>
          <AlertDescription>{estado.mensagem}</AlertDescription>
        </Alert>
      ) : null}

      {resultado ? (
        <section className="space-y-4">
          <Alert>
            <CheckCircle2 aria-hidden />
            <AlertTitle>Importacao concluida</AlertTitle>
            <AlertDescription>
              <span>
                {resultado.gravados} {resultado.gravados === 1 ? "apontamento" : "apontamentos"} com
                horas extras gravadas
                {resultado.criados > 0 ? ` (${resultado.criados} criados agora)` : ""}
                {resultado.semMudanca > 0 ? `, ${resultado.semMudanca} ja estavam iguais` : ""}.
              </span>
            </AlertDescription>
          </Alert>

          {resultado.naoImportados.length > 0 ? (
            <Alert>
              <TriangleAlert aria-hidden />
              <AlertTitle>
                {resultado.naoImportados.length === 1
                  ? "1 nome ficou de fora, sem cadastro associado"
                  : `${resultado.naoImportados.length} nomes ficaram de fora, sem cadastro associado`}
              </AlertTitle>
              <AlertDescription>
                <span>{resultado.naoImportados.join(", ")}.</span>
              </AlertDescription>
            </Alert>
          ) : null}

          <Recusadas recusadas={resultado.recusadas} />

          <Button asChild variant="secondary">
            <Link href={`${ROTA_APONTAMENTOS}?status=apontados`}>Ver os apontamentos</Link>
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function Previa({
  previa,
  previaConfere,
  arquivoEscolhido,
  associacoes,
  aoAssociar,
}: {
  previa: PreviaDaImportacaoDeHoras;
  previaConfere: boolean;
  arquivoEscolhido: string | null;
  associacoes: Record<string, string>;
  aoAssociar: (chave: string, funcionarioId: string) => void;
}) {
  const novos = previa.gravar.filter((item) => item.novo).length;
  const ignoradas = previa.outrasVerbas.reduce((total, verba) => total + verba.linhas, 0);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          <FileSpreadsheet className="mr-2 inline size-4" aria-hidden />
          {previa.arquivo}
        </h2>
        <p className="text-muted-foreground text-sm">
          Competencia {previa.competencia}. Nada foi gravado ainda. HE 50% e HE 100% de quem esta no
          arquivo sao substituidas; o resto do apontamento fica como esta.
        </p>
      </div>

      {previaConfere ? null : (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Esta previa e de outro arquivo</AlertTitle>
          <AlertDescription>
            O campo acima aponta para {arquivoEscolhido ?? "nenhum arquivo"}, e o que esta descrito
            aqui e {previa.arquivo}. Confira o arquivo de novo antes de importar.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Numero rotulo="Mudam o apontamento" valor={previa.gravar.length} />
        <Numero rotulo="Ja estao iguais" valor={previa.semMudanca} />
        <Numero rotulo="Sem cadastro casado" valor={previa.semCadastro.length} alerta />
        <Numero rotulo="Linhas recusadas" valor={previa.recusadas.length} alerta />
      </div>

      {novos > 0 ? (
        <Alert>
          <Info aria-hidden />
          <AlertTitle>
            {novos === 1
              ? "1 pessoa ainda nao tem apontamento nesta competencia"
              : `${novos} pessoas ainda nao tem apontamento nesta competencia`}
          </AlertTitle>
          <AlertDescription>
            O apontamento delas nasce so com as horas extras. O &quot;Gerar pelas regras&quot; pula
            quem ja tem apontamento: se for usa-lo, gere antes de importar.
          </AlertDescription>
        </Alert>
      ) : null}

      {ignoradas > 0 || previa.zeradas > 0 ? (
        <p className="text-muted-foreground text-sm">
          {ignoradas > 0
            ? `${ignoradas} ${ignoradas === 1 ? "linha" : "linhas"} de outras verbas (${previa.outrasVerbas
                .map((verba) => verba.verba)
                .join(", ")}) ficaram de fora. `
            : null}
          {previa.zeradas > 0
            ? `${previa.zeradas} ${previa.zeradas === 1 ? "linha zerada nao muda" : "linhas zeradas nao mudam"} nada.`
            : null}
        </p>
      ) : null}

      <Recusadas recusadas={previa.recusadas} />

      <SemCadastro nomes={previa.semCadastro} associacoes={associacoes} aoAssociar={aoAssociar} />

      <Gravacoes itens={previa.gravar} />
    </section>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div
        className={
          alerta && valor > 0 ? "text-destructive text-2xl font-semibold" : "text-2xl font-semibold"
        }
      >
        {valor}
      </div>
      <p className="text-muted-foreground text-sm">{rotulo}</p>
    </div>
  );
}

function Horas({ minutos }: { minutos: number | null }) {
  return minutos === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="tabular-nums">{formatarDuracao(minutos)}</span>
  );
}

/** O que o arquivo traz contra o que esta gravado: o gravado sai riscado quando muda. */
function Mudanca({ novo, gravado }: { novo: number | null; gravado: number }) {
  if (novo === null) {
    return gravado > 0 ? (
      <span className="text-muted-foreground tabular-nums" title="O arquivo nao traz esta verba">
        {formatarDuracao(gravado)}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  if (novo === gravado || gravado === 0) {
    return <Horas minutos={novo} />;
  }

  return (
    <span className="tabular-nums">
      <s className="text-muted-foreground mr-1.5">{formatarDuracao(gravado)}</s>
      <u className="decoration-primary underline-offset-2">{formatarDuracao(novo)}</u>
    </span>
  );
}

/**
 * As linhas do arquivo em intervalos: o relatorio de eventos traz uma linha por
 * dia, e a mesma pessoa soma dezenas delas, quase sempre seguidas ("8-10, 15").
 */
function intervalos(linhas: readonly number[]) {
  const partes: string[] = [];
  let inicio = linhas[0];
  let anterior = linhas[0];

  for (const linha of [...linhas.slice(1), Number.NaN]) {
    if (linha === anterior + 1) {
      anterior = linha;
      continue;
    }

    partes.push(inicio === anterior ? String(inicio) : `${inicio}-${anterior}`);
    inicio = linha;
    anterior = linha;
  }

  return partes.join(", ");
}

function Linhas({ linhas }: { linhas: readonly number[] }) {
  return <span className="tabular-nums">{intervalos(linhas)}</span>;
}

function Matricula({ matricula }: { matricula: string | null }) {
  return matricula === null ? null : (
    <span className="text-muted-foreground ml-1.5 text-xs">matricula {matricula}</span>
  );
}

/**
 * Os nomes que nao casaram sozinhos. O campo de cada um e o que vai no envio:
 * vazio deixa o nome de fora, e a action confere de novo o cadastro escolhido.
 */
function SemCadastro({
  nomes,
  associacoes,
  aoAssociar,
}: {
  nomes: readonly NomeSemCadastro[];
  associacoes: Record<string, string>;
  aoAssociar: (chave: string, funcionarioId: string) => void;
}) {
  if (nomes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-medium">
        <TriangleAlert className="text-destructive size-4" aria-hidden />
        {nomes.length === 1
          ? "1 nome sem cadastro casado"
          : `${nomes.length} nomes sem cadastro casado`}
      </h3>
      <p className="text-muted-foreground text-sm">
        Escolha o cadastro de quem tiver um parecido. O que ficar em &quot;Nao importar&quot; fica
        de fora.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Linhas</TableHead>
              <TableHead>Nome no arquivo</TableHead>
              <TableHead className="w-20">HE 50%</TableHead>
              <TableHead className="w-20">HE 100%</TableHead>
              <TableHead className="w-80">Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nomes.map((nome) => {
              const id = `associar-${nome.chave.replaceAll(/[^A-Z0-9]+/g, "-")}`;

              return (
                <TableRow key={nome.chave}>
                  <TableCell className="whitespace-normal">
                    <Linhas linhas={nome.linhas} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <label htmlFor={id}>{nome.nomeNoArquivo}</label>
                    <Matricula matricula={nome.matriculaNoArquivo} />
                    {nome.motivo === "homonimos" ? (
                      <Badge variant="outline" className="ml-2">
                        mais de um cadastro com este nome
                      </Badge>
                    ) : null}
                    {nome.motivo === "matricula_diferente" ? (
                      <Badge variant="outline" className="ml-2">
                        o cadastro com este nome tem outra matricula
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Horas minutos={nome.he50} />
                  </TableCell>
                  <TableCell>
                    <Horas minutos={nome.he100} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {nome.candidatos.length > 0 ? (
                      <NativeSelect
                        id={id}
                        name={`${PREFIXO_ASSOCIACAO}${nome.chave}`}
                        value={associacoes[nome.chave] ?? ""}
                        onChange={(evento) => aoAssociar(nome.chave, evento.target.value)}
                      >
                        <option value="">Nao importar</option>
                        {nome.candidatos.map((candidato) => (
                          <option key={candidato.id} value={candidato.id}>
                            {candidato.nome} — {candidato.detalhe}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        Nenhum cadastro parecido
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Gravacoes({ itens }: { itens: readonly ItemDaImportacaoDeHoras[] }) {
  if (itens.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/*
        Quem casou por associacao ja saiu da lista de "sem cadastro", e com ela
        o campo que levava a escolha. Sem este campo, "Conferir de novo" e
        "Importar" reenviariam o arquivo sem a associacao, e a pessoa voltaria
        a ficar de fora na gravacao.
      */}
      {itens
        .filter((item) => item.associado)
        .map((item) => (
          <input
            key={item.chave}
            type="hidden"
            name={`${PREFIXO_ASSOCIACAO}${item.chave}`}
            value={item.funcionarioId}
          />
        ))}
      <h3 className="font-medium">Mudam o apontamento: {itens.length}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Linhas</TableHead>
              <TableHead>Funcionario</TableHead>
              <TableHead className="w-32">HE 50%</TableHead>
              <TableHead className="w-32">HE 100%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item.funcionarioId}>
                <TableCell className="whitespace-normal">
                  <Linhas linhas={item.linhas} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{item.funcionario}</span>
                    {item.novo ? <Badge variant="secondary">sem apontamento</Badge> : null}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {item.associado
                      ? `${item.nomeNoArquivo}${item.matriculaNoArquivo ? ` (matricula ${item.matriculaNoArquivo})` : ""} no arquivo · `
                      : null}
                    {item.detalhe}
                  </div>
                </TableCell>
                <TableCell>
                  <Mudanca novo={item.he50} gravado={item.gravado50} />
                </TableCell>
                <TableCell>
                  <Mudanca novo={item.he100} gravado={item.gravado100} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Recusadas({ recusadas }: { recusadas: readonly LinhaRecusada[] }) {
  if (recusadas.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-medium">
        <TriangleAlert className="text-destructive size-4" aria-hidden />
        {recusadas.length === 1 ? "1 linha recusada" : `${recusadas.length} linhas recusadas`}
      </h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Linha</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recusadas.map((recusada) => (
              <TableRow key={`${recusada.linha}-${recusada.motivo}`}>
                <TableCell>{recusada.linha}</TableCell>
                <TableCell className="whitespace-normal">{recusada.identificacao}</TableCell>
                <TableCell className="whitespace-normal">{recusada.motivo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
