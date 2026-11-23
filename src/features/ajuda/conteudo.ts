import type { AreaPortal } from "@/db/schema";

/**
 * O conteudo da Ajuda: o que cada area faz, como configura-la e como usa-la.
 *
 * E o lugar dos textos que explicam a tela. A tela fica com o que e dela —
 * titulo, competencia, periodo, contagens e avisos de estado — e o "por que" e
 * o "como" moram aqui, a um clique do botao no canto da tela.
 *
 * Modulo puro (so `import type` do schema): e lido pelo botao de ajuda, que e
 * client. O `Record<AreaPortal, ...>` amarra o catalogo ao enum do banco: area
 * nova sem ajuda quebra o typecheck, como em `areas.ts` e `modulos.ts`.
 */

export type SecaoDeAjuda = {
  titulo: string;
  /**
   * Telas a que a secao se refere, como prefixo de caminho
   * (`/funcionarios/importar`). Na tela que casa, a secao sobe para o topo do
   * painel com a marca "Nesta tela". Sem `telas`, a secao vale para a area
   * inteira e fica na ordem do catalogo.
   */
  telas?: readonly string[];
  paragrafos?: readonly string[];
  /** Lista numerada: a ordem importa. */
  passos?: readonly string[];
  /** Lista de termo + significado (siglas, status, campos). */
  termos?: readonly { termo: string; descricao: string }[];
  /** Paragrafos que vem depois dos passos e dos termos — o que vale saber depois de fazer. */
  notas?: readonly string[];
};

export type Ajuda = {
  titulo: string;
  resumo: string;
  secoes: readonly SecaoDeAjuda[];
};

/** Ajuda da pagina inicial e de qualquer rota que nao seja de uma area. */
export const AJUDA_GERAL: Ajuda = {
  titulo: "Como o portal funciona",
  resumo:
    "O portal reune a escala dos postos, o ponto, as horas extras e o fechamento da folha. Tudo o que e lancado pertence a uma competencia, e as telas mostram so a que estiver em vigor.",
  secoes: [
    {
      titulo: "Por onde comecar",
      paragrafos: [
        "Cada area depende de cadastros feitos antes dela. Na primeira configuracao, siga esta ordem:",
      ],
      passos: [
        "Competencias: abra a competencia do periodo. Sem competencia aberta o portal nao grava nada datado.",
        "Eventos: cadastre as siglas da grade, com ao menos um evento de trabalho e um de folga marcados como padrao.",
        "Postos de trabalho: cadastre os postos, as funcoes de cada um e as vigencias (ciclo e horario) de cada funcao.",
        "Escalas: cadastre as regras de jornada usadas pelos funcionarios.",
        "Funcionarios: importe o relatorio da folha e defina escala e inicio de ciclo de cada pessoa.",
        "Analise de ponto: importe o arquivo de marcacoes do relogio.",
        "Preenchimento de escala: inclua as pessoas em cada posto e registre o realizado dia a dia.",
        "Apontamentos: lance, por funcionario, o que a folha vai valorar na competencia.",
      ],
    },
    {
      titulo: "Menu e acesso",
      paragrafos: [
        "O menu lateral agrupa as areas em modulos (Gestao e Operacao). Cada usuario ve apenas as areas liberadas para ele; o administrador ve todas.",
        "Clique no seu nome, no rodape do menu, para trocar a senha, sair ou, se tiver a area, cadastrar acessos.",
      ],
    },
    {
      titulo: "Competencia em vigor",
      paragrafos: [
        "O topo de toda tela mostra a competencia em vigor. Quando voce consulta uma competencia encerrada, uma faixa avisa — tudo o que for lancado vai para a consultada ate voce voltar para a ativa.",
      ],
    },
  ],
};

