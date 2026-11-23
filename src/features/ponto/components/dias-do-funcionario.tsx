import { PenLine } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import {
  formatarMinutos,
  rotuloDaDivergencia,
  temPendencia,
  type DiaApurado,
} from "@/features/ponto/apuracao";

import { hrefDaOcorrencia } from "@/features/ponto/types";

import { Saldo } from "./lista-conferencia";
import { rotuloDoAfastamento } from "@/features/funcionarios/afastamentos";

/**
 * O dia a dia de uma pessoa no periodo apurado.
 *
 * Server Component: e uma leitura, e tudo o que ela mostra ja foi decidido por
 * `apuracao.ts`. A tela nao recalcula nada — se recalculasse, passaria a existir
 * uma segunda versao da regra para divergir da primeira.
 *
 * A coluna de marcacoes mostra o **turno**, e nao a linha do relatorio: numa
 * escala noturna a saida foi registrada no dia seguinte, e e aqui que os dois
 * pedacos aparecem juntos, como o turno que sempre foram.
 */
export function DiasDoFuncionario({
  funcionarioId,
  dias,
}: {
  funcionarioId: string;
  dias: readonly DiaApurado[];
}) {
  if (dias.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
        Nao ha dia apurado neste periodo.
      </p>
    );
  }

  return (
    // O `Table` do shadcn ja rola sozinho; a camada de fora so desenha a borda.
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dia</TableHead>
            <TableHead>Ciclo</TableHead>
            <TableHead>Previsto</TableHead>
            <TableHead>Marcacoes</TableHead>
            <TableHead className="text-right">Trabalhado</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>O que houve</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dias.map((dia) => (
            <TableRow key={dia.data} data-pendencia={temPendencia(dia) ? "" : undefined}>
              <TableCell className="whitespace-nowrap">
                <div className="font-medium">{formatarData(dia.data)}</div>
                <div className="text-muted-foreground text-xs">{diaDaSemana(dia.data)}</div>
              </TableCell>

              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                dia {dia.diaCiclo}
                {dia.afastamento
                  ? ` · ${rotuloDoAfastamento(dia.afastamento.tipo).toLowerCase()}`
                  : null}
                {!dia.afastamento && !dia.regra ? " · folga" : null}
              </TableCell>

              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {dia.regra ? (
                  <>
                    {dia.regra.entrada}–{dia.regra.saida}
                    <div>{formatarMinutos(dia.previstoMinutos)}</div>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>

              <TableCell>
                <Marcacoes dia={dia} />
              </TableCell>

              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {dia.trabalhadoMinutos === null ? "—" : formatarMinutos(dia.trabalhadoMinutos)}
              </TableCell>

              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {dia.saldoToleradoMinutos === null || dia.saldoMinutos === null ? (
                  "—"
                ) : (
                  <SaldoDoDia tolerado={dia.saldoToleradoMinutos} bruto={dia.saldoMinutos} />
                )}
              </TableCell>

              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  {/*
                    Cada divergencia e um link para a tratativa dela: e daqui que
                    se sai da leitura ("o que houve neste dia?") para o trabalho
                    ("o que fazemos a respeito?").
                  */}
                  {dia.divergencias.map((divergencia) => (
                    <Link
                      key={divergencia.tipo}
                      href={hrefDaOcorrencia({
                        funcionarioId,
                        data: dia.data,
                        tipo: divergencia.tipo,
                      })}
                      title={divergencia.descricao}
                    >
                      <Badge
                        variant={
                          divergencia.gravidade === "impeditiva" ? "destructive" : "secondary"
                        }
                      >
                        {rotuloDaDivergencia(divergencia.tipo)}
                      </Badge>
                    </Link>
                  ))}
                  {dia.afastamento ? (
                    <Badge variant="outline">{rotuloDoAfastamento(dia.afastamento.tipo)}</Badge>
                  ) : null}
                  {dia.divergencias.length === 0 && dia.regra && !dia.afastamento ? (
                    <span className="text-muted-foreground text-xs">Fecha com a escala.</span>
                  ) : null}
                </div>

                {dia.divergencias.length > 0 ? (
                  <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                    {dia.divergencias.map((divergencia) => (
                      <li key={`${divergencia.tipo}-descricao`}>{divergencia.descricao}</li>
                    ))}
                  </ul>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * As batidas do turno, e as ignoradas logo abaixo.
 *
 * A batida ignorada aparece riscada e com o motivo: ela existe no relatorio, e
 * some-la deixaria quem confere procurando no arquivo uma marcacao que a tela
 * jurou nao existir.
 */
/**
 * O saldo com tolerancia, que e o que decide extra e debito, e embaixo o que o
 * relogio registrou quando os dois diferem. Mostrar so o bruto fazia 06:52-17:09
 * parecer "+17min" de extra num dia que o portal nao marca como extra.
 */
function SaldoDoDia({ tolerado, bruto }: { tolerado: number; bruto: number }) {
  return (
    <>
      <Saldo minutos={tolerado} />
      {bruto !== tolerado ? (
        <div className="text-muted-foreground text-xs" title="Saldo como o relogio registrou">
          relogio {bruto > 0 ? "+" : ""}
          {formatarMinutos(bruto)}
        </div>
      ) : null}
    </>
  );
}

function Marcacoes({ dia }: { dia: DiaApurado }) {
  if (dia.batidas.length === 0 && dia.ignoradas.length === 0) {
    // Em dia de folga a ausencia e o esperado, e escrever "sem marcacao" ali
    // faria a linha parecer um problema. Num dia de trabalho e o problema, e a
    // divergencia ao lado ja o nomeia.
    return (
      <span className="text-muted-foreground text-sm">{dia.regra ? "Sem marcacao" : "—"}</span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5 font-mono text-sm tabular-nums">
        {dia.batidas.map((batida, indice) => (
          // A chave e a posicao: numa jornada de mais de 24h a mesma hora se repete.
          <span key={indice} className="inline-flex items-center gap-0.5">
            {batida.hora}
            {batida.diaSeguinte ? (
              // Compacto de proposito: no plantao noturno quase toda batida e da
              // madrugada, e "(dia seguinte)" por extenso empurrava o saldo para
              // fora da tela.
              <sup
                className="text-muted-foreground font-sans text-[10px]"
                title="Registrada no dia seguinte"
                aria-label="registrada no dia seguinte"
              >
                +1
              </sup>
            ) : null}
            {batida.incluida ? (
              <PenLine className="text-muted-foreground size-3" aria-label="Incluida a mao" />
            ) : null}
          </span>
        ))}
        {dia.batidas.length === 0 ? <span className="text-muted-foreground">—</span> : null}
      </div>

      {dia.ignoradas.length > 0 ? (
        <div className="text-muted-foreground text-xs">
          <span className="font-mono line-through">
            {dia.ignoradas.map((batida) => batida.hora).join(" ")}
          </span>{" "}
          {dia.motivoIgnoradas}
        </div>
      ) : null}
    </div>
  );
}
