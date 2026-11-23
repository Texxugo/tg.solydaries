import {
  ArrowLeftRight,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  CircleAlert,
  ClipboardPenLine,
  KeyRound,
  LayoutList,
  MapPin,
  Tags,
  UserCheck,
  Timer,
  Table2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { AreaPortal } from "@/db/schema";

import type { ModuloPortal } from "./modulos";

/**
 * Icone de cada modulo e de cada area. Fica separado dos catalogos porque
 * `areas.ts` e `modulos.ts` sao modulos puros — a DAL importa o primeiro e nao
 * deve arrastar componentes React junto.
 *
 * Os `Record<...>` garantem que um modulo ou uma area nova nao passe
 * despercebido no typecheck.
 */
export const iconesDeModulo: Record<ModuloPortal, LucideIcon> = {
  gestao: LayoutList,
  operacao: Workflow,
};

export const iconesDeArea: Record<AreaPortal, LucideIcon> = {
  competencias: CalendarRange,
  escalas: CalendarClock,
  funcionarios: Users,
  ponto: ClipboardCheck,
  apontamentos: ClipboardPenLine,
  postos: MapPin,
  eventos: Tags,
  efetivos: UserCheck,
  preenchimento: Table2,
  extras: Timer,
  movimentacoes: ArrowLeftRight,
  sinalizacoes: CircleAlert,
  acessos: KeyRound,
};
