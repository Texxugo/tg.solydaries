"use client";

import { CheckCircle2, FileText, LoaderCircle, Replace, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData, formatarPeriodo } from "@/features/competencias/periodo";
import { importarMarcacoes } from "@/features/ponto/actions";
import { substituicaoMudaAlgo } from "@/features/ponto/carga";
import type { LinhaRecusada } from "@/features/ponto/relatorio";
import {
  estadoInicialImportacaoPonto,
  ITENS_NA_PREVIA,
  ROTA_PONTO,
  type BatidaDoDia,
  type EmpresaParaAssociar,
  type MatriculaNaoEncontrada,
  type PreviaDoPonto,
} from "@/features/ponto/types";

import { AssociarEmpresas } from "./associar-empresa-form";

/**
 * Importacao do relatorio de marcacoes, em duas etapas: enviar mostra o que vai
 * acontecer, confirmar grava.
 *
 * As duas etapas mandam o **mesmo arquivo**, e nao o plano que a previa
 * devolveu: o que o cliente reenvia nao e evidencia (a action e um POST
 * publico) e o cadastro pode ter mudado entre uma tela e outra — que aqui e a
 * regra, e nao a excecao, porque associar um codigo de empresa e justamente o
 * que se faz entre as duas. Por isso o `input type="file"` continua montado
 * durante a previa: e dele que sai o arquivo do segundo envio.
 */
