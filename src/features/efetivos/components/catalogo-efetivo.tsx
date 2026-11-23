"use client";

import { Check, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  definirSituacaoLocal,
  definirSituacaoTipo,
  salvarLocal,
  salvarTipoDeExcecao,
} from "@/features/efetivos/actions";
import {
  COMPORTAMENTOS,
  IDS_COMPORTAMENTOS,
  estadoInicialCatalogo,
  type Catalogo,
  type CatalogoState,
  type ItemDoCatalogo,
} from "@/features/efetivos/types";

/**
 * As actions de cada cadastro. Referencias de modulo, e nao props: Server
 * Action passada de um Server Component funcionaria, mas o par fica mais claro
 * aqui, ao lado de quem o usa.
 */
const ACOES: Record<
  Catalogo,
  {
    salvar: (estado: CatalogoState, formData: FormData) => Promise<CatalogoState>;
    situacao: (estado: CatalogoState, formData: FormData) => Promise<CatalogoState>;
    rotuloDoCampo: string;
    exemplo: string;
    vazio: string;
  }
> = {
  locais: {
    salvar: salvarLocal,
    situacao: definirSituacaoLocal,
    rotuloDoCampo: "Novo local",
    exemplo: "Ex.: Garagem",
    vazio: "Nenhum local cadastrado.",
  },
  tipos: {
    salvar: salvarTipoDeExcecao,
    situacao: definirSituacaoTipo,
    rotuloDoCampo: "Novo tipo",
    exemplo: "Ex.: Treinamento",
    vazio: "Nenhum tipo de excecao cadastrado.",
  },
};

/** Avisa pelo toast o que nao tem campo onde aparecer. */
function useAvisos(estado: CatalogoState, aoSalvar?: () => void) {
  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
      aoSalvar?.();
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
    // `aoSalvar` fica de fora: so a resposta nova deve disparar o aviso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);
}

/** Lista e cadastro de um dos dois catalogos (locais ou tipos de excecao). */
export function CatalogoEfetivo({
  catalogo,
  itens,
}: {
  catalogo: Catalogo;
  itens: ItemDoCatalogo[];
}) {
  const comComportamento = catalogo === "tipos";

  return (
    <div className="space-y-6">
      <NovoItem catalogo={catalogo} />

      {itens.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{ACOES[catalogo].vazio}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              {comComportamento ? <TableHead>Comportamento</TableHead> : null}
              <TableHead>Situacao</TableHead>
              <TableHead className="sr-only">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <LinhaDoCatalogo
                key={`${item.id}-${item.nome}-${item.ativo}`}
                catalogo={catalogo}
                item={item}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function NovoItem({ catalogo }: { catalogo: Catalogo }) {
  const { salvar, rotuloDoCampo, exemplo } = ACOES[catalogo];
  const [estado, formAction, pendente] = useActionState(salvar, estadoInicialCatalogo);
  const campo = useRef<HTMLInputElement>(null);
  const comComportamento = catalogo === "tipos";

  // Depois de cadastrar, o foco volta ao nome: cadastrar varios seguidos e so
  // digitar e dar Enter.
  useAvisos(estado, () => campo.current?.focus());

  const recusado = estado.status === "error" ? estado.valores : undefined;

  return (
    <form action={formAction} className="space-y-1.5">
      {/* Os erros ficam abaixo da linha inteira, e nao de cada campo: dentro do
          campo eles empurravam o botao para fora do alinhamento. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor={`novo-${catalogo}`}>{rotuloDoCampo}</Label>
          <Input
            key={`nome-${estado.versao ?? 0}`}
            ref={campo}
            id={`novo-${catalogo}`}
            name="nome"
            placeholder={exemplo}
            defaultValue={recusado?.nome ?? ""}
            aria-invalid={Boolean(estado.erros?.nome)}
            autoComplete="off"
            required
          />
        </div>

        {comComportamento ? (
          <div className="min-w-56 space-y-1.5">
            <Label htmlFor="novo-comportamento">Comportamento</Label>
            <NativeSelect
              key={`comportamento-${estado.versao ?? 0}`}
              id="novo-comportamento"
              name="comportamento"
              defaultValue={recusado?.comportamento ?? ""}
              aria-invalid={Boolean(estado.erros?.comportamento)}
              required
            >
              <option value="" disabled>
                Escolha...
              </option>
              {IDS_COMPORTAMENTOS.map((id) => (
                <option key={id} value={id}>
                  {COMPORTAMENTOS[id].rotulo} — {COMPORTAMENTOS[id].descricao}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        <Button type="submit" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : <Plus aria-hidden />}
          Adicionar
        </Button>
      </div>

      {[...(estado.erros?.nome ?? []), ...(estado.erros?.comportamento ?? [])]
        .slice(0, 2)
        .map((erro) => (
          <p key={erro} role="alert" className="text-destructive text-sm">
            {erro}
          </p>
        ))}
    </form>
  );
}

function LinhaDoCatalogo({ catalogo, item }: { catalogo: Catalogo; item: ItemDoCatalogo }) {
  const { salvar, situacao } = ACOES[catalogo];
  const [editando, setEditando] = useState(false);
  const [estadoNome, salvarNome, salvandoNome] = useActionState(salvar, estadoInicialCatalogo);
  const [estadoSituacao, mudarSituacao, mudando] = useActionState(situacao, estadoInicialCatalogo);

  useAvisos(estadoNome, () => setEditando(false));
  useAvisos(estadoSituacao);

  const comComportamento = catalogo === "tipos";

  return (
    <TableRow className={item.ativo ? undefined : "text-muted-foreground"}>
      <TableCell>
        {editando ? (
          <form action={salvarNome} className="flex items-center gap-2">
            <input type="hidden" name="id" value={item.id} />
            <Input
              key={`nome-${estadoNome.versao ?? 0}`}
              name="nome"
              aria-label="Nome"
              defaultValue={estadoNome.valores?.nome ?? item.nome}
              aria-invalid={Boolean(estadoNome.erros?.nome)}
              className="h-7 max-w-64"
              autoComplete="off"
              autoFocus
              required
              onKeyDown={(evento) => {
                if (evento.key === "Escape") {
                  setEditando(false);
                }
              }}
            />
            <Button type="submit" size="icon-sm" disabled={salvandoNome} aria-label="Salvar">
              {salvandoNome ? <LoaderCircle className="animate-spin" /> : <Check />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancelar"
              onClick={() => setEditando(false)}
            >
              <X />
            </Button>
            {estadoNome.erros?.nome ? (
              <span className="text-destructive text-sm">{estadoNome.erros.nome[0]}</span>
            ) : null}
          </form>
        ) : (
          <span className="font-medium">{item.nome}</span>
        )}
      </TableCell>

      {comComportamento ? (
        <TableCell className="text-sm">
          {item.comportamento ? COMPORTAMENTOS[item.comportamento].rotulo : null}
        </TableCell>
      ) : null}

      <TableCell>
        {item.ativo ? (
          <Badge variant="outline">Ativo</Badge>
        ) : (
          <Badge variant="ghost">Inativo</Badge>
        )}
      </TableCell>

      <TableCell>
        <div className="flex justify-end gap-1">
          {editando ? null : (
            <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
              <Pencil aria-hidden />
              Editar
            </Button>
          )}
          <form action={mudarSituacao}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="ativo" value={item.ativo ? "false" : "true"} />
            <Button type="submit" variant="ghost" size="sm" disabled={mudando}>
              {item.ativo ? "Desativar" : "Reativar"}
            </Button>
          </form>
        </div>
      </TableCell>
    </TableRow>
  );
}
