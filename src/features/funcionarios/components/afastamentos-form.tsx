"use client";

import { CalendarPlus, LoaderCircle, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData } from "@/features/competencias/periodo";
import { registrarAfastamento, removerAfastamento } from "@/features/funcionarios/actions";
import {
  diasDeAfastamento,
  rotuloDoAfastamento,
  TIPOS_DE_AFASTAMENTO,
} from "@/features/funcionarios/afastamentos";
import {
  estadoInicialRegistrarAfastamento,
  estadoInicialRemoverAfastamento,
  type AfastamentoResumo,
} from "@/features/funcionarios/types";

/**
 * Os periodos em que a pessoa nao devia bater ponto: ferias, atestado, INSS.
 *
 * Terceira aba do cadastro, ao lado de dados e jornada, e pelo mesmo motivo das
 * outras duas: e outra coisa, vinda de outro lugar e mudada em outro momento. A
 * jornada diz que **terca era dia de trabalho**; o afastamento diz que naquela
 * terca especifica nao era para haver batida. Sem ele, a apuracao le o dia sem
 * marcacao como falta.
 *
 * Uma lista com um formulario em cima, e nao um formulario por linha: cada
 * afastamento e um registro independente, e editar um periodo ja lancado nao
 * existe — corrige-se removendo e lancando de novo, que e o que a action de
 * remocao existe para permitir.
 */
export function AfastamentosForm({
  funcionarioId,
  afastamentos,
  /** `YYYY-MM-DD` no fuso do portal, para o resumo saber o que ja passou. */
  hoje,
}: {
  funcionarioId: string;
  afastamentos: readonly AfastamentoResumo[];
  hoje: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, formAction, pendente] = useActionState(
    registrarAfastamento,
    estadoInicialRegistrarAfastamento,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
      formRef.current?.reset();
    }

    if (estado.status === "error" && !estado.erros) {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="funcionarioId" value={funcionarioId} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <NativeSelect
              id="tipo"
              name="tipo"
              defaultValue="ferias"
              aria-invalid={Boolean(estado.erros?.tipo)}
              aria-describedby={estado.erros?.tipo ? "tipo-erro" : undefined}
            >
              {TIPOS_DE_AFASTAMENTO.map((atual) => (
                <option key={atual.tipo} value={atual.tipo}>
                  {atual.rotulo}
                </option>
              ))}
            </NativeSelect>
            {estado.erros?.tipo ? (
              <p id="tipo-erro" className="text-destructive text-sm">
                {estado.erros.tipo[0]}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataInicio">Inicio</Label>
            <Input
              id="dataInicio"
              name="dataInicio"
              type="date"
              aria-invalid={Boolean(estado.erros?.dataInicio)}
              aria-describedby={estado.erros?.dataInicio ? "dataInicio-erro" : undefined}
            />
            {estado.erros?.dataInicio ? (
              <p id="dataInicio-erro" className="text-destructive text-sm">
                {estado.erros.dataInicio[0]}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataFim">Fim</Label>
            <Input
              id="dataFim"
              name="dataFim"
              type="date"
              aria-invalid={Boolean(estado.erros?.dataFim)}
              aria-describedby={estado.erros?.dataFim ? "dataFim-erro" : "dataFim-ajuda"}
            />
            {estado.erros?.dataFim ? (
              <p id="dataFim-erro" className="text-destructive text-sm">
                {estado.erros.dataFim[0]}
              </p>
            ) : (
              <p id="dataFim-ajuda" className="text-muted-foreground text-sm">
                Inclusivo. Um dia so: mesma data no inicio e no fim.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacao">Observacao</Label>
          <Input
            id="observacao"
            name="observacao"
            placeholder="Numero do atestado, beneficio do INSS..."
            aria-invalid={Boolean(estado.erros?.observacao)}
            aria-describedby={estado.erros?.observacao ? "observacao-erro" : undefined}
          />
          {estado.erros?.observacao ? (
            <p id="observacao-erro" className="text-destructive text-sm">
              {estado.erros.observacao[0]}
            </p>
          ) : null}
        </div>

        {estado.status === "error" && !estado.erros ? (
          <p role="alert" className="text-destructive text-sm">
            {estado.mensagem}
          </p>
        ) : null}

        <Button type="submit" disabled={pendente}>
          {pendente ? <LoaderCircle className="animate-spin" /> : <CalendarPlus aria-hidden />}
          {pendente ? "Registrando..." : "Registrar afastamento"}
        </Button>
      </form>

      <Separator />

      {afastamentos.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum afastamento registrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>Observacao</TableHead>
                <TableHead className="sr-only">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {afastamentos.map((afastamento) => {
                const dias = diasDeAfastamento(afastamento);
                const emCurso = hoje >= afastamento.dataInicio && hoje <= afastamento.dataFim;

                return (
                  <TableRow key={afastamento.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{rotuloDoAfastamento(afastamento.tipo)}</span>
                        {emCurso ? <Badge>Em curso</Badge> : null}
                      </div>
                    </TableCell>

                    <TableCell className="whitespace-normal">
                      <div>
                        {formatarData(afastamento.dataInicio)} a {formatarData(afastamento.dataFim)}
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {dias === 1 ? "1 dia" : `${dias} dias`}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-normal">
                      {afastamento.observacao ?? "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      <BotaoRemover afastamento={afastamento} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * Remover e a unica exclusao do modulo, e e a certa aqui: o afastamento e uma
 * entrada, nao um fato ja interpretado. Uma data errada nao se corrige
 * desativando — enquanto a linha existir, ela continua tirando dias da apuracao.
 *
 * Formulario proprio por linha, e nao um botao dentro do formulario de cima:
 * dois `<form>` aninhados nao existem em HTML, e o de cima e o de registrar.
 */
function BotaoRemover({ afastamento }: { afastamento: AfastamentoResumo }) {
  const [estado, formAction, pendente] = useActionState(
    removerAfastamento,
    estadoInicialRemoverAfastamento,
  );

  useEffect(() => {
    if (estado.status === "success") {
      toast.success(estado.mensagem);
    }

    if (estado.status === "error") {
      toast.error(estado.mensagem);
    }
  }, [estado]);

  return (
    <form action={formAction}>
      <input type="hidden" name="afastamentoId" value={afastamento.id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <LoaderCircle className="animate-spin" /> : <Trash2 aria-hidden />}
        <span className="sr-only">
          Remover o afastamento de {formatarData(afastamento.dataInicio)} a{" "}
          {formatarData(afastamento.dataFim)}
        </span>
      </Button>
    </form>
  );
}
