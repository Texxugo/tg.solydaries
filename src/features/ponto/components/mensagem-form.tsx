"use client";

import { ArrowLeft, Eye, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/features/competencias/periodo";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import { enviarMensagem } from "@/features/ponto/actions";
import { rotuloDaDivergencia } from "@/features/ponto/apuracao";
import { motivoDoBloqueio } from "@/features/ponto/contato";
import { LIMITE_MENSAGEM } from "@/features/ponto/mensagens";
import {
  estadoInicialMensagem,
  type ChaveDaOcorrencia,
  type MensagemState,
  type OcorrenciaDetalhada,
} from "@/features/ponto/types";

/**
 * A mensagem ao colaborador, em duas etapas: escrever e conferir.
 *
 * A segunda etapa existe pelo motivo mais simples possivel — **envio de
 * WhatsApp nao tem desfazer**. A previa mostra destinatario, numero, ocorrencia
 * e o texto inteiro, e nada sai antes de alguem confirmar. E o mesmo arranjo da
 * importacao de marcacoes, pela mesma razao.
 *
 * O que a confirmacao reenvia e so o **texto**. Destinatario e numero sao
 * relidos do cadastro dentro da action: o que o cliente devolve nao e evidencia
 * — a action e um POST publico como todas as outras. O destino da previa volta
 * so para ser **comparado**: se mudou no meio, nada sai.
 *
 * Quando o colaborador esta no grupo de contato de um posto com responsavel, e
 * o responsavel quem recebe — e o texto sugerido ja e o dele.
 */
export function MensagemForm({
  chave,
  ocorrencia,
}: {
  chave: ChaveDaOcorrencia;
  ocorrencia: OcorrenciaDetalhada;
}) {
  const [estado, formAction, pendente] = useActionState(enviarMensagem, estadoInicialMensagem);

  /**
   * "Voltar e editar" e a unica coisa que o cliente decide aqui; a etapa em si
   * vem do servidor (`estado.status`), para que a previa apareca mesmo sem
   * JavaScript.
   *
   * O que se guarda e **de qual previa** a pessoa voltou, e nao um booleano: o
   * `estado` e um objeto novo a cada resposta da action, entao comparar por
   * identidade ja faz a previa seguinte aparecer sozinha. Um booleano exigiria
   * zera-lo num efeito, que e justamente o `setState` em efeito que o
   * `react-hooks` reprova — e a mesma razao pela qual `use-mobile.ts` foi
   * reescrito com `useSyncExternalStore`.
   */
  const [previaDispensada, setPreviaDispensada] = useState<MensagemState | null>(null);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  const { destino } = ocorrencia;

  if (destino.bloqueio === "sem_telefone") {
    return (
      <Alert>
        <TriangleAlert aria-hidden />
        <AlertTitle>Esta pessoa esta sem telefone no cadastro</AlertTitle>
        <AlertDescription>
          O numero nao vem da folha — ele nasce no portal. Informe o WhatsApp em{" "}
          <Link href={`/funcionarios/${ocorrencia.funcionario.id}`} className="underline">
            Funcionarios
          </Link>{" "}
          para poder falar com o colaborador por aqui.
        </AlertDescription>
      </Alert>
    );
  }

  if (destino.bloqueio) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden />
        <AlertTitle>
          A mensagem vai para o responsavel pelo posto, e ele nao pode recebe-la
        </AlertTitle>
        <AlertDescription>
          {motivoDoBloqueio(destino.bloqueio)} Responsavel: {destino.nome}
          {destino.posto ? ` (posto ${destino.posto.codigo})` : null}.{" "}
          <Link href={`/funcionarios/${destino.funcionarioId}`} className="underline">
            Abrir o cadastro
          </Link>
          {destino.posto ? (
            <>
              {" · "}
              <Link href={`/postos/${destino.posto.id}`} className="underline">
                Abrir o posto
              </Link>
            </>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (!ocorrencia.envioDisponivel) {
    return (
      <Alert>
        <TriangleAlert aria-hidden />
        <AlertTitle>Envio de mensagens indisponivel</AlertTitle>
        <AlertDescription>
          As credenciais da Z-API nao estao configuradas neste ambiente. O resto da tratativa
          continua funcionando: o status e a observacao sao gravados normalmente.
        </AlertDescription>
      </Alert>
    );
  }

  const naPrevia =
    estado.status === "previa" && Boolean(estado.previa) && previaDispensada !== estado;
  const texto = estado.conteudo ?? ocorrencia.sugestao;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="funcionarioId" value={chave.funcionarioId} />
      <input type="hidden" name="data" value={chave.data} />
      <input type="hidden" name="tipo" value={chave.tipo} />

      {naPrevia && estado.previa ? (
        <>
          {/* O texto viaja num hidden: a previa e so leitura, e o que sai tem de
              ser exatamente o que esta na tela. */}
          <input type="hidden" name="conteudo" value={estado.previa.conteudo} />
          <input type="hidden" name="confirmar" value="1" />
          <input type="hidden" name="destino" value={estado.previa.destino} />
          <input type="hidden" name="destinatarioId" value={estado.previa.destinatarioId} />

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Confira antes de enviar</Badge>
              <span className="text-muted-foreground text-sm">Nada foi enviado ainda.</span>
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Campo
                rotulo="Destinatario"
                valor={
                  estado.previa.posto
                    ? `${estado.previa.destinatario} (responsavel pelo posto ${estado.previa.posto})`
                    : estado.previa.destinatario
                }
              />
              <Campo rotulo="Numero" valor={estado.previa.telefone} />
              {estado.previa.sobre ? (
                <Campo rotulo="Sobre o colaborador" valor={estado.previa.sobre} />
              ) : null}
              <Campo rotulo="Empresa" valor={estado.previa.empresa} />
              <Campo
                rotulo="Ocorrencia"
                valor={`${formatarData(estado.previa.ocorrencia.data)} · ${rotuloDaDivergencia(
                  estado.previa.ocorrencia.tipo,
                )}`}
              />
            </dl>

            <div className="space-y-1">
              <p className="text-sm font-medium">Mensagem</p>
              {/* `whitespace-pre-wrap` porque o modelo tem quebras de linha, e e
                  assim que o colaborador vai ler no WhatsApp. */}
              <p className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">
                {estado.previa.conteudo}
              </p>
            </div>
          </div>

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
              Voltar e editar
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="conteudo">Mensagem</Label>
            {/*
              A `key` derivada do texto reaplica o que o servidor devolveu: React
              reseta o formulario depois de toda Server Action, e sem isso a
              edicao de quem voltou da previa se perderia.
            */}
            <Textarea
              key={texto}
              id="conteudo"
              name="conteudo"
              rows={10}
              defaultValue={texto}
              maxLength={LIMITE_MENSAGEM}
              className="font-mono text-sm"
            />
            <p className="text-muted-foreground text-sm">
              {destino.via === "responsavel" && destino.posto
                ? `Para ${destino.nome}, responsavel pelo posto ${destino.posto.codigo} — ${formatarTelefone(destino.telefone ?? "")}.`
                : `Para ${formatarTelefone(destino.telefone ?? "")}.`}
            </p>
          </div>

          {estado.status === "error" ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.mensagem}
            </p>
          ) : null}

          <Button type="submit" variant="secondary" disabled={pendente}>
            {pendente ? <LoaderCircle className="animate-spin" /> : <Eye aria-hidden />}
            Pre-visualizar
          </Button>
        </>
      )}
    </form>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
