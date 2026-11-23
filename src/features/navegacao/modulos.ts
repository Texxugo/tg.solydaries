import type { AreaPortal } from "@/db/schema";
import {
  AREAS_PORTAL,
  podeAcessar,
  type Area,
  type SujeitoDoAcesso,
} from "@/features/acessos/areas";

/**
 * Agrupamento das areas em modulos, para o menu lateral.
 *
 * Modulo e apresentacao, nao autorizacao: o acesso continua sendo concedido
 * area a area (`acessos.area`), e quem decide se alguem entra e o
 * `exigirAcesso()` da DAL. Por isso este catalogo nao vai para o banco e
 * `areas.ts` nao precisa saber que modulos existem.
 *
 * Modulo puro como `areas.ts`: e importado pelo layout (servidor) e pelo menu
 * (client). Icone, por ser apresentacao, fica em `icones.ts`.
 */
export type ModuloPortal = "gestao" | "operacao";

/** Ordem das chaves = ordem dos modulos no menu. */
const CATALOGO_MODULOS: Record<ModuloPortal, { rotulo: string }> = {
  gestao: { rotulo: "Gestao" },
  operacao: { rotulo: "Operacao" },
};

/**
 * A que modulo cada area pertence. `null` tira a area do menu de modulos e a
 * joga no menu do usuario — hoje so `acessos`, que e configuracao da conta e
 * nao um modulo de trabalho.
 *
 * O `Record<AreaPortal, ...>` amarra o mapa ao enum do banco: area nova sem
 * modulo definido quebra o typecheck.
 */
const MODULO_DA_AREA: Record<AreaPortal, ModuloPortal | null> = {
  competencias: "gestao",
  escalas: "gestao",
  funcionarios: "gestao",
  ponto: "gestao",
  // Logo depois da analise de ponto porque e o passo seguinte a ela: o
  // apontamento e lancado com o espelho aberto ao lado.
  apontamentos: "gestao",
  // A grade do periodo e os dois cadastros que a alimentam. Ficam fora de
  // "Gestao" porque sao o trabalho do dia a dia, e nao a base que se cadastra
  // uma vez — e porque Gestao ja carregava as cinco areas que cabem numa lista.
  postos: "operacao",
  eventos: "operacao",
  // Antes da grade: e o lancamento diario de quem esteve em cada posto, que a
  // consulta semanal entrega pronto para quem monta a escala.
  efetivos: "operacao",
  preenchimento: "operacao",
  extras: "operacao",
  // Ao lado dos extras: as duas registram o que fugiu da escala do dia.
  movimentacoes: "operacao",
  // Logo depois da grade e do que ela registra: e a fila do que alguem marcou
  // com o "!" ao preencher a escala.
  sinalizacoes: "operacao",
  acessos: null,
};

export type Modulo = {
  id: ModuloPortal;
  rotulo: string;
  /** Areas do modulo que este usuario pode abrir. Nunca vazia. */
  opcoes: Area[];
};

/**
 * Modulos que o usuario ve no menu, ja com as opcoes filtradas. Modulo sem
 * nenhuma opcao liberada nao aparece — nao ha o que expandir.
 *
 * E conveniencia, nao seguranca: quem digitar a URL de uma area nao liberada
 * esbarra em `exigirAcesso()`.
 */
export function modulosVisiveis(usuario: SujeitoDoAcesso): Modulo[] {
  return (Object.keys(CATALOGO_MODULOS) as ModuloPortal[])
    .map((id) => ({
      id,
      ...CATALOGO_MODULOS[id],
      opcoes: AREAS_PORTAL.filter(
        (area) => MODULO_DA_AREA[area.id] === id && podeAcessar(usuario, area.id),
      ),
    }))
    .filter((modulo) => modulo.opcoes.length > 0);
}

/** Areas fora dos modulos: entram no menu que abre ao clicar no nome do usuario. */
export function areasDaConta(usuario: SujeitoDoAcesso): Area[] {
  return AREAS_PORTAL.filter(
    (area) => MODULO_DA_AREA[area.id] === null && podeAcessar(usuario, area.id),
  );
}
