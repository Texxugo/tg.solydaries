"use client";

import { LoaderCircle, Wand2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData } from "@/features/competencias/periodo";
import { diasDoPeriodo } from "@/features/preenchimento/grade";
import { definirEscalasSugeridas } from "@/features/ponto/actions";
import { DIAS_MINIMOS, type SugestaoDeEscala } from "@/features/ponto/inferencia";
import {
  estadoInicialAplicarSugestoes,
  type PaginaDeSugestoes,
  type SugestaoParaConferencia,
} from "@/features/ponto/types";

/**
 * A conferencia das escalas que o ponto sugere, e a gravacao em lote.
 *
 * Vem marcado so o que a leitura considera confiavel; o resto continua na
 * lista, com o motivo a vista, porque "o ponto nao explica esta pessoa"
 * tambem e resposta — e some-la esconderia justamente quem precisa de olhar.
 *
 * Quem marca decide; a action recalcula tudo e grava so o que ela mesma
 * concluiu.
 */
export function EscalasSugeridas({ leitura }: { leitura: PaginaDeSugestoes }) {
  const [estado, formAction, pendente] = useActionState(
    definirEscalasSugeridas,
    estadoInicialAplicarSugestoes,
  );

  const [marcados, setMarcados] = useState<ReadonlySet<string>>(
    () => new Set(leitura.sugestoes.filter((s) => s.confiavel).map((s) => s.funcionarioId)),
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  function alternar(funcionarioId: string, marcado: boolean) {
    setMarcados((atuais) => {
      const proximos = new Set(atuais);

      if (marcado) {
        proximos.add(funcionarioId);
      } else {
        proximos.delete(funcionarioId);
      }

      return proximos;
    });
  }

  // Conta so quem ainda esta na lista: depois de gravar, quem ganhou escala
  // sai da leitura e o `Set` fica com ids que nao existem mais.
  const selecionadas = leitura.sugestoes.filter((s) => marcados.has(s.funcionarioId)).length;
  const confiaveis = leitura.sugestoes.filter((s) => s.confiavel).length;

  if (!leitura.competencia) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhuma competencia em vigor. Abra uma em Competencias para o portal ter onde ler o ponto.
      </p>
    );
  }

  if (!leitura.janela) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum arquivo de ponto foi importado nesta competencia — sem batida nao ha o que inferir.
        Comece pela{" "}
        <Link href="/ponto/importar" className="underline underline-offset-4">
          importacao de marcacoes
        </Link>
        .
      </p>
    );
  }

  const diasDaJanela = diasDoPeriodo(leitura.janela.inicio, leitura.janela.fim).length;

  return (
    <div className="space-y-6">
      {/*
        Janela curta nao e "nenhuma escala bate": e nao haver ponto suficiente
        para um ciclo aparecer. Sem dizer isso, a tela vazia pareceria defeito
        logo depois de virar a competencia — que e justamente quando ela e
        aberta.
      */}
      {diasDaJanela < DIAS_MINIMOS ? (
        <p className="text-sm">
          O ponto importado nesta competencia cobre {diasDaJanela}{" "}
          {diasDaJanela === 1 ? "dia" : "dias"} — abaixo dos {DIAS_MINIMOS} que um ciclo precisa
          para aparecer. Importe mais dias, ou consulte a competencia anterior em{" "}
          <Link href="/competencias" className="underline underline-offset-4">
            Competencias
          </Link>{" "}
          e volte aqui: a escala que sair de la vale para o cadastro, que nao e datado.
        </p>
      ) : null}

      <p className="text-muted-foreground text-sm">
        {leitura.totalSemEscala} sem escala; o ponto de {formatarData(leitura.janela.inicio)} a{" "}
        {formatarData(leitura.janela.fim)} explica{" "}
        <span className="text-foreground font-medium">{leitura.sugestoes.length}</span> —{" "}
        {confiaveis} com folga.
        {leitura.semPonto > 0
          ? ` ${leitura.semPonto} nao bateram ponto nenhum nesta competencia e continuam so no cadastro manual.`
          : null}
      </p>

      {leitura.sugestoes.length > 0 ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="competenciaId" value={leitura.competencia.id} />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Aplicar</span>
                </TableHead>
                <TableHead>Funcionario</TableHead>
                <TableHead>Escala sugerida</TableHead>
                <TableHead>Confere</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Marcacoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leitura.sugestoes.map((sugestao) => (
                <Linha
                  key={sugestao.funcionarioId}
                  sugestao={sugestao}
                  marcado={marcados.has(sugestao.funcionarioId)}
                  onAlternar={(marcado) => alternar(sugestao.funcionarioId, marcado)}
                />
              ))}
            </TableBody>
          </Table>

          <Button type="submit" disabled={pendente || selecionadas === 0}>
            {pendente ? <LoaderCircle className="animate-spin" /> : <Wand2 aria-hidden />}
            {pendente
              ? "Definindo..."
              : selecionadas === 0
                ? "Marque quem receber a escala"
                : `Definir ${selecionadas} ${selecionadas === 1 ? "escala" : "escalas"}`}
          </Button>
        </form>
      ) : null}

      {leitura.semSugestao.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">
            O ponto nao explica ({leitura.semSugestao.length})
          </h2>
          <p className="text-muted-foreground text-sm">
            Continuam sem escala. Poucos dias com batida nao sustentam um ciclo, e o catalogo pode
            nao ter o horario dessas pessoas — nesse caso o caminho e cadastrar a escala em{" "}
            <Link href="/escalas" className="underline underline-offset-4">
              Escalas
            </Link>{" "}
            e voltar aqui.
          </p>

          <ul className="divide-y rounded-md border text-sm">
            {leitura.semSugestao.map((pessoa) => (
              <li
                key={pessoa.funcionarioId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span>
                  <span className="font-medium">{pessoa.nome}</span>{" "}
                  <span className="text-muted-foreground">
                    {pessoa.matricula} · {pessoa.empresaNome}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {pessoa.motivo === "poucos_dias"
                    ? `so ${pessoa.diasComBatida} ${pessoa.diasComBatida === 1 ? "dia" : "dias"} com batida`
                    : "nenhuma escala do catalogo bate"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** "+5 min" ou "no horario" — o quanto a entrada observada difere da escala. */
function diferencaDeHorario(minutos: number) {
  return minutos === 0 ? "no horario" : `${minutos} min de diferenca`;
}

function Linha({
  sugestao,
  marcado,
  onAlternar,
}: {
  sugestao: SugestaoParaConferencia;
  marcado: boolean;
  onAlternar: (marcado: boolean) => void;
}) {
  const id = `sugestao-${sugestao.funcionarioId}`;

  return (
    <TableRow>
      <TableCell>
        <Checkbox
          id={id}
          name="funcionarioId"
          value={sugestao.funcionarioId}
          checked={marcado}
          onCheckedChange={(valor) => onAlternar(valor === true)}
          aria-label={`Definir a escala de ${sugestao.nome}`}
        />
      </TableCell>

      <TableCell className="whitespace-normal">
        <div className="font-medium">{sugestao.nome}</div>
        <p className="text-muted-foreground text-sm">
          {sugestao.matricula} · {sugestao.empresaNome}
        </p>
      </TableCell>

      <TableCell className="whitespace-normal">
        <div className="flex flex-wrap items-center gap-2">
          <span>{sugestao.escalaNome}</span>
          {sugestao.confiavel ? null : <Badge variant="outline">Conferir</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">
          Ciclo comeca em {formatarData(sugestao.inicioCiclo)}
        </p>
      </TableCell>

      <TableCell>
        <div>{sugestao.percentual}%</div>
        <p className="text-muted-foreground text-sm">
          {sugestao.acertos} de {sugestao.diasConferidos} dias
          {sugestao.diasDivergentes.length > 0
            ? ` · fora: ${diasFora(sugestao.diasDivergentes)}`
            : null}
        </p>
      </TableCell>

      <TableCell className="text-muted-foreground text-sm">
        {diferencaDeHorario(sugestao.minutosDeDiferenca)}
      </TableCell>

      <TableCell className="text-muted-foreground text-sm">
        {sugestao.marcacoesObservadas} por dia
      </TableCell>
    </TableRow>
  );
}

/** Os primeiros dias que nao bateram — a lista inteira viraria um paragrafo. */
function diasFora(datas: SugestaoDeEscala["diasDivergentes"]) {
  const mostrados = datas.slice(0, 3).map((data) => formatarData(data).slice(0, 5));

  return datas.length > 3
    ? `${mostrados.join(", ")} e mais ${datas.length - 3}`
    : mostrados.join(", ");
}
