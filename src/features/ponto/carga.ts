import type { LeituraDoPonto, LinhaRecusada } from "./relatorio";
import type { BatidaDoDia, CodigoDesconhecido, DiaAlterado, MatriculaNaoEncontrada } from "./types";

/**
 * O plano de uma carga de marcacoes: o que o arquivo faria com a competencia,
 * decidido antes de qualquer escrita.
 *
 * Modulo puro (so `import type`), e de proposito: a tela de importacao mostra a
 * previa e o botao de confirmar grava — e as duas passam por **esta** funcao.
 * Uma previa calculada por um caminho e uma gravacao por outro seria uma previa
 * que nao promete nada, que e pior do que nao ter previa. Mesmo arranjo de
 * `funcionarios/importacao.ts`.
 *
 * Por isso a confirmacao tambem reprocessa o arquivo em vez de receber de volta
 * o plano exibido: o que o cliente devolve nao e evidencia, e o cadastro pode
 * ter mudado entre uma tela e outra — e aqui isso e a regra, nao a excecao,
 * porque associar um codigo de empresa e justamente o que se faz entre as duas.
 */

/** Empresa do portal, com o codigo que ela tem no relogio de ponto. */
export type EmpresaConhecida = { id: string; nome: string; codigo: string | null };

/** Funcionario do portal, pela chave que o relatorio de ponto oferece. */
export type FuncionarioConhecido = { id: string; empresaId: string; matricula: string };

/** Uma batida pronta para virar linha. */
export type MarcacaoPlanejada = {
  funcionarioId: string;
  data: string;
  /** `HH:MM`. */
  hora: string;
  incluida: boolean;
};

/** Uma batida que ja esta no banco, como o plano precisa le-la. */
export type MarcacaoGravada = {
  funcionarioId: string;
  data: string;
  /** `HH:MM` ou `HH:MM:SS` (como o `time` do banco volta). */
  hora: string;
  incluida: boolean;
};

export type PlanoDaCarga = {
  /**
   * O periodo que o **arquivo** declara cobrir. Fica ao lado da janela, e nao
   * no lugar dela, porque os dois podem diferir: um relatorio que atravessa a
   * virada da competencia cobre dias que este periodo nao vai apurar, e a
   * previa precisa poder dizer isso em vez de fingir que o arquivo era menor.
   */
  periodoDoArquivo: { inicio: string; fim: string };
  /** O mesmo periodo ja recortado pela competencia — o que sera apurado. */
  janela: { inicio: string; fim: string };
  /** As batidas do arquivo que o banco ainda nao tem — o que entra nos dois modos. */
  aGravar: MarcacaoPlanejada[];
  /**
   * Todas as batidas do arquivo que tem destino (pessoa do cadastro, data da
   * competencia), novas ou nao. E o que a substituicao regrava depois de
   * esvaziar o recorte.
   */
  doArquivo: MarcacaoPlanejada[];
  /** Batidas do arquivo que ja estao no banco: reenviar o mesmo arquivo nao duplica. */
  jaGravadas: number;
  /** Quantas pessoas distintas o arquivo alcanca no cadastro. */
  funcionarios: number;
  /**
   * Quem o arquivo alcanca. Com `janela`, e o recorte da substituicao: estas
   * pessoas, nestas datas — e nunca a competencia inteira nem quem o arquivo
   * nao traz.
   */
  funcionariosAlcancados: string[];
  /**
   * Batidas do recorte que o portal tem e o arquivo nao traz. So a
   * substituicao as tira; acrescentando, elas ficam.
   */
  aRemover: number;
  /** Batidas na mesma hora nos dois lados, com a marca de incluida trocada. */
  comMarcaTrocada: number;
  /** Os dias do recorte em que portal e arquivo discordam, em qualquer sentido. */
  diasAlterados: DiaAlterado[];
  /** Batidas lidas do arquivo, antes de qualquer recusa. */
  marcacoesLidas: number;
  /** Quantas linhas o arquivo diz ter, no rodape. Confere a leitura. */
  registrosLidos: number;
  registrosDeclarados: number | null;
  /** Linhas cuja data cai fora da competencia em vigor. */
  foraDaCompetencia: number;
  codigosDesconhecidos: CodigoDesconhecido[];
  naoEncontrados: MatriculaNaoEncontrada[];
  recusadas: LinhaRecusada[];
};

/** A identidade de uma batida — a mesma do indice unico da tabela. */
export function chaveDaMarcacao(funcionarioId: string, data: string, hora: string) {
  return `${funcionarioId}|${data}|${hora.slice(0, 5)}`;
}

/** Matricula compara sem caixa, como o indice unico de `funcionarios` a ve. */
function chaveDaMatricula(empresaId: string, matricula: string) {
  return `${empresaId}|${matricula.trim().toLowerCase()}`;
}

/** Quantos nomes do bloco a previa mostra para quem confere reconhecer a empresa. */
const EXEMPLOS_POR_CODIGO = 3;

