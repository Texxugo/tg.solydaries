"use client";

import { CalendarCheck, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoEscala } from "@/features/escalas/components/campo-escala";
import type { EscalaParaAtribuicao } from "@/features/escalas/types";
import { atribuirEscala } from "@/features/funcionarios/actions";
import { ListaFuncionarios } from "@/features/funcionarios/components/lista-funcionarios";
import {
  estadoInicialAtribuirEscala,
  type FiltrosDeFuncionarios,
  type FuncionarioResumo,
} from "@/features/funcionarios/types";

/**
 * A lista com a barra de atribuicao em lote.
 *
 * A barra e a lista sao um `<form>` so: os checkboxes das linhas tem
 * `name="funcionarios"` e chegam a action como lista (`getAll`), do mesmo jeito
 * que as areas em `acessos`. Duas telas separadas obrigariam a copiar ids de um
 * lado para o outro.
 *
 * A selecao e o unico estado desta tela; busca, filtro e pagina moram na URL. A
 * pagina remonta este componente por `key` a cada mudanca de filtro ou de
 * pagina, e por isso a selecao comeca vazia toda vez: so o checkbox renderizado
 * chega no `FormData`, entao uma selecao que sobrevivesse a virada de pagina
 * exibiria "12 selecionados" e atribuiria a 5.
 */
export function AtribuirEscalaEmLote({
  funcionarios,
  escalas,
  hoje,
  filtros,
}: {
  funcionarios: readonly FuncionarioResumo[];
  escalas: readonly EscalaParaAtribuicao[];
  hoje: string;
  filtros: FiltrosDeFuncionarios;
}) {
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set());
  const [estado, formAction, pendente] = useActionState(
    atribuirEscala,
    estadoInicialAtribuirEscala,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  const alternar = (id: string, marcado: boolean) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);

      if (marcado) {
        proximo.add(id);
      } else {
        proximo.delete(id);
      }

      return proximo;
    });
  };

  const daPagina = funcionarios.map((funcionario) => funcionario.id);
  const todosMarcados = daPagina.length > 0 && daPagina.every((id) => selecionados.has(id));

  /**
   * A contagem sai do cruzamento com a lista visivel, e nao do tamanho do
   * conjunto: so o checkbox renderizado chega no `FormData`, entao uma marca
   * que sobrou de uma lista anterior prometeria atribuir a quem nao esta na
   * tela. Acontece de verdade depois de atribuir com o filtro de pendencias
   * ligado — as linhas atribuidas somem da lista na mesma hora.
   */
  const quantidade = daPagina.filter((id) => selecionados.has(id)).length;

  return (
    <form action={formAction} className="space-y-4">
      <div className="bg-muted/40 flex flex-wrap items-end gap-3 rounded-lg border p-4">
        {/* `basis-72` para o campo de escala nao encolher: com o filtro acima
            ele e o mais alto da barra, e e o que se preenche primeiro. */}
        <div className="min-w-72 flex-1 basis-72">
          <CampoEscala
            escalas={escalas}
            id="escalaEmLote"
            name="escalaId"
            rotuloVazio="Selecione a escala"
            disabled={escalas.length === 0}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inicioCicloEmLote">Inicio do ciclo</Label>
          <Input id="inicioCicloEmLote" name="inicioCiclo" type="date" className="w-44" />
        </div>

        <Button type="submit" disabled={pendente || quantidade === 0 || escalas.length === 0}>
          {pendente ? <LoaderCircle className="animate-spin" /> : <CalendarCheck aria-hidden />}
          {pendente
            ? "Atribuindo..."
            : quantidade === 0
              ? "Selecione na lista"
              : `Atribuir a ${quantidade}`}
        </Button>

        <div className="text-muted-foreground w-full text-sm">
          {escalas.length === 0 ? (
            <>Cadastre uma escala antes: e ela que diz os horarios e o ciclo.</>
          ) : (
            <>
              Marque as pessoas na lista e defina escala e inicio de ciclo para todas de uma vez. O
              inicio de ciclo e o primeiro dia trabalhado — quem faz a outra turma do 12x36 comeca
              no dia seguinte, entao atribua uma turma de cada vez.
            </>
          )}
        </div>
      </div>

      {funcionarios.length > 0 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            // A selecao nunca sai desta pagina (o componente remonta ao virar),
            // entao marcar todos e exatamente a lista visivel.
            onClick={() => setSelecionados(todosMarcados ? new Set() : new Set(daPagina))}
          >
            {todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
          </Button>

          {quantidade > 0 ? (
            <span className="text-muted-foreground text-sm">
              {quantidade === 1 ? "1 selecionado" : `${quantidade} selecionados`}
            </span>
          ) : null}
        </div>
      ) : null}

      <ListaFuncionarios
        funcionarios={funcionarios}
        hoje={hoje}
        filtros={filtros}
        selecionados={selecionados}
        aoAlternar={alternar}
      />
    </form>
  );
}
