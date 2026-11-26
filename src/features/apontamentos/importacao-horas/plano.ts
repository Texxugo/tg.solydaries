import type { LinhaRecusada } from "@/features/funcionarios/planilha";

import { chaveDoNome, type LinhaDeHoras } from "./leitura";

/**
 * O plano da importacao de horas: quem do arquivo e quem no cadastro, e o que
 * muda no apontamento de cada um.
 *
 * Modulo puro, chamado pela previa e pela gravacao — a mesma funcao, como em
 * `funcionarios/importacao.ts`: uma previa calculada por outro caminho nao
 * prometeria nada.
 *
 * **A pessoa e achada pelo nome**, porque e o que todo relatorio traz. O
 * casamento automatico e so o exato (`chaveDoNome()` dos dois lados) e com um
 * cadastro so. Quando o arquivo traz a **matricula**, ela tambem precisa bater:
 * desempata os homonimos do cadastro e barra o nome igual de outra pessoa (a
 * matricula se repete entre empresas, entao ela sozinha nao casa ninguem). Nome parecido nunca casa sozinho: "JESSICA
 * APARECIDA DOS SANTOS" e "JESSICA APARECIDA DOS SANTOS LIMA" podem ser a mesma
 * pessoa ou duas, e lancar horas extras na errada e pagar a quem nao fez. Os
 * parecidos viram **candidatos** para quem importa escolher.
 */

export type FuncionarioParaHoras = {
  id: string;
  nome: string;
  matricula: string;
  empresaNome: string;
  ativo: boolean;
};

/** HE 50% e HE 100% ja gravadas na competencia. Sem linha de apontamento, nao entra no mapa. */
export type HorasGravadas = { he50Minutos: number; he100Minutos: number };

/** As horas que o arquivo traz para um nome. `null` = a verba nao veio, e a coluna fica como esta. */
type HorasDoArquivo = { he50: number | null; he100: number | null };

export type Gravacao = HorasDoArquivo & {
  /** A identidade do arquivo (`LinhaDeHoras.identidade`): a chave da associacao, quando houver. */
  chave: string;
  funcionario: FuncionarioParaHoras;
  nomeNoArquivo: string;
  matriculaNoArquivo: string | null;
  linhas: number[];
  /** Casou por associacao escolhida na previa, e nao pelo nome exato. */
  associado: boolean;
  /** `null` quando a pessoa ainda nao tem apontamento na competencia. */
  gravado: HorasGravadas | null;
};

export type CandidatoDoNome = { id: string; nome: string; detalhe: string };

export type NomeSemCadastro = HorasDoArquivo & {
  /** A identidade do arquivo (`LinhaDeHoras.identidade`): e a chave da associacao no formulario. */
  chave: string;
  nomeNoArquivo: string;
  matriculaNoArquivo: string | null;
  linhas: number[];
  /**
   * `homonimos`: o nome (e a matricula, se veio) casa com mais de um cadastro.
   * `matricula_diferente`: o nome casa, mas a matricula do arquivo nao e a do
   * cadastro — pode ser outra pessoa com o mesmo nome.
   */
  motivo: "sem_cadastro" | "homonimos" | "matricula_diferente";
  candidatos: CandidatoDoNome[];
};

export type PlanoDeHoras = {
  /** Quem muda alguma coisa no apontamento. */
  gravar: Gravacao[];
  /** Quem ja esta com as mesmas horas gravadas. */
  semMudanca: Gravacao[];
  /** Nomes sem cadastro casado e sem associacao escolhida: ficam de fora. */
  semCadastro: NomeSemCadastro[];
  recusadas: LinhaRecusada[];
};

/** Palavras que nao ajudam a dizer se dois nomes sao a mesma pessoa. */
const CONECTIVOS = new Set(["DA", "DAS", "DE", "DO", "DOS", "E"]);

const CANDIDATOS_POR_NOME = 5;

function palavras(chave: string) {
  return chave.split(" ").filter((palavra) => !CONECTIVOS.has(palavra));
}

