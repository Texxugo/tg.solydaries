"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SITUACOES } from "@/features/funcionarios/situacoes";
import type {
  EmpresaResumo,
  ErrosDoFuncionario,
  ValoresDoFuncionario,
} from "@/features/funcionarios/types";

/**
 * Os dados que **a folha** conhece de um funcionario: empresa, matricula, nome,
 * CPF, cargo, admissao e situacao. Compartilhados pelo cadastro e pela edicao —
 * as duas telas descrevem a mesma pessoa, e o que muda entre elas (situacao do
 * cadastro, id, botao) fica no formulario que os envolve.
 *
 * Escala e inicio de ciclo **nao** estao aqui: sao `CamposJornada`. Os dados vem
 * da folha e a jornada nasce no portal, entao editar um nao deveria obrigar a
 * reenviar o outro.
 *
 * Campos nao controlados (`defaultValue`), como no resto do portal — quem
 * remonta o formulario depois de uma gravacao e a `key` do lado de fora.
 */
export function CamposFuncionario({
  empresas,
  valores,
  erros,
}: {
  empresas: readonly EmpresaResumo[];
  valores?: Partial<ValoresDoFuncionario>;
  erros?: ErrosDoFuncionario;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="empresaId">Empresa</Label>
          <NativeSelect
            id="empresaId"
            name="empresaId"
            defaultValue={valores?.empresaId ?? ""}
            aria-invalid={Boolean(erros?.empresaId)}
            aria-describedby={erros?.empresaId ? "empresaId-erro" : undefined}
          >
            <option value="">Selecione a empresa</option>
            {empresas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>
                {empresa.nome}
                {empresa.ativa ? "" : " (inativa)"}
              </option>
            ))}
          </NativeSelect>
          {erros?.empresaId ? (
            <p id="empresaId-erro" className="text-destructive text-sm">
              {erros.empresaId[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="matricula">Matricula</Label>
          <Input
            id="matricula"
            name="matricula"
            defaultValue={valores?.matricula}
            placeholder="1335"
            aria-invalid={Boolean(erros?.matricula)}
            aria-describedby={erros?.matricula ? "matricula-erro" : undefined}
          />
          {/* A mensagem fica: e por aqui que chega "ja existe alguem com esta
              matricula nesta empresa", que o indice unico so descobre no INSERT. */}
          {erros?.matricula ? (
            <p id="matricula-erro" className="text-destructive text-sm">
              {erros.matricula[0]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={valores?.nome}
          placeholder="Nome completo"
          aria-invalid={Boolean(erros?.nome)}
          aria-describedby={erros?.nome ? "nome-erro" : undefined}
        />
        {erros?.nome ? (
          <p id="nome-erro" className="text-destructive text-sm">
            {erros.nome[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            defaultValue={valores?.cpf}
            placeholder="000.000.000-00"
            aria-invalid={Boolean(erros?.cpf)}
            aria-describedby={erros?.cpf ? "cpf-erro" : undefined}
          />
          {erros?.cpf ? (
            <p id="cpf-erro" className="text-destructive text-sm">
              {erros.cpf[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cargo">Cargo</Label>
          <Input
            id="cargo"
            name="cargo"
            defaultValue={valores?.cargo}
            placeholder="VIGIA"
            aria-invalid={Boolean(erros?.cargo)}
            aria-describedby={erros?.cargo ? "cargo-erro" : undefined}
          />
          {erros?.cargo ? (
            <p id="cargo-erro" className="text-destructive text-sm">
              {erros.cargo[0]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="telefone">WhatsApp</Label>
        <Input
          id="telefone"
          name="telefone"
          type="tel"
          inputMode="tel"
          defaultValue={valores?.telefone}
          placeholder="(62) 99999-9999"
          aria-invalid={Boolean(erros?.telefone)}
          aria-describedby={erros?.telefone ? "telefone-erro" : "telefone-ajuda"}
        />
        {/* O numero nao vem da folha: e o unico campo desta secao que nasce no
            portal, e e ele que destrava o contato pela tela de pendencias. */}
        {erros?.telefone ? (
          <p id="telefone-erro" className="text-destructive text-sm">
            {erros.telefone[0]}
          </p>
        ) : (
          <p id="telefone-ajuda" className="text-muted-foreground text-sm">
            Opcional, e o unico campo desta secao que nao vem da folha. Sem ele nao da para falar
            com o colaborador pelas pendencias de ponto. Sem DDI, assumimos o 55.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="admissao">Admissao</Label>
          <Input
            id="admissao"
            name="admissao"
            type="date"
            defaultValue={valores?.admissao}
            aria-invalid={Boolean(erros?.admissao)}
            aria-describedby={erros?.admissao ? "admissao-erro" : undefined}
          />
          {erros?.admissao ? (
            <p id="admissao-erro" className="text-destructive text-sm">
              {erros.admissao[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="situacao">Situacao na folha</Label>
          <NativeSelect
            id="situacao"
            name="situacao"
            defaultValue={valores?.situacao ?? "1"}
            aria-invalid={Boolean(erros?.situacao)}
            aria-describedby={erros?.situacao ? "situacao-erro" : undefined}
          >
            {SITUACOES.map((situacao) => (
              <option key={situacao.codigo} value={situacao.codigo}>
                {situacao.codigo} — {situacao.rotulo}
              </option>
            ))}
          </NativeSelect>
          {erros?.situacao ? (
            <p id="situacao-erro" className="text-destructive text-sm">
              {erros.situacao[0]}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
