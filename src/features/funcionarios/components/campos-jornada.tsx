"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoEscala } from "@/features/escalas/components/campo-escala";
import type { EscalaParaAtribuicao } from "@/features/escalas/types";
import type { ErrosDoFuncionario, ValoresDoFuncionario } from "@/features/funcionarios/types";

/**
 * Escala e inicio de ciclo — os dois campos que decidem, para cada dia, se era
 * dia de trabalho ou de folga.
 *
 * Vivem separados dos dados da pessoa porque sao outra coisa: os dados vem da
 * folha (a mao ou por importacao) e a jornada nasce no portal. Na edicao os dois
 * blocos sao formularios independentes, cada um com o seu botao; no cadastro
 * ainda nao ha a quem atribuir jornada antes de a pessoa existir, entao eles
 * viajam no mesmo envio, mas em secoes distintas.
 *
 * Os dois campos ficam juntos **entre si** de proposito: sozinho, nenhum
 * responde "hoje e dia de trabalho?", e o banco recusa a gravacao de um sem o
 * outro (`funcionarios_escala_com_inicio`).
 */
export function CamposJornada({
  escalas,
  valores,
  erros,
  /** Rotulo e ajuda mudam entre "pode ficar em branco" e "e isto que voce veio definir". */
  obrigatorio = false,
}: {
  escalas: readonly EscalaParaAtribuicao[];
  valores?: Partial<Pick<ValoresDoFuncionario, "escalaId" | "inicioCiclo">>;
  erros?: ErrosDoFuncionario;
  obrigatorio?: boolean;
}) {
  return (
    <>
      {/*
        A escala ocupa a linha inteira: com a busca dentro dela o campo ja e o
        mais alto do bloco, e ao lado de um campo de data eles nao se
        alinhariam. O nome da escala tambem e longo e agradece a largura.
      */}
      <CampoEscala
        escalas={escalas}
        id="escalaId"
        name="escalaId"
        defaultValue={valores?.escalaId ?? ""}
        rotuloVazio={obrigatorio ? "Selecione a escala" : "Sem escala definida"}
        erro={erros?.escalaId?.[0]}
        ajuda={
          escalas.length === 0
            ? "Nenhuma escala ativa cadastrada ainda."
            : "Somente escalas ativas aparecem aqui."
        }
      />

      <div className="space-y-2 sm:max-w-xs">
        <Label htmlFor="inicioCiclo">Inicio do ciclo</Label>
        <Input
          id="inicioCiclo"
          name="inicioCiclo"
          type="date"
          defaultValue={valores?.inicioCiclo}
          aria-invalid={Boolean(erros?.inicioCiclo)}
          aria-describedby={erros?.inicioCiclo ? "inicioCiclo-erro" : "inicioCiclo-ajuda"}
        />
        {erros?.inicioCiclo ? (
          <p id="inicioCiclo-erro" className="text-destructive text-sm">
            {erros.inicioCiclo[0]}
          </p>
        ) : (
          <p id="inicioCiclo-ajuda" className="text-muted-foreground text-sm">
            O primeiro dia trabalhado do ciclo. Num 12x36, e o dia em que esta pessoa entra — quem
            faz a outra turma comeca no dia seguinte.
          </p>
        )}
      </div>
    </>
  );
}
