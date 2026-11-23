"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { ColaboradorDisponivel, ErrosDoExtra, ValoresDoExtra } from "@/features/extras/types";
import type { PostoParaEscolha } from "@/features/postos/types";

/**
 * Os campos que descrevem um extra, compartilhados pelo registro e pela edicao:
 * as duas telas descrevem a mesma coisa, e o que muda entre elas (id, botao,
 * exclusao) fica no formulario que envolve estes campos — mesmo arranjo de
 * `CamposEscala`.
 *
 * Campos nao controlados (`defaultValue`), como no resto do portal: quem
 * remonta o formulario depois de uma gravacao e a `key` do lado de fora.
 */
export function CamposExtra({
  colaboradores,
  postos,
  periodo,
  valores,
  erros,
}: {
  colaboradores: readonly ColaboradorDisponivel[];
  postos: readonly PostoParaEscolha[];
  /** Os limites da competencia aberta: o dia do extra cai dentro dela. */
  periodo: { inicio: string; fim: string };
  valores?: Partial<ValoresDoExtra>;
  erros?: ErrosDoExtra;
}) {
  const funcionarios = colaboradores.filter((pessoa) => !pessoa.freelancer);
  const freelancers = colaboradores.filter((pessoa) => pessoa.freelancer);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="data">Data</Label>
          {/*
            `min` e `max` sao o periodo da competencia: o seletor do navegador ja
            leva quem digita para dentro dele. Nao e autorizacao — quem postar
            outra data esbarra na mesma conferencia dentro da action.
          */}
          <Input
            id="data"
            name="data"
            type="date"
            min={periodo.inicio}
            max={periodo.fim}
            defaultValue={valores?.data}
            aria-invalid={Boolean(erros?.data)}
            aria-describedby={erros?.data ? "data-erro" : undefined}
          />
          {erros?.data ? (
            <p id="data-erro" className="text-destructive text-sm">
              {erros.data[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="postoId">Posto</Label>
          <NativeSelect
            id="postoId"
            name="postoId"
            defaultValue={valores?.postoId ?? ""}
            aria-invalid={Boolean(erros?.postoId)}
            aria-describedby={erros?.postoId ? "postoId-erro" : undefined}
          >
            <option value="" disabled>
              Selecione o posto
            </option>
            {postos.map((posto) => (
              <option key={posto.id} value={posto.id}>
                {posto.codigo} — {posto.nome}
              </option>
            ))}
          </NativeSelect>
          {erros?.postoId ? (
            <p id="postoId-erro" className="text-destructive text-sm">
              {erros.postoId[0]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="colaborador">Colaborador</Label>
        {/*
          Uma lista so, com as duas origens separadas por `optgroup`: quem
          procura o nome nao sabe (nem precisa saber) de que tabela ele vem. O
          valor carrega a origem junto do id — ver `colaborador.ts`.

          `<select>` nativo mesmo com centenas de opcoes: o navegador ja busca
          por digitacao dentro dele, e trocar por um menu do Radix custaria a
          navegacao sem JavaScript que o resto do portal preserva.
        */}
        <NativeSelect
          id="colaborador"
          name="colaborador"
          defaultValue={valores?.colaborador ?? ""}
          aria-invalid={Boolean(erros?.colaborador)}
          aria-describedby={erros?.colaborador ? "colaborador-erro" : undefined}
        >
          <option value="">Selecione quem fez o extra</option>
          {funcionarios.length > 0 ? (
            <optgroup label="Funcionarios">
              {funcionarios.map((pessoa) => (
                <option key={pessoa.valor} value={pessoa.valor}>
                  {pessoa.nome}
                  {pessoa.identificacao ? ` (${pessoa.identificacao})` : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
          {freelancers.length > 0 ? (
            <optgroup label="Freelancers">
              {freelancers.map((pessoa) => (
                <option key={pessoa.valor} value={pessoa.valor}>
                  {pessoa.nome}
                  {pessoa.identificacao ? ` (${pessoa.identificacao})` : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
        </NativeSelect>
        {erros?.colaborador ? (
          <p id="colaborador-erro" className="text-destructive text-sm">
            {erros.colaborador[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="freelancerNome">Freelancer novo</Label>
        <Input
          id="freelancerNome"
          name="freelancerNome"
          defaultValue={valores?.freelancerNome}
          placeholder="Nome de quem fez o extra e nao esta na lista"
          aria-invalid={Boolean(erros?.freelancerNome)}
          aria-describedby={erros?.freelancerNome ? "freelancerNome-erro" : "freelancerNome-ajuda"}
        />
        {erros?.freelancerNome ? (
          <p id="freelancerNome-erro" className="text-destructive text-sm">
            {erros.freelancerNome[0]}
          </p>
        ) : (
          <p id="freelancerNome-ajuda" className="text-muted-foreground text-sm">
            Preencha so quando quem fez o extra nao aparece na lista acima. O freelancer nasce aqui,
            sem cadastro previo; nome que ja existe reaproveita o cadastro e nao cria um homonimo.
          </p>
        )}
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="horaEntrada">Entrada</Label>
          <Input
            id="horaEntrada"
            name="horaEntrada"
            type="time"
            defaultValue={valores?.horaEntrada}
            aria-invalid={Boolean(erros?.horaEntrada)}
            aria-describedby={erros?.horaEntrada ? "horaEntrada-erro" : undefined}
          />
          {erros?.horaEntrada ? (
            <p id="horaEntrada-erro" className="text-destructive text-sm">
              {erros.horaEntrada[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="horaSaida">Saida</Label>
          <Input
            id="horaSaida"
            name="horaSaida"
            type="time"
            defaultValue={valores?.horaSaida}
            aria-invalid={Boolean(erros?.horaSaida)}
            aria-describedby={erros?.horaSaida ? "horaSaida-erro" : "horaSaida-ajuda"}
          />
          {erros?.horaSaida ? (
            <p id="horaSaida-erro" className="text-destructive text-sm">
              {erros.horaSaida[0]}
            </p>
          ) : (
            <p id="horaSaida-ajuda" className="text-muted-foreground text-sm">
              Saida menor que a entrada vira a meia-noite — a duracao sai dos dois horarios, como na
              escala.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="local">Local</Label>
        <Input
          id="local"
          name="local"
          defaultValue={valores?.local}
          placeholder="Portaria 2, Fortaleza II, Recepcao"
          aria-invalid={Boolean(erros?.local)}
          aria-describedby={erros?.local ? "local-erro" : "local-ajuda"}
        />
        {erros?.local ? (
          <p id="local-erro" className="text-destructive text-sm">
            {erros.local[0]}
          </p>
        ) : (
          <p id="local-ajuda" className="text-muted-foreground text-sm">
            O que o posto sozinho nao diz: onde, dentro dele, o extra foi feito.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="observacao">Observacao</Label>
        <Textarea
          id="observacao"
          name="observacao"
          rows={2}
          defaultValue={valores?.observacao}
          placeholder="Opcional: por que houve extra, quem autorizou, o que aconteceu no dia."
          aria-invalid={Boolean(erros?.observacao)}
          aria-describedby={erros?.observacao ? "observacao-erro" : undefined}
        />
        {erros?.observacao ? (
          <p id="observacao-erro" className="text-destructive text-sm">
            {erros.observacao[0]}
          </p>
        ) : null}
      </div>
    </>
  );
}
