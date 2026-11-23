"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { toast } from "sonner";

import { cadastrarFreelancerDoEfetivo } from "@/features/efetivos/actions";
import { buscarPessoasDoEfetivo } from "@/features/efetivos/busca";
import {
  CaixaDeBusca,
  normalizarBusca,
  type OpcaoDaBusca,
} from "@/features/efetivos/components/caixa-de-busca";
import { NOME_MINIMO_FREELANCER } from "@/features/efetivos/types";
import {
  ESPERA_DA_BUSCA,
  PESSOAS_POR_BUSCA,
  TERMO_MINIMO,
  type PessoaEncontrada,
} from "@/features/preenchimento/types";

export type PessoaEscolhida = { valor: string; nome: string };

const NOVO_FREELANCER = "novo-freelancer";

/**
 * Campo de pessoa do lancamento: busca no servidor enquanto se digita
 * (funcionarios e freelancers ativos) e, quando `permitirFreelancer`, oferece
 * "Inserir como freelancer" para quem nao esta cadastrado.
 *
 * Controlado: quem usa guarda o texto e a pessoa escolhida (para limpar depois
 * de adicionar e para preencher na edicao); o campo guarda so a busca.
 *
 * E o mesmo campo para quem esta no posto e para a contraparte da excecao
 * (quem faltou, com quem trocou) — a contraparte nao cadastra freelancer: quem
 * faltou ja estava escalado, e portanto ja existe.
 */
export function CampoPessoaDoEfetivo({
  id,
  ref,
  texto,
  pessoa,
  aoDigitar,
  aoEscolher,
  aoErro,
  permitirFreelancer = false,
  placeholder = "Nome ou matricula",
  invalido,
  descritoPor,
  autoFocus,
}: {
  id: string;
  ref?: Ref<HTMLInputElement>;
  texto: string;
  pessoa: PessoaEscolhida | null;
  /** Digitar desfaz a escolha: quem usa zera a pessoa. */
  aoDigitar: (texto: string) => void;
  aoEscolher: (pessoa: PessoaEscolhida) => void;
  aoErro: (mensagem: string) => void;
  permitirFreelancer?: boolean;
  placeholder?: string;
  invalido?: boolean;
  descritoPor?: string;
  autoFocus?: boolean;
}) {
  /** A ultima resposta da busca, com o termo que a produziu. */
  const [resposta, setResposta] = useState<{ termo: string; pessoas: PessoaEncontrada[] }>({
    termo: "",
    pessoas: [],
  });
  const [cadastrando, setCadastrando] = useState(false);
  /** Descarta resposta atrasada: "adr" nao pode sobrescrever "adriano". */
  const pedido = useRef(0);
  /** Enter apertado antes de a lista chegar: escolhe o primeiro quando chegar. */
  const enterPendente = useRef(false);

  const termo = pessoa ? "" : texto.trim();
  const curto = termo.length < TERMO_MINIMO;
  const buscando = !curto && resposta.termo !== termo;

  useEffect(() => {
    if (curto || resposta.termo === termo) {
      return;
    }

    const meu = ++pedido.current;
    const relogio = setTimeout(() => {
      buscarPessoasDoEfetivo(termo)
        .then((pessoas) => {
          if (meu !== pedido.current) {
            return;
          }

          setResposta({ termo, pessoas });

          if (enterPendente.current && pessoas[0]) {
            enterPendente.current = false;
            aoEscolher({ valor: pessoas[0].valor, nome: pessoas[0].nome });
          }
        })
        .catch(() => {
          if (meu === pedido.current) {
            setResposta({ termo, pessoas: [] });
          }
        });
    }, ESPERA_DA_BUSCA);

    return () => clearTimeout(relogio);
    // `aoEscolher` muda a cada render de quem usa; fora da lista para a busca
    // nao sair de novo a cada tecla em outro campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, curto, resposta.termo]);

  const encontradas = curto ? [] : resposta.pessoas;
  const casaExato = encontradas.some(
    (item) => normalizarBusca(item.nome) === normalizarBusca(termo),
  );

  const opcoes: OpcaoDaBusca[] = pessoa
    ? []
    : [
        ...encontradas.map((item) => ({
          valor: item.valor,
          rotulo: item.nome,
          detalhe: [item.identificacao, item.freelancer ? "freelancer" : null]
            .filter(Boolean)
            .join(" · "),
        })),
        // "Se nao encontrar, inserir como freelancer" — e tambem quando so ha
        // parecidos: "Joao Silva" freelancer novo nao e o "Joao Silveira" da folha.
        ...(permitirFreelancer && !buscando && termo.length >= NOME_MINIMO_FREELANCER && !casaExato
          ? [{ valor: NOVO_FREELANCER, rotulo: `Inserir "${termo}" como freelancer`, acao: true }]
          : []),
      ];

  const aviso = pessoa
    ? null
    : curto
      ? texto.trim()
        ? `Digite ao menos ${TERMO_MINIMO} letras`
        : null
      : encontradas.length === PESSOAS_POR_BUSCA
        ? `Mostrando os ${PESSOAS_POR_BUSCA} primeiros — digite mais para estreitar`
        : encontradas.length === 0 && !buscando
          ? "Ninguem ativo com este nome"
          : null;

  async function escolher(opcao: OpcaoDaBusca) {
    if (opcao.valor !== NOVO_FREELANCER) {
      aoEscolher({ valor: opcao.valor, nome: opcao.rotulo });
      return;
    }

    setCadastrando(true);
    const cadastro = await cadastrarFreelancerDoEfetivo(termo);
    setCadastrando(false);

    if (!cadastro.ok) {
      aoErro(cadastro.mensagem);
      return;
    }

    toast.success(
      cadastro.novo
        ? `Freelancer ${cadastro.nome} cadastrado.`
        : `${cadastro.nome} ja era freelancer cadastrado.`,
    );
    aoEscolher({ valor: cadastro.valor, nome: cadastro.nome });
  }

  return (
    <CaixaDeBusca
      ref={ref}
      id={id}
      texto={texto}
      aoDigitar={aoDigitar}
      opcoes={opcoes}
      aoEscolher={escolher}
      aviso={aviso}
      carregando={buscando || cadastrando}
      aoEnterSemOpcao={() => {
        enterPendente.current = true;
      }}
      placeholder={placeholder}
      invalido={invalido}
      descritoPor={descritoPor}
      autoFocus={autoFocus}
    />
  );
}
