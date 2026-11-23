"use client";

import { LoaderCircle, Plus, Save, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useActionState,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { diaDaSemana } from "@/features/competencias/periodo";
import { salvarLancamento } from "@/features/efetivos/actions";
import {
  CaixaDeBusca,
  normalizarBusca as normalizar,
  type OpcaoDaBusca,
} from "@/features/efetivos/components/caixa-de-busca";
import {
  CampoPessoaDoEfetivo,
  type PessoaEscolhida,
} from "@/features/efetivos/components/campo-pessoa-do-efetivo";
import { AvisoDeConflito } from "@/features/efetivos/components/aviso-de-conflito";
import { CopiarD2 } from "@/features/efetivos/components/copiar-d2";
import { ListaDoDia } from "@/features/efetivos/components/lista-do-dia";
import { interpretarHora } from "@/features/efetivos/horario";
import {
  ROTA_EFETIVOS,
  estadoInicialLancamento,
  type CamposDoLancamento,
  type LancamentoDoDia,
  type LancamentoState,
  type LocalDoPosto,
  type PostoDoLancamento,
  type TipoDoLancamento,
} from "@/features/efetivos/types";
import { duracaoEmMinutos, formatarDuracao, temViradaDeTurno } from "@/features/escalas/jornada";

type Erros = Partial<Record<CamposDoLancamento, string>>;

/** A ordem dos campos na tela: o primeiro com erro recebe o foco. */
const ORDEM_DOS_CAMPOS = [
  "postoId",
  "pessoa",
  "localId",
  "entrada",
  "saida",
  "tipoId",
  "contraparte",
  "postoOrigemId",
  "observacao",
] as const;

function rotuloDoPosto(posto: PostoDoLancamento) {
  return `${posto.codigo} — ${posto.nome}`;
}

/**
 * O lancamento do efetivo de um posto num dia, e a lista do que ja foi lancado.
 *
 * O fluxo e de teclado, na ordem da tela: data, posto, pessoa, local, entrada,
 * saida, Enter — e, quando o dia teve algo fora do normal, a caixa Excecao
 * (Espaco) antes do Enter, com o tipo e o que ele pede. Cada escolha leva o foco ao campo seguinte; depois de
 * adicionar, data e posto ficam e o foco volta para a pessoa — o posto inteiro
 * se lanca em sequencia sem tocar no mouse.
 *
 * Data e posto moram tambem na URL (`?data=&posto=`): sao eles que decidem a
 * lista e a ordem dos locais, que o servidor le, e recarregar a pagina nao pode
 * perder onde se estava.
 */
export function LancamentoEfetivo({
  data: dataDaUrl,
  postoId: postoDaUrl,
  postos,
  locais,
  tipos,
  lancamentos,
}: {
  data: string;
  postoId: string | null;
  postos: PostoDoLancamento[];
  locais: LocalDoPosto[];
  tipos: TipoDoLancamento[];
  lancamentos: LancamentoDoDia[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, iniciarNavegacao] = useTransition();
  const [, iniciarEnvio] = useTransition();

  // --- data e posto -------------------------------------------------------
  const [data, setData] = useState(dataDaUrl);
  const [postoId, setPostoId] = useState(postoDaUrl);
  const [postoTexto, setPostoTexto] = useState(() => {
    const posto = postos.find((item) => item.id === postoDaUrl);
    return posto ? rotuloDoPosto(posto) : "";
  });

  /*
    A URL pode mudar por fora (o link do menu, o voltar do navegador). Quando
    muda para algo diferente do que esta tela escolheu, o estado segue a URL —
    ajustado no render, e nao num efeito, como o modulo aberto do menu lateral.
  */
  const [urlVista, setUrlVista] = useState({ data: dataDaUrl, postoId: postoDaUrl });

  if (urlVista.data !== dataDaUrl || urlVista.postoId !== postoDaUrl) {
    setUrlVista({ data: dataDaUrl, postoId: postoDaUrl });

    if (dataDaUrl !== data) {
      setData(dataDaUrl);
    }

    if (postoDaUrl !== postoId) {
      const posto = postos.find((item) => item.id === postoDaUrl);
      setPostoId(postoDaUrl);
      setPostoTexto(posto ? rotuloDoPosto(posto) : "");
    }
  }

  function irPara(proximaData: string, proximoPosto: string | null) {
    const parametros = new URLSearchParams({ data: proximaData });

    if (proximoPosto) {
      parametros.set("posto", proximoPosto);
    }

    iniciarNavegacao(() => {
      router.replace(`${pathname ?? ROTA_EFETIVOS}?${parametros}`, { scroll: false });
    });
  }

  // --- os campos do lancamento --------------------------------------------
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [pessoaTexto, setPessoaTexto] = useState("");
  const [pessoa, setPessoa] = useState<PessoaEscolhida | null>(null);
  const [localTexto, setLocalTexto] = useState("");
  const [localId, setLocalId] = useState<string | null>(null);
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [erros, setErros] = useState<Erros>({});

  // A excecao do dia. Desmarcada a caixa, nada daqui vai para o servidor.
  const [excecao, setExcecao] = useState(false);
  const [tipoId, setTipoId] = useState("");
  const [contraparteTexto, setContraparteTexto] = useState("");
  const [contraparte, setContraparte] = useState<PessoaEscolhida | null>(null);
  const [origemTexto, setOrigemTexto] = useState("");
  const [origemId, setOrigemId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");

  /** Conflito de horario devolvido pela action, esperando a decisao. */
  const [conflitos, setConflitos] = useState<string[] | null>(null);
  /** O ultimo envio, para "Lancar mesmo assim" reenviar exatamente o mesmo. */
  const ultimoEnvio = useRef<FormData | null>(null);

  const campoPosto = useRef<HTMLInputElement>(null);
  const campoPessoa = useRef<HTMLInputElement>(null);
  const campoLocal = useRef<HTMLInputElement>(null);
  const campoEntrada = useRef<HTMLInputElement>(null);
  const campoSaida = useRef<HTMLInputElement>(null);
  const campoTipo = useRef<HTMLSelectElement>(null);
  const campoContraparte = useRef<HTMLInputElement>(null);
  const campoOrigem = useRef<HTMLInputElement>(null);
  const campoObservacao = useRef<HTMLInputElement>(null);

  const alvos: Record<(typeof ORDEM_DOS_CAMPOS)[number], RefObject<HTMLElement | null>> = {
    postoId: campoPosto,
    pessoa: campoPessoa,
    localId: campoLocal,
    entrada: campoEntrada,
    saida: campoSaida,
    tipoId: campoTipo,
    contraparte: campoContraparte,
    postoOrigemId: campoOrigem,
    observacao: campoObservacao,
  };

  /**
   * Leva o foco ao campo seguinte **na hora**, e nao no proximo quadro: quem
   * digita rapido ja esta na tecla seguinte, e o "07" da entrada cairia no campo
   * do local. Todos os campos existem desde o primeiro render, entao nao ha o
   * que esperar.
   */
  function focar(campo: RefObject<HTMLElement | null>) {
    campo.current?.focus();
  }

  function limparCampos() {
    setEditandoId(null);
    setPessoaTexto("");
    setPessoa(null);
    setLocalTexto("");
    setLocalId(null);
    setEntrada("");
    setSaida("");
    setTocados({ entrada: false, saida: false });
    limparExcecao();
    setExcecao(false);
    setErros({});
  }

  /** Os campos que dependem do tipo: trocar de tipo comeca do zero. */
  function limparExcecao() {
    setTipoId("");
    setContraparteTexto("");
    setContraparte(null);
    setOrigemTexto("");
    setOrigemId(null);
    setObservacao("");
  }

  function escolherPessoa(escolhida: PessoaEscolhida) {
    setPessoa(escolhida);
    setPessoaTexto(escolhida.nome);
    setErros((atuais) => ({ ...atuais, pessoa: undefined }));
    focar(campoLocal);
  }

  // --- posto e local (listas que ja vieram com a pagina) -------------------
  const postoSelecionado = postos.find((item) => item.id === postoId) ?? null;
  const filtroPosto =
    postoSelecionado && postoTexto === rotuloDoPosto(postoSelecionado)
      ? ""
      : normalizar(postoTexto);
  const opcoesDePosto: OpcaoDaBusca[] = postos
    .filter(
      (item) =>
        !filtroPosto ||
        normalizar(item.codigo).includes(filtroPosto) ||
        normalizar(item.nome).includes(filtroPosto),
    )
    .map((item) => ({ valor: item.id, rotulo: item.codigo, detalhe: item.nome }));

  function escolherPosto(opcao: OpcaoDaBusca) {
    const posto = postos.find((item) => item.id === opcao.valor);

    if (!posto) {
      return;
    }

    setPostoTexto(rotuloDoPosto(posto));
    setErros((atuais) => ({ ...atuais, postoId: undefined }));

    if (posto.id !== postoId) {
      // Outro posto, outra lista: o que estava sendo editado era do anterior.
      setPostoId(posto.id);
      limparCampos();
      irPara(data, posto.id);
    }

    focar(campoPessoa);
  }

  const localSelecionado = locais.find((item) => item.id === localId) ?? null;
  const filtroLocal =
    localSelecionado && localTexto === localSelecionado.nome ? "" : normalizar(localTexto);
  const opcoesDeLocal: OpcaoDaBusca[] = locais
    .filter((item) => !filtroLocal || normalizar(item.nome).includes(filtroLocal))
    .map((item) => ({
      valor: item.id,
      rotulo: item.nome,
      detalhe: item.usos > 0 ? `${item.usos}x neste posto` : null,
    }));

  function escolherLocal(opcao: OpcaoDaBusca) {
    setLocalId(opcao.valor);
    setLocalTexto(opcao.rotulo);
    setErros((atuais) => ({ ...atuais, localId: undefined }));
    focar(campoEntrada);
  }

  // --- horario ------------------------------------------------------------
  /** Campos de horario que ja perderam o foco: so eles mostram "Horario invalido". */
  const [tocados, setTocados] = useState({ entrada: false, saida: false });

  /**
   * Ao sair do campo, "0730" vira "07:30"; o que nao e hora fica como esta.
   *
   * Le o estado, e nao o DOM (`evento.target.value`): depois de adicionar, o foco
   * salta para a pessoa **antes** de o React redesenhar os campos limpos, e o
   * `blur` da saida ainda veria o "19" no DOM — e o escreveria de volta.
   */
  function normalizarHora(campo: "entrada" | "saida") {
    (campo === "entrada" ? setEntrada : setSaida)((atual) => interpretarHora(atual) ?? atual);
    setTocados((atuais) => ({ ...atuais, [campo]: true }));
  }

  const entradaLida = interpretarHora(entrada);
  const saidaLida = interpretarHora(saida);
  const turno =
    entradaLida && saidaLida && entradaLida !== saidaLida
      ? {
          duracao: formatarDuracao(duracaoEmMinutos(entradaLida, saidaLida)),
          viraODia: temViradaDeTurno(entradaLida, saidaLida),
        }
      : null;
  const erroEntrada =
    erros.entrada ??
    (tocados.entrada && entrada.trim() && !entradaLida ? "Horario invalido" : undefined);
  const erroSaida =
    erros.saida ?? (tocados.saida && saida.trim() && !saidaLida ? "Horario invalido" : undefined);

  // --- excecao ------------------------------------------------------------
  const tipo = tipos.find((item) => item.id === tipoId) ?? null;
  const comportamento = excecao ? (tipo?.comportamento ?? null) : null;
  const pedeContraparte = comportamento === "cobertura" || comportamento === "troca";
  const pedeOrigem = comportamento === "troca";

  const origemSelecionada = postos.find((item) => item.id === origemId) ?? null;
  const filtroOrigem =
    origemSelecionada && origemTexto === rotuloDoPosto(origemSelecionada)
      ? ""
      : normalizar(origemTexto);
  const opcoesDeOrigem: OpcaoDaBusca[] = postos
    .filter((item) => item.id !== postoId)
    .filter(
      (item) =>
        !filtroOrigem ||
        normalizar(item.codigo).includes(filtroOrigem) ||
        normalizar(item.nome).includes(filtroOrigem),
    )
    .map((item) => ({ valor: item.id, rotulo: item.codigo, detalhe: item.nome }));

  /**
   * Marcar a caixa leva o foco ao tipo. `flushSync` porque o `<select>` so
   * existe depois do render: sem ele o foco iria para um campo que ainda nao
   * esta na tela.
   */
  function alternarExcecao(marcada: boolean) {
    flushSync(() => {
      setExcecao(marcada);
      setErros((atuais) => ({
        ...atuais,
        tipoId: undefined,
        contraparte: undefined,
        postoOrigemId: undefined,
        observacao: undefined,
      }));

      if (!marcada) {
        limparExcecao();
      }
    });

    if (marcada) {
      focar(campoTipo);
    }
  }

  /**
   * Enter na caixa ou no select adiciona, como nos campos de texto. Nenhum dos
   * dois envia o formulario sozinho: o checkbox do Radix engole o Enter, e o
   * `<select>` nao tem envio implicito.
   */
  function enviarComEnter(evento: KeyboardEvent<HTMLElement>) {
    if (evento.key === "Enter") {
      evento.preventDefault();
      evento.currentTarget.closest("form")?.requestSubmit();
    }
  }

  // --- envio --------------------------------------------------------------
  const [, enviar, enviando] = useActionState(
    async (anterior: LancamentoState, formData: FormData) => {
      const resultado = await salvarLancamento(anterior, formData);

      if (resultado.status === "success") {
        toast.success(resultado.mensagem);
        setConflitos(null);
        limparCampos();
        focar(campoPessoa);
      } else if (resultado.conflitos) {
        setConflitos(resultado.conflitos);
      } else if (resultado.erros) {
        const recebidos = Object.fromEntries(
          Object.entries(resultado.erros).map(([campo, mensagens]) => [campo, mensagens?.[0]]),
        ) as Erros;
        setErros(recebidos);

        const primeiro = ORDEM_DOS_CAMPOS.find((campo) => recebidos[campo]);

        if (primeiro) {
          focar(alvos[primeiro]);
        }
      } else {
        toast.error(resultado.mensagem);
      }

      return resultado;
    },
    estadoInicialLancamento,
  );

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    // A mesma conferencia da action, para nao gastar uma ida ao servidor com o
    // obvio — e para levar o foco ao primeiro campo que falta.
    const faltando: Erros = {};

    if (!postoId) faltando.postoId = "Escolha o posto";
    if (!pessoa) faltando.pessoa = "Escolha a pessoa";
    if (!localId) faltando.localId = "Escolha o local";
    if (!entradaLida) faltando.entrada = entrada.trim() ? "Horario invalido" : "Informe a entrada";
    if (!saidaLida) faltando.saida = saida.trim() ? "Horario invalido" : "Informe a saida";
    if (entradaLida && saidaLida && entradaLida === saidaLida) {
      faltando.saida = "A saida nao pode ser igual a entrada";
    }

    if (excecao) {
      if (!tipo) {
        faltando.tipoId = "Escolha o tipo de excecao";
      } else if (comportamento === "cobertura" && !contraparte) {
        faltando.contraparte = contraparteTexto.trim()
          ? "Escolha quem faltou na lista"
          : "Informe quem faltou";
      } else if (comportamento === "troca" && !contraparte && !origemId) {
        faltando.contraparte = "Informe com quem trocou ou de qual posto veio";
      }

      if (pedeContraparte && contraparte && pessoa && contraparte.valor === pessoa.valor) {
        faltando.contraparte =
          comportamento === "cobertura"
            ? "Quem faltou nao pode ser quem esta cobrindo"
            : "A pessoa nao pode trocar com ela mesma";
      }
    }

    const primeiro = ORDEM_DOS_CAMPOS.find((campo) => faltando[campo]);

    if (primeiro) {
      setErros(faltando);
      focar(alvos[primeiro]);
      return;
    }

    if (entradaLida) setEntrada(entradaLida);
    if (saidaLida) setSaida(saidaLida);

    const formData = new FormData();
    formData.set("id", editandoId ?? "");
    formData.set("data", data);
    formData.set("postoId", postoId ?? "");
    formData.set("pessoa", pessoa?.valor ?? "");
    formData.set("localId", localId ?? "");
    formData.set("entrada", entradaLida ?? "");
    formData.set("saida", saidaLida ?? "");
    formData.set("excecao", excecao ? "1" : "");

    if (excecao) {
      formData.set("tipoId", tipoId);
      formData.set("contraparte", pedeContraparte ? (contraparte?.valor ?? "") : "");
      formData.set("postoOrigemId", pedeOrigem ? (origemId ?? "") : "");
      formData.set("observacao", observacao);
    }

    setConflitos(null);
    ultimoEnvio.current = formData;
    iniciarEnvio(() => enviar(formData));
  }

  function confirmarConflito() {
    const anterior = ultimoEnvio.current;

    if (!anterior) {
      return;
    }

    const formData = new FormData();
    anterior.forEach((valor, chave) => formData.set(chave, valor));
    formData.set("confirmarConflito", "1");
    iniciarEnvio(() => enviar(formData));
  }

  function corrigirConflito() {
    setConflitos(null);
    focar(campoEntrada);
  }

  function editar(lancamento: LancamentoDoDia) {
    setEditandoId(lancamento.id);
    setPessoa({ valor: lancamento.pessoa, nome: lancamento.nome });
    setPessoaTexto(lancamento.nome);
    setLocalId(lancamento.localId);
    setLocalTexto(lancamento.local);
    setEntrada(lancamento.entrada);
    setSaida(lancamento.saida);
    setTocados({ entrada: false, saida: false });

    const doDia = lancamento.excecao;
    setExcecao(Boolean(doDia));
    setTipoId(doDia?.tipoId ?? "");
    setContraparte(doDia?.contraparte ?? null);
    setContraparteTexto(doDia?.contraparte?.nome ?? "");
    setOrigemId(doDia?.postoOrigem?.id ?? null);
    setOrigemTexto(
      doDia?.postoOrigem
        ? rotuloDoPosto(
            postos.find((item) => item.id === doDia.postoOrigem?.id) ?? {
              id: doDia.postoOrigem.id,
              codigo: doDia.postoOrigem.codigo,
              nome: "inativo",
            },
          )
        : "",
    );
    setObservacao(doDia?.observacao ?? "");
    setErros({});
    focar(campoPessoa);
  }

  function cancelarEdicao() {
    limparCampos();
    focar(campoPessoa);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={aoEnviar}
        onKeyDown={(evento) => {
          if (evento.key === "Escape" && editandoId) {
            cancelarEdicao();
          }
        }}
        className="bg-card space-y-4 rounded-xl border p-4"
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
          <Campo id="efetivo-data" rotulo="Data" erro={erros.data}>
            <div className="flex items-center gap-2">
              <Input
                id="efetivo-data"
                type="date"
                value={data}
                onChange={(evento) => {
                  const nova = evento.target.value;

                  if (!nova) {
                    return;
                  }

                  setData(nova);
                  limparCampos();
                  irPara(nova, postoId);
                }}
                required
              />
              <span className="text-muted-foreground w-8 shrink-0 text-sm">
                {diaDaSemana(data)}
              </span>
            </div>
          </Campo>

          <Campo id="efetivo-posto" rotulo="Posto" erro={erros.postoId}>
            <CaixaDeBusca
              ref={campoPosto}
              id="efetivo-posto"
              texto={postoTexto}
              aoDigitar={setPostoTexto}
              opcoes={opcoesDePosto}
              aoEscolher={escolherPosto}
              aviso={opcoesDePosto.length === 0 ? "Nenhum posto ativo com este codigo" : null}
              abrirAoFocar
              placeholder="Codigo ou nome do posto"
              invalido={Boolean(erros.postoId)}
              descritoPor={erros.postoId ? "efetivo-posto-erro" : undefined}
              autoFocus={!postoDaUrl}
            />
          </Campo>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_7rem_7rem]">
          <Campo
            id="efetivo-pessoa"
            rotulo={editandoId ? "Funcionario (editando)" : "Funcionario"}
            erro={erros.pessoa}
          >
            <CampoPessoaDoEfetivo
              ref={campoPessoa}
              id="efetivo-pessoa"
              texto={pessoaTexto}
              pessoa={pessoa}
              aoDigitar={(texto) => {
                setPessoaTexto(texto);
                setPessoa(null);
              }}
              aoEscolher={escolherPessoa}
              aoErro={(mensagem) => {
                setErros((atuais) => ({ ...atuais, pessoa: mensagem }));
                focar(campoPessoa);
              }}
              permitirFreelancer
              invalido={Boolean(erros.pessoa)}
              descritoPor={erros.pessoa ? "efetivo-pessoa-erro" : undefined}
              autoFocus={Boolean(postoDaUrl)}
            />
          </Campo>

          <Campo id="efetivo-local" rotulo="Local" erro={erros.localId}>
            <CaixaDeBusca
              ref={campoLocal}
              id="efetivo-local"
              texto={localTexto}
              aoDigitar={(texto) => {
                setLocalTexto(texto);
                setLocalId(null);
              }}
              opcoes={opcoesDeLocal}
              aoEscolher={escolherLocal}
              aviso={opcoesDeLocal.length === 0 ? "Nenhum local ativo com este nome" : null}
              abrirAoFocar
              placeholder="Portaria, Ronda..."
              invalido={Boolean(erros.localId)}
              descritoPor={erros.localId ? "efetivo-local-erro" : undefined}
            />
          </Campo>

          <Campo id="efetivo-entrada" rotulo="Entrada" erro={erroEntrada}>
            <Input
              ref={campoEntrada}
              id="efetivo-entrada"
              value={entrada}
              onChange={(evento) => {
                setEntrada(evento.target.value);
                setErros((atuais) => ({ ...atuais, entrada: undefined }));
              }}
              onBlur={() => normalizarHora("entrada")}
              onFocus={(evento) => evento.target.select()}
              placeholder="07"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(erroEntrada)}
              aria-describedby={erroEntrada ? "efetivo-entrada-erro" : undefined}
            />
          </Campo>

          <Campo id="efetivo-saida" rotulo="Saida" erro={erroSaida}>
            <Input
              ref={campoSaida}
              id="efetivo-saida"
              value={saida}
              onChange={(evento) => {
                setSaida(evento.target.value);
                setErros((atuais) => ({ ...atuais, saida: undefined }));
              }}
              onBlur={() => normalizarHora("saida")}
              onFocus={(evento) => evento.target.select()}
              placeholder="19"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(erroSaida)}
              aria-describedby={erroSaida ? "efetivo-saida-erro" : undefined}
            />
          </Campo>
        </div>

        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="flex h-8 items-center gap-2 pt-6">
            <Checkbox
              id="efetivo-excecao"
              checked={excecao}
              onCheckedChange={(marcada) => alternarExcecao(marcada === true)}
              onKeyDown={enviarComEnter}
            />
            <Label htmlFor="efetivo-excecao">Excecao</Label>
          </div>

          {excecao ? (
            <>
              <div className="w-56">
                <Campo id="efetivo-tipo" rotulo="Tipo" erro={erros.tipoId}>
                  <NativeSelect
                    ref={campoTipo}
                    id="efetivo-tipo"
                    value={tipoId}
                    onChange={(evento) => {
                      setTipoId(evento.target.value);
                      // Os detalhes sao de um tipo: o de cobertura nao serve a troca.
                      setContraparteTexto("");
                      setContraparte(null);
                      setOrigemTexto("");
                      setOrigemId(null);
                      setErros((atuais) => ({
                        ...atuais,
                        tipoId: undefined,
                        contraparte: undefined,
                        postoOrigemId: undefined,
                      }));
                    }}
                    onKeyDown={enviarComEnter}
                    aria-invalid={Boolean(erros.tipoId)}
                  >
                    <option value="" disabled>
                      Escolha...
                    </option>
                    {tipos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.rotulo}
                        {item.ativo ? "" : " (inativo)"}
                      </option>
                    ))}
                  </NativeSelect>
                </Campo>
              </div>

              {pedeContraparte ? (
                <div className="w-72">
                  <Campo
                    id="efetivo-contraparte"
                    rotulo={comportamento === "cobertura" ? "Quem faltou" : "Trocou com"}
                    erro={erros.contraparte}
                  >
                    <CampoPessoaDoEfetivo
                      ref={campoContraparte}
                      id="efetivo-contraparte"
                      texto={contraparteTexto}
                      pessoa={contraparte}
                      aoDigitar={(texto) => {
                        setContraparteTexto(texto);
                        setContraparte(null);
                      }}
                      aoEscolher={(escolhida) => {
                        setContraparte(escolhida);
                        setContraparteTexto(escolhida.nome);
                        setErros((atuais) => ({ ...atuais, contraparte: undefined }));
                        focar(pedeOrigem ? campoOrigem : campoObservacao);
                      }}
                      aoErro={(mensagem) =>
                        setErros((atuais) => ({ ...atuais, contraparte: mensagem }))
                      }
                      invalido={Boolean(erros.contraparte)}
                      descritoPor={erros.contraparte ? "efetivo-contraparte-erro" : undefined}
                    />
                  </Campo>
                </div>
              ) : null}

              {pedeOrigem ? (
                <div className="w-64">
                  <Campo id="efetivo-origem" rotulo="Veio do posto" erro={erros.postoOrigemId}>
                    <CaixaDeBusca
                      ref={campoOrigem}
                      id="efetivo-origem"
                      texto={origemTexto}
                      aoDigitar={(texto) => {
                        setOrigemTexto(texto);
                        setOrigemId(null);
                      }}
                      opcoes={opcoesDeOrigem}
                      aoEscolher={(opcao) => {
                        const posto = postos.find((item) => item.id === opcao.valor);
                        setOrigemId(opcao.valor);
                        setOrigemTexto(posto ? rotuloDoPosto(posto) : opcao.rotulo);
                        setErros((atuais) => ({
                          ...atuais,
                          contraparte: undefined,
                          postoOrigemId: undefined,
                        }));
                        focar(campoObservacao);
                      }}
                      aviso={opcoesDeOrigem.length === 0 ? "Nenhum outro posto ativo" : null}
                      placeholder="Opcional"
                      invalido={Boolean(erros.postoOrigemId)}
                    />
                  </Campo>
                </div>
              ) : null}

              {tipo ? (
                <div className="min-w-56 flex-1">
                  <Campo id="efetivo-observacao" rotulo="Observacao" erro={erros.observacao}>
                    <Input
                      ref={campoObservacao}
                      id="efetivo-observacao"
                      value={observacao}
                      onChange={(evento) => setObservacao(evento.target.value)}
                      placeholder="Opcional"
                      maxLength={280}
                      autoComplete="off"
                    />
                  </Campo>
                </div>
              ) : null}
            </>
          ) : null}

          {/* Depois da excecao, e nao ao lado da saida: e a ordem do Tab. Saida,
              Tab, Espaco marca a excecao; com o botao no meio, o Espaco
              adicionaria sem ela. */}
          <div className="ml-auto flex items-end gap-2 self-end">
            <Button type="submit" disabled={enviando}>
              {enviando ? (
                <LoaderCircle className="animate-spin" />
              ) : editandoId ? (
                <Save aria-hidden />
              ) : (
                <Plus aria-hidden />
              )}
              {editandoId ? "Salvar" : "Adicionar"}
            </Button>
            {editandoId ? (
              <Button type="button" variant="ghost" onClick={cancelarEdicao}>
                <X aria-hidden />
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>

        {conflitos ? (
          <AvisoDeConflito
            conflitos={conflitos}
            aoConfirmar={confirmarConflito}
            aoCorrigir={corrigirConflito}
            enviando={enviando}
          />
        ) : null}

        <p className="text-muted-foreground min-h-5 text-sm" aria-live="polite">
          {turno ? (
            <>
              Turno de {turno.duracao}
              {turno.viraODia ? (
                <span className="text-amber-700 dark:text-amber-400"> · vira o dia</span>
              ) : null}
            </>
          ) : null}
        </p>
      </form>

      {postoId ? (
        // `key`: outro dia ou outro posto, outro rascunho — o aberto e descartado.
        <CopiarD2
          key={`${data}|${postoId}`}
          data={data}
          postoId={postoId}
          aoConcluir={() => focar(campoPessoa)}
        />
      ) : null}

      <ListaDoDia
        lancamentos={lancamentos}
        temPosto={Boolean(postoDaUrl)}
        editandoId={editandoId}
        aoEditar={editar}
        atualizando={navegando}
      />
    </div>
  );
}

function Campo({
  id,
  rotulo,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
