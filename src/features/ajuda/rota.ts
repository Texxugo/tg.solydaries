import { AREAS_PORTAL } from "@/features/acessos/areas";

import { AJUDA_DAS_AREAS, AJUDA_GERAL, type Ajuda, type SecaoDeAjuda } from "./conteudo";

/**
 * Qual ajuda abrir na rota atual, e quais secoes dela falam desta tela.
 *
 * Modulo puro: o botao de ajuda chama a cada navegacao, com o `usePathname()`.
 */
export type AjudaDaRota = {
  ajuda: Ajuda;
  /** Secoes que falam da tela aberta — o painel as mostra primeiro. */
  nestaTela: SecaoDeAjuda[];
  /** O resto da area, na ordem do catalogo. */
  demais: SecaoDeAjuda[];
};

/**
 * A area e a do menu: a primeira cuja rota e o caminho atual ou um prefixo de
 * segmento dele (`/ponto/pendencias` e de `ponto`, `/pontos` nao seria). Fora
 * de qualquer area — a home — vale a ajuda geral.
 */
function ajudaDoCaminho(caminho: string): Ajuda {
  const area = AREAS_PORTAL.find(
    (atual) => caminho === atual.href || caminho.startsWith(`${atual.href}/`),
  );

  return area ? AJUDA_DAS_AREAS[area.id] : AJUDA_GERAL;
}

/**
 * Quanto uma tela da secao casa com o caminho: o tamanho dela, ou `-1`.
 *
 * Tela terminada em `/` casa com o que vier depois (`/extras/` cobre a edicao
 * de qualquer extra); sem a barra, so com o caminho exato (`/extras` e a
 * lista, e nao a lista e tudo abaixo dela).
 */
function encaixe(tela: string, caminho: string) {
  if (tela.endsWith("/") ? caminho.startsWith(tela) : caminho === tela) return tela.length;
  return -1;
}

function melhorEncaixe(secao: SecaoDeAjuda, caminho: string) {
  return Math.max(-1, ...(secao.telas ?? []).map((tela) => encaixe(tela, caminho)));
}

/**
 * Vale so o encaixe mais longo: `/funcionarios/importar` tambem comeca com
 * `/funcionarios/` (a ficha de um funcionario), mas a importacao nao e a
 * ficha. Sem isso, toda subtela traria junto as secoes das irmas.
 */
export function ajudaDaRota(caminho: string): AjudaDaRota {
  const ajuda = ajudaDoCaminho(caminho);
  const encaixes = ajuda.secoes.map((secao) => melhorEncaixe(secao, caminho));
  const maior = Math.max(-1, ...encaixes);

  return {
    ajuda,
    nestaTela: ajuda.secoes.filter((_, indice) => maior >= 0 && encaixes[indice] === maior),
    demais: ajuda.secoes.filter((_, indice) => maior < 0 || encaixes[indice] !== maior),
  };
}