/** Distancia de edicao, limitada ao que interessa aqui: palavras curtas de nome. */
function distancia(a: string, b: string) {
  const anterior = Array.from({ length: b.length + 1 }, (_, indice) => indice);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = anterior[0];
    anterior[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const acima = anterior[j];
      anterior[j] = Math.min(
        anterior[j] + 1,
        anterior[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = acima;
    }
  }

  return anterior[b.length];
}

/**
 * Duas palavras de nome "iguais o bastante": a mesma, uma letra trocada
 * (DONIZETE/DONIZETI, TEREZA/TERESA) ou uma comeco da outra — o relatorio corta
 * o nome comprido no meio da palavra ("DA SILVA DE AL").
 */
function palavraParecida(a: string, b: string) {
  if (a === b) {
    return true;
  }

  if (Math.min(a.length, b.length) >= 4 && distancia(a, b) <= 1) {
    return true;
  }

  return a.length >= 2 && b.startsWith(a);
}

/**
 * Quao parecidos sao dois nomes, de 0 a 1: as palavras do menor que tem par no
 * maior, sobre o tamanho do maior. O primeiro nome precisa bater — sobrenome
 * igual com primeiro nome diferente e outra pessoa da mesma familia.
 */
function semelhanca(doArquivo: string, doCadastro: string) {
  const a = palavras(doArquivo);
  const b = palavras(doCadastro);

  if (a.length === 0 || b.length === 0 || !palavraParecida(a[0], b[0])) {
    return 0;
  }

  const livres = [...b];
  let pares = 0;

  for (const palavra of a) {
    const indice = livres.findIndex((outra) => palavraParecida(palavra, outra));

    if (indice >= 0) {
      pares += 1;
      livres.splice(indice, 1);
    }
  }

  return pares / Math.max(a.length, b.length);
}

export function detalheDoFuncionario(funcionario: FuncionarioParaHoras) {
  return [
    funcionario.empresaNome,
    `matricula ${funcionario.matricula}`,
    funcionario.ativo ? null : "inativo",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Os parecidos pelo nome; os de mesma matricula sobem para o topo da lista. */
function candidatosDoNome(
  chave: string,
  matricula: string | null,
  cadastro: readonly (FuncionarioParaHoras & { chave: string })[],
): CandidatoDoNome[] {
  const mesma = (funcionario: FuncionarioParaHoras) =>
    matricula !== null && funcionario.matricula === matricula ? 1 : 0;

  return cadastro
    .map((funcionario) => ({ funcionario, nota: semelhanca(chave, funcionario.chave) }))
    .filter(({ nota }) => nota >= 0.5)
    .sort(
      (a, b) =>
        mesma(b.funcionario) - mesma(a.funcionario) ||
        b.nota - a.nota ||
        a.funcionario.nome.localeCompare(b.funcionario.nome),
    )
    .slice(0, CANDIDATOS_POR_NOME)
    .map(({ funcionario }) => ({
      id: funcionario.id,
      nome: funcionario.nome,
      detalhe: detalheDoFuncionario(funcionario),
    }));
}

function mudaAlgo(horas: HorasDoArquivo, gravado: HorasGravadas | null) {
  return (
    (horas.he50 !== null && horas.he50 !== (gravado?.he50Minutos ?? 0)) ||
    (horas.he100 !== null && horas.he100 !== (gravado?.he100Minutos ?? 0))
  );
}

export function planejarHoras({
  linhas,
  funcionarios,
  gravadas,
  associacoes,
}: {
  linhas: readonly LinhaDeHoras[];
  funcionarios: readonly FuncionarioParaHoras[];
  gravadas: ReadonlyMap<string, HorasGravadas>;
  /**
   * Nome do arquivo (`chave`) -> funcionario, escolhidos na previa. Vale so
   * para nome que nao casou sozinho: o casamento exato e unico nao se troca
   * por um campo do formulario.
   */
  associacoes: ReadonlyMap<string, string>;
}): PlanoDeHoras {
  const cadastro = funcionarios.map((funcionario) => ({
    ...funcionario,
    chave: chaveDoNome(funcionario.nome),
  }));
  const porId = new Map(cadastro.map((funcionario) => [funcionario.id, funcionario]));
  const porNome = Map.groupBy(cadastro, (funcionario) => funcionario.chave);

  // Uma entrada por pessoa do arquivo (`identidade`), com as duas verbas juntas.
  const pessoas = new Map<
    string,
    HorasDoArquivo & { nome: string; chave: string; matricula: string | null; linhas: number[] }
  >();

  for (const linha of linhas) {
    const atual = pessoas.get(linha.identidade) ?? {
      nome: linha.nome,
      chave: linha.chave,
      matricula: linha.matricula,
      linhas: [],
      he50: null,
      he100: null,
    };

    atual.linhas.push(...linha.linhas);

    if (linha.verba === "150") atual.he50 = linha.minutos;
    else atual.he100 = linha.minutos;

    pessoas.set(linha.identidade, atual);
  }

  const resolvidas: Omit<Gravacao, "gravado">[] = [];
  const semCadastro: NomeSemCadastro[] = [];

  for (const [identidade, doArquivo] of pessoas) {
    const mesmoNome = porNome.get(doArquivo.chave) ?? [];
    // Com matricula no arquivo, o nome igual so vale com a matricula igual.
    const exatos =
      doArquivo.matricula === null
        ? mesmoNome
        : mesmoNome.filter((funcionario) => funcionario.matricula === doArquivo.matricula);
    const doArquivoNaGravacao = {
      chave: identidade,
      he50: doArquivo.he50,
      he100: doArquivo.he100,
      nomeNoArquivo: doArquivo.nome,
      matriculaNoArquivo: doArquivo.matricula,
      linhas: doArquivo.linhas.toSorted((a, b) => a - b),
    };

    if (exatos.length === 1) {
      resolvidas.push({ ...doArquivoNaGravacao, funcionario: exatos[0], associado: false });
      continue;
    }

    const escolhido = porId.get(associacoes.get(identidade) ?? "");

    if (escolhido) {
      resolvidas.push({ ...doArquivoNaGravacao, funcionario: escolhido, associado: true });
      continue;
    }

    semCadastro.push({
      ...doArquivoNaGravacao,
      motivo:
        exatos.length > 1
          ? "homonimos"
          : mesmoNome.length > 0
            ? "matricula_diferente"
            : "sem_cadastro",
      candidatos: candidatosDoNome(doArquivo.chave, doArquivo.matricula, cadastro),
    });
  }

  // Duas pessoas do arquivo no mesmo cadastro so acontece por associacao, e
  // uma das duas esta errada: nenhuma entra, em vez de uma sobrescrever a outra.
  const porFuncionario = Map.groupBy(resolvidas, (gravacao) => gravacao.funcionario.id);
  const recusadas: LinhaRecusada[] = [];
  const plano: PlanoDeHoras = { gravar: [], semMudanca: [], semCadastro, recusadas };

  for (const [funcionarioId, doFuncionario] of porFuncionario) {
    if (doFuncionario.length > 1) {
      for (const gravacao of doFuncionario) {
        for (const linha of gravacao.linhas) {
          recusadas.push({
            linha,
            identificacao: gravacao.nomeNoArquivo,
            motivo: `Mais de uma pessoa do arquivo ficou associada a ${gravacao.funcionario.nome}.`,
          });
        }
      }
      continue;
    }

    const gravacao = { ...doFuncionario[0], gravado: gravadas.get(funcionarioId) ?? null };

    (mudaAlgo(gravacao, gravacao.gravado) ? plano.gravar : plano.semMudanca).push(gravacao);
  }

  const porNomeDoArquivo = (a: { nomeNoArquivo: string }, b: { nomeNoArquivo: string }) =>
    a.nomeNoArquivo.localeCompare(b.nomeNoArquivo);

  plano.gravar.sort(porNomeDoArquivo);
  plano.semMudanca.sort(porNomeDoArquivo);
  plano.semCadastro.sort(porNomeDoArquivo);
  recusadas.sort((a, b) => a.linha - b.linha);

  return plano;
}
