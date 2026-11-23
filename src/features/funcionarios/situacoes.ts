/**
 * Situacoes da folha, como a legenda do relatorio "Relacao de Empregados" as
 * numera. O codigo e gravado em `funcionarios.situacao` exatamente como veio.
 *
 * Modulo puro (nenhum import): e lido pela DAL, pelas paginas e pelos
 * componentes client — mesma regra de `escalas/jornada.ts` e `acessos/areas.ts`.
 *
 * Guardar o codigo, e nao um booleano ativo/inativo, e o que permite a
 * interpretacao da jornada distinguir os casos que **parecem** iguais no ponto:
 * um dia sem marcacao de quem esta de ferias e um dia previsto e justificado;
 * o mesmo dia de quem esta trabalhando e uma falta a apurar.
 *
 * A numeracao tem buracos (nao ha 23) e salta para 90/91 no fim: e a legenda do
 * proprio relatorio, e reescreve-la para ficar sequencial faria os codigos do
 * portal deixarem de bater com os da folha.
 */

/** Quem esta em atividade: a unica situacao de quem deve bater ponto. */
export const SITUACAO_TRABALHANDO = 1;

/** Fim de contrato. Nao e afastamento: nao ha jornada prevista a apurar. */
export const SITUACAO_DEMITIDO = 8;

const CATALOGO = new Map<number, string>([
  [1, "Trabalhando"],
  [2, "Afastado com direitos integrais"],
  [3, "Acidente de trabalho por periodo superior a 15 dias"],
  [4, "Servico militar"],
  [5, "Licenca maternidade"],
  [6, "Doenca por periodo superior a 15 dias"],
  [7, "Licenca sem vencimento"],
  [8, "Demitido"],
  [9, "Ferias"],
  [10, "Novo afastamento pelo mesmo acidente de trabalho"],
  [11, "Antecipacao ou prorrogacao de licenca maternidade"],
  [12, "Novo afastamento pela mesma doenca"],
  [13, "Exercicio de mandato sindical"],
  [14, "Aposentadoria por invalidez: acidente de trabalho"],
  [15, "Aposentadoria por invalidez: doenca profissional"],
  [16, "Aposentadoria por invalidez: exceto acidente e doenca profissional"],
  [17, "Acidente de trabalho por periodo de ate 15 dias"],
  [18, "Doenca por periodo de ate 15 dias"],
  [19, "Aborto nao criminoso"],
  [20, "Licenca maternidade por adocao de crianca de ate 1 ano"],
  [21, "Licenca maternidade por adocao de crianca de 1 a 4 anos"],
  [22, "Licenca maternidade por adocao de crianca de 4 a 8 anos"],
  [24, "Outros motivos de afastamento"],
  [90, "Suspensao contratual por acao de rescisao indireta"],
  [91, "Suspensao contratual para inquerito de falta grave"],
]);

export type Situacao = { codigo: number; rotulo: string };

/** Todas as situacoes conhecidas, na ordem do codigo — como o `select` as lista. */
export const SITUACOES: readonly Situacao[] = [...CATALOGO.entries()]
  .map(([codigo, rotulo]) => ({ codigo, rotulo }))
  .sort((a, b) => a.codigo - b.codigo);

/**
 * O rotulo da situacao. Codigo desconhecido nao vira erro nem cai no vazio: a
 * folha pode ganhar um codigo novo antes de este catalogo saber dele, e o
 * numero cru ainda diz mais a quem le do que uma tela em branco.
 */
export function rotuloDaSituacao(codigo: number) {
  return CATALOGO.get(codigo) ?? `Situacao ${codigo}`;
}

/** `false` para o codigo que a folha ainda nao usava quando isto foi escrito. */
export function ehSituacaoConhecida(codigo: number) {
  return CATALOGO.has(codigo);
}

/**
 * Se a pessoa esta em atividade. Tudo que nao e "Trabalhando" e ausencia com
 * motivo — inclusive a demissao, que nao e afastamento mas tambem nao preve
 * jornada.
 */
export function estaTrabalhando(codigo: number) {
  return codigo === SITUACAO_TRABALHANDO;
}

/** Afastado: ausencia com motivo, contrato ainda em vigor. */
export function estaAfastado(codigo: number) {
  return codigo !== SITUACAO_TRABALHANDO && codigo !== SITUACAO_DEMITIDO;
}
