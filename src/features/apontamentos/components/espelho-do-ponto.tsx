import { ExternalLink, FileWarning } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resumirEspelho } from "@/features/apontamentos/espelho";
import { formatarPeriodo } from "@/features/competencias/periodo";
import { formatarMinutos } from "@/features/ponto/apuracao";
import type { ApuracaoDetalhada } from "@/features/ponto/types";

/**
 * O espelho de ponto resumido, ao lado do formulario.
 *
 * So leitura, e nunca preenchimento: os numeros vem da apuracao, que le a
 * marcacao contra a escala cadastrada, e quem aponta decide o que deles vira
 * rubrica — a hora alem do previsto pode ser 50%, 60% ou 100%, e a falta pode
 * ter sido abonada.
 */
export function EspelhoDoPonto({
  detalhe,
  funcionarioId,
  podeAbrirPonto,
}: {
  /** `null` quando a competencia nao tem carga de ponto nenhuma. */
  detalhe: ApuracaoDetalhada | null;
  funcionarioId: string;
  /** O dia a dia continua sendo da area de ponto: o link so aparece a quem a tem. */
  podeAbrirPonto: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Espelho de ponto</CardTitle>
        <CardDescription>
          {detalhe
            ? `Periodo apurado: ${formatarPeriodo(detalhe.janela.inicio, detalhe.janela.fim)}.`
            : "Referencia para o apontamento; nada daqui e gravado."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Conteudo detalhe={detalhe} />

        {podeAbrirPonto && detalhe ? (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={`/ponto/${funcionarioId}`}>
              <ExternalLink aria-hidden />
              Abrir o dia a dia
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Conteudo({ detalhe }: { detalhe: ApuracaoDetalhada | null }) {
  if (!detalhe) {
    return (
      <Aviso>
        Nenhuma carga de ponto nesta competencia. Sem marcacoes nao ha espelho a consultar — o
        apontamento continua podendo ser feito.
      </Aviso>
    );
  }

  if (!detalhe.resumo.escala) {
    return (
      <Aviso>
        Funcionario sem escala: a apuracao nao sabe o que era dia de trabalho, e por isso nao ha
        falta nem hora extra a mostrar. {detalhe.resumo.batidas} batidas na competencia.
      </Aviso>
    );
  }

  const resumo = resumirEspelho(detalhe.apuracao);

  const itens: { rotulo: string; valor: string; detalhe?: string }[] = [
    {
      rotulo: "Dias previstos",
      valor: String(resumo.diasPrevistos),
      detalhe: `${resumo.diasComRegistro} com marcacao`,
    },
    { rotulo: "Faltas", valor: String(resumo.faltas) },
    {
      rotulo: "Alem do previsto",
      valor: formatarMinutos(resumo.horaExtraMinutos),
      detalhe: plural(resumo.diasComHoraExtra, "dia", "dias"),
    },
    {
      rotulo: "Trabalho em folga",
      valor: formatarMinutos(resumo.trabalhoEmFolgaMinutos),
      detalhe: plural(resumo.trabalhoEmFolgaDias, "dia", "dias"),
    },
    {
      rotulo: "Entre 22h e 5h",
      valor: formatarMinutos(resumo.noturnoMinutos),
      detalhe: "hora de relogio, sem a reducao",
    },
    {
      rotulo: "Intrajornada nao cumprida",
      valor: formatarMinutos(resumo.intrajornadaSuprimidaMinutos),
      detalhe: plural(resumo.diasComIntrajornadaCurta, "dia", "dias"),
    },
    { rotulo: "Dias afastado", valor: String(resumo.diasAfastado) },
  ];

  return (
    <>
      {resumo.diasComPendencia > 0 ? (
        <Aviso>
          {plural(resumo.diasComPendencia, "dia ainda tem", "dias ainda tem")} pendencia no ponto
          (marcacao faltando, trabalho em folga): os numeros abaixo podem mudar quando forem
          tratados.
        </Aviso>
      ) : null}

      <dl className="divide-y text-sm">
        {itens.map((item) => (
          <div key={item.rotulo} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-muted-foreground">
              {item.rotulo}
              {item.detalhe ? <span className="block text-xs">{item.detalhe}</span> : null}
            </dt>
            <dd className="font-medium tabular-nums">{item.valor}</dd>
          </div>
        ))}
      </dl>

      {detalhe.janela.diasNaoCobertos > 0 ? (
        <p className="text-muted-foreground text-xs">
          {plural(detalhe.janela.diasNaoCobertos, "dia", "dias")} do fim da competencia ainda sem
          arquivo de ponto.
        </p>
      ) : null}
    </>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex gap-2 rounded-md border border-dashed p-3 text-sm">
      <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function plural(quantidade: number, singular: string, varios: string) {
  return `${quantidade} ${quantidade === 1 ? singular : varios}`;
}
