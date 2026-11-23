import type { AreaPortal, PerfilUsuario } from "@/db/schema";

/**
 * Catalogo das areas do portal: rotulo, descricao e rota de cada uma.
 *
 * Modulo puro de proposito (so `import type` do schema, apagado na compilacao):
 * e consumido tanto pelo layout do portal quanto pelos formularios client, e
 * nenhum dos dois deve arrastar o Drizzle para o bundle.
 *
 * O `Record<AreaPortal, ...>` amarra o catalogo ao enum do banco: incluir um
 * valor em `area_portal` sem descrever a area aqui quebra o typecheck.
 */
const CATALOGO: Record<AreaPortal, { rotulo: string; descricao: string; href: string }> = {
  competencias: {
    rotulo: "Competencias",
    descricao: "Abrir a competencia do periodo e consultar as anteriores.",
    href: "/competencias",
  },
  escalas: {
    rotulo: "Escalas",
    descricao: "Cadastrar as regras de jornada que interpretam a marcacao de cada funcionario.",
    href: "/escalas",
  },
  funcionarios: {
    rotulo: "Funcionarios",
    descricao: "Cadastrar funcionarios e definir a escala e o inicio de ciclo de cada um.",
    href: "/funcionarios",
  },
  ponto: {
    rotulo: "Analise de ponto",
    descricao:
      "Importar as marcacoes do relogio e conferir, dia a dia, o que fecha com a escala de cada um.",
    href: "/ponto",
  },
  apontamentos: {
    rotulo: "Apontamentos",
    descricao:
      "Registrar, para o fechamento da folha, os direitos e ocorrencias de cada funcionario na competencia.",
    href: "/apontamentos",
  },
  postos: {
    rotulo: "Postos de trabalho",
    descricao: "Cadastrar os postos e as funcoes que a escala do periodo precisa cobrir.",
    href: "/postos",
  },
  eventos: {
    rotulo: "Eventos",
    descricao: "Cadastrar o vocabulario da grade: as siglas que cada dia pode receber.",
    href: "/eventos",
  },
  efetivos: {
    rotulo: "Efetivos",
    descricao:
      "Lancar o efetivo de cada posto no dia, com as excecoes, e consultar a semana para montar a escala.",
    href: "/efetivos",
  },
  preenchimento: {
    rotulo: "Preenchimento de escala",
    descricao:
      "Montar a escala da competencia dia a dia: quem cobre cada posto, o que foi previsto e o que foi realizado.",
    href: "/preenchimento",
  },
  extras: {
    rotulo: "Conferencia de horas extras",
    descricao:
      "Registrar quem fez hora extra: colaborador, horario, posto, local e o que explica o dia.",
    href: "/extras",
  },
  movimentacoes: {
    rotulo: "Movimentacoes",
    descricao:
      "Registrar faltas, trocas internas e trocas de escala, com a justificativa e os documentos de cada uma.",
    href: "/movimentacoes",
  },
  sinalizacoes: {
    rotulo: "Dias sinalizados",
    descricao:
      "Conferir os dias que alguem sinalizou com o ! ao preencher a escala, e marca-los como resolvidos.",
    href: "/sinalizacoes",
  },
  acessos: {
    rotulo: "Acessos",
    descricao: "Cadastrar usuarios e definir as areas de cada um.",
    href: "/acessos",
  },
};

export type Area = {
  id: AreaPortal;
  rotulo: string;
  descricao: string;
  href: string;
};

/** Todas as areas, na ordem em que aparecem no menu. */
export const AREAS_PORTAL: readonly Area[] = (Object.keys(CATALOGO) as AreaPortal[]).map((id) => ({
  id,
  ...CATALOGO[id],
}));

/** Mesma lista, no formato de tupla que o `z.enum` exige. */
export const IDS_AREAS = AREAS_PORTAL.map((area) => area.id) as [AreaPortal, ...AreaPortal[]];

export function rotuloDaArea(area: AreaPortal) {
  return CATALOGO[area].rotulo;
}

/** Estrutura minima para decidir acesso — evita depender do tipo da sessao. */
export type SujeitoDoAcesso = { perfil: PerfilUsuario; areas: readonly AreaPortal[] };

/**
 * Administrador enxerga tudo; qualquer outro usuario precisa da area concedida
 * explicitamente. E o unico privilegio implicito do sistema — nao ha perfis
 * intermediarios.
 */
export function podeAcessar(usuario: SujeitoDoAcesso, area: AreaPortal) {
  return usuario.perfil === "administrador" || usuario.areas.includes(area);
}

/** Areas que o usuario ve no menu e na home. */
export function areasVisiveis(usuario: SujeitoDoAcesso) {
  return AREAS_PORTAL.filter((area) => podeAcessar(usuario, area.id));
}
