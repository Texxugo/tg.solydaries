"use client";

import { CheckCircle2, FileSpreadsheet, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
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
import { importarFuncionarios } from "@/features/funcionarios/actions";
import type { LinhaRecusada } from "@/features/funcionarios/planilha";
import {
  estadoInicialImportacao,
  ITENS_NA_PREVIA,
  ROTA_FUNCIONARIOS,
  type ItemDaPrevia,
} from "@/features/funcionarios/types";

/**
 * Importacao do relatorio da folha, em duas etapas: enviar mostra o que vai
 * acontecer, confirmar grava.
 *
 * As duas etapas mandam o **mesmo arquivo**, e nao o plano que a previa
 * devolveu: o que o cliente reenvia nao e evidencia (a action e um POST
 * publico) e o cadastro pode ter mudado entre uma tela e outra. Por isso o
 * `input type="file"` continua montado durante a previa — e dele que sai o
 * arquivo do segundo envio.
 */
export function ImportarFuncionariosForm() {
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
  /** O nome do arquivo, para a tela comparar com o que a previa descreve. */
  const [arquivoEscolhido, setArquivoEscolhido] = useState<string | null>(null);
  const [estado, formAction, pendente] = useActionState(
    importarFuncionarios,
    estadoInicialImportacao,
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
  const vaiEscrever = previa ? previa.criar + previa.atualizar > 0 : false;

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
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            O relatorio &quot;Relacao de Empregados&quot; exportado da folha, em .xlsx. As colunas
            Codigo, Nome e CPF precisam existir; empresa, cargo, admissao e situacao sao lidas
            quando estao la.
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
            <Button type="submit" name="confirmar" value="1" disabled={pendente}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 aria-hidden />}
              Importar {previa.criar + previa.atualizar}
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
              <FileSpreadsheet className="mr-2 inline size-4" aria-hidden />
              {previa.arquivo}
            </h2>
            <p className="text-muted-foreground text-sm">
              {previa.lidas} linhas de funcionario lidas. Nada foi gravado ainda — confira abaixo e
              use &quot;Importar&quot; para aplicar.
            </p>
          </div>

          {previaConfere ? null : (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>Esta previa e de outro arquivo</AlertTitle>
              <AlertDescription>
                O campo acima aponta para {arquivoEscolhido ?? "nenhum arquivo"}, e o que esta
                descrito aqui e {previa.arquivo}. Confira o arquivo de novo antes de importar.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <Numero rotulo="Cadastrar" valor={previa.criar} />
            <Numero rotulo="Atualizar" valor={previa.atualizar} />
            <Numero rotulo="Sem mudanca" valor={previa.inalterados} />
            <Numero rotulo="Recusadas" valor={previa.recusadas.length} alerta />
          </div>

          {previa.empresasNovas.length > 0 ? (
            <Alert>
              <TriangleAlert aria-hidden />
              <AlertTitle>
                {previa.empresasNovas.length === 1
                  ? "1 empresa sera cadastrada"
                  : `${previa.empresasNovas.length} empresas serao cadastradas`}
              </AlertTitle>
              <AlertDescription>
                <span>
                  {previa.empresasNovas.join(", ")}. O relatorio corta a razao social em 40
                  caracteres — vale conferir o nome depois em cada empresa.
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          {!vaiEscrever && previa.recusadas.length === 0 ? (
            <Alert>
              <CheckCircle2 aria-hidden />
              <AlertTitle>O cadastro ja esta igual ao arquivo</AlertTitle>
              <AlertDescription>
                Nenhuma linha muda alguma coisa, entao nao ha o que importar.
              </AlertDescription>
            </Alert>
          ) : null}

          <Recusadas recusadas={previa.recusadas} cortadas={previa.recusasCortadas} />

          <Amostra
            titulo="Serao cadastrados"
            colunaDetalhe="Cargo"
            total={previa.criar}
            itens={previa.amostraCriar}
          />

          <Amostra
            titulo="Serao atualizados"
            colunaDetalhe="O que muda"
            total={previa.atualizar}
            itens={previa.amostraAtualizar}
          />

          <Alert>
            <CheckCircle2 aria-hidden />
            <AlertTitle>Escala e inicio de ciclo nao sao tocados</AlertTitle>
            <AlertDescription>
              O relatorio da folha nao traz jornada. Quem entra agora fica sem escala definida, e
              quem ja tem uma continua com ela — a importacao nunca desfaz esse trabalho.
            </AlertDescription>
          </Alert>
        </section>
      ) : null}

      {resultado ? (
        <section className="space-y-4">
          <Alert>
            <CheckCircle2 aria-hidden />
            <AlertTitle>Importacao concluida</AlertTitle>
            <AlertDescription>
              <span>
                {resultado.criados} cadastrados, {resultado.atualizados} atualizados e{" "}
                {resultado.inalterados} sem mudanca.
                {resultado.empresasCriadas.length > 0
                  ? ` Empresas criadas: ${resultado.empresasCriadas.join(", ")}.`
                  : null}
              </span>
            </AlertDescription>
          </Alert>

          <Recusadas recusadas={resultado.recusadas} cortadas={resultado.recusasCortadas} />

          {resultado.criados > 0 ? (
            <Button asChild variant="secondary">
              <Link href={`${ROTA_FUNCIONARIOS}?pendentes=1`}>Definir a escala de quem entrou</Link>
            </Button>
          ) : null}
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
 * As linhas que o portal nao aceita. Vem sempre em primeiro lugar na tela: sao
 * as unicas que exigem alguma coisa de quem esta importando — o resto e so
 * conferencia.
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
        Estas linhas nao entram, e as outras entram normalmente. Corrija na folha e importe de novo.
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

/** Uma amostra do que vai acontecer — o total inteiro vira o numero do cabecalho. */
function Amostra({
  titulo,
  colunaDetalhe,
  total,
  itens,
}: {
  titulo: string;
  colunaDetalhe: string;
  total: number;
  itens: readonly ItemDaPrevia[];
}) {
  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="font-medium">
        {titulo}: {total}
      </h3>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Linha</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>{colunaDetalhe}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item.linha}>
                <TableCell>{item.linha}</TableCell>
                <TableCell className="whitespace-normal">{item.nome}</TableCell>
                <TableCell className="whitespace-normal">{item.empresa}</TableCell>
                <TableCell className="whitespace-normal">{item.detalhe}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > itens.length ? (
        <p className="text-muted-foreground text-sm">
          Mostrando as {ITENS_NA_PREVIA} primeiras. As outras {total - itens.length} tambem entram.
        </p>
      ) : null}

      <Separator />
    </div>
  );
}
