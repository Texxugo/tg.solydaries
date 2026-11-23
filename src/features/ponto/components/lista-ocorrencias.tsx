import {
  ChevronRight,
  Hourglass,
  MessageSquare,
  MessageSquareX,
  PhoneOff,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { rotuloDaDivergencia } from "@/features/ponto/apuracao";
import type { PrazoDeRetorno } from "@/features/ponto/contato";
import { rotuloDaTratativa, tratativaEncerrada } from "@/features/ponto/tratativas";
import { hrefDaOcorrencia, type Ocorrencia } from "@/features/ponto/types";
import type { TratativaStatus } from "@/db/schema";

/**
 * O painel: uma linha por **ocorrencia**, e nao por pessoa.
 *
 * Server Component, como a lista da conferencia: cada linha e um link para a
 * ocorrencia e os filtros vivem na URL. O que muda em relacao a conferencia e a
 * unidade — aqui cada problema aparece sozinho, porque cada um tem a sua
 * conversa e o seu desfecho.
 *
 * As duas metades da linha tem origens diferentes, e a tabela as separa: da
 * esquerda ate "Ocorrencia" tudo e **calculado** a cada leitura e some se a
 * escala mudar; de "Tratativa" em diante tudo e **gravado**.
 */
export function ListaOcorrencias({ itens }: { itens: readonly Ocorrencia[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
        Nenhuma ocorrencia atende a este filtro.
      </p>
    );
  }

  return (
    // O `Table` do shadcn ja embrulha a tabela num container que rola; a camada
    // de fora so desenha a borda.
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Funcionario</TableHead>
            <TableHead>Dia</TableHead>
            <TableHead>Ocorrencia</TableHead>
            <TableHead>Tratativa</TableHead>
            <TableHead>Mensagens</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((ocorrencia) => (
            <TableRow key={`${ocorrencia.funcionarioId}-${ocorrencia.data}-${ocorrencia.tipo}`}>
              <TableCell className="min-w-48 whitespace-normal">
                <div className="font-medium">{ocorrencia.nome}</div>
                <div className="text-muted-foreground text-xs">
                  {ocorrencia.empresaNome} · matricula {ocorrencia.matricula}
                  {ocorrencia.cargo ? ` · ${ocorrencia.cargo}` : null}
                </div>
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <div>{formatarData(ocorrencia.data)}</div>
                <div className="text-muted-foreground text-xs">
                  {diaDaSemana(ocorrencia.data)} · dia {ocorrencia.diaCiclo}
                </div>
              </TableCell>

              <TableCell className="min-w-64 whitespace-normal">
                <Badge
                  variant={ocorrencia.gravidade === "impeditiva" ? "destructive" : "secondary"}
                >
                  {rotuloDaDivergencia(ocorrencia.tipo)}
                </Badge>
                <div className="text-muted-foreground mt-1 text-xs">{ocorrencia.descricao}</div>
              </TableCell>

              <TableCell className="min-w-40 whitespace-normal">
                <TratativaBadge status={ocorrencia.status} />
                {ocorrencia.responsavel ? (
                  <div className="text-muted-foreground mt-1 text-xs">{ocorrencia.responsavel}</div>
                ) : null}
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <Mensagens ocorrencia={ocorrencia} />
              </TableCell>

              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link
                    href={hrefDaOcorrencia(ocorrencia)}
                    aria-label={`Tratar a ocorrencia de ${ocorrencia.nome}`}
                  >
                    Tratar
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * O status da tratativa. `aberta` fica em `outline` de proposito: e a ausencia
 * de trabalho, e nao um desfecho — dar-lhe cor a faria competir com a gravidade
 * da ocorrencia, que e a coluna ao lado e diz coisa diferente.
 */
export function TratativaBadge({ status }: { status: TratativaStatus }) {
  const variante =
    status === "aberta" ? "outline" : tratativaEncerrada(status) ? "default" : "secondary";

  return <Badge variant={variante}>{rotuloDaTratativa(status)}</Badge>;
}

/**
 * Se alguem ja avisou o colaborador — e se o aviso chegou a sair.
 *
 * Envio que falhou aparece com destaque proprio: sem isso, "ninguem mandou
 * mensagem" e "a mensagem nao foi aceita" ficariam iguais na tela, e as duas
 * pedem acoes diferentes. Quem esta sem telefone aparece antes disso, porque
 * ali nao ha nem o que tentar.
 *
 * Com responsavel, a linha diz por quem a conversa passa e, depois do envio,
 * ate quando se espera o retorno dele.
 */
function Mensagens({ ocorrencia }: { ocorrencia: Ocorrencia }) {
  const { destino } = ocorrencia;
  const viaResponsavel =
    destino.via === "responsavel" ? (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <UserCheck className="size-3.5" aria-hidden />
        via {destino.nome}
        {destino.posto ? ` (${destino.posto.codigo})` : null}
      </span>
    ) : null;

  if (ocorrencia.mensagens === 0) {
    if (destino.bloqueio) {
      return (
        <span className="flex flex-col gap-0.5">
          {viaResponsavel}
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <PhoneOff className="size-3.5" aria-hidden />
            {destino.via === "responsavel" ? "Responsavel sem contato" : "Sem telefone"}
          </span>
        </span>
      );
    }

    return viaResponsavel ?? <span className="text-muted-foreground text-sm">—</span>;
  }

  const falhou = ocorrencia.ultimaMensagem?.status === "falhou";

  return (
    <span className="flex flex-col gap-0.5">
      {viaResponsavel}
      <span
        className={
          falhou
            ? "text-destructive inline-flex items-center gap-1 text-xs"
            : "text-muted-foreground inline-flex items-center gap-1 text-xs"
        }
      >
        {falhou ? (
          <MessageSquareX className="size-3.5" aria-hidden />
        ) : (
          <MessageSquare className="size-3.5" aria-hidden />
        )}
        {ocorrencia.mensagens}
        {falhou ? " · ultimo envio falhou" : null}
      </span>
      {ocorrencia.prazo ? <PrazoBadge prazo={ocorrencia.prazo} /> : null}
    </span>
  );
}

/**
 * Ate quando se espera o retorno do responsavel. Vencido fica em destaque: e o
 * caso em que alguem precisa cobrar.
 */
export function PrazoBadge({ prazo }: { prazo: PrazoDeRetorno }) {
  return (
    <span
      className={
        prazo.vencido
          ? "inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"
          : "text-muted-foreground inline-flex items-center gap-1 text-xs"
      }
    >
      <Hourglass className="size-3.5" aria-hidden />
      {prazo.vencido
        ? `Prazo vencido em ${formatarData(prazo.ate)}`
        : `Retorno ate ${formatarData(prazo.ate)}`}
    </span>
  );
}
