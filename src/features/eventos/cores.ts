import type { EventoCor, EventoNatureza } from "@/db/schema";

/**
 * Aparencia e vocabulario do catalogo de eventos.
 *
 * Modulo puro de proposito (so `import type` do schema, apagado na compilacao):
 * e lido pela grade (Server Component), pelos formularios client e pela lista —
 * mesma regra de `acessos/areas.ts` e `competencias/periodo.ts`.
 *
 * As classes estao escritas por extenso, e nao montadas com template string
 * (`bg-${cor}-100`): o Tailwind varre o codigo-fonte procurando classes
 * literais, e uma classe montada em tempo de execucao simplesmente nao entra no
 * CSS — a celula sairia sem cor nenhuma, sem erro nenhum.
 */

/** Fundo, texto e borda de cada cor, no tema claro e no escuro. */
const CLASSES: Record<EventoCor, string> = {
  cinza: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  verde: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  azul: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  ambar: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  vermelho: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  roxo: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};

/** Como cada cor se chama no formulario de cadastro. */
const ROTULOS_COR: Record<EventoCor, string> = {
  cinza: "Cinza",
  verde: "Verde",
  azul: "Azul",
  ambar: "Ambar",
  vermelho: "Vermelho",
  roxo: "Roxo",
};

export const CORES_EVENTO = (Object.keys(CLASSES) as EventoCor[]).map((id) => ({
  id,
  rotulo: ROTULOS_COR[id],
  classes: CLASSES[id],
}));

/** Mesma lista, no formato de tupla que o `z.enum` exige. */
export const IDS_CORES = CORES_EVENTO.map((cor) => cor.id) as [EventoCor, ...EventoCor[]];

export function classesDaCor(cor: EventoCor) {
  return CLASSES[cor];
}

/**
 * O que cada natureza quer dizer, e o que ela faz com o dia na hora de somar o
 * rodape da grade. A descricao aparece no formulario porque a escolha e o unico
 * campo do cadastro que muda o **numero** que a tela mostra depois.
 */
const NATUREZAS: Record<EventoNatureza, { rotulo: string; descricao: string }> = {
  trabalho: {
    rotulo: "Trabalho",
    descricao: "O dia conta como trabalhado. E o D, o N e qualquer cobertura efetiva.",
  },
  folga: {
    rotulo: "Folga",
    descricao: "Dia sem jornada prevista. Nao entra na contagem de trabalho nem na de falta.",
  },
  falta: {
    rotulo: "Falta",
    descricao: "Havia jornada prevista e ninguem cobriu. E o que a grade destaca como pendencia.",
  },
  afastamento: {
    rotulo: "Afastamento",
    descricao: "Ferias, atestado, INSS: a pessoa esta fora e o dia esta explicado.",
  },
  outro: {
    rotulo: "Outro",
    descricao: "Marca o dia sem afetar nenhuma contagem — treinamento, integracao, deslocamento.",
  },
  troca: {
    rotulo: "Troca",
    descricao:
      "Inverte o previsto: conta como trabalho na folga prevista e como folga no dia de trabalho previsto. E a troca interna entre dois colegas.",
  },
};

export const NATUREZAS_EVENTO = (Object.keys(NATUREZAS) as EventoNatureza[]).map((id) => ({
  id,
  ...NATUREZAS[id],
}));

export const IDS_NATUREZAS = NATUREZAS_EVENTO.map((natureza) => natureza.id) as [
  EventoNatureza,
  ...EventoNatureza[],
];

export function rotuloDaNatureza(natureza: EventoNatureza) {
  return NATUREZAS[natureza].rotulo;
}

/**
 * O codigo como a grade o compara: sem espacos e em caixa alta.
 *
 * A comparacao ignora a caixa pelo mesmo motivo do indice `eventos_codigo_unico`
 * — quem preenche trinta e uma colunas digita "d" tanto quanto "D", e recusar a
 * minuscula seria transformar a grade num ditado.
 */
export function normalizarCodigo(codigo: string) {
  return codigo.trim().toUpperCase();
}
