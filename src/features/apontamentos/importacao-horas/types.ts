import type { LinhaRecusada } from "@/features/funcionarios/planilha";

import type { NomeSemCadastro } from "./plano";

/**
 * Contratos da importacao de horas extras entre a action e a tela. Fora de
 * `actions.ts` porque um arquivo "use server" so exporta funcoes async.
 */

export const ROTA_IMPORTAR_HORAS = "/apontamentos/importar-horas";

/** O relatorio tem poucas centenas de linhas; 5 MB e o teto da importacao da folha. */
export const TAMANHO_MAXIMO_RELATORIO_DE_HORAS = 5 * 1024 * 1024;

/**
 * O campo da previa que associa um nome do arquivo a um cadastro. O nome vai
 * no proprio nome do campo, e o valor e o id do funcionario.
 */
export const PREFIXO_ASSOCIACAO = "associar:";

/** Uma pessoa que o apontamento vai receber, como a previa a desenha. */
export type ItemDaImportacaoDeHoras = {
  /** A identidade do arquivo; com `associado`, e o nome do campo que leva a escolha adiante. */
  chave: string;
  funcionarioId: string;
  funcionario: string;
  detalhe: string;
  nomeNoArquivo: string;
  matriculaNoArquivo: string | null;
  /** As linhas do arquivo somadas nesta pessoa (o relatorio de eventos traz uma por dia). */
  linhas: number[];
  /** Casou pelo nome exato (`false`) ou por associacao escolhida na previa. */
  associado: boolean;
  /** `null` = o arquivo nao traz a verba, e a coluna fica como esta. */
  he50: number | null;
  he100: number | null;
  gravado50: number;
  gravado100: number;
  /** Ainda nao tem apontamento na competencia: a importacao cria um. */
  novo: boolean;
};

export type PreviaDaImportacaoDeHoras = {
  /** Muda a cada previa: as escolhas de associacao da tela se prendem a ela. */
  token: string;
  arquivo: string;
  competencia: string;
  gravar: ItemDaImportacaoDeHoras[];
  semMudanca: number;
  semCadastro: NomeSemCadastro[];
  recusadas: LinhaRecusada[];
  outrasVerbas: { verba: string; linhas: number }[];
  zeradas: number;
};

export type ResultadoDaImportacaoDeHoras = {
  gravados: number;
  criados: number;
  semMudanca: number;
  /** Nomes que ficaram de fora por nao terem cadastro associado. */
  naoImportados: string[];
  recusadas: LinhaRecusada[];
};

export type ImportacaoDeHorasState =
  | { status: "idle" }
  | { status: "error"; mensagem: string }
  | { status: "previa"; previa: PreviaDaImportacaoDeHoras }
  | { status: "success"; mensagem: string; resultado: ResultadoDaImportacaoDeHoras };

export const estadoInicialImportacaoDeHoras: ImportacaoDeHorasState = { status: "idle" };
