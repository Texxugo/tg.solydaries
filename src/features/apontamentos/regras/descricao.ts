import { formatarDuracao } from "@/features/escalas/jornada";

import { horasParaCampo, percentualParaCampo, ROTULOS_GRAU_INSALUBRIDADE } from "../rubricas";
import { rotuloDaRubricaDaRegra, rotuloDoGatilho, unidadeDaRubricaDaRegra } from "./campos";
import type { RegraResumo, ValoresDaRegra } from "./types";

/**
 * Como a regra se le na lista e na ficha: o escopo em pedacos e o efeito numa
 * frase.
 *
 * Modulo puro, separado de `campos.ts` porque ele fala do **cadastro ja lido**
 * (`RegraResumo`), e nao do vocabulario — e `campos.ts` e importado por quem
 * calcula, que nao conhece nome de empresa nenhum.
 */

/** Um pedaco por filtro preenchido. Lista vazia = a regra vale para todo mundo. */
export function partesDoEscopo(regra: RegraResumo): string[] {
  const { escopo } = regra;

  return [
    escopo.empresaNome && `Empresa ${escopo.empresaNome}`,
    escopo.cargo && `Cargo com "${escopo.cargo}"`,
    escopo.funcionarioNome && `So ${escopo.funcionarioNome}`,
    escopo.postoNome && `Posto ${escopo.postoNome}`,
    escopo.funcaoNome && `Funcao ${escopo.funcaoNome}`,
    escopo.turma === "contraescala" ? "Contraescala" : escopo.turma === "escala" ? "Escala" : null,
    escopo.eventoCodigo && `Sigla ${escopo.eventoCodigo}`,
    escopo.cicloDias !== null &&
      escopo.cicloFolgas !== null &&
      `Ciclo de ${escopo.cicloDias} dias com ${escopo.cicloFolgas} ${
        escopo.cicloFolgas === 1 ? "folga" : "folgas"
      }`,
    escopo.jornadaMinutos !== null && `Turno de ${formatarDuracao(escopo.jornadaMinutos)}`,
  ].filter((parte): parte is string => Boolean(parte));
}

/** O valor do efeito, na unidade da rubrica. */
export function valorDoEfeito(regra: RegraResumo) {
  switch (unidadeDaRubricaDaRegra(regra.rubrica)) {
    case "dias": {
      const dias = regra.quantidade ?? 0;
      return `${dias} ${dias === 1 ? "dia" : "dias"}`;
    }
    case "horas":
      return formatarDuracao(regra.quantidade ?? 0);
    case "percentual":
      return `${percentualParaCampo(regra.percentual ?? 0)}%`;
    case "sim_nao":
      return (regra.quantidade ?? 0) > 0 ? "Sim" : "Nao";
    case "grau":
      return regra.grau ? ROTULOS_GRAU_INSALUBRIDADE[regra.grau] : "—";
  }
}

/** "+1 dia em Vale-transporte por dia trabalhado", numa frase so. */
export function rotuloDoEfeito(regra: RegraResumo) {
  const rubrica = rotuloDaRubricaDaRegra(regra.rubrica);
  const valor = valorDoEfeito(regra);
  const gatilho = rotuloDoGatilho(regra.gatilho).toLowerCase();

  if (regra.acao === "definir") {
    return `${rubrica}: ${valor}${regra.gatilho === "fixo" ? "" : ` (${gatilho})`}`;
  }

  return `+${valor} em ${rubrica} a cada ${gatilho}`;
}

/** A regra gravada no formato dos campos — tudo texto, como o formulario le. */
export function valoresDaRegra(regra: RegraResumo): ValoresDaRegra {
  const unidade = unidadeDaRubricaDaRegra(regra.rubrica);

  return {
    nome: regra.nome,
    descricao: regra.descricao ?? "",
    ordem: String(regra.ordem),
    ativa: regra.ativa ? "on" : "",
    empresaId: regra.escopo.empresaId ?? "",
    cargo: regra.escopo.cargo ?? "",
    funcionarioId: regra.escopo.funcionarioId ?? "",
    postoId: regra.escopo.postoId ?? "",
    funcaoId: regra.escopo.funcaoId ?? "",
    turma: regra.escopo.turma ?? "",
    eventoId: regra.escopo.eventoId ?? "",
    cicloDias: regra.escopo.cicloDias === null ? "" : String(regra.escopo.cicloDias),
    cicloFolgas: regra.escopo.cicloFolgas === null ? "" : String(regra.escopo.cicloFolgas),
    jornadaMinutos:
      regra.escopo.jornadaMinutos === null ? "" : horasParaCampo(regra.escopo.jornadaMinutos),
    gatilho: regra.gatilho,
    rubrica: regra.rubrica,
    acao: regra.acao,
    quantidade:
      regra.quantidade === null
        ? ""
        : unidade === "horas"
          ? horasParaCampo(regra.quantidade)
          : String(regra.quantidade),
    percentual: regra.percentual === null ? "" : percentualParaCampo(regra.percentual),
    grau: regra.grau ?? "",
    excecoes: regra.excecoes.map((excecao) => `${excecao.tipo}:${excecao.alvoId}`),
  };
}
