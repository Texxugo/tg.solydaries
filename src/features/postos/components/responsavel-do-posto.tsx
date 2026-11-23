"use client";

import { LoaderCircle, Phone, PhoneOff, TriangleAlert, UserMinus, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatarTelefone } from "@/features/funcionarios/telefone";
import {
  definirResponsavel,
  incluirNoGrupo,
  retirarDoGrupo,
  trazerDaGrade,
} from "@/features/postos/actions";
import { buscarFuncionarios } from "@/features/postos/busca";
import {
  estadoInicialGrupo,
  type GrupoDeContato,
  type GrupoState,
  type MembroDoGrupo,
} from "@/features/postos/types";
import { CampoPessoa } from "@/features/preenchimento/components/campo-pessoa";

/** Toast da resposta. Cada formulario da aba tem o seu estado, e todos avisam igual. */
function useAviso(estado: GrupoState) {
  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);
}

/**
 * A aba Responsavel do posto: quem responde pelo grupo de contato e quem esta
 * nele.
 *
 * Com responsavel, a mensagem de correcao de ponto de quem esta no grupo vai
 * para ele, e nao para o colaborador. Sem responsavel, o grupo fica cadastrado
 * mas cada pessoa volta a receber a propria mensagem.
 */
export function ResponsavelDoPosto({ postoId, grupo }: { postoId: string; grupo: GrupoDeContato }) {
  return (
    <div className="space-y-6">
      <FormResponsavel
        // Remonta quando o servidor devolve outro responsavel: o campo e
        // controlado a partir do valor inicial.
        key={grupo.responsavel?.id ?? "nenhum"}
        postoId={postoId}
        responsavel={grupo.responsavel}
      />

      <Separator />

      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" aria-hidden />
          Grupo de contato
          <Badge variant="secondary">{grupo.membros.length}</Badge>
        </h3>

        {grupo.membros.length > 0 && !grupo.responsavel ? (
          <p className="text-muted-foreground text-sm">
            Sem responsavel definido, cada pessoa do grupo recebe a propria mensagem.
          </p>
        ) : null}

        <FormIncluir postoId={postoId} />

        {grupo.membros.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ninguem no grupo ainda.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {grupo.membros.map((membro) => (
              <LinhaDoMembro key={membro.funcionarioId} postoId={postoId} membro={membro} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FormResponsavel({
  postoId,
  responsavel,
}: {
  postoId: string;
  responsavel: GrupoDeContato["responsavel"];
}) {
  const [estado, formAction, pendente] = useActionState(definirResponsavel, estadoInicialGrupo);
  const [escolha, setEscolha] = useState<{ valor: string; nome: string | null }>({
    valor: responsavel ? `f:${responsavel.id}` : "",
    nome: responsavel?.nome ?? null,
  });

  useAviso(estado);

  const mudou = escolha.valor !== (responsavel ? `f:${responsavel.id}` : "");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="postoId" value={postoId} />

      <div className="space-y-2">
        <Label htmlFor="responsavel">Responsavel pelo posto</Label>
        <CampoPessoa
          id="responsavel"
          name="responsavel"
          valor={escolha.valor}
          nome={escolha.nome}
          aoEscolher={setEscolha}
          buscar={buscarFuncionarios}
          rotuloDaBusca="Buscar o responsavel"
          textoVazio="Sem responsavel"
          textoLimpar="Tirar o responsavel"
        />
      </div>

      {responsavel && !mudou ? <SituacaoDoResponsavel responsavel={responsavel} /> : null}

      <Button type="submit" size="sm" disabled={pendente || !mudou}>
        {pendente ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pendente ? "Salvando..." : "Salvar responsavel"}
      </Button>
    </form>
  );
}

/**
 * O que decide se a mensagem sai: telefone e cadastro ativo. Sem um dos dois o
 * envio para — e nao volta ao colaborador.
 */
function SituacaoDoResponsavel({
  responsavel,
}: {
  responsavel: NonNullable<GrupoDeContato["responsavel"]>;
}) {
  if (!responsavel.ativo || !responsavel.telefone) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden />
        <AlertTitle>
          {!responsavel.ativo
            ? "O responsavel esta desativado"
            : "O responsavel esta sem telefone no cadastro"}
        </AlertTitle>
        <AlertDescription>
          Enquanto isso, nenhuma mensagem de correcao do grupo e enviada. Corrija em{" "}
          <Link href={`/funcionarios/${responsavel.id}`} className="underline">
            Funcionarios
          </Link>{" "}
          ou escolha outro responsavel.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <Phone className="size-3.5" aria-hidden />
      {formatarTelefone(responsavel.telefone)}
      {responsavel.cargo ? ` · ${responsavel.cargo}` : null}
    </p>
  );
}

function FormIncluir({ postoId }: { postoId: string }) {
  const [estado, formAction, pendente] = useActionState(incluirNoGrupo, estadoInicialGrupo);
  const [estadoGrade, acaoGrade, pendenteGrade] = useActionState(trazerDaGrade, estadoInicialGrupo);

  useAviso(estado);
  useAviso(estadoGrade);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <form
        // Remonta limpo a cada inclusao concluida.
        key={estado.chave ?? "inicial"}
        action={formAction}
        className="flex flex-1 items-end gap-2"
      >
        <input type="hidden" name="postoId" value={postoId} />
        <CampoDeInclusao />
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Incluir
        </Button>
      </form>

      <form action={acaoGrade}>
        <input type="hidden" name="postoId" value={postoId} />
        <Button type="submit" size="sm" variant="outline" disabled={pendenteGrade}>
          {pendenteGrade ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Trazer quem esta na grade deste posto
        </Button>
      </form>
    </div>
  );
}

/** O campo da inclusao, com estado proprio — a `key` do formulario o zera. */
function CampoDeInclusao() {
  const [escolha, setEscolha] = useState<{ valor: string; nome: string | null }>({
    valor: "",
    nome: null,
  });

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <Label htmlFor="incluir-pessoa">Incluir colaborador</Label>
      <CampoPessoa
        id="incluir-pessoa"
        name="pessoa"
        valor={escolha.valor}
        nome={escolha.nome}
        aoEscolher={setEscolha}
        buscar={buscarFuncionarios}
        rotuloDaBusca="Buscar o colaborador"
        textoVazio="Escolha um funcionario"
        textoLimpar="Limpar"
      />
    </div>
  );
}

function LinhaDoMembro({ postoId, membro }: { postoId: string; membro: MembroDoGrupo }) {
  const [estado, formAction, pendente] = useActionState(retirarDoGrupo, estadoInicialGrupo);

  useAviso(estado);

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/funcionarios/${membro.funcionarioId}`} className="hover:underline">
            {membro.nome}
          </Link>
          {membro.ativo ? null : <Badge variant="destructive">Inativo</Badge>}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {[membro.matricula, membro.cargo, membro.empresaNome].filter(Boolean).join(" · ")}
        </p>
      </div>

      <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex">
        {membro.telefone ? (
          <>
            <Phone className="size-3" aria-hidden />
            {formatarTelefone(membro.telefone)}
          </>
        ) : (
          <>
            <PhoneOff className="size-3" aria-hidden />
            sem telefone
          </>
        )}
      </span>

      <form action={formAction}>
        <input type="hidden" name="postoId" value={postoId} />
        <input type="hidden" name="funcionarioId" value={membro.funcionarioId} />
        <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
          {pendente ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <UserMinus aria-hidden />
          )}
          Retirar
        </Button>
      </form>
    </li>
  );
}