export const AJUDA_DAS_AREAS: Record<AreaPortal, Ajuda> = {
  competencias: {
    titulo: "Competencias",
    resumo:
      "A competencia e a base temporal do portal: todo dado nasce dentro de uma e as telas mostram apenas a que estiver em vigor.",
    secoes: [
      {
        titulo: "O que e uma competencia",
        paragrafos: [
          "E o periodo entre duas datas. O nome vem do mes da data final: 21/07 a 21/08 e Agosto. O nome nunca e digitado — mudou a data final, mudou o nome.",
          "So existe uma competencia aberta por vez, e nao ha duas competencias do mesmo mes.",
        ],
      },
      {
        titulo: "Abrir nova competencia",
        paragrafos: [
          "Abrir a proxima encerra a atual na mesma hora. Os dados da encerrada ficam guardados e param de aparecer nas telas.",
          "O inicio ja vem sugerido como o dia seguinte ao fim da anterior, e nao pode invadir o periodo dela.",
        ],
        termos: [
          {
            termo: "O que segue para a nova",
            descricao:
              "A escalacao dos postos: as mesmas pessoas, funcoes, turmas, siglas e ordem. O ciclo continua de onde parou.",
          },
          {
            termo: "O que comeca em branco",
            descricao:
              "Os dias da grade, as observacoes das linhas, os apontamentos, os extras e as marcacoes de ponto.",
          },
        ],
      },
      {
        titulo: "Historico e consulta",
        paragrafos: [
          "Consultar abre uma competencia encerrada so para voce, nesta sessao. Da para ler, editar e preencher nela como na ativa: grade, apontamentos, extras e ponto.",
          'A consulta termina ao clicar em "Voltar a competencia ativa" ou ao sair do portal. A competencia ativa do portal nao muda, e as outras pessoas continuam trabalhando nela.',
          "Se uma tela foi aberta antes de a consulta acabar, a gravacao feita nela e recusada — recarregue a pagina para trabalhar na competencia certa.",
        ],
      },
    ],
  },

  escalas: {
    titulo: "Escalas",
    resumo:
      "A escala e a regra da jornada: quando entra, quando sai, em que ciclo, quanto de intervalo e quantas marcacoes o dia deve ter. E contra ela que a marcacao de cada funcionario e interpretada.",
    secoes: [
      {
        titulo: "Cadastrar uma escala",
        telas: ["/escalas/nova", "/escalas/"],
        passos: [
          'De um nome que a operacao reconheca ("12x36 diurno", "5x2 comercial"). Nomes que so diferem em maiusculas sao considerados iguais.',
          "Informe entrada e saida. Se a saida for menor que a entrada, o turno vira o dia — isso e calculado sozinho.",
          "Informe o intervalo (intrajornada) e as horas extras ja previstas, se houver.",
          "Informe quantas marcacoes o dia deve ter: sempre um numero par, de 2 a 8 (cada entrada tem a sua saida).",
          "Monte o ciclo: o tamanho em dias e quais posicoes sao folga.",
        ],
      },
      {
        titulo: "Como montar o ciclo",
        paragrafos: [
          "O ciclo se repete a partir do dia 1. Os dias marcados sao folga; os demais sao trabalho. O que identifica a escala e o ciclo, e nao o dia da semana.",
        ],
        termos: [
          { termo: "5x2", descricao: "Ciclo de 7 dias com folga no 6 e no 7." },
          { termo: "6x1", descricao: "Ciclo de 7 dias com folga no 7." },
          {
            termo: "6x1 com folga alternada",
            descricao:
              "Ciclo de 14 dias com folga no 7 e no 13 — a folga cai no domingo de uma semana e no sabado da outra.",
          },
          {
            termo: "12x36",
            descricao:
              "Ciclo de 2 dias com folga no dia 2. As 12 horas ficam na entrada e na saida.",
          },
        ],
      },
      {
        titulo: "Dias que fogem do padrao",
        telas: ["/escalas/"],
        paragrafos: [
          "Na aba de dias do ciclo, ajuste o dia que tem horario diferente (o 5o dia do 5x2 que sai mais cedo, o meio periodo). Cada dia descreve a jornada inteira dele.",
          "Dia igual ao padrao nao vira ajuste; voltar o dia ao padrao apaga o ajuste. Encurtar o ciclo ou marcar como folga um dia ajustado tambem apaga o ajuste.",
        ],
      },
      {
        titulo: "Desativar em vez de apagar",
        telas: ["/escalas/"],
        paragrafos: [
          'Escala nao se apaga: ela explica jornadas ja interpretadas. Desmarque "Ativa" para que ela deixe de ser oferecida em novas atribuicoes.',
        ],
      },
      {
        titulo: "Onde a escala e usada",
        paragrafos: [
          "A escala e atribuida ao funcionario, junto com a data em que o ciclo comeca para ele. A mesma 12x36 serve todas as turmas: o que separa uma turma da outra e o inicio do ciclo.",
          "Mudar uma escala muda a leitura do ponto de todos que a seguem, inclusive de dias que ja passaram.",
        ],
      },
    ],
  },

  funcionarios: {
    titulo: "Funcionarios",
    resumo:
      "Quem tem jornada a ser interpretada. Os dados de identificacao vem da folha; a escala, o inicio de ciclo, o telefone e os afastamentos sao definidos aqui.",
    secoes: [
      {
        titulo: "Importar o relatorio da folha",
        telas: ["/funcionarios/importar"],
        passos: [
          'Exporte da folha o relatorio "Relacao de Empregados" em .xlsx (de uma empresa ou de varias).',
          "Escolha o arquivo e confira a previa: quem sera criado, quem sera atualizado e as linhas recusadas, com o motivo.",
          'Clique em "Importar" para gravar. A confirmacao le o arquivo de novo, entao quem entrou no cadastro entre as duas telas vira atualizacao.',
        ],
        notas: [
          "A pessoa e reconhecida pelo CPF. CPF invalido, CPF repetido no arquivo, data impossivel e matricula de outra pessoa viram recusa — as demais linhas entram normalmente. Corrija na folha e importe de novo.",
          "A importacao nunca mexe na escala, no inicio de ciclo nem no telefone. Empresas novas sao criadas pela propria carga.",
        ],
      },
      {
        titulo: "Cadastrar a mao",
        telas: ["/funcionarios/novo"],
        paragrafos: [
          'Use "Novo funcionario" para quem ainda nao veio da folha. O CPF e a identidade: e por ele que a importacao reconhece a pessoa depois, em vez de cadastra-la de novo.',
          'A jornada e opcional no cadastro. Sem ela, a pessoa entra na fila de "sem escala".',
          "Sem empresa cadastrada nao ha como cadastrar ninguem: importe o relatorio da folha primeiro.",
        ],
      },
      {
        titulo: "Abas da ficha",
        telas: ["/funcionarios/"],
        termos: [
          {
            termo: "Dados",
            descricao:
              "O que vem da folha (nome, CPF, matricula, cargo, situacao) e o telefone de WhatsApp, que so existe no portal.",
          },
          {
            termo: "Jornada",
            descricao:
              "Escala e inicio de ciclo. Os dois andam juntos: ou se informa os dois, ou nenhum. Deixar os dois vazios tira uma escala atribuida por engano.",
          },
          {
            termo: "Afastamentos",
            descricao:
              "Ferias, atestado e INSS como periodos com inicio e fim. Os dias cobertos saem da apuracao do ponto e nao viram falta.",
          },
        ],
        notas: [
          "Cada aba salva sozinha: salvar os dados nao reenvia a jornada. O que foi digitado e nao salvo nao se perde ao trocar de aba.",
        ],
      },
      {
        titulo: "Escala e inicio de ciclo",
        telas: ["/funcionarios"],
        paragrafos: [
          "A escala diz o padrao; o inicio de ciclo diz em que dia a posicao 1 desse padrao caiu para esta pessoa. Mesma 12x36 com um dia de diferenca no inicio: uma turma trabalha quando a outra folga.",
          "Para atribuir a varias pessoas de uma vez, marque-as na lista e use a atribuicao em lote — faca uma vez por turma.",
          '"Sem escala" na lista isola quem ainda nao tem jornada; essas pessoas nao sao apuradas no ponto.',
        ],
      },
      {
        titulo: "Escalas sugeridas pelo ponto",
        telas: ["/funcionarios/escalas-sugeridas"],
        paragrafos: [
          "O relogio mostra em que dias e em que horario cada pessoa trabalha. O portal compara as batidas importadas com cada escala cadastrada, em cada posicao do ciclo, e sugere a que melhor explica a pessoa — com o dia em que o ciclo comeca.",
          "So vem marcadas as sugestoes confiaveis (90% dos dias e horario a ate 30 minutos). Confira, ajuste a selecao e confirme: a gravacao e feita so em quem continua sem escala.",
          "Com menos de 6 dias de batida nao ha sugestao. Importe mais dias, ou consulte a competencia anterior e aplique de la. Se nenhuma escala explica a pessoa, cadastre a escala que falta em Escalas.",
        ],
      },
      {
        titulo: "Situacao e desativacao",
        paragrafos: [
          "A situacao e o codigo da folha (Trabalhando, Ferias...). Ativo e outra coisa: quem esta de ferias continua ativo no portal.",
          "Funcionario nao se apaga. Desativar tira a pessoa das telas de trabalho e mantem o cadastro.",
        ],
      },
    ],
  },

  ponto: {
    titulo: "Analise de ponto",
    resumo:
      "As marcacoes do relogio lidas contra a escala de cada funcionario: o que fecha, o que falta e o que sobra. So as batidas sao gravadas; a divergencia e recalculada a cada abertura.",
    secoes: [
      {
        titulo: "Importar marcacoes",
        telas: ["/ponto/importar"],
        passos: [
          'Exporte do relogio a "Lista de Marcacoes Realizadas Simplificadas" em TXT.',
          "Escolha o arquivo e confira a previa: quantas marcacoes entram, quantas ja existiam e o que foi recusado.",
          "Codigo de empresa desconhecido bloqueia o bloco daquele codigo: associe o codigo a empresa ali mesmo. A associacao vale para sempre.",
          'Clique em "Gravar". Reenviar o mesmo arquivo nao duplica nada.',
          'Corrigiu batidas no sistema do relogio? Exporte o relatorio de novo e confira: a previa lista os dias em que o arquivo discorda do portal, com as batidas que saem riscadas e as que entram sublinhadas. "Substituir as marcacoes do periodo do arquivo" faz as batidas dessas pessoas, nos dias do periodo do arquivo, passarem a ser as dele. "Gravar" so acrescenta: a batida errada continuaria no portal.',
        ],
        notas: [
          "A substituicao so mexe em quem o arquivo traz e nos dias do periodo dele (dentro da competencia). Quem o arquivo nao traz, e os outros dias, ficam como estao.",
          "Pessoas que o relogio traz e o portal nao tem ficam de fora: importe o relatorio da folha em Funcionarios e confira o arquivo de novo.",
          "Data fora da competencia em vigor nao entra — ela pertence a outro periodo.",
          'Batida com "i" (14:05i) foi incluida a mao no sistema de ponto e aparece marcada.',
        ],
      },
      {
        titulo: "Periodo apurado",
        paragrafos: [
          "A apuracao vai so ate onde ha arquivo importado, e nao ate o fim da competencia. Sem nenhuma carga, nada e apurado — em vez de tudo virar falta.",
          'As batidas sao lidas em jornadas, e nao por data: depois de uma saida, 8 horas ou mais sem batida comecam outra jornada, e a jornada pertence ao dia da entrada. Por isso o turno noturno fica inteiro no dia em que comecou, e a saida de um plantao e a entrada do proximo no mesmo dia viram duas jornadas. Na tabela, a batida registrada no dia seguinte aparece com um "+1" pequeno ao lado da hora.',
          "Na troca interna, a jornada trabalhada num dia de folga aparece como trabalho em dia de folga, e o dia de trabalho que ficou sem jornada como falta — cada metade no dia em que aconteceu.",
          'No ultimo dia importado, a jornada que ainda nao fechou aparece como "turno em aberto".',
        ],
      },
      {
        titulo: "Conferencia",
        telas: ["/ponto", "/ponto/"],
        paragrafos: [
          "A lista mostra cada funcionario com escala, ordenado por quem tem mais pendencia. Abra a pessoa para ver o dia a dia: escala, batidas, horas e o que cada dia acusa.",
          "Quem esta sem escala nao e apurado. Defina a jornada em Funcionarios — a leitura muda na hora, sem reimportar nada.",
        ],
        termos: [
          {
            termo: "Impeditiva",
            descricao:
              "Trava o fechamento: falta, marcacao impar (jornada com numero impar de batidas, que nunca vira hora extra), marcacoes a menos, trabalho em dia de folga.",
          },
          {
            termo: "Atencao",
            descricao:
              "Pede conferencia: hora extra, debito, intrajornada curta, marcacoes a mais, turno em aberto, batida em dia de afastamento.",
          },
          {
            termo: "Tolerancia",
            descricao:
              "Ate 10 minutos na entrada e 10 na saida valem o horario da escala (CLT, art. 58, par. 1o): nao geram extra nem atraso. Passou disso, conta a diferenca inteira. A coluna Saldo ja vem com a tolerancia; embaixo, menor, o que o relogio registrou.",
          },
        ],
      },
      {
        titulo: "Pendencias e tratativas",
        telas: ["/ponto/pendencias"],
        paragrafos: [
          'Uma linha por ocorrencia, e nao por pessoa: cada dia que nao fecha tem a sua conversa e o seu desfecho. Ocorrencia sem registro nenhum esta "aberta".',
          'Abra a ocorrencia para registrar o status e a observacao. "Descartada" exige observacao dizendo por que.',
          "Ocorrencias ja encerradas descem na lista. Se a divergencia sumir (escala corrigida, batida importada, atestado lancado), ela sai do painel, mas o historico fica guardado e volta se a divergencia voltar.",
        ],
      },
      {
        titulo: "Mensagem pelo WhatsApp",
        telas: ["/ponto/pendencias/"],
        paragrafos: [
          'Se o colaborador esta no grupo de contato de um posto com responsavel (Postos de trabalho, aba Responsavel), a mensagem vai para o responsavel, e nao para ele — a secao passa a se chamar "Falar com o responsavel pelo posto". Quem nao esta em grupo nenhum recebe a propria mensagem.',
          "O envio exige telefone no cadastro de quem recebe (aba Dados do funcionario). O numero nao vem da folha. Responsavel sem telefone ou desativado bloqueia o envio: a mensagem nao volta para o colaborador.",
          "O texto ja vem montado a partir da ocorrencia e pode ser editado. Ao responsavel, ele traz o colaborador, o posto, o dia, as marcacoes e o prazo de retorno. A previa mostra destinatario, numero e o texto inteiro — confirme so depois de conferir, porque mensagem enviada nao tem desfazer.",
          'Envio aceito move a ocorrencia de "aberta" para "em tratativa". Envios e falhas ficam no historico como foram, com o nome do responsavel quando foi ele quem recebeu.',
        ],
        termos: [
          {
            termo: "Prazo de retorno",
            descricao:
              '3 dias corridos a partir do envio ao responsavel. O painel mostra "Retorno ate" e, passado o dia, "Prazo vencido". Reenviar renova o prazo; encerrar a tratativa o tira da tela.',
          },
        ],
      },
      {
        titulo: "Envio aos responsaveis",
        telas: ["/ponto/pendencias/responsaveis"],
        paragrafos: [
          'Em vez de uma mensagem por ocorrencia, manda a cada responsavel uma mensagem so com as pendencias do grupo dele. Chega-se pelo botao "Enviar aos responsaveis" no painel de pendencias.',
          "Entram so faltas e marcacoes incompletas (marcacao impar e marcacoes a menos), nao encerradas e ainda nao enviadas a ele: as que nunca sairam, as cujo envio falhou e as que foram enviadas a outra pessoa (o colaborador, ou o responsavel anterior). As que ja foram enviadas a ele e estao no prazo ficam de fora, para o prazo nao ser renovado sem querer; para cobrar uma, use a tela da ocorrencia. Hora extra, debito, intrajornada e os demais tipos ficam so no painel.",
          'Clique em "Pre-visualizar a mensagem", confira e confirme. O texto nao se edita: ele e a lista do que vai ser dado como avisado. Os itens sao numerados, por posto e por data, para o responsavel responder citando o numero.',
          'Cada ocorrencia enviada passa a "em tratativa", ganha o prazo de 3 dias e aparece no historico com o selo Consolidada. Cabem 30 ocorrencias por mensagem; as demais ficam para o envio seguinte, e a previa diz quantas.',
          "Se algo mudar entre a previa e a confirmacao (carga nova, tratativa encerrada, o dia virou), nada sai e a previa precisa ser feita de novo.",
        ],
      },
      {
        titulo: "Correcao pelo colaborador (chatbot)",
        telas: ["/ponto/pendencias/"],
        paragrafos: [
          'O colaborador manda "Ponto" para o WhatsApp do RH e corrige sozinho faltas e marcacoes incompletas: escolhe a data, o motivo, informa os horarios ou a explicacao e confirma.',
          'Cada confirmacao vira tratativa justificada e gera um comprovante em PDF com a transcricao e um hash SHA-256. A integridade e conferida de novo a cada abertura; "Conteudo alterado" indica que algo foi mexido no banco.',
          "Quem esta no grupo de contato de um posto com responsavel nao e atendido pelo robo: recebe o aviso de que a correcao passa pelo responsavel do posto.",
        ],
      },
    ],
  },

  apontamentos: {
    titulo: "Apontamentos",
    resumo:
      "O que cada funcionario tem a receber ou a descontar na competencia — vales, horas extras, adicionais, faltas e DSR. O portal nao calcula salario: registra as quantidades que a folha vai valorar.",
    secoes: [
      {
        titulo: "Lancar o apontamento",
        telas: ["/apontamentos/"],
        passos: [
          "Abra a pessoa na lista. A ficha mostra todas as rubricas, na ordem da folha: Vale-transporte, Vale-refeicao, HE 50%, HE 60%, Intrajornada, HE 100%, Adicional noturno, Faltas, Gratificacao, Periculosidade, Cesta basica e Assiduidade; Insalubridade e Desconto de DSR vem no fim.",
          '"Preencher apontamento" (ou "Editar apontamento") abre o preenchimento, um campo por vez. Clicar numa rubrica da ficha abre direto nela.',
          "Digite e aperte Enter para ir ao proximo campo; Shift+Enter volta. Em Sim/Nao, as teclas S e N escolhem; na insalubridade, 0 a 3. A lista a esquerda mostra o que ja foi preenchido e leva a qualquer campo.",
          "Horas vao em HH:MM (12:30), e podem passar de 24 horas. Campo vazio vale zero.",
          'Ao lado de cada campo aparecem o numero do espelho do ponto que conversa com ele e a sugestao das regras, com "Usar" para trazer o valor.',
          'Salve em qualquer campo — nao precisa ir ate o fim. No ultimo (Observacoes), Ctrl+Enter salva. Salvar com tudo em branco apaga o apontamento; a observacao sozinha ja conta ("conferido, nada a lancar").',
        ],
        notas: [
          'Dias e faltas nao passam do tamanho da competencia. Se o salvar for recusado, o preenchimento volta ao campo com o problema, com o que foi digitado. "Remover apontamento" apaga o lancamento e devolve a pessoa a fila.',
          'Na sugestao das regras, "Usar a sugestao" abre o preenchimento com ela nos campos; nada muda ate salvar.',
        ],
      },
      {
        titulo: "Espelho do ponto",
        telas: ["/apontamentos/"],
        paragrafos: [
          "Resume a analise de ponto da pessoa: horas extras, trabalho em folga, intrajornada que faltou e horas noturnas (hora de relogio, sem reducao). E referencia: nada dali vai sozinho para os campos.",
          "A apuracao nao sabe se a hora e 50%, 60% ou 100%, nem se a falta foi abonada — quem fecha a folha decide.",
        ],
      },
      {
        titulo: "Gerar pelas regras",
        telas: ["/apontamentos"],
        paragrafos: [
          '"Gerar pelas regras" grava a sugestao so para quem ainda nao tem apontamento. Quem ja foi lancado a mao fica como esta e aparece marcado quando difere da sugestao.',
          "Quem nao esta em nenhuma grade de posto nao tem sugestao e precisa ser apontado a mao.",
        ],
      },
      {
        titulo: "Importar horas extras",
        telas: ["/apontamentos/importar-horas"],
        passos: [
          'Em Apontamentos, use "Importar horas extras" e escolha a planilha .xlsx com as colunas Nome, Horas e Verba.',
          '"Conferir arquivo" mostra, sem gravar nada, o que muda no apontamento de cada pessoa: a hora gravada sai riscada e a do arquivo entra sublinhada.',
          'Para os nomes sem cadastro casado, escolha o cadastro certo na lista de parecidos, ou deixe em "Nao importar".',
          'Use "Importar" para gravar na competencia em vigor.',
        ],
        termos: [
          { termo: "Verba 150", descricao: "Vai para Horas extras 50%." },
          { termo: "Verba 200", descricao: "Vai para Horas extras 100%." },
        ],
        notas: [
          "A pessoa e achada pelo nome, sem diferenca de acento, maiuscula ou espaco duplo. Nome parecido nunca casa sozinho: lancar horas extras na pessoa errada e pagar a quem nao fez.",
          "As horas do arquivo substituem as gravadas, e nao somam: importar o mesmo arquivo duas vezes nao dobra nada. Uma verba que nao veio para a pessoa fica como estava, e as outras rubricas do apontamento nao mudam. Outras verbas do relatorio sao ignoradas.",
          'Quem ainda nao tinha apontamento ganha um so com as horas extras, e o "Gerar pelas regras" passa a pular essa pessoa. Se for usar as regras, gere antes de importar — ou use "Usar a sugestao" na ficha depois.',
        ],
      },
      {
        titulo: "Regras de apontamento",
        telas: ["/apontamentos/regras", "/apontamentos/regras/"],
        paragrafos: [
          "A regra diz o que a grade vira em rubrica: o dia trabalhado que paga VT, o dia sem intervalo que vira hora, a empresa que sempre paga periculosidade. A regra e cadastro e vale para todas as competencias; o resultado dela e so sugestao.",
          'As regras sao aplicadas na ordem da lista, de cima para baixo. A acao "Definir" sobrescreve o que as anteriores acumularam na mesma rubrica.',
        ],
        termos: [
          {
            termo: "Escopo",
            descricao:
              "Campo em branco nao filtra. Empresa, cargo e pessoa olham o cadastro; posto, funcao, turma, sigla, ciclo e jornada olham o dia na grade.",
          },
          {
            termo: "Ciclo",
            descricao:
              "Tamanho e quantidade de folgas andam juntos: o 5x1 e um ciclo de 6 com 1 folga, o 12x36 um ciclo de 2 com 1 folga.",
          },
          {
            termo: "Gatilho e acao",
            descricao:
              "O gatilho diz o que dispara a regra: dia trabalhado, dia de falta, dia com intrajornada nao usufruida ou fixo na competencia (uma vez por pessoa). A acao diz o que ela faz na rubrica: Somar acumula a cada dia, Definir fixa o valor. Marcacao e grau so aceitam Definir.",
          },
          {
            termo: "Excecoes",
            descricao:
              'Onde a regra nao vale — e assim que "todas as empresas menos a LC" cabe numa regra so. Segure Ctrl (ou Cmd) para marcar mais de um.',
          },
          {
            termo: "Ativa",
            descricao:
              "Regra inativa continua cadastrada e para de alimentar a sugestao. Apagar a regra nao muda apontamento ja gravado.",
          },
        ],
      },
      {
        titulo: "Exportar",
        telas: ["/apontamentos"],
        termos: [
          {
            termo: "Planilha (Excel)",
            descricao:
              "Para importar na folha: uma linha por funcionario, no layout da folha. Horas extras 50%/60% somadas, faltas de escala e folga somadas, VA e a cesta basica.",
          },
          {
            termo: "Relatorio (Word)",
            descricao:
              "Para ler: totais da competencia e, por empresa, o que cada pessoa tem, em texto corrido. Inclui insalubridade e DSR, que nao vao na planilha.",
          },
        ],
        notas: [
          "Os dois arquivos respeitam a busca e a empresa da lista e trazem so quem foi apontado.",
        ],
      },
    ],
  },

  postos: {
    titulo: "Postos de trabalho",
    resumo:
      "O posto diz o lugar; a funcao diz o turno ou o papel que se cobre ali. Cada funcao vira uma faixa na grade, e o contrato declarado nela gera o previsto.",
    secoes: [
      {
        titulo: "Configurar um posto",
        telas: ["/postos/novo", "/postos/"],
        passos: [
          "Crie o posto com codigo, nome e empresa.",
          "Na aba Funcoes, cadastre cada turno ou papel (Portaria diurna, Lider, CCO). O nome e unico dentro do posto.",
          "No cartao da funcao, clique em Definir escala: escolha o modelo (12x36, 5x2...), marque os dias de folga do ciclo e informe entrada e saida. Os dias aparecem abaixo enquanto voce preenche.",
          "Se o posto tem duas metades com padroes proprios, use Adicionar contraescala e ajuste o Dia 1 do ciclo com as setas ate as duas linhas se alternarem.",
        ],
      },
      {
        titulo: "Vigencias",
        telas: ["/postos/"],
        paragrafos: [
          'O contrato e uma lista de vigencias: cada uma vale ate a proxima da mesma turma comecar. E assim que "12x36 ate 27/08, 4x2 a partir de 28/08" aparece na mesma faixa sem reescrever o passado.',
          'Vigencia sem data de inicio vale "desde sempre" (so pode haver uma por turma). Dia anterior a primeira vigencia fica sem previsto.',
          "Cada cartao desenha escala e contraescala nos dias da competencia em vigor: o dia de trabalho leva a sigla da funcao e a folga, F. Um traco antes do dia marca onde uma vigencia nova comeca.",
          "Escala sem vigencia aparece em vermelho: a faixa dela nasce em branco na grade. Vigencia substituida antes do periodo aparece apagada — ela nao vale em nenhum dia dele.",
        ],
        termos: [
          {
            termo: "Folga em quais dias do ciclo",
            descricao:
              "Posicoes do ciclo, e nao dias da semana: 5x2 e ciclo de 7 com folga no 6 e no 7. Clique no dia para trocar entre trabalho e folga.",
          },
          {
            termo: "Dia 1 do ciclo cai em",
            descricao:
              'A data em que o ciclo comeca (a ancora). Em branco, vale o dia em que a vigencia passa a valer; na vigencia "desde sempre", o primeiro dia da competencia. As setas empurram a escala um dia — se as folgas "nao encaixaram", e aqui que se ajusta.',
          },
          {
            termo: "Escala e contraescala",
            descricao:
              "Duas escalas completas, cada uma com ciclo, horario e vigencias proprios. A contraescala nao herda nada da escala.",
          },
        ],
      },
      {
        titulo: "Responsavel e grupo de contato",
        telas: ["/postos/"],
        paragrafos: [
          "Na aba Responsavel, escolha o funcionario que responde pelo posto e monte o grupo de contato: as pessoas cuja correcao de ponto passa por ele. A mensagem de pendencias dessas pessoas vai para o responsavel, com o colaborador, o dia e o prazo de 3 dias para retorno.",
          'Use "Incluir colaborador" para um a um, ou "Trazer quem esta na grade deste posto" para incluir de uma vez quem esta escalado no posto na competencia em vigor. O grupo e cadastro: virar a competencia nao o muda.',
          "Cada pessoa fica em um grupo so, e o responsavel nao entra no proprio grupo. Quem ja esta no grupo de outro posto precisa ser retirado de la antes.",
          "Sem responsavel, cada pessoa do grupo volta a receber a propria mensagem. O responsavel precisa de telefone e de cadastro ativo; sem isso o envio fica bloqueado.",
        ],
      },
      {
        titulo: "Mudar o contrato",
        paragrafos: [
          "Mudar o ciclo de uma funcao reescreve o previsto de todo mundo nela, na hora, porque o previsto nao e gravado. Para uma troca a partir de uma data, crie uma vigencia nova em vez de editar a atual.",
        ],
      },
      {
        titulo: "Desativar",
        paragrafos: [
          "Posto e funcao nao se apagam: eles explicam escalas ja montadas. Posto inativo sai da lista de postos da grade.",
        ],
      },
    ],
  },

  eventos: {
    titulo: "Eventos",
    resumo:
      "O vocabulario da grade: cada sigla que um dia pode receber precisa existir aqui. A natureza decide como o dia e somado.",
    secoes: [
      {
        titulo: "Cadastro minimo",
        paragrafos: [
          "Para a grade funcionar, cadastre ao menos um evento de natureza trabalho e um de natureza folga, os dois marcados como padrao. Sao eles que o previsto escreve — sem os dois, a faixa P nasce em branco.",
        ],
      },
      {
        titulo: "Campos do evento",
        termos: [
          {
            termo: "Sigla",
            descricao:
              "O que aparece na celula da grade. Mantenha curta: D, N, F, TE, MEIO. O nome e a descricao servem para quem le a grade meses depois.",
          },
          {
            termo: "Natureza",
            descricao:
              "Trabalho, folga, falta, afastamento, outro ou troca. Decide como o dia conta nas regras de apontamento e no sinal do relogio. Troca inverte o previsto: conta como trabalho na folga prevista e como folga no dia de trabalho previsto.",
          },
          {
            termo: "Cor",
            descricao: "Cor da celula na grade, escolhida de uma paleta curta.",
          },
          {
            termo: "Pede horario na celula",
            descricao:
              "Para o evento que so significa algo com entrada e saida — apoio extra, meio periodo.",
          },
          {
            termo: "Nomeia outra pessoa",
            descricao:
              "Para cobertura de extra, troca de turno, troca interna e substituicao: o modal do dia passa a pedir com quem.",
          },
          {
            termo: "Nomeia outro posto",
            descricao: "Para troca de posto: o modal do dia passa a pedir para onde a pessoa foi.",
          },
          {
            termo: "Pede o dia trabalhado",
            descricao:
              "Para a troca de escala (TE): o modal passa a pedir a folga em que a pessoa trabalhou no lugar daquele dia, e e esse dia que conta como trabalho.",
          },
          {
            termo: "Usar como padrao desta natureza",
            descricao:
              "O evento que o previsto grava. So um por natureza: marcar um desmarca o anterior.",
          },
        ],
      },
      {
        titulo: "Desativar",
        paragrafos: [
          "Evento nao se apaga. Inativo, ele deixa de ser aceito em dias novos e continua explicando os que ja foram preenchidos.",
        ],
      },
    ],
  },

  efetivos: {
    titulo: "Efetivos",
    resumo:
      "O lancamento diario de quem esteve em cada posto — pessoa, local e horario —, com as excecoes do dia (faltas, coberturas, trocas). E um registro: nao muda a grade, as movimentacoes nem os extras.",
    secoes: [
      {
        titulo: "Lancar o efetivo do posto",
        telas: ["/efetivos"],
        passos: [
          "Data: vem com hoje. Mude se estiver lancando outro dia.",
          "Posto: digite o codigo (ou parte do nome) e de Enter.",
          "Funcionario: digite parte do nome ou a matricula, espere a lista e de Enter. Se a pessoa nao estiver cadastrada, escolha Inserir como freelancer: ela e cadastrada na hora.",
          "Local: os mais usados naquele posto aparecem primeiro. Enter com o campo vazio escolhe o primeiro; digite parte do nome para filtrar.",
          "Entrada e saida: digite so os numeros, alternando com Tab — 07 vira 07:00, 0730 ou 7:30 vira 07:30.",
          "Enter adiciona. Data e posto ficam, o resto se limpa e o cursor volta para o funcionario: lance o posto inteiro em sequencia.",
        ],
        notas: [
          "Saida menor que a entrada (19 -> 07) e um turno que vira o dia; a tela mostra a duracao e o aviso vira o dia antes de adicionar.",
          "Tab tambem escolhe o item destacado da lista e segue para o proximo campo. Passar por um campo ja preenchido sem digitar nada nao muda o valor.",
          "A mesma pessoa nao entra duas vezes no mesmo posto, no mesmo dia, com a mesma entrada.",
        ],
      },
      {
        titulo: "Excecoes do dia",
        telas: ["/efetivos"],
        paragrafos: [
          "Depois da saida, Tab leva a caixa Excecao: Espaco marca e o cursor vai para o Tipo. Digite a primeira letra do tipo (C, F, T...) e siga com Tab. Enter adiciona de qualquer campo.",
        ],
        termos: [
          {
            termo: "Cobertura de falta",
            descricao:
              "Lance quem cobriu e informe em Quem faltou a pessoa que faltou. A falta dela fica registrada junto, sem outro lancamento.",
          },
          {
            termo: "Troca interna",
            descricao:
              "Informe com quem a pessoa trocou, de qual posto ela veio, ou os dois. Ao menos um e obrigatorio.",
          },
          {
            termo: "Falta sem cobertura",
            descricao:
              "Lance quem faltou, no local e horario do turno que ficou sem ninguem. A linha aparece em vermelho, como posto descoberto.",
          },
          {
            termo: "Demais tipos",
            descricao: "So o tipo, com a observacao opcional.",
          },
        ],
        notas: [
          "Trocar o tipo limpa os campos do tipo anterior. Desmarcar Excecao na edicao tira a excecao do lancamento.",
        ],
      },
      {
        titulo: "Copiar da mesma equipe (D-2)",
        telas: ["/efetivos"],
        paragrafos: [
          "Na escala 12x36 a equipe de hoje e a de dois dias atras. Com data e posto escolhidos, o botao traz quem estava no posto em D-2 como rascunho: nada e gravado ate voce clicar em Confirmar (o botao ja vem com o foco, entao conferir e dar Enter basta). Esc ou Descartar fecha sem lancar.",
          "Vem so a equipe base — pessoa, local e horario —, nunca a excecao. Quem faltou em D-2 (com ou sem cobertura) entra, porque e da equipe, com a marca Faltou. Quem estava la por excecao (cobertura, troca, dobra, folga trabalhada) nao entra, e aparece em Nao copiados.",
        ],
        notas: [
          "Quem ja esta lancado hoje no posto vem desmarcado; pessoa ou local desativado vem bloqueado. Desmarque quem nao veio hoje e, depois de confirmar, ajuste horario ou local na lista.",
          "Sem nenhum lancamento no posto em D-2, a tela avisa e nao abre rascunho.",
        ],
      },
      {
        titulo: "Painel do dia",
        telas: ["/efetivos"],
        paragrafos: [
          "O topo da tela resume a data escolhida: quantos postos ja tem efetivo e quais ainda nao tem nenhum lancamento, as faltas sem cobertura (em vermelho: posto descoberto), as faltas cobertas e os conflitos de horario que alguem confirmou. Cada posto e cada falta leva direto ao lancamento daquele posto no dia.",
        ],
      },
      {
        titulo: "Conflito de horario",
        telas: ["/efetivos"],
        paragrafos: [
          "Ao adicionar, o portal confere se a mesma pessoa ja esta lancada em outro lugar no mesmo horario — em qualquer posto, contando o turno da noite anterior que vira o dia — ou se consta como falta naquele horario. Havendo conflito, nada e gravado: o aviso lista onde ela ja esta.",
          "Lancar mesmo assim (ja vem com o foco, entao e um Enter) grava como esta — para a dobra legitima. Corrigir ou Esc volta ao formulario. O mesmo vale para o rascunho de D-2.",
        ],
        notas: ["Turnos que so encostam (um sai 07:00, o outro entra 07:00) nao sao conflito."],
      },
      {
        titulo: "Corrigir ou excluir um lancamento",
        telas: ["/efetivos"],
        paragrafos: [
          "Editar traz o lancamento de volta para o formulario; ajuste e de Enter (Esc cancela). A lista mostra quem lancou e, quando houver, quem editou e quando.",
          "Excluir pede um segundo clique em Confirmar. Nao ha como desfazer.",
        ],
      },
      {
        titulo: "Consulta semanal",
        telas: ["/efetivos/semana"],
        paragrafos: [
          "Mostra a semana de segunda a domingo, um quadro por posto: uma linha por pessoa e uma coluna por dia, com horario, local e a excecao por extenso. E o que se le para preencher a planilha de escala.",
          "A falta aparece na linha de quem faltou: em vermelho quando o posto ficou descoberto, em ambar quando alguem cobriu (com o nome de quem cobriu). Excecao de quem trabalhou (cobertura, troca, dobra...) aparece em lilas. O +1 marca o turno que vira o dia. O rodape soma o efetivo de cada dia e os turnos descobertos.",
          "As setas andam uma semana; Esta semana volta para a atual. Para outra semana, escolha qualquer dia dela em Semana de; Posto restringe a um posto so. O dia no cabecalho abre o lancamento daquele posto naquele dia.",
        ],
        notas: [
          "Exportar Excel baixa a semana do recorte da tela em duas abas: Semana (o mesmo quadro, com as mesmas cores) e Lancamentos (uma linha por lancamento, com filtro, para conferir por pessoa, tipo ou quem lancou).",
          "Postos ativos sem nenhum lancamento na semana aparecem listados no fim da tela.",
        ],
      },
      {
        titulo: "Locais",
        telas: ["/efetivos/cadastros"],
        paragrafos: [
          "Os locais (Portaria, Ronda, CFTV, Zeladoria...) valem para todos os postos. No lancamento, cada posto ve primeiro os locais que mais usa e depois os demais em ordem alfabetica.",
          "Local que nao se usa mais e desativado, e nao apagado: ele continua explicando os lancamentos antigos, mas sai da lista do lancamento.",
        ],
      },
      {
        titulo: "Tipos de excecao",
        telas: ["/efetivos/cadastros"],
        paragrafos: [
          "Cada tipo tem um comportamento, que decide o que o lancamento pede quando a caixa Excecao e marcada:",
        ],
        termos: [
          {
            termo: "Falta sem cobertura",
            descricao:
              "Registra a falta de quem esta no lancamento e marca o posto como descoberto naquele horario.",
          },
          {
            termo: "Cobertura de falta",
            descricao:
              "Pede quem faltou. A falta dessa pessoa fica registrada junto, sem outro lancamento.",
          },
          {
            termo: "Troca",
            descricao: "Pede com quem a pessoa trocou ou de qual posto ela veio.",
          },
          { termo: "Simples", descricao: "So o tipo, com uma observacao opcional." },
        ],
        notas: [
          "O comportamento e escolhido ao cadastrar e nao muda depois: trocar reinterpretaria os lancamentos ja feitos com o tipo. Para mudar, desative o tipo e cadastre outro.",
        ],
      },
    ],
  },

  preenchimento: {
    titulo: "Preenchimento de escala",
    resumo:
      "A escala do periodo, montada como uma planilha: um posto por grade, uma coluna por dia da competencia e duas faixas por pessoa — o previsto e o realizado.",
    secoes: [
      {
        titulo: "Antes de comecar",
        passos: [
          "Tenha uma competencia aberta.",
          "Cadastre os eventos, com os padroes de trabalho e de folga.",
          "Cadastre o posto, as funcoes e as vigencias em Postos de trabalho.",
        ],
      },
      {
        titulo: "Montar a escala do posto",
        telas: ["/preenchimento/"],
        paragrafos: [
          "Na aba Incluir, escolha a funcao e a pessoa (funcionario ou freelancer). O freelancer nao precisa de cadastro previo: nasce ali, com nome e o numero pelo qual a operacao o chama; nome que ja existe reaproveita o cadastro.",
          "A mesma pessoa pode estar em duas funcoes, mas nao duas vezes na mesma.",
          "Na aba Pessoas, escolha para cada um a turma (Escala ou Contraescala) e a sigla do previsto. Com uma sigla diferente da funcao (N numa portaria de D), aparecem entrada e saida: e o horario do previsto dessa pessoa, ja sugerido como o turno do outro lado do relogio. Os dias ao lado mostram na hora o que a escolha produz, um embaixo do outro: dia em que ninguem trabalha e dia descoberto — quase sempre alguem na turma errada.",
          "As mudancas so valem depois de Gravar, no topo da funcao (Enter na observacao tambem grava). Descartar volta ao que estava. Para retirar alguem incluido por engano, use a lixeira e confirme: os dias ja preenchidos dessa pessoa vao junto.",
        ],
      },
      {
        titulo: "Previsto (P) e realizado (R)",
        telas: ["/preenchimento/"],
        termos: [
          {
            termo: "P — previsto",
            descricao:
              "Sai das vigencias da turma que a pessoa segue. E somente leitura: muda em Postos de trabalho, e nao celula a celula.",
          },
          {
            termo: "R — realizado",
            descricao: "Clique no dia para registrar o que aconteceu.",
          },
          {
            termo: "Sublinhado",
            descricao: "O realizado difere do previsto.",
          },
          {
            termo: "Sigla propria da linha",
            descricao:
              "Troca so a letra do previsto (o N de quem cobre a noite). O horario sai em branco nesses dias.",
          },
          {
            termo: "TE — troca de escala",
            descricao:
              'A pessoa folgou num dia de trabalho e trabalhou numa folga, sem trocar com ninguem. Lance TE no dia em que ela folgou e escolha o dia trabalhado: o modal mostra as marcacoes daquele dia, e "Usar as marcacoes" preenche o horario. O dia da TE conta como folga; o dia trabalhado, como trabalho, e aparece com TE em contorno. Um F que estivesse la e substituido.',
          },
          {
            termo: "TI — troca interna",
            descricao:
              "Dois colegas trocam folgas. Lance TI nos dois dias, dizendo com quem: na folga prevista conta como trabalho (e folga trabalhada); no dia de trabalho previsto, como folga.",
          },
        ],
      },
      {
        titulo: "O modal do dia",
        telas: ["/preenchimento/"],
        paragrafos: [
          'Registre sigla, horario, quem cobriu, para onde a pessoa foi e a observacao. "Igual ao previsto" preenche os campos com o previsto — o dia so e gravado ao confirmar. Gravar nao fecha o modal: o dia continua aberto, ja com o que foi gravado.',
          'Sigla que exige pessoa ou destino nao grava sem eles. "Apagar este dia" limpa o dia inteiro.',
          "A caixa de Extra lanca o dia em Conferencia de horas extras e exige o horario. O lancamento e de quem cobriu o turno, quando o dia nomeia alguem; sem ninguem nomeado (ou numa troca interna), e do proprio dono da linha. Na TE, o extra sai com a data do dia trabalhado. Desmarcar ou apagar o dia remove o lancamento.",
          "A caixa de intrajornada registra que o intervalo nao foi usufruido. Ela fica so no dia e nao vira lancamento.",
          "As setas para a esquerda e para a direita (ou os botoes ao lado da data) abrem o dia anterior e o seguinte da mesma pessoa, sem fechar o modal. Com o cursor dentro de um campo, a seta e do campo. Se o dia tem alteracao nao gravada, a primeira seta avisa e a segunda troca sem gravar.",
        ],
      },
      {
        titulo: "Sinalizar um dia (!)",
        telas: ["/preenchimento/"],
        paragrafos: [
          "O botao ! ao lado do Relogio de ponto, no modal do dia, sinaliza o dia para conferir depois: ele vai para a tela Dias sinalizados, com a pessoa, o posto e a data. Sinalizar nao grava nada do que estiver digitado nos campos do dia.",
          "Com o dia sinalizado, o campo O que conferir aceita uma frase curta (bateu so a entrada, cobriu sem avisar). Ela grava ao sair do campo ou no Enter, e vai na tela Dias sinalizados e na mensagem ao responsavel do posto.",
          "Clicar de novo tira a marca enquanto ela esta pendente. Um dia ja resolvido mostra Resolvido, e o ! o devolve aos pendentes — e ao proximo envio ao responsavel.",
          "Na grade, o dia sinalizado e pendente ganha um ! vermelho no canto inferior direito da celula.",
        ],
      },
      {
        titulo: "Preencher varios dias",
        telas: ["/preenchimento/"],
        paragrafos: [
          'Escolha pessoas, intervalo e o que gravar: "igual ao previsto" ou uma sigla fixa (ferias do mes inteiro). So os dias em branco recebem o lote — dia ja preenchido fica como esta.',
          "O lote grava so a sigla, sem horario, sem extra e sem intrajornada.",
        ],
      },
      {
        titulo: "Sinais do relogio de ponto",
        telas: ["/preenchimento/"],
        termos: [
          {
            termo: "Ponto azul",
            descricao: "Houve batida e o dia esta em branco.",
          },
          {
            termo: "Ponto ambar",
            descricao:
              "O dia diz trabalho e nao houve batida, ou diz folga, falta ou afastamento e houve.",
          },
        ],
        notas: [
          "A grade nunca se preenche pelo relogio — o sinal so aponta a contradicao. Fora do periodo importado nao ha sinal, e freelancer nunca tem.",
        ],
      },
      {
        titulo: "Na virada da competencia",
        paragrafos: [
          "As linhas da grade (pessoas, turmas, siglas e ordem) seguem para a nova competencia; os dias comecam em branco.",
        ],
      },
    ],
  },

  extras: {
    titulo: "Conferencia de horas extras",
    resumo:
      "Quem fez hora extra na competencia, em que horario, em que posto e local e o que explica o dia. E o extra reconhecido, e nao a divergencia calculada pela analise de ponto.",
    secoes: [
      {
        titulo: "Registrar um extra",
        telas: ["/extras/novo", "/extras/"],
        passos: [
          "Escolha o colaborador na lista, ou digite o nome de um freelancer novo — nunca os dois.",
          "Informe a data (dentro da competencia em vigor), entrada e saida. Saida menor que a entrada vira o dia.",
          "Escolha o posto e, se precisar, o local (Portaria 2, Fortaleza II).",
          "Explique o dia na observacao e registre.",
        ],
        notas: [
          "O mesmo extra nao entra duas vezes: mesma pessoa, dia, posto e horario de entrada. Sem posto ativo cadastrado nao ha como registrar.",
        ],
      },
      {
        titulo: "Extras vindos da grade",
        paragrafos: [
          "A cobertura marcada como Extra no preenchimento de escala aparece aqui com o selo Grade. Ela se edita e se apaga como qualquer outra, mas regravar aquele dia na grade a reescreve.",
        ],
      },
      {
        titulo: "Lista, filtros e total",
        telas: ["/extras"],
        paragrafos: [
          "A busca casa com colaborador, matricula, posto, local, observacao e data. Os filtros (posto, intervalo de datas, tipo e origem) somam com a competencia, e o total do rodape soma o recorte inteiro, e nao so a pagina.",
        ],
      },
      {
        titulo: "Corrigir ou apagar",
        telas: ["/extras/"],
        paragrafos: [
          "Lancamento errado se apaga: enquanto a linha existir, ela soma horas que ninguem fez.",
        ],
      },
    ],
  },

  movimentacoes: {
    titulo: "Movimentacoes",
    resumo:
      "O registro das faltas, trocas internas e trocas de escala da competencia: quem, quando, por que e os documentos que comprovam. E um registro — nao muda a grade, o ponto nem o apontamento.",
    secoes: [
      {
        titulo: "Registrar uma movimentacao",
        telas: ["/movimentacoes"],
        passos: [
          'Clique em "Registrar movimentacao" e escolha o tipo: Falta, Troca interna ou Troca de escala.',
          "Informe a data. Ela precisa cair dentro da competencia em vigor.",
          'Na falta, escolha quem faltou e, se houve, quem cobriu. Nas trocas, escolha as pessoas envolvidas (ao menos duas; "Adicionar pessoa" abre mais vagas, ate seis).',
          "Escreva a justificativa.",
          "Arraste o atestado ou o print da conversa para a area de documentos e salve.",
        ],
      },
      {
        titulo: "Documentos",
        telas: ["/movimentacoes"],
        paragrafos: [
          "Os documentos entram arrastando e soltando, colando um print com Ctrl+V ou clicando na area para escolher o arquivo. Nao ha campo de link: o documento fica guardado no proprio portal.",
          "Imagens sao reduzidas automaticamente antes do envio — a tela mostra o tamanho antes e depois. PDF vai como esta, ate 2 MB; se for maior, envie uma foto ou print do documento.",
          "Cada movimentacao aceita ate 4 documentos. Na edicao, o X tira um documento ja gravado (ele so sai ao salvar) e a seta desfaz.",
        ],
        notas: [
          "Foto em HEIC (iPhone) que o navegador nao abre e recusada com aviso: salve como JPG ou envie um print.",
        ],
      },
      {
        titulo: "Consultar, filtrar e exportar",
        telas: ["/movimentacoes"],
        paragrafos: [
          "A busca casa com o nome ou a matricula de qualquer pessoa envolvida, a justificativa e a data. Os filtros (tipo, intervalo de datas e com ou sem documento) somam com a competencia.",
          '"Exportar Excel" baixa a planilha com tudo o que o recorte alcanca — todas as paginas, uma linha por movimentacao.',
        ],
      },
      {
        titulo: "Corrigir ou excluir",
        telas: ["/movimentacoes"],
        paragrafos: [
          '"Abrir" mostra a movimentacao no mesmo modal, para corrigir qualquer campo. Excluir pede confirmacao e leva junto os documentos — nao ha como desfazer.',
        ],
      },
    ],
  },

  sinalizacoes: {
    titulo: "Dias sinalizados",
    resumo:
      "Os dias que alguem marcou com o ! ao preencher a escala, para conferir com calma. So aparece o que foi sinalizado na grade — nada da analise de ponto, das pendencias ou das tratativas.",
    secoes: [
      {
        titulo: "De onde vem a lista",
        telas: ["/sinalizacoes"],
        paragrafos: [
          "Cada linha e um dia sinalizado no modal do dia do Preenchimento de escala, na competencia em vigor: a data, quem, o posto e a funcao, o que a grade registra naquele dia, quem sinalizou e quando.",
          "Abrir na grade leva ao posto com aquele dia ja aberto — e la que ficam as marcacoes do relogio e o resto do dia. O link so aparece a quem tem acesso ao Preenchimento de escala.",
        ],
      },
      {
        titulo: "Resolver",
        telas: ["/sinalizacoes"],
        paragrafos: [
          "Resolver tira o dia dos pendentes e grava quem resolveu e quando. Ele continua no filtro Resolvidos, e Reabrir o devolve aos pendentes.",
          "Para tirar a marca de vez (sinalizou o dia errado), clique de novo no ! no modal do dia enquanto ela esta pendente.",
        ],
      },
      {
        titulo: "Envio aos responsaveis",
        telas: ["/sinalizacoes/responsaveis", "/sinalizacoes"],
        paragrafos: [
          "Junta numa mensagem so, por WhatsApp, os dias sinalizados por todo mundo nos postos de cada responsavel — o responsavel cadastrado no posto, em Postos de trabalho. Cada dia sai num bloco separado, numerado: o nome da pessoa (sem matricula), a data com o dia da semana, as marcacoes do relogio e o O que conferir — sem posto, funcao, previsto ou o que a escala registra. A mensagem termina pedindo o retorno o mais breve possivel.",
          "Pre-visualizar mostra o texto exato; nada sai antes de Confirmar envio. Entram so os dias pendentes que ainda nao foram enviados a ele, ate 30 por mensagem.",
          "Enviar nao resolve: o dia continua pendente, com Enviado a ... na lista, ate alguem resolver quando o responsavel responder. Sinalizar de novo pelo ! um dia resolvido o devolve ao proximo envio.",
        ],
        notas: [
          "Posto sem responsavel aparece no fim da tela: os dias dele nao tem a quem ir. Responsavel sem telefone ou desativado bloqueia o envio ate o cadastro ser corrigido.",
        ],
      },
    ],
  },

  acessos: {
    titulo: "Acessos",
    resumo:
      "Cada usuario enxerga apenas as areas liberadas para ele. Nao ha perfis nem cargos: o administrador e a unica excecao e enxerga tudo.",
    secoes: [
      {
        titulo: "Cadastrar um usuario",
        telas: ["/acessos/novo"],
        passos: [
          "Informe nome e login.",
          "Marque as areas que a pessoa pode abrir, ou o perfil de administrador.",
          "Salve e entregue a senha provisoria exibida. Ela aparece uma vez so; no primeiro acesso a pessoa e obrigada a troca-la.",
        ],
      },
      {
        titulo: "Editar, desativar e redefinir senha",
        telas: ["/acessos/"],
        paragrafos: [
          "Desativar encerra as sessoes abertas e bloqueia o login. Redefinir a senha gera outra provisoria e derruba as sessoes da pessoa.",
          "Para trocar a propria senha, use o menu do seu nome no rodape.",
        ],
      },
      {
        titulo: "Travas",
        paragrafos: [
          "Ninguem desativa a propria conta, remove o proprio perfil de administrador nem tira de si a area Acessos.",
          "Somente um administrador promove outro, altera ou redefine a senha de um administrador.",
        ],
      },
    ],
  },
};
