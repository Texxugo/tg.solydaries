"use client";

import { LoaderCircle, UserPlus } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { incluirFreelancer, incluirFuncionario } from "@/features/preenchimento/actions";
import {
  estadoInicialIncluirPessoa,
  type FreelancerDisponivel,
  type FuncaoParaInclusao,
  type PessoaDisponivel,
} from "@/features/preenchimento/types";

/**
 * Quem entra no bloco: um funcionario ja cadastrado, ou um freelancer que
 * nasce aqui.
 *
 * Dois formularios, e nao um com um seletor de tipo: as duas coisas pedem
 * campos diferentes (uma escolhe, a outra digita) e recusam por motivos
 * diferentes. Um so obrigaria a esconder metade dos campos o tempo todo, e
 * campo escondido continua sendo campo postado.
 */
export function IncluirPessoa({
  competenciaId,
  funcoes,
  disponiveis,
  freelancers,
}: {
  /**
   * Competencia em que a tela foi desenhada. A inclusao nao tem data que
   * denuncie uma tela aberta antes de a consulta ser encerrada, entao a action
   * confere este id e recusa se a competencia em vigor mudou.
   */
  competenciaId: string;
  /** As funcoes do posto: a pessoa entra em uma delas, e nao no posto inteiro. */
  funcoes: readonly FuncaoParaInclusao[];
  disponiveis: readonly PessoaDisponivel[];
  /** So para a lista de sugestoes: digitar um nome que ja existe reaproveita o cadastro. */
  freelancers: readonly FreelancerDisponivel[];
}) {
  if (funcoes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Este posto nao tem funcao ativa nenhuma — nao ha em que turno escalar alguem. Cadastre uma
        em Postos de trabalho.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <FuncionarioForm competenciaId={competenciaId} funcoes={funcoes} disponiveis={disponiveis} />

      <Separator />

      <FreelancerForm competenciaId={competenciaId} funcoes={funcoes} freelancers={freelancers} />
    </div>
  );
}

/**
 * Em qual funcao a pessoa entra.
 *
 * O campo existe porque a grade e do posto inteiro: sem ele, a inclusao teria
 * de adivinhar o turno. Com uma funcao so, ele vira um `hidden` — perguntar o
 * obvio e ruido no formulario que mais se usa no dia a dia.
 */
function CampoFuncao({
  funcoes,
  prefixo,
}: {
  funcoes: readonly FuncaoParaInclusao[];
  prefixo: string;
}) {
  if (funcoes.length === 1) {
    return <input type="hidden" name="funcaoId" value={funcoes[0].id} />;
  }

  return (
    <div className="min-w-48 space-y-2">
      <Label htmlFor={`${prefixo}-funcaoId`}>Funcao</Label>
      <NativeSelect id={`${prefixo}-funcaoId`} name="funcaoId" defaultValue={funcoes[0].id}>
        {funcoes.map((funcao) => (
          <option key={funcao.id} value={funcao.id}>
            {funcao.nome}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function FuncionarioForm({
  competenciaId,
  funcoes,
  disponiveis,
}: {
  competenciaId: string;
  funcoes: readonly FuncaoParaInclusao[];
  disponiveis: readonly PessoaDisponivel[];
}) {
  const [estado, formAction, pendente] = useActionState(
    incluirFuncionario,
    estadoInicialIncluirPessoa,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  if (disponiveis.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum funcionario ativo cadastrado.</p>;
  }

  return (
    <form
      key={estado.chave ?? "novo"}
      action={formAction}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="competenciaId" value={competenciaId} />
      <CampoFuncao funcoes={funcoes} prefixo="funcionario" />

      <div className="min-w-64 flex-1 space-y-2">
        <Label htmlFor="funcionarioId">Funcionario</Label>
        {/* `<select>` nativo mesmo com centenas de opcoes: o navegador ja busca
            por digitacao dentro dele, e trocar por um menu do Radix custaria a
            navegacao sem JavaScript que o resto do portal preserva. */}
        <NativeSelect
          id="funcionarioId"
          name="funcionarioId"
          defaultValue=""
          aria-invalid={Boolean(estado.erros?.funcionarioId)}
          aria-describedby={estado.erros?.funcionarioId ? "funcionarioId-erro" : undefined}
        >
          <option value="" disabled>
            Selecione
          </option>
          {disponiveis.map((pessoa) => (
            <option key={pessoa.id} value={pessoa.id}>
              {pessoa.nome}
              {pessoa.identificacao ? ` (${pessoa.identificacao})` : ""}
              {pessoa.empresaNome ? ` — ${pessoa.empresaNome}` : ""}
            </option>
          ))}
        </NativeSelect>
        {estado.erros?.funcionarioId ? (
          <p id="funcionarioId-erro" className="text-destructive text-sm">
            {estado.erros.funcionarioId[0]}
          </p>
        ) : null}
      </div>

      <Button type="submit" variant="secondary" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <UserPlus aria-hidden />}
        {pendente ? "Incluindo..." : "Incluir na escala"}
      </Button>
    </form>
  );
}

function FreelancerForm({
  competenciaId,
  funcoes,
  freelancers,
}: {
  competenciaId: string;
  funcoes: readonly FuncaoParaInclusao[];
  freelancers: readonly FreelancerDisponivel[];
}) {
  const [estado, formAction, pendente] = useActionState(
    incluirFreelancer,
    estadoInicialIncluirPessoa,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form key={estado.chave ?? "novo"} action={formAction} className="space-y-3">
      <input type="hidden" name="competenciaId" value={competenciaId} />
      {/* Sugere os ja cadastrados para que o mesmo freela nao vire dois
          registros por causa de uma letra. Fora da coluna do campo: dentro, o
          `space-y` dava margem ao input (ele deixava de ser o ultimo filho) e o
          rotulo "Freelancer" subia em relacao aos vizinhos. */}
      <datalist id="freelancers-cadastrados">
        {freelancers.map((pessoa) => (
          <option key={pessoa.id} value={pessoa.nome} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-end gap-3">
        <CampoFuncao funcoes={funcoes} prefixo="freelancer" />

        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="freelancer-nome">Freelancer</Label>
          <Input
            id="freelancer-nome"
            name="nome"
            list="freelancers-cadastrados"
            autoComplete="off"
            placeholder="Nome de quem vai cobrir"
            aria-invalid={Boolean(estado.erros?.nome)}
            aria-describedby={estado.erros?.nome ? "freelancer-nome-erro" : undefined}
          />
          {estado.erros?.nome ? (
            <p id="freelancer-nome-erro" className="text-destructive text-sm">
              {estado.erros.nome[0]}
            </p>
          ) : null}
        </div>

        <div className="w-32 space-y-2">
          <Label htmlFor="freelancer-codigo">Codigo</Label>
          <Input
            id="freelancer-codigo"
            name="codigo"
            maxLength={20}
            className="font-mono uppercase"
            placeholder="606"
            aria-invalid={Boolean(estado.erros?.codigo)}
            aria-describedby={estado.erros?.codigo ? "freelancer-codigo-erro" : undefined}
          />
          {estado.erros?.codigo ? (
            <p id="freelancer-codigo-erro" className="text-destructive text-sm">
              {estado.erros.codigo[0]}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="secondary" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : <UserPlus aria-hidden />}
          {pendente ? "Incluindo..." : "Incluir freelancer"}
        </Button>
      </div>
    </form>
  );
}
