"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { EmpresaResumo } from "@/features/funcionarios/types";
import type { ErrosDoPosto, ValoresDoPosto } from "@/features/postos/types";

/**
 * Os campos que descrevem um posto, compartilhados pelo cadastro e pela edicao:
 * as duas telas descrevem a mesma coisa, e o que muda entre elas (situacao, id,
 * botao) fica no formulario que envolve estes campos.
 *
 * Campos nao controlados (`defaultValue`), como no resto do portal — quem
 * remonta o formulario depois de uma gravacao e a `key` do lado de fora.
 */
export function CamposPosto({
  empresas,
  valores,
  erros,
}: {
  empresas: readonly EmpresaResumo[];
  valores?: Partial<ValoresDoPosto>;
  erros?: ErrosDoPosto;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="codigo">Codigo</Label>
          <Input
            id="codigo"
            name="codigo"
            defaultValue={valores?.codigo}
            placeholder="GP01"
            maxLength={20}
            className="font-mono uppercase"
            aria-invalid={Boolean(erros?.codigo)}
            aria-describedby={erros?.codigo ? "codigo-erro" : "codigo-ajuda"}
          />
          {erros?.codigo ? (
            <p id="codigo-erro" className="text-destructive text-sm">
              {erros.codigo[0]}
            </p>
          ) : (
            <p id="codigo-ajuda" className="text-muted-foreground text-sm">
              Como o posto e chamado na operacao.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            name="nome"
            defaultValue={valores?.nome}
            placeholder="GP-01. Base operacional"
            aria-invalid={Boolean(erros?.nome)}
            aria-describedby={erros?.nome ? "nome-erro" : undefined}
          />
          {erros?.nome ? (
            <p id="nome-erro" className="text-destructive text-sm">
              {erros.nome[0]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="empresaId">Empresa</Label>
        {/* `<select>` nativo, e nao o menu do Radix: e o campo de um formulario
            que funciona por progressive enhancement. A lista de empresas nao
            precisa de busca — sao poucas, e nascem pela importacao da folha. */}
        <NativeSelect
          id="empresaId"
          name="empresaId"
          defaultValue={valores?.empresaId ?? ""}
          aria-invalid={Boolean(erros?.empresaId)}
          aria-describedby={erros?.empresaId ? "empresaId-erro" : "empresaId-ajuda"}
        >
          <option value="">Sem empresa definida</option>
          {empresas.map((empresa) => (
            <option key={empresa.id} value={empresa.id}>
              {empresa.nome}
            </option>
          ))}
        </NativeSelect>
        {erros?.empresaId ? (
          <p id="empresaId-erro" className="text-destructive text-sm">
            {erros.empresaId[0]}
          </p>
        ) : (
          <p id="empresaId-ajuda" className="text-muted-foreground text-sm">
            Opcional: ha posto atendido por mais de uma, e ha posto cadastrado antes de a primeira
            carga da folha criar a empresa.
          </p>
        )}
      </div>
    </>
  );
}