export function ImportarPontoForm({ empresas }: { empresas: readonly EmpresaParaAssociar[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  /**
   * O arquivo escolhido, guardado fora do campo.
   *
   * React reseta o formulario depois de **toda** Server Action, e num campo de
   * arquivo isso apaga a escolha: a previa voltaria com o campo vazio e o botao
   * de confirmar enviaria nada — na pratica, a segunda etapa nunca aconteceria.
   * Nenhum navegador deixa repovoar um `input[type=file]` por valor, entao a
   * escolha vive aqui e e devolvida ao campo a cada resposta.
   */
  const arquivoRef = useRef<File | null>(null);
  const [arquivoEscolhido, setArquivoEscolhido] = useState<string | null>(null);
  const [estado, formAction, pendente] = useActionState(
    importarMarcacoes,
    estadoInicialImportacaoPonto,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
      // Carga concluida: aqui o campo vazio e o certo, e o arquivo nao volta.
      arquivoRef.current = null;
      formRef.current?.reset();
      return;
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }

    // Devolve a escolha ao campo depois do reset do React. Mexer no DOM e o que
    // um efeito existe para fazer; o estado da tela nao muda com isso.
    const campo = campoRef.current;
    const arquivo = arquivoRef.current;

    if (!campo || !arquivo || campo.files?.length) {
      return;
    }

    const conteudo = new DataTransfer();
    conteudo.items.add(arquivo);
    campo.files = conteudo.files;
  }, [estado]);

  const previa = estado.status === "previa" ? estado.previa : undefined;
  const resultado = estado.status === "success" ? estado.resultado : undefined;
  /**
   * Confirmar so aparece quando a previa na tela descreve o arquivo que esta no
   * campo. Trocar o arquivo depois de conferir deixaria um botao que grava um
   * arquivo e uma tela que descreve outro.
   */
  const previaConfere = Boolean(previa && arquivoEscolhido === previa.arquivo);
  const vaiEscrever = previa ? previa.marcacoesNovas > 0 : false;
  /**
   * O arquivo discorda do portal no que ele cobre: tem batida que saiu, ou que
   * trocou a marca de incluida. So entao a substituicao e oferecida — se o
   * arquivo so acrescenta, os dois botoes fariam a mesma coisa.
   */
  const podeSubstituir = previa
    ? substituicaoMudaAlgo({
        aRemover: previa.marcacoesARemover,
        comMarcaTrocada: previa.marcacoesComMarcaTrocada,
      })
    : false;

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="arquivo">Arquivo do relatorio</Label>
          <Input
            ref={campoRef}
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".txt,text/plain"
            required
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0] ?? null;

              arquivoRef.current = arquivo;
              setArquivoEscolhido(arquivo?.name ?? null);
            }}
            className="h-auto py-1.5"
            aria-describedby="arquivo-ajuda"
          />
          <p id="arquivo-ajuda" className="text-muted-foreground text-sm">
            O relatorio &quot;Lista de Marcacoes Realizadas Simplificadas&quot;, em .txt. O
            cabecalho precisa dizer o periodo (&quot;De ... a ...&quot;): e ele que define ate onde
            a competencia foi apurada, e sem ele os dias que o arquivo nao cobre virariam faltas.
          </p>
        </div>

        {/*
          Os dois botoes enviam o mesmo formulario; o que os distingue e o
          `name`/`value` do proprio botao, que o navegador inclui no FormData
          por ser o submitter. Guardar a diferenca em estado seria uma corrida:
          `setState` nao termina antes do envio que o clique dispara.
        */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant={previaConfere ? "secondary" : "default"}
            disabled={pendente}
          >
            {pendente ? <LoaderCircle className="animate-spin" /> : <Upload aria-hidden />}
            {previaConfere ? "Conferir de novo" : "Conferir arquivo"}
          </Button>

          {previaConfere && vaiEscrever && previa ? (
            <Button
              type="submit"
              name="confirmar"
              value="acrescentar"
              variant={podeSubstituir ? "outline" : "default"}
              disabled={pendente}
            >
              {pendente ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 aria-hidden />}
              Gravar {previa.marcacoesNovas} marcacoes
            </Button>
          ) : null}

          {previaConfere && podeSubstituir && previa ? (
            <Button type="submit" name="confirmar" value="substituir" disabled={pendente}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <Replace aria-hidden />}
              Substituir as marcacoes do periodo do arquivo
            </Button>
          ) : null}
        </div>
      </form>

      {estado.status === "error" ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Nao foi possivel ler o arquivo</AlertTitle>
          <AlertDescription>{estado.mensagem}</AlertDescription>
        </Alert>
      ) : null}

      {previa ? (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              <FileText className="mr-2 inline size-4" aria-hidden />
              {previa.arquivo}
            </h2>
            <p className="text-muted-foreground text-sm">
              {previa.registros} linhas e {previa.marcacoesLidas} marcacoes lidas. Nada foi gravado
              ainda — confira abaixo e use{" "}
              {podeSubstituir ? "um dos botoes acima" : <>&quot;Gravar&quot;</>} para aplicar.
            </p>
          </div>

          {previaConfere ? null : (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>Esta previa e de outro arquivo</AlertTitle>
              <AlertDescription>
                O campo acima aponta para {arquivoEscolhido ?? "nenhum arquivo"}, e o que esta
                descrito aqui e {previa.arquivo}. Confira o arquivo de novo antes de gravar.
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <CheckCircle2 aria-hidden />
            <AlertTitle>
              Periodo apurado: {formatarPeriodo(previa.janela.inicio, previa.janela.fim)}
            </AlertTitle>
            <AlertDescription>
              So os dias desta janela sao conferidos. O que vier depois dela nao vira falta — vira
              periodo que ainda nao foi apurado.
              {previa.periodo.inicio !== previa.janela.inicio ||
              previa.periodo.fim !== previa.janela.fim ? (
                <>
                  {" "}
                  O arquivo cobre {formatarPeriodo(previa.periodo.inicio, previa.periodo.fim)}: os
                  dias fora da competencia entram quando a competencia deles estiver em vigor.
                </>
              ) : null}
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-4">
            <Numero rotulo="Marcacoes novas" valor={previa.marcacoesNovas} />
            <Numero rotulo="Ja gravadas" valor={previa.marcacoesJaGravadas} />
            <Numero rotulo="Funcionarios" valor={previa.funcionarios} />
            <Numero
              rotulo="Linhas sem destino"
              valor={
                previa.codigosDesconhecidos.reduce((soma, item) => soma + item.linhas, 0) +
                previa.naoEncontrados.reduce((soma, item) => soma + item.dias, 0) +
                previa.foraDaCompetencia
              }
              alerta
            />
          </div>

          {previa.registrosDeclarados !== null &&
          previa.registrosDeclarados !== previa.registros ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>A leitura nao bate com o rodape do arquivo</AlertTitle>
              <AlertDescription>
                O rodape diz {previa.registrosDeclarados} linhas e conseguimos ler{" "}
                {previa.registros}. Vale conferir o arquivo antes de gravar — pode haver linha em um
                formato que este leitor ainda nao conhece.
              </AlertDescription>
            </Alert>
          ) : null}

          {previa.codigosDesconhecidos.length > 0 ? (
            <div className="space-y-3">
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                <AlertTitle>
                  {previa.codigosDesconhecidos.length === 1
                    ? "1 codigo de empresa sem associacao"
                    : `${previa.codigosDesconhecidos.length} codigos de empresa sem associacao`}
                </AlertTitle>
                <AlertDescription>
                  O relatorio de ponto identifica a empresa so pelo codigo do relogio, e o da folha
                  so pela razao social — nenhum dos dois liga os dois lados sozinho. Enquanto a
                  associacao nao existir, as linhas desses codigos ficam de fora, porque a mesma
                  matricula existe em empresas diferentes. Associe e confira o arquivo de novo.
                </AlertDescription>
              </Alert>

              <AssociarEmpresas codigos={previa.codigosDesconhecidos} empresas={empresas} />
            </div>
          ) : null}

          {previa.foraDaCompetencia > 0 ? (
            <Alert>
              <TriangleAlert aria-hidden />
              <AlertTitle>{previa.foraDaCompetencia} linhas fora da competencia</AlertTitle>
              <AlertDescription>
                Elas pertencem a outro periodo e serao gravadas quando aquela competencia estiver em
                vigor — a marcacao pertence ao dia em que aconteceu, e nao a competencia aberta
                agora.
              </AlertDescription>
            </Alert>
          ) : null}

          {podeSubstituir ? <Discordancia previa={previa} /> : null}

          <NaoEncontrados itens={previa.naoEncontrados} cortados={previa.naoEncontradosCortados} />

          <Recusadas recusadas={previa.recusadas} cortadas={previa.recusasCortadas} />

          {!vaiEscrever && !podeSubstituir && previa.marcacoesJaGravadas > 0 ? (
            <Alert>
              <CheckCircle2 aria-hidden />
              <AlertTitle>Estas marcacoes ja estao no portal</AlertTitle>
              <AlertDescription>
                Nenhuma batida do arquivo e nova, entao nao ha o que gravar. Reenviar o mesmo
                relatorio nunca duplica nada.
              </AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}

      {resultado ? (
        <section className="space-y-4">
          <Alert>
            <CheckCircle2 aria-hidden />
            <AlertTitle>
              {resultado.modo === "substituir" ? "Marcacoes substituidas" : "Carga concluida"}
            </AlertTitle>
            <AlertDescription>
              {resultado.modo === "substituir" ? (
                <span>
                  As batidas de {resultado.funcionarios} funcionarios no periodo{" "}
                  {formatarPeriodo(resultado.periodo.inicio, resultado.periodo.fim)} passaram a ser
                  as do arquivo: {resultado.marcacoesGravadas} entraram e{" "}
                  {resultado.marcacoesRemovidas} sairam.
                </span>
              ) : (
                <span>
                  {resultado.marcacoesGravadas} marcacoes gravadas para {resultado.funcionarios}{" "}
                  funcionarios, no periodo{" "}
                  {formatarPeriodo(resultado.periodo.inicio, resultado.periodo.fim)}.{" "}
                  {resultado.marcacoesJaGravadas > 0
                    ? `${resultado.marcacoesJaGravadas} ja estavam no portal.`
                    : null}
                </span>
              )}
            </AlertDescription>
          </Alert>

          <Button asChild>
            <Link href={`${ROTA_PONTO}?status=com_pendencia`}>Ver as pendencias do periodo</Link>
          </Button>
        </section>
      ) : null}
    </div>
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

/**
 * Onde o arquivo e o portal discordam, no recorte que o arquivo cobre. E o que
 * a substituicao muda, mostrado antes do clique: as batidas que saem riscadas,
 * as que entram destacadas — e o caso tipico e o relatorio corrigido no relogio.
 */
function Discordancia({ previa }: { previa: PreviaDoPonto }) {
  return (
    <div className="space-y-3">
      <Alert>
        <Replace aria-hidden />
        <AlertTitle>
          O arquivo discorda do portal em {previa.totalDiasAlterados}{" "}
          {previa.totalDiasAlterados === 1 ? "dia" : "dias"} de {previa.pessoasAlteradas}{" "}
          {previa.pessoasAlteradas === 1 ? "pessoa" : "pessoas"}
        </AlertTitle>
        <AlertDescription>
          <span>
            Substituindo, as batidas destas pessoas em{" "}
            {formatarPeriodo(previa.janela.inicio, previa.janela.fim)} passam a ser as do arquivo:{" "}
            {previa.marcacoesNovas} entram, {previa.marcacoesARemover} saem
            {previa.marcacoesComMarcaTrocada > 0
              ? ` e ${previa.marcacoesComMarcaTrocada} trocam a marca de incluida`
              : ""}
            . Quem o arquivo nao traz fica como esta.
            {previa.marcacoesNovas > 0
              ? " Gravar so acrescenta: as batidas que o arquivo nao traz continuam no portal."
              : null}
          </span>
        </AlertDescription>
      </Alert>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionario</TableHead>
              <TableHead className="w-28">Dia</TableHead>
              <TableHead>No portal</TableHead>
              <TableHead>No arquivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {previa.diasAlterados.map((dia) => (
              <TableRow key={`${dia.funcionarioId}-${dia.data}`}>
                <TableCell className="whitespace-normal">
                  {dia.nome}
                  <span className="text-muted-foreground"> · {dia.matricula}</span>
                </TableCell>
                <TableCell>{formatarData(dia.data)}</TableCell>
                <TableCell>
                  <Batidas batidas={dia.noPortal} outroLado={dia.noArquivo} lado="portal" />
                </TableCell>
                <TableCell>
                  <Batidas batidas={dia.noArquivo} outroLado={dia.noPortal} lado="arquivo" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {previa.diasAlteradosCortados ? (
        <p className="text-muted-foreground text-sm">Mostrando os {ITENS_NA_PREVIA} primeiros.</p>
      ) : null}

      <Separator />
    </div>
  );
}

/**
 * As batidas de um lado do dia. A que nao existe do outro lado e o que muda:
 * no portal ela sai (riscada), no arquivo ela entra (destacada). A marca `i` e
 * a do relatorio — batida incluida a mao no relogio.
 */
function Batidas({
  batidas,
  outroLado,
  lado,
}: {
  batidas: readonly BatidaDoDia[];
  outroLado: readonly BatidaDoDia[];
  lado: "portal" | "arquivo";
}) {
  if (batidas.length === 0) {
    return <span className="text-muted-foreground">sem batida</span>;
  }

  return (
    <span className="flex flex-wrap gap-x-2 font-mono text-sm">
      {batidas.map((batida) => {
        const doOutroLado = outroLado.find((outra) => outra.hora === batida.hora);
        const muda = !doOutroLado || doOutroLado.incluida !== batida.incluida;
        const classe = !muda
          ? "text-muted-foreground"
          : lado === "portal"
            ? "text-destructive line-through"
            : "font-semibold underline";

        return (
          <span key={batida.hora} className={classe}>
            {batida.hora}
            {batida.incluida ? "i" : ""}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Quem o relogio conhece e o cadastro nao. Nao e erro do arquivo: e gente que
 * saiu do cadastro, ou que entrou no relogio antes de a folha ser importada. As
 * outras linhas entram normalmente.
 */
function NaoEncontrados({
  itens,
  cortados,
}: {
  itens: readonly MatriculaNaoEncontrada[];
  cortados: boolean;
}) {
  if (itens.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-medium">
        <TriangleAlert className="text-destructive size-4" aria-hidden />
        {itens.length === 1
          ? "1 matricula sem cadastro"
          : `${itens.length} matriculas sem cadastro`}
        {cortados ? <Badge variant="outline">lista cortada</Badge> : null}
      </h3>
      <p className="text-muted-foreground text-sm">
        O relogio traz estas pessoas e o portal nao as tem. Importe o relatorio da folha em
        Funcionarios e confira o arquivo de novo — as outras linhas entram normalmente.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Matricula</TableHead>
              <TableHead>Nome no relogio</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead className="w-20">Dias</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={`${item.codigo}-${item.matricula}`}>
                <TableCell>{item.matricula}</TableCell>
                <TableCell className="whitespace-normal">{item.nome}</TableCell>
                <TableCell className="whitespace-normal">{item.empresa}</TableCell>
                <TableCell>{item.dias}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {cortados ? (
        <p className="text-muted-foreground text-sm">Mostrando as {ITENS_NA_PREVIA} primeiras.</p>
      ) : null}

      <Separator />
    </div>
  );
}

/**
 * As linhas que o portal nao conseguiu ler. Vem sempre em primeiro lugar entre
 * os problemas: sao as unicas que apontam para o arquivo, e nao para o cadastro.
 */
function Recusadas({
  recusadas,
  cortadas,
}: {
  recusadas: readonly LinhaRecusada[];
  cortadas: boolean;
}) {
  if (recusadas.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-medium">
        <TriangleAlert className="text-destructive size-4" aria-hidden />
        {recusadas.length === 1 ? "1 linha recusada" : `${recusadas.length} linhas recusadas`}
        {cortadas ? <Badge variant="outline">lista cortada</Badge> : null}
      </h3>
      <p className="text-muted-foreground text-sm">
        Estas linhas nao entram, e as outras entram normalmente.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Linha</TableHead>
              <TableHead>Funcionario</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recusadas.map((recusada) => (
              <TableRow key={`${recusada.linha}-${recusada.identificacao}`}>
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
