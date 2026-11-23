"use client";

import { CalendarRange, LoaderCircle, Plus, Settings2, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { EventoDaGrade } from "@/features/eventos/types";
import { atualizarFuncao, criarFuncao } from "@/features/postos/actions";
import { CamposFuncao } from "@/features/postos/components/campos-funcao";
import { DiasDasTurmas } from "@/features/postos/components/dias-das-turmas";
import { VigenciasDaTurma } from "@/features/postos/components/vigencias-da-funcao";
import {
  estadoInicialFuncao,
  type FuncaoResumo,
  type PeriodoDaPrevia,
  type PostoResumo,
} from "@/features/postos/types";
import { TURMAS } from "@/features/preenchimento/previsto";
import { cn } from "@/lib/utils";

type Catalogos = {
  eventosDeTrabalho: readonly EventoDaGrade[];
};

/**
 * As funcoes de um posto, cada uma num cartao proprio.
 *
 * O cartao responde de saida o que quase sempre se quer saber — em que dias
 * cada turma trabalha neste periodo —, com escala e contraescala desenhadas
 * uma embaixo da outra (`DiasDasTurmas`). A frase "12x36 · 06:30-18:30 desde
 * 20/09 → 12x36 · 18:30-06:30 desde 21/09" dizia o contrato e escondia o
 * resultado; o desenho mostra os dois, e a alternancia se confere sem abrir a
 * grade.
 *
 * Os formularios (dados da funcao e vigencias de cada turma) abrem sob
 * demanda, dentro do cartao. Aberto uma vez, continua montado e so escondido:
 * fechar para olhar outra funcao nao pode levar junto o que foi digitado.
 */
export function FuncoesDoPosto({
  posto,
  catalogos,
  periodo,
}: {
  posto: PostoResumo;
  catalogos: Catalogos;
  periodo: PeriodoDaPrevia;
}) {
  const [novaAberta, setNovaAberta] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <CalendarRange className="size-4" aria-hidden />
        Dias desenhados: {periodo.rotulo}.
      </p>

      {posto.funcoes.length > 0 ? (
        <div className="space-y-4">
          {posto.funcoes.map((funcao) => (
            <CartaoDaFuncao
              key={funcao.id}
              funcao={funcao}
              catalogos={catalogos}
              periodo={periodo}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Este posto ainda nao tem funcao nenhuma.</p>
      )}

      {novaAberta ? (
        <NovaFuncaoForm postoId={posto.id} catalogos={catalogos} />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setNovaAberta(true)}>
          <Plus aria-hidden />
          Adicionar funcao
        </Button>
      )}
    </div>
  );
}

/** O que o cartao tem aberto: os dados da funcao, uma das turmas, ou nada. */
type Painel = "dados" | (typeof TURMAS)[number]["id"];

function CartaoDaFuncao({
  funcao,
  catalogos,
  periodo,
}: {
  funcao: FuncaoResumo;
  catalogos: Catalogos;
  periodo: PeriodoDaPrevia;
}) {
  const [aberto, setAberto] = useState<Painel | null>(null);
  /** Paineis abertos uma vez continuam montados — so escondidos. */
  const [montados, setMontados] = useState<ReadonlySet<Painel>>(() => new Set());

  function alternar(painel: Painel) {
    setAberto((atual) => (atual === painel ? null : painel));
    setMontados((atuais) => (atuais.has(painel) ? atuais : new Set(atuais).add(painel)));
  }

  const sigla = funcao.eventoTrabalhoCodigo ?? "T";
  const temContraescala = funcao.vigencias.some((vigencia) => vigencia.turma === "contraescala");
  const semEscala = !funcao.vigencias.some((vigencia) => vigencia.turma === "escala");

  const turmas = TURMAS.filter((turma) => turma.id === "escala" || temContraescala).map(
    (turma) => ({
      rotulo: turma.rotulo,
      vigencias: funcao.vigencias.filter((vigencia) => vigencia.turma === turma.id),
    }),
  );

  return (
    <section
      aria-labelledby={`funcao-${funcao.id}-nome`}
      className={cn(
        "bg-card overflow-hidden rounded-xl border shadow-xs",
        !funcao.ativa && "opacity-70",
      )}
    >
      <header className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <h3
            id={`funcao-${funcao.id}-nome`}
            className="flex flex-wrap items-center gap-2 text-sm font-semibold"
          >
            {funcao.nome}
            {funcao.eventoTrabalhoCodigo ? (
              <Badge variant="outline" title="Sigla dos dias de trabalho">
                {funcao.eventoTrabalhoCodigo}
              </Badge>
            ) : null}
            {funcao.ativa ? null : <Badge variant="destructive">Inativa</Badge>}
          </h3>
          {funcao.observacao ? (
            <p className="text-muted-foreground truncate text-xs">{funcao.observacao}</p>
          ) : null}
        </div>

        <Button
          type="button"
          variant={aberto === "dados" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => alternar("dados")}
          aria-expanded={aberto === "dados"}
        >
          <Settings2 aria-hidden />
          Nome e sigla
        </Button>
      </header>

      <div className="space-y-3 px-4 py-3">
        {semEscala ? (
          <p className="text-destructive flex items-center gap-1.5 text-sm">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            Sem escala definida: a faixa desta funcao nasce em branco na grade.
          </p>
        ) : null}

        <DiasDasTurmas periodo={periodo} sigla={sigla} turmas={turmas} />

        <div className="flex flex-wrap gap-2">
          {TURMAS.map((turma) => (
            <Button
              key={turma.id}
              type="button"
              size="sm"
              variant={aberto === turma.id ? "secondary" : "outline"}
              onClick={() => alternar(turma.id)}
              aria-expanded={aberto === turma.id}
            >
              {turma.id === "contraescala" && !temContraescala ? <Plus aria-hidden /> : null}
              {turma.id === "contraescala" && !temContraescala
                ? "Adicionar contraescala"
                : turma.id === "escala" && semEscala
                  ? "Definir escala"
                  : `Editar ${turma.rotulo.toLowerCase()}`}
            </Button>
          ))}
        </div>

        {montados.has("dados") ? (
          <div hidden={aberto !== "dados"} className="bg-muted/30 rounded-lg border p-4">
            <FuncaoForm funcao={funcao} catalogos={catalogos} />
          </div>
        ) : null}

        {TURMAS.map((turma) =>
          montados.has(turma.id) ? (
            <div key={turma.id} hidden={aberto !== turma.id}>
              <VigenciasDaTurma
                funcaoId={funcao.id}
                turma={turma.id}
                vigenciasDaFuncao={funcao.vigencias}
                periodo={periodo}
                sigla={sigla}
                aoFechar={() => setAberto(null)}
              />
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

/**
 * Os dados da funcao. Fica em `<form>` proprio — separado do das vigencias —
 * porque `<form>` dentro de `<form>` nao existe em HTML, e salvar o nome nao
 * deveria reenviar o contrato.
 */
function FuncaoForm({ funcao, catalogos }: { funcao: FuncaoResumo; catalogos: Catalogos }) {
  const [estado, formAction, pendente] = useActionState(atualizarFuncao, estadoInicialFuncao);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  /** Sem remontar, os campos nao controlados exibiriam o estado anterior ao `refresh()`. */
  const assinatura = [funcao.nome, funcao.eventoTrabalhoId, funcao.observacao, funcao.ativa].join(
    "|",
  );

  return (
    <form key={assinatura} action={formAction} className="space-y-4">
      <input type="hidden" name="funcaoId" value={funcao.id} />

      <CamposFuncao
        prefixo={`funcao-${funcao.id}`}
        eventosDeTrabalho={catalogos.eventosDeTrabalho}
        valores={{
          nome: funcao.nome,
          eventoTrabalhoId: funcao.eventoTrabalhoId ?? "",
          observacao: funcao.observacao ?? "",
        }}
        erros={estado.erros}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Checkbox id={`ativa-${funcao.id}`} name="ativa" defaultChecked={funcao.ativa} />
          <Label htmlFor={`ativa-${funcao.id}`}>Ativa</Label>
        </div>

        <Button type="submit" size="sm" variant="secondary" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : null}
          {pendente ? "Salvando..." : "Salvar funcao"}
        </Button>
      </div>

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}
    </form>
  );
}

function NovaFuncaoForm({ postoId, catalogos }: { postoId: string; catalogos: Catalogos }) {
  const [estado, formAction, pendente] = useActionState(criarFuncao, estadoInicialFuncao);

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    /**
     * Remontar em vez de `reset()`: `reset()` so devolve ao padrao os campos
     * nao controlados. A chave vem da action, e nao de um contador local,
     * porque contar no cliente seria `setState` dentro de efeito — o que o
     * `react-hooks` reprova. Em erro ela nao muda, e o que foi digitado
     * continua na tela.
     */
    <form
      key={estado.chave ?? "nova"}
      action={formAction}
      className="bg-card space-y-4 rounded-lg border p-4"
    >
      <input type="hidden" name="postoId" value={postoId} />

      <div className="space-y-1">
        <h3 className="text-sm font-medium">Nova funcao</h3>
      </div>

      <CamposFuncao
        prefixo="funcao-nova"
        eventosDeTrabalho={catalogos.eventosDeTrabalho}
        valores={estado.valores}
        erros={estado.erros}
      />

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Plus aria-hidden />}
        {pendente ? "Cadastrando..." : "Adicionar funcao"}
      </Button>
    </form>
  );
}
