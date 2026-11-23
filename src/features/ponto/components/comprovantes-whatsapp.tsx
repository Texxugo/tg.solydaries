import { FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { diaDaSemana, formatarData } from "@/features/competencias/periodo";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import { rotuloDaDivergencia } from "@/features/ponto/apuracao";
import type {
  AtendimentoDaOcorrencia,
  ComprovanteResumo,
} from "@/features/ponto/atendimento/queries";
import { hrefDaOcorrencia } from "@/features/ponto/types";

/**
 * Os comprovantes das tratativas feitas pelo WhatsApp.
 *
 * Server Component: leitura pura. A integridade vem conferida da query — o hash
 * contra o conteudo e a transcricao contra as mensagens gravadas — e a tela so a
 * diz. Um comprovante que nao confere aparece em vermelho, e nao some: e
 * justamente o caso que quem audita precisa ver.
 */
export function ComprovantesWhatsapp({
  comprovantes,
  mostrarOcorrencia = false,
}: {
  comprovantes: readonly ComprovanteResumo[];
  /** Na tela do funcionario, cada linha diz de que ocorrencia e e leva ate ela. */
  mostrarOcorrencia?: boolean;
}) {
  if (comprovantes.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Nenhuma tratativa confirmada pelo WhatsApp.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {comprovantes.map((comprovante) => {
        const integro =
          comprovante.integridade.hashConfere && comprovante.integridade.transcricaoConfere;

        return (
          <li key={comprovante.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              {integro ? (
                <Badge variant="secondary">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Integro
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <ShieldAlert className="size-3.5" aria-hidden />
                  Conteudo alterado
                </Badge>
              )}

              {mostrarOcorrencia ? (
                <Link
                  href={hrefDaOcorrencia({
                    funcionarioId: comprovante.funcionarioId,
                    data: comprovante.data,
                    tipo: comprovante.tipo,
                  })}
                  className="text-sm font-medium underline"
                >
                  {formatarData(comprovante.data)} ({diaDaSemana(comprovante.data)}) ·{" "}
                  {rotuloDaDivergencia(comprovante.tipo)}
                </Link>
              ) : null}

              <span className="text-muted-foreground text-xs">
                {formatarDataHora(comprovante.geradoEm)} · {formatarTelefone(comprovante.telefone)}{" "}
                · {comprovante.motivo} · {comprovante.mensagens} mensagens
              </span>

              <a
                href={`/ponto/comprovantes/${comprovante.id}/pdf`}
                target="_blank"
                rel="noopener"
                className="ml-auto inline-flex items-center gap-1 text-sm underline"
              >
                <FileText className="size-3.5" aria-hidden />
                Abrir PDF
              </a>
            </div>

            <p className="text-muted-foreground font-mono text-xs break-all">
              SHA-256 {comprovante.hash}
            </p>

            {!integro ? (
              <p className="text-destructive text-sm">
                {!comprovante.integridade.hashConfere
                  ? "O conteudo gravado nao corresponde mais ao hash registrado na confirmacao."
                  : "As mensagens gravadas nao correspondem mais a transcricao que foi confirmada."}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const ROTULO_DA_ETAPA: Record<AtendimentoDaOcorrencia["etapa"], string> = {
  data: "escolhendo a data",
  tipo: "escolhendo a ocorrencia",
  motivo: "escolhendo o motivo",
  horarios: "informando os horarios",
  descricao: "escrevendo a explicacao",
  confirmacao: "conferindo o resumo",
};

const ROTULO_DO_DESFECHO: Record<NonNullable<AtendimentoDaOcorrencia["desfecho"]>, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado pelo colaborador",
  expirado: "Expirou sem resposta",
  sem_pendencia: "Encerrado sem pendencia",
  encaminhado_ao_responsavel: "Encaminhado ao responsavel do posto",
};

/** As conversas sobre a ocorrencia — inclusive a que esta em andamento agora. */
export function AtendimentosDaOcorrencia({
  atendimentos,
}: {
  atendimentos: readonly AtendimentoDaOcorrencia[];
}) {
  if (atendimentos.length === 0) {
    return null;
  }

  return (
    <ul className="text-muted-foreground space-y-1 text-sm">
      {atendimentos.map((atendimento) => (
        <li key={atendimento.id} className="flex flex-wrap items-center gap-2">
          {atendimento.desfecho ? (
            <Badge variant="outline">{ROTULO_DO_DESFECHO[atendimento.desfecho]}</Badge>
          ) : (
            <Badge variant="secondary">Em andamento — {ROTULO_DA_ETAPA[atendimento.etapa]}</Badge>
          )}
          <span>
            {formatarDataHora(atendimento.ultimaInteracaoEm)} · {atendimento.mensagens} mensagens ·
            protocolo {atendimento.id.slice(0, 8)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatarDataHora(instante: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(instante);
}
