"use server";

import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { freelancers, funcionarios, locais } from "@/db/schema";
import { exigirAcesso } from "@/features/auth/queries";
import { diaAnterior, ehDataValida, formatarData } from "@/features/competencias/periodo";
import { lerColaborador } from "@/features/extras/colaborador";

import { listarLancamentosDoDia } from "./queries";
import { AREA_EFETIVOS, type ItemDoRascunho, type RascunhoDaEquipe } from "./types";

/**
 * "Copiar da mesma equipe (D-2)": monta, **sem gravar nada**, o rascunho da
 * equipe de hoje a partir do posto dois dias atras. A maioria das escalas e
 * 12x36, e quem trabalhou anteontem trabalha hoje.
 *
 * Copia a equipe base — pessoa, local e horario — e nunca as excecoes:
 * - linha sem excecao: entra como esta;
 * - cobertura de falta: entra **quem faltou** (e da equipe; quem cobriu nao e),
 *   no local e no horario do turno coberto;
 * - falta sem cobertura: entra quem faltou, no turno que ficou descoberto;
 * - troca, dobra, folga trabalhada e os demais: ninguem entra — quem estava la
 *   estava por excecao. Vao na lista de ignorados, para a tela dizer o que nao
 *   veio.
 *
 * Quem ja esta lancado hoje no posto vem desmarcado; pessoa ou local
 * desativado depois de D-2 vem bloqueado. Confirmar e outra action
 * (`confirmarRascunho`), que confere tudo de novo.
 */
export async function montarRascunhoDaEquipe(
  data: string,
  postoId: string,
): Promise<RascunhoDaEquipe> {
  await exigirAcesso(AREA_EFETIVOS);

  if (!ehDataValida(data) || !z.uuid().safeParse(postoId).success) {
    return { ok: false, mensagem: "Escolha a data e o posto." };
  }

  const dataOrigem = diaAnterior(diaAnterior(data));
  const [deOrigem, deHoje] = await Promise.all([
    listarLancamentosDoDia(dataOrigem, postoId),
    listarLancamentosDoDia(data, postoId),
  ]);

  if (deOrigem.length === 0) {
    return {
      ok: false,
      mensagem: `Nenhum lancamento neste posto em ${formatarData(dataOrigem)} (D-2).`,
    };
  }

  const lancadasHoje = new Set(deHoje.map((linha) => linha.pessoa));
  const vistas = new Set<string>();
  const itens: Omit<ItemDoRascunho, "bloqueio">[] = [];
  const ignorados: { nome: string; tipo: string }[] = [];
  const dia = formatarData(dataOrigem).slice(0, 5);

  for (const linha of deOrigem) {
    const excecao = linha.excecao;
    let pessoa: { valor: string; nome: string } | null = null;
    let nota: string | null = null;

    if (!excecao) {
      pessoa = { valor: linha.pessoa, nome: linha.nome };
    } else if (excecao.comportamento === "falta_sem_cobertura") {
      pessoa = { valor: linha.pessoa, nome: linha.nome };
      nota = `Faltou em ${dia}`;
    } else if (excecao.comportamento === "cobertura" && excecao.contraparte) {
      pessoa = excecao.contraparte;
      nota = `Faltou em ${dia} (coberto por ${linha.nome})`;
      ignorados.push({ nome: linha.nome, tipo: excecao.tipo });
    } else {
      ignorados.push({ nome: linha.nome, tipo: excecao.tipo });
    }

    if (!pessoa || vistas.has(pessoa.valor)) {
      continue;
    }

    vistas.add(pessoa.valor);
    itens.push({
      chave: pessoa.valor,
      pessoa: pessoa.valor,
      nome: pessoa.nome,
      // A contraparte nao traz matricula na leitura do dia; a linha propria traz.
      identificacao: pessoa.valor === linha.pessoa ? linha.identificacao : null,
      freelancer: pessoa.valor.startsWith("l:"),
      localId: linha.localId,
      local: linha.local,
      entrada: linha.entrada,
      saida: linha.saida,
      viraODia: linha.viraODia,
      nota,
      jaLancada: lancadasHoje.has(pessoa.valor),
    });
  }

  // Quem foi desativado depois de D-2 nao pode ser lancado hoje: a tela mostra,
  // mas nao deixa marcar.
  const ids = (tipo: "funcionario" | "freelancer") =>
    itens.flatMap((item) => {
      const escolhido = lerColaborador(item.pessoa);
      return escolhido?.tipo === tipo ? [escolhido.id] : [];
    });
  const idsFuncionarios = ids("funcionario");
  const idsFreelancers = ids("freelancer");
  const idsLocais = [...new Set(itens.map((item) => item.localId))];

  const [funcionariosAtivos, freelancersAtivos, locaisAtivos] = await Promise.all([
    idsFuncionarios.length
      ? db
          .select({ id: funcionarios.id, ativo: funcionarios.ativo })
          .from(funcionarios)
          .where(inArray(funcionarios.id, idsFuncionarios))
      : [],
    idsFreelancers.length
      ? db
          .select({ id: freelancers.id, ativo: freelancers.ativo })
          .from(freelancers)
          .where(inArray(freelancers.id, idsFreelancers))
      : [],
    idsLocais.length
      ? db
          .select({ id: locais.id, ativo: locais.ativo })
          .from(locais)
          .where(inArray(locais.id, idsLocais))
      : [],
  ]);

  const ativas = new Set([
    ...funcionariosAtivos.filter((linha) => linha.ativo).map((linha) => `f:${linha.id}`),
    ...freelancersAtivos.filter((linha) => linha.ativo).map((linha) => `l:${linha.id}`),
  ]);
  const locaisOk = new Set(locaisAtivos.filter((linha) => linha.ativo).map((linha) => linha.id));

  return {
    ok: true,
    dataOrigem,
    itens: itens.map((item) => ({
      ...item,
      bloqueio: !ativas.has(item.pessoa)
        ? "Pessoa desativada"
        : !locaisOk.has(item.localId)
          ? "Local desativado"
          : null,
    })),
    ignorados,
  };
}
