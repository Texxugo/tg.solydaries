import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const consulta = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function assinar(aoMudar: () => void) {
  const mql = window.matchMedia(consulta);
  mql.addEventListener("change", aoMudar);

  return () => mql.removeEventListener("change", aoMudar);
}

/**
 * Versao gerada pelo shadcn CLI, reescrita com `useSyncExternalStore`: a
 * original chamava `setState` dentro do efeito e o `react-hooks` do
 * eslint-config-next reprova isso. Refaca esta troca se um `shadcn add`
 * sobrescrever o arquivo.
 *
 * No servidor o snapshot e `false` — o menu lateral renderiza na versao
 * desktop e o layout responsivo do CSS cuida do resto ate a hidratacao.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
