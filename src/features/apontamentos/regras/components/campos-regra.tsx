"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  IDS_GRAU_INSALUBRIDADE,
  ROTULOS_GRAU_INSALUBRIDADE,
} from "@/features/apontamentos/rubricas";
import {
  ACOES,
  aceitaSoma,
  GATILHOS,
  IDS_RUBRICA_DA_REGRA,
  rotuloDaRubricaDaRegra,
  unidadeDaRubricaDaRegra,
} from "@/features/apontamentos/regras/campos";
import type {
  ErrosDaRegra,
  OpcoesDasRegras,
  ValoresDaRegra,
} from "@/features/apontamentos/regras/types";
import type { RubricaDaRegra } from "@/db/schema";

/**
 * Os campos de uma regra, compartilhados pelo cadastro e pela edicao — mesmo
 * arranjo de `CamposExtra`.
 *
 * Cliente por causa de um campo so: qual valor a regra pede (dias, horas,
 * percentual, grau ou marcacao) depende da rubrica escolhida, e mostrar os
 * cinco de uma vez faria o formulario perguntar quatro coisas que nao valem.
 * O resto continua nao controlado, e a `key` de fora e quem remonta.
 */
export function CamposRegra({
  opcoes,
  valores,
  erros,
}: {
  opcoes: OpcoesDasRegras;
  valores?: Partial<ValoresDaRegra>;
  erros?: ErrosDaRegra;
}) {
  const [rubrica, setRubrica] = useState<RubricaDaRegra>(
    (valores?.rubrica as RubricaDaRegra) || "vt_dias",
  );

  const unidade = unidadeDaRubricaDaRegra(rubrica);
  const somavel = aceitaSoma(rubrica);
  const excecoes = valores?.excecoes ?? [];

  return (
    <>
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <Campo id="nome" rotulo="Nome" erro={erros?.nome?.[0]}>
            <Input
              id="nome"
              name="nome"
              defaultValue={valores?.nome}
              placeholder="VT e VR por dia trabalhado"
              aria-invalid={Boolean(erros?.nome)}
            />
          </Campo>

          <Campo
            id="ordem"
            rotulo="Ordem"
            erro={erros?.ordem?.[0]}
            ajuda="Menor primeiro. Importa porque Definir sobrescreve."
          >
            <Input
              id="ordem"
              name="ordem"
              type="number"
              min={0}
              max={999}
              defaultValue={valores?.ordem ?? "0"}
              aria-invalid={Boolean(erros?.ordem)}
            />
          </Campo>
        </div>

        <Campo id="descricao" rotulo="Descricao" erro={erros?.descricao?.[0]}>
          <Textarea
            id="descricao"
            name="descricao"
            rows={2}
            defaultValue={valores?.descricao}
            placeholder="Opcional: o que esta regra representa no acordo ou no contrato."
          />
        </Campo>

        <div className="flex items-start gap-3">
          <Checkbox
            id="ativa"
            name="ativa"
            defaultChecked={(valores?.ativa ?? "on") === "on"}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="ativa">Ativa</Label>
            <p className="text-muted-foreground text-sm">
              Regra inativa continua cadastrada e para de alimentar a sugestao.
            </p>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="font-medium">Escopo</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="empresaId" rotulo="Empresa" erro={erros?.empresaId?.[0]}>
            <NativeSelect id="empresaId" name="empresaId" defaultValue={valores?.empresaId ?? ""}>
              <option value="">Todas</option>
              {opcoes.empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <Campo id="cargo" rotulo="Cargo contem" erro={erros?.cargo?.[0]}>
            <Input id="cargo" name="cargo" defaultValue={valores?.cargo} placeholder="porteiro" />
          </Campo>

          <Campo id="funcionarioId" rotulo="Somente a pessoa" erro={erros?.funcionarioId?.[0]}>
            <NativeSelect
              id="funcionarioId"
              name="funcionarioId"
              defaultValue={valores?.funcionarioId ?? ""}
            >
              <option value="">Todas as pessoas</option>
              {opcoes.funcionarios.map((pessoa) => (
                <option key={pessoa.id} value={pessoa.id}>
                  {pessoa.nome}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <Campo id="postoId" rotulo="Posto" erro={erros?.postoId?.[0]}>
            <NativeSelect id="postoId" name="postoId" defaultValue={valores?.postoId ?? ""}>
              <option value="">Todos</option>
              {opcoes.postos.map((posto) => (
                <option key={posto.id} value={posto.id}>
                  {posto.nome}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <Campo id="funcaoId" rotulo="Funcao" erro={erros?.funcaoId?.[0]}>
            <NativeSelect id="funcaoId" name="funcaoId" defaultValue={valores?.funcaoId ?? ""}>
              <option value="">Todas</option>
              {opcoes.funcoes.map((funcao) => (
                <option key={funcao.id} value={funcao.id}>
                  {funcao.nome}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <Campo id="turma" rotulo="Turma" erro={erros?.turma?.[0]}>
            <NativeSelect id="turma" name="turma" defaultValue={valores?.turma ?? ""}>
              <option value="">As duas</option>
              <option value="escala">Escala</option>
              <option value="contraescala">Contraescala</option>
            </NativeSelect>
          </Campo>

          <Campo
            id="eventoId"
            rotulo="Sigla do dia"
            erro={erros?.eventoId?.[0]}
            ajuda="E assim que o turno N vira regra."
          >
            <NativeSelect id="eventoId" name="eventoId" defaultValue={valores?.eventoId ?? ""}>
              <option value="">Qualquer sigla</option>
              {opcoes.eventos.map((evento) => (
                <option key={evento.id} value={evento.id}>
                  {evento.codigo} — {evento.rotulo}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <div className="grid grid-cols-2 gap-2">
            <Campo id="cicloDias" rotulo="Ciclo (dias)" erro={erros?.cicloDias?.[0]}>
              <Input
                id="cicloDias"
                name="cicloDias"
                type="number"
                min={1}
                max={31}
                defaultValue={valores?.cicloDias}
                placeholder="6"
              />
            </Campo>
            <Campo id="cicloFolgas" rotulo="Folgas" erro={erros?.cicloFolgas?.[0]}>
              <Input
                id="cicloFolgas"
                name="cicloFolgas"
                type="number"
                min={0}
                max={31}
                defaultValue={valores?.cicloFolgas}
                placeholder="1"
              />
            </Campo>
          </div>

          <Campo
            id="jornadaMinutos"
            rotulo="Turno de"
            erro={erros?.jornadaMinutos?.[0]}
            ajuda="Duracao do turno da vigencia (12:00)."
          >
            <Input
              id="jornadaMinutos"
              name="jornadaMinutos"
              inputMode="numeric"
              placeholder="12:00"
              defaultValue={valores?.jornadaMinutos}
            />
          </Campo>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="font-medium">Efeito</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="gatilho" rotulo="Dispara em" erro={erros?.gatilho?.[0]}>
            <NativeSelect
              id="gatilho"
              name="gatilho"
              defaultValue={valores?.gatilho ?? "dia_trabalhado"}
            >
              {GATILHOS.map((gatilho) => (
                <option key={gatilho.id} value={gatilho.id}>
                  {gatilho.rotulo}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <Campo id="rubrica" rotulo="Rubrica" erro={erros?.rubrica?.[0]}>
            <NativeSelect
              id="rubrica"
              name="rubrica"
              value={rubrica}
              onChange={(evento) => setRubrica(evento.target.value as RubricaDaRegra)}
            >
              {IDS_RUBRICA_DA_REGRA.map((id) => (
                <option key={id} value={id}>
                  {rotuloDaRubricaDaRegra(id)}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <Campo
            id="acao"
            rotulo="Acao"
            erro={erros?.acao?.[0]}
            ajuda={somavel ? undefined : "Marcacao e grau so aceitam Definir."}
          >
            <NativeSelect
              id="acao"
              name="acao"
              key={somavel ? "somavel" : "definir"}
              defaultValue={somavel ? (valores?.acao ?? "somar") : "definir"}
            >
              {ACOES.filter((acao) => somavel || acao.id === "definir").map((acao) => (
                <option key={acao.id} value={acao.id}>
                  {acao.rotulo}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <ValorDaRegra unidade={unidade} valores={valores} erros={erros} />
        </div>

        <p className="text-muted-foreground text-sm">
          {GATILHOS.find((gatilho) => gatilho.id === (valores?.gatilho ?? "dia_trabalhado"))
            ?.descricao ?? ""}
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="font-medium">Excecoes</h3>
          <p className="text-muted-foreground text-sm">
            Segure Ctrl (ou Cmd) para marcar mais de um.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ListaDeExcecoes
            id="excecoes-empresas"
            rotulo="Empresas"
            tipo="empresa"
            itens={opcoes.empresas}
            escolhidos={excecoes}
          />
          <ListaDeExcecoes
            id="excecoes-postos"
            rotulo="Postos"
            tipo="posto"
            itens={opcoes.postos}
            escolhidos={excecoes}
          />
          <ListaDeExcecoes
            id="excecoes-funcoes"
            rotulo="Funcoes"
            tipo="funcao"
            itens={opcoes.funcoes}
            escolhidos={excecoes}
          />
          <ListaDeExcecoes
            id="excecoes-pessoas"
            rotulo="Pessoas"
            tipo="funcionario"
            itens={opcoes.funcionarios}
            escolhidos={excecoes}
          />
        </div>

        {erros?.excecoes ? <p className="text-destructive text-sm">{erros.excecoes[0]}</p> : null}
      </section>
    </>
  );
}

/** O campo de valor muda com a rubrica: dias, horas, percentual, grau ou marcacao. */
function ValorDaRegra({
  unidade,
  valores,
  erros,
}: {
  unidade: ReturnType<typeof unidadeDaRubricaDaRegra>;
  valores?: Partial<ValoresDaRegra>;
  erros?: ErrosDaRegra;
}) {
  if (unidade === "grau") {
    return (
      <Campo id="grau" rotulo="Grau" erro={erros?.grau?.[0]}>
        <NativeSelect id="grau" name="grau" defaultValue={valores?.grau ?? ""}>
          <option value="">Escolha o grau</option>
          {IDS_GRAU_INSALUBRIDADE.map((grau) => (
            <option key={grau} value={grau}>
              {ROTULOS_GRAU_INSALUBRIDADE[grau]}
            </option>
          ))}
        </NativeSelect>
      </Campo>
    );
  }

  if (unidade === "percentual") {
    return (
      <Campo id="percentual" rotulo="Percentual" erro={erros?.percentual?.[0]}>
        <Input
          id="percentual"
          name="percentual"
          inputMode="decimal"
          placeholder="12,5"
          defaultValue={valores?.percentual}
        />
      </Campo>
    );
  }

  if (unidade === "sim_nao") {
    return (
      <Campo id="quantidade" rotulo="Marcar como" erro={erros?.quantidade?.[0]}>
        <NativeSelect id="quantidade" name="quantidade" defaultValue={valores?.quantidade || "1"}>
          <option value="1">Sim</option>
          <option value="0">Nao</option>
        </NativeSelect>
      </Campo>
    );
  }

  if (unidade === "horas") {
    return (
      <Campo id="quantidade" rotulo="Horas" erro={erros?.quantidade?.[0]} ajuda="Como 3:00.">
        <Input
          id="quantidade"
          name="quantidade"
          inputMode="numeric"
          placeholder="3:00"
          defaultValue={valores?.quantidade}
        />
      </Campo>
    );
  }

  return (
    <Campo id="quantidade" rotulo="Dias" erro={erros?.quantidade?.[0]}>
      <Input
        id="quantidade"
        name="quantidade"
        type="number"
        min={0}
        max={31}
        placeholder="1"
        defaultValue={valores?.quantidade}
      />
    </Campo>
  );
}

function ListaDeExcecoes({
  id,
  rotulo,
  tipo,
  itens,
  escolhidos,
}: {
  id: string;
  rotulo: string;
  tipo: string;
  itens: readonly { id: string; nome: string }[];
  escolhidos: readonly string[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {/*
        `select multiple` posta um valor por opcao marcada, todos sob o mesmo
        nome — e o unico campo do portal que manda lista sem depender de
        JavaScript. O valor carrega o tipo junto do id, como o campo de pessoa
        do modal da grade.
      */}
      <select
        id={id}
        name="excecoes"
        multiple
        size={4}
        defaultValue={escolhidos.filter((valor) => valor.startsWith(`${tipo}:`))}
        className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
      >
        {itens.map((item) => (
          <option key={item.id} value={`${tipo}:${item.id}`}>
            {item.nome}
          </option>
        ))}
      </select>
    </div>
  );
}

function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro ? (
        <p className="text-destructive text-sm">{erro}</p>
      ) : ajuda ? (
        <p className="text-muted-foreground text-sm">{ajuda}</p>
      ) : null}
    </div>
  );
}
