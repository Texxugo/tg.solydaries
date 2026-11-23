"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { atualizarUsuario } from "@/features/acessos/actions";
import { CampoAreas } from "@/features/acessos/components/campo-areas";
import { estadoInicialAtualizarUsuario, type UsuarioGerenciado } from "@/features/acessos/types";

/**
 * Edicao de um usuario ja cadastrado: nome, situacao, perfil e areas.
 *
 * O login nao aparece: e a credencial e mudar depois so confundiria quem
 * entra. Os campos escondidos aqui (perfil para nao-administrador, desativar a
 * si mesmo) tambem sao barrados na action — esconder campo nao e autorizacao.
 */
export function EditarUsuarioForm({
  usuario,
  autorEhAdministrador,
  ehOProprioUsuario,
}: {
  usuario: UsuarioGerenciado;
  autorEhAdministrador: boolean;
  ehOProprioUsuario: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarUsuario,
    estadoInicialAtualizarUsuario,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  const ehAdministrador = usuario.perfil === "administrador";

  /**
   * Os campos sao nao controlados: mudar `defaultChecked` nao mexe em um
   * checkbox ja montado, e depois do `refresh()` da action o formulario ficaria
   * exibindo o estado anterior mesmo com a gravacao concluida. A chave derivada
   * dos dados do servidor remonta o formulario quando (e so quando) eles mudam.
   */
  const assinatura = [
    usuario.nome,
    usuario.perfil,
    usuario.ativo,
    [...usuario.areas].sort().join(","),
  ].join("|");

  return (
    <form key={assinatura} action={formAction} className="space-y-6">
      <input type="hidden" name="usuarioId" value={usuario.id} />

      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={usuario.nome}
          aria-invalid={Boolean(estado.erros?.nome)}
          aria-describedby={estado.erros?.nome ? "nome-erro" : undefined}
        />
        {estado.erros?.nome ? (
          <p id="nome-erro" className="text-destructive text-sm">
            {estado.erros.nome[0]}
          </p>
        ) : null}
      </div>

      <Separator />

      <CampoAreas
        selecionadas={usuario.areas}
        // Sem o perfil de administrador, tirar a propria area de acessos
        // trancaria o usuario para fora desta tela.
        obrigatorias={ehOProprioUsuario && !autorEhAdministrador ? ["acessos"] : []}
        erro={estado.erros?.areas?.[0]}
      />

      {ehAdministrador ? (
        <p className="text-muted-foreground text-sm">
          Administrador enxerga todas as areas de qualquer forma. A selecao acima passa a valer se o
          perfil for removido.
        </p>
      ) : null}

      <Separator />

      <div className="space-y-3">
        {autorEhAdministrador ? (
          <div className="flex items-start gap-3">
            <Checkbox
              id="administrador"
              name="administrador"
              defaultChecked={ehAdministrador}
              disabled={ehOProprioUsuario && ehAdministrador}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="administrador">Administrador</Label>
              <p className="text-muted-foreground text-sm">
                {ehOProprioUsuario && ehAdministrador
                  ? "Voce nao pode remover o proprio perfil de administrador."
                  : "Enxerga todas as areas e exibe o badge ao lado do nome."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-start gap-3">
          <Checkbox
            id="ativo"
            name="ativo"
            defaultChecked={usuario.ativo}
            disabled={ehOProprioUsuario}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="ativo">Ativo</Label>
            <p className="text-muted-foreground text-sm">
              {ehOProprioUsuario
                ? "Voce nao pode desativar a propria conta."
                : "Desativar encerra as sessoes abertas e bloqueia o login."}
            </p>
          </div>
        </div>
      </div>

      {/* Checkbox desabilitado nao vai no FormData; sem isto, salvar removeria
          o proprio perfil ou desativaria a conta. */}
      {ehOProprioUsuario ? <input type="hidden" name="ativo" value="on" /> : null}
      {ehOProprioUsuario && ehAdministrador ? (
        <input type="hidden" name="administrador" value="on" />
      ) : null}

      {estado.status === "error" && !estado.erros ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.mensagem}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : null}
        {pendente ? "Salvando..." : "Salvar alteracoes"}
      </Button>
    </form>
  );
}