/**
 * Monta o plano.
 *
 * A identidade e o par **codigo da empresa + matricula**, e nao a matricula
 * sozinha: o codigo 1335 existe em duas empresas e sao duas pessoas. Como o
 * relatorio de ponto so traz o codigo do relogio e o da folha so traz a razao
 * social, a ponte entre os dois e `empresas.codigo` — e enquanto ela nao
 * existir, o bloco inteiro daquele codigo fica de fora, com o codigo listado
 * para ser associado.
 *
 * Nada e descartado em silencio: codigo sem empresa, matricula sem cadastro e
 * data fora da competencia viram numero e amostra na previa, e as outras linhas
 * entram normalmente. Uma carga de trezentas pessoas nao cai inteira porque
 * alguem foi demitido e saiu do cadastro.
 *
 * O plano descreve tambem a **substituicao**: o que o portal tem e o arquivo
 * nao traz, no recorte que o arquivo cobre (as pessoas que ele alcanca, nas
 * datas da janela). Acrescentar nunca enxerga isso — e e por isso que um
 * relatorio corrigido no relogio, que so tirou uma batida errada, parecia "sem
 * nada novo". O recorte e por pessoa e por **janela**, e nao pelos pares
 * pessoa/dia que tem linha: o relatorio nao escreve dia sem batida, entao o dia
 * que a correcao esvaziou nao teria linha nenhuma para ser alcancado.
 */
export function planejarCarga(
  leitura: LeituraDoPonto,
  competencia: { dataInicio: string; dataFim: string },
  periodoDoArquivo: { inicio: string; fim: string },
  janela: { inicio: string; fim: string },
  empresas: readonly EmpresaConhecida[],
  cadastrados: readonly FuncionarioConhecido[],
  gravadas: readonly MarcacaoGravada[],
): PlanoDaCarga {
  const jaNoBanco = new Set(
    gravadas.map((linha) => chaveDaMarcacao(linha.funcionarioId, linha.data, linha.hora)),
  );
  const empresaPorCodigo = new Map(
    empresas
      .filter((empresa) => empresa.codigo)
      .map((empresa) => [empresa.codigo!.trim().toLowerCase(), empresa]),
  );
  const funcionarioPorMatricula = new Map(
    cadastrados.map((funcionario) => [
      chaveDaMatricula(funcionario.empresaId, funcionario.matricula),
      funcionario,
    ]),
  );

  const desconhecidos = new Map<string, CodigoDesconhecido>();
  const naoEncontrados = new Map<string, MatriculaNaoEncontrada>();
  const alcancados = new Set<string>();
  const aGravar: MarcacaoPlanejada[] = [];
  const doArquivo: MarcacaoPlanejada[] = [];
  /** Como o relogio chama cada pessoa alcancada, para a amostra dos dias. */
  const identificacao = new Map<string, { nome: string; matricula: string }>();
  /** As batidas do arquivo no recorte, por pessoa e dia. */
  const arquivoPorDia = new Map<string, Map<string, boolean>>();

  let marcacoesLidas = 0;
  let jaGravadas = 0;
  let foraDaCompetencia = 0;

  for (const registro of leitura.registros) {
    marcacoesLidas += registro.batidas.length;

    const empresa = empresaPorCodigo.get(registro.codigoEmpresa.trim().toLowerCase());

    if (!empresa) {
      const atual = desconhecidos.get(registro.codigoEmpresa) ?? {
        codigo: registro.codigoEmpresa,
        linhas: 0,
        exemplos: [],
      };

      atual.linhas += 1;

      if (atual.exemplos.length < EXEMPLOS_POR_CODIGO && !atual.exemplos.includes(registro.nome)) {
        atual.exemplos.push(registro.nome);
      }

      desconhecidos.set(registro.codigoEmpresa, atual);
      continue;
    }

    const funcionario = funcionarioPorMatricula.get(
      chaveDaMatricula(empresa.id, registro.matricula),
    );

    if (!funcionario) {
      const chave = `${empresa.id}|${registro.matricula.toLowerCase()}`;
      const atual = naoEncontrados.get(chave) ?? {
        codigo: registro.codigoEmpresa,
        empresa: empresa.nome,
        matricula: registro.matricula,
        nome: registro.nome,
        dias: 0,
      };

      atual.dias += 1;
      naoEncontrados.set(chave, atual);
      continue;
    }

    /**
     * Data fora da competencia nao entra. A marcacao pertence ao periodo em que
     * o dia caiu, e nao ao periodo aberto quando alguem clicou em enviar:
     * gravar o dia 21/09 dentro de agosto o esconderia de setembro para sempre,
     * porque o indice unico impediria a carga seguinte de traze-lo de volta.
     */
    if (registro.data < competencia.dataInicio || registro.data > competencia.dataFim) {
      foraDaCompetencia += 1;
      continue;
    }

    alcancados.add(funcionario.id);

    if (!identificacao.has(funcionario.id)) {
      identificacao.set(funcionario.id, { nome: registro.nome, matricula: registro.matricula });
    }

    const noRecorte = registro.data >= janela.inicio && registro.data <= janela.fim;
    const chaveDoDia = `${funcionario.id}|${registro.data}`;
    const doDia = arquivoPorDia.get(chaveDoDia) ?? new Map<string, boolean>();

    for (const batida of registro.batidas) {
      const planejada = {
        funcionarioId: funcionario.id,
        data: registro.data,
        hora: batida.hora,
        incluida: batida.incluida,
      };

      if (noRecorte) {
        doDia.set(batida.hora, batida.incluida);
      }

      doArquivo.push(planejada);

      if (jaNoBanco.has(chaveDaMarcacao(funcionario.id, registro.data, batida.hora))) {
        jaGravadas += 1;
        continue;
      }

      aGravar.push(planejada);
    }

    if (noRecorte) {
      arquivoPorDia.set(chaveDoDia, doDia);
    }
  }

  /**
   * O lado do portal, so no recorte: quem o arquivo alcanca, nas datas da
   * janela. Batida de quem o arquivo nao traz, ou de dia fora da janela, nao e
   * comparada — a substituicao nao vai toca-la.
   */
  const portalPorDia = new Map<string, Map<string, boolean>>();

  for (const linha of gravadas) {
    if (
      !alcancados.has(linha.funcionarioId) ||
      linha.data < janela.inicio ||
      linha.data > janela.fim
    ) {
      continue;
    }

    const chaveDoDia = `${linha.funcionarioId}|${linha.data}`;
    const doDia = portalPorDia.get(chaveDoDia) ?? new Map<string, boolean>();

    doDia.set(linha.hora.slice(0, 5), linha.incluida);
    portalPorDia.set(chaveDoDia, doDia);
  }

  let aRemover = 0;
  let comMarcaTrocada = 0;
  const diasAlterados: DiaAlterado[] = [];

  for (const chaveDoDia of new Set([...arquivoPorDia.keys(), ...portalPorDia.keys()])) {
    const noArquivo = arquivoPorDia.get(chaveDoDia) ?? new Map<string, boolean>();
    const noPortal = portalPorDia.get(chaveDoDia) ?? new Map<string, boolean>();
    let difere = false;

    for (const [hora, incluida] of noPortal) {
      const doArquivoNaHora = noArquivo.get(hora);

      if (doArquivoNaHora === undefined) {
        aRemover += 1;
        difere = true;
      } else if (doArquivoNaHora !== incluida) {
        comMarcaTrocada += 1;
        difere = true;
      }
    }

    for (const hora of noArquivo.keys()) {
      if (!noPortal.has(hora)) {
        difere = true;
      }
    }

    if (!difere) {
      continue;
    }

    const [funcionarioId, data] = chaveDoDia.split("|");
    const pessoa = identificacao.get(funcionarioId)!;

    diasAlterados.push({
      funcionarioId,
      nome: pessoa.nome,
      matricula: pessoa.matricula,
      data,
      noPortal: emOrdem(noPortal),
      noArquivo: emOrdem(noArquivo),
    });
  }

  diasAlterados.sort((a, b) => a.nome.localeCompare(b.nome) || a.data.localeCompare(b.data));

  return {
    periodoDoArquivo,
    janela,
    registrosLidos: leitura.registros.length,
    registrosDeclarados: leitura.totalDeclarado,
    aGravar,
    doArquivo,
    jaGravadas,
    funcionarios: alcancados.size,
    funcionariosAlcancados: [...alcancados],
    aRemover,
    comMarcaTrocada,
    diasAlterados,
    marcacoesLidas,
    foraDaCompetencia,
    codigosDesconhecidos: [...desconhecidos.values()].sort((a, b) =>
      a.codigo.localeCompare(b.codigo),
    ),
    naoEncontrados: [...naoEncontrados.values()].sort((a, b) => b.dias - a.dias),
    recusadas: [...leitura.recusadas],
  };
}

