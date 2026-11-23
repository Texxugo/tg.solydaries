import { MessageSquare, MessageSquareX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import type { MensagemEnviada } from "@/features/ponto/types";

/**
 * O que ja foi enviado por causa desta ocorrencia.
 *
 * Server Component: e leitura pura. Cada linha guarda o texto e o numero **como
 * foram enviados**, e nao por referencia ao cadastro ou ao modelo — os dois
 * mudam, e o historico precisa dizer o que a pessoa recebeu naquele dia.
 *
 * Envio que falhou tambem aparece. Sem ele, "ninguem avisou o colaborador" e "o
 * numero esta errado" ficariam indistinguiveis na tela, e as duas situacoes
 * pedem acoes diferentes.
 */
export function HistoricoMensagens({ mensagens }: { mensagens: readonly MensagemEnviada[] }) {
  if (mensagens.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Nenhuma mensagem enviada por causa desta ocorrencia.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {mensagens.map((mensagem) => (
        <li key={mensagem.id} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {mensagem.status === "enviada" ? (
              <Badge variant="secondary">
                <MessageSquare className="size-3.5" aria-hidden />
                Enviada
              </Badge>
            ) : (
              <Badge variant="destructive">
                <MessageSquareX className="size-3.5" aria-hidden />
                Falhou
              </Badge>
            )}

            {mensagem.destino === "responsavel" ? (
              <Badge variant="outline">
                Ao responsavel{mensagem.destinatario ? `: ${mensagem.destinatario}` : null}
              </Badge>
            ) : null}

            {mensagem.ocorrenciasNoLote ? (
              <Badge variant="outline">
                Consolidada
                {mensagem.ocorrenciasNoLote > 1
                  ? ` · ${mensagem.ocorrenciasNoLote} ocorrencias`
                  : null}
              </Badge>
            ) : null}

            <span className="text-muted-foreground text-xs">
              {formatarDataHora(mensagem.criadoEm)} · {formatarTelefone(mensagem.telefone)}
              {mensagem.enviadoPor ? ` · por ${mensagem.enviadoPor}` : null}
            </span>
          </div>

          {mensagem.erro ? <p className="text-destructive text-sm">{mensagem.erro}</p> : null}

          {/* `whitespace-pre-wrap`: o texto tem quebras de linha, e e assim que o
              colaborador o leu. */}
          <p className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">{mensagem.conteudo}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * `05/09/2026 14:32`. O `criado_em` e `timestamptz`, entao o instante e
 * absoluto; a formatacao fixa o fuso de Sao Paulo para que o servidor e o
 * cliente escrevam a mesma coisa — sem isso, a hidratacao divergiria.
 */
function formatarDataHora(instante: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(instante);
}
