"use client";

import { ArrowLeft, Eye, Hourglass, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import { enviarConsolidado } from "@/features/ponto/actions";
import { motivoDoBloqueio } from "@/features/ponto/contato";
import {
  estadoInicialConsolidado,
  type ConsolidadoState,
  type ResponsavelComPendencias,
} from "@/features/ponto/types";

/**
 * Um responsavel na tela do envio consolidado: o que o grupo tem de pendente
 * e, em duas etapas, a mensagem unica com tudo o que ainda nao foi enviado a
 * ele.
 *
 * A previa e so leitura: o texto e a lista das ocorrencias que vao ser dadas
 * como avisadas, e por isso nao se edita. O que volta na confirmacao e a
 * assinatura dele, e a action recusa se o texto refeito la for outro.
 */
export function EnvioConsolidado({ responsavel }: { responsavel: ResponsavelComPendencias }) {
  const [estado, formAction, pendente] = useActionState(
    enviarConsolidado,
    estadoInicialConsolidado,
  );
  // Mesmo arranjo do `MensagemForm`: guarda de qual previa a pessoa voltou.
  const [previaDispensada, setPreviaDispensada] = useState<ConsolidadoState | null>(null);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  const naPrevia =
    estado.status === "previa" && Boolean(estado.previa) && previaDispensada !== estado;

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium">
            <Link href={`/funcionarios/${responsavel.id}`} className="hover:underline">
              {responsavel.nome}
            </Link>
          </p>
          <p className="text-muted-foreground text-xs">
            {responsavel.postos.map((posto) => posto.codigo).join(", ")}
            {responsavel.telefone ? ` · ${formatarTelefone(responsavel.telefone)}` : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={responsavel.aEnviar > 0 ? "default" : "outline"}>
            {responsavel.aEnviar === 1 ? "1 a enviar" : `${responsavel.aEnviar} a enviar`}
          </Badge>
          <Badge variant="secondary">
            {responsavel.pendentes === 1 ? "1 pendente" : `${responsavel.pendentes} pendentes`}
          </Badge>
          {responsavel.prazosVencidos > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Hourglass className="size-3.5" aria-hidden />
              {responsavel.prazosVencidos} com prazo vencido
            </span>
          ) : null}
        </div>
      </div>

      {responsavel.bloqueio ? (
        <p className="text-destructive flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {motivoDoBloqueio(responsavel.bloqueio)}
        </p>
      ) : responsavel.aEnviar === 0 ? (
        <p className="text-muted-foreground text-sm">
          Tudo o que esta pendente ja foi enviado a este responsavel.
        </p>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="responsavelId" value={responsavel.id} />

          {naPrevia && estado.previa ? (
            <>
              <input type="hidden" name="confirmar" value="1" />
              <input type="hidden" name="assinatura" value={estado.previa.assinatura} />

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Confira antes de enviar</Badge>
                <span className="text-muted-foreground text-sm">
                  Para {estado.previa.destinatario} ({estado.previa.telefone}) ·{" "}
                  {estado.previa.ocorrencias === 1
                    ? "1 ocorrencia"
                    : `${estado.previa.ocorrencias} ocorrencias`}
                  . Nada foi enviado ainda.
                </span>
              </div>

              {estado.previa.restantes > 0 ? (
                <p className="text-sm">
                  Mais {estado.previa.restantes} {estado.previa.restantes === 1 ? "fica" : "ficam"}{" "}
                  para o proximo envio.
                </p>
              ) : null}

              {/* `whitespace-pre-wrap`: e assim que o responsavel vai ler no WhatsApp. */}
              <p className="bg-muted max-h-96 overflow-y-auto rounded-md p-3 text-sm whitespace-pre-wrap">
                {estado.previa.conteudo}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pendente}>
                  {pendente ? <LoaderCircle className="animate-spin" /> : <Send aria-hidden />}
                  Confirmar envio
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPreviaDispensada(estado)}
                  disabled={pendente}
                >
                  <ArrowLeft aria-hidden />
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <Button type="submit" variant="secondary" size="sm" disabled={pendente}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <Eye aria-hidden />}
              Pre-visualizar a mensagem
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