/** As batidas de um dia, em ordem de hora. */
function emOrdem(batidas: ReadonlyMap<string, boolean>): BatidaDoDia[] {
  return [...batidas]
    .map(([hora, incluida]) => ({ hora, incluida }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

/**
 * A substituicao so faz sentido quando tira ou troca alguma coisa. Se o arquivo
 * so acrescenta, substituir e acrescentar dao o mesmo resultado, e a tela
 * oferece so o caminho de sempre.
 */
export function substituicaoMudaAlgo(plano: Pick<PlanoDaCarga, "aRemover" | "comMarcaTrocada">) {
  return plano.aRemover + plano.comMarcaTrocada > 0;
}

/**
 * A intersecao entre o periodo do arquivo e a competencia — o que sera de fato
 * apurado. `null` quando os dois nao se tocam: um relatorio de julho enviado
 * numa competencia de setembro nao tem um so dia a apurar, e aceita-lo gravaria
 * uma janela que nao cobre nada.
 */
export function recortarPeriodo(
  periodo: { inicio: string; fim: string },
  competencia: { dataInicio: string; dataFim: string },
) {
  const inicio = periodo.inicio < competencia.dataInicio ? competencia.dataInicio : periodo.inicio;
  const fim = periodo.fim > competencia.dataFim ? competencia.dataFim : periodo.fim;

  return inicio <= fim ? { inicio, fim } : null;
}
