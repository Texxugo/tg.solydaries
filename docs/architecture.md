# Arquitetura — Portal TG

> Documento vivo. Atualize junto com [CLAUDE.md](../CLAUDE.md) sempre que uma
> decisao relevante for tomada.
>
> Ultima atualizacao: 2026-10-02 (correcao de ponto pelo responsavel do posto).

## 1. Visao geral

Aplicacao Next.js (App Router) que serve UI e API no mesmo processo, com
PostgreSQL como unica fonte de dados. Nao ha backend separado: as regras de
negocio vivem em Server Components (leitura) e Server Actions (escrita).

```
Navegador
   |  HTML/RSC payload, POST de Server Action
   v
Next.js 16 (Node.js 24) ................. src/app/**
   |-- Server Components  -> queries.ts  -> Drizzle -> pg Pool
   |-- Server Actions     -> actions.ts  -> Drizzle -> pg Pool
   `-- Route Handlers     -> src/app/api/**
                                              |
                                              v
                                   PostgreSQL 18 (Docker)
```

## 2. Camadas

| Camada           | Local                                      | Responsabilidade                      |
| ---------------- | ------------------------------------------ | ------------------------------------- |
| Apresentacao     | `src/app/**`, `src/features/*/components/` | rotas, layout, composicao de UI       |
| Primitivos de UI | `src/components/ui/`                       | componentes shadcn, sem dominio       |
| Aplicacao        | `src/features/*/actions.ts`, `queries.ts`  | casos de uso, validacao, orquestracao |
| Contratos        | `src/features/*/schema.ts`, `types.ts`     | schemas Zod e tipos compartilhados    |
| Dados            | `src/db/`                                  | conexao, schema Drizzle, migrations   |
| Infra local      | `docker-compose.yml`, `.env`               | PostgreSQL e configuracao             |

Regra de dependencia: apresentacao -> aplicacao -> dados. Nunca o inverso, e
nunca da apresentacao direto para `src/db`.

## 3. Estrutura de diretorios

```
src/
  app/
    layout.tsx                 # layout raiz, fontes Geist, <ProvedorTema>, <Toaster />
    (auth)/                    # telas de credencial, layout de cartao centrado
      login/page.tsx
      trocar-senha/page.tsx
    (portal)/                  # rotas autenticadas, layout com menu lateral
      layout.tsx               # exigirUsuario(); monta o menu so com o que o usuario abre
      page.tsx                 # home: cartoes das areas do usuario
      competencias/page.tsx    # base temporal: competencia ativa e consulta as anteriores
      escalas/                 # regras de jornada (area "escalas")
        page.tsx               # lista de escalas
        nova/page.tsx          # cadastro
        [id]/page.tsx          # horarios, ciclo, dias do ciclo, extras e situacao
      funcionarios/            # quem tem jornada (area "funcionarios")
        page.tsx               # lista, filtros e atribuicao de escala em lote
        novo/page.tsx          # cadastro manual
        importar/page.tsx      # carga do relatorio da folha (.xlsx), com previa
        [id]/page.tsx          # dados da folha, escala, inicio de ciclo e jornada de hoje
      ponto/                   # analise de ponto (area "ponto")
        page.tsx               # conferencia da competencia: uma linha por funcionario
        importar/page.tsx      # carga do relatorio de marcacoes (.txt), com previa
        [id]/page.tsx          # o dia a dia de uma pessoa, lido contra a escala
        pendencias/            # painel de ocorrencias e tratativas
          page.tsx             # uma linha por ocorrencia, com filtros e status
          [funcionarioId]/[data]/[tipo]/page.tsx  # a ocorrencia: tratativa, mensagem e historico
      apontamentos/            # fechamento da folha (area "apontamentos")
        page.tsx               # uma linha por funcionario, com o apontamento da competencia
        [funcionarioId]/page.tsx  # as rubricas da pessoa, com o espelho de ponto ao lado
        exportar/word/route.ts    # GET: relatorio da competencia (.docx)
        exportar/excel/route.ts   # GET: planilha, uma linha por funcionario (.xlsx)
      postos/                  # postos e funcoes (area "postos")
        page.tsx               # lista de postos, com as funcoes de cada um
        novo/page.tsx          # cadastro do posto
        [id]/page.tsx          # abas: dados, funcoes (um form por funcao) e responsavel
      eventos/                 # vocabulario da grade (area "eventos")
        page.tsx               # lista de siglas
        novo/page.tsx          # cadastro
        [id]/page.tsx          # sigla, natureza, cor, horario e padrao
      preenchimento/           # a escala do periodo (area "preenchimento")
        page.tsx               # abas: os postos que a grade abre, e as siglas aceitas
        [postoId]/page.tsx     # abas: a grade do posto, incluir na escala, pessoas
      extras/                  # conferencia de horas extras (area "extras")
        page.tsx               # lista da competencia, com busca e total do periodo
        novo/page.tsx          # registro: colaborador, horario, posto, local e observacao
        [id]/page.tsx          # edicao do extra e exclusao
      movimentacoes/           # faltas e trocas (area "movimentacoes")
        page.tsx               # lista com filtros; registro e edicao num modal
        exportar/route.ts      # GET: planilha .xlsx do recorte
        documentos/[id]/route.ts # GET: o documento (imagem ou PDF), inline
      acessos/                 # gestao de acessos (area "acessos")
        page.tsx               # lista de usuarios
        novo/page.tsx          # cadastro
        [id]/page.tsx          # areas, situacao, perfil e senha
    api/health/route.ts        # healthcheck app + banco
  proxy.ts                     # checagem otimista de sessao (Next 16; ex-middleware)
  components/ui/               # shadcn (gerado pelo CLI)
  features/
    competencias/
      periodo.ts               # nome e formatacao do periodo (modulo puro)
      schema.ts  types.ts  queries.ts  actions.ts  components/
    escalas/
      jornada.ts               # ciclo, regra do dia, duracao e virada (modulo puro)
      schema.ts  types.ts  queries.ts  actions.ts  components/
    funcionarios/
      afastamentos.ts          # ferias, atestado e INSS: periodos (modulo puro)
      cpf.ts                   # normalizacao e digitos verificadores (modulo puro)
      situacoes.ts             # catalogo das situacoes da folha (modulo puro)
      telefone.ts              # normalizacao e formatacao do WhatsApp (modulo puro)
      planilha.ts              # leitura do relatorio: celulas -> funcionarios (modulo puro)
      importacao.ts            # plano da carga: criar, atualizar, recusar (modulo puro)
      xlsx.ts                  # leitor minimo de .xlsx (ZIP + XML), server-only
      schema.ts  types.ts  queries.ts  actions.ts  components/
    ponto/
      relatorio.ts             # leitura do TXT do relogio: linhas -> batidas (modulo puro)
      apuracao.ts              # a leitura das batidas contra a escala (modulo puro)
      carga.ts                 # plano da carga: gravar, ignorar, recusar (modulo puro)
      inferencia.ts            # as batidas contra o catalogo: que escala e esta? (modulo puro)
      tratativas.ts            # catalogo dos status da tratativa (modulo puro)
      mensagens.ts             # modelo do texto ao colaborador e ao responsavel (modulo puro)
      contato.ts               # destino da mensagem, bloqueio e prazo de retorno (modulo puro)
      zapi.ts                  # cliente HTTP da Z-API (WhatsApp), server-only
      schema.ts  types.ts  queries.ts  actions.ts  components/
    apontamentos/
      rubricas.ts              # catalogo das rubricas, unidades, leitura e escrita (modulo puro)
      espelho.ts               # a apuracao do ponto resumida nas rubricas (modulo puro)
      exportacao/
        tipos.ts               # contratos, nome do arquivo e link de download (modulo puro)
        planilha.ts            # colunas da planilha, na ordem da folha (modulo puro)
        relatorio.ts           # totais e agrupamento do relatorio (modulo puro)
        dados.ts               # apontados do recorte + postos da grade, server-only
        excel.ts  word.ts      # geradores com exceljs e docx, server-only
        resposta.ts            # o download: acesso, recorte, gerador e cabecalhos
      regras/
        campos.ts              # rubrica, gatilho e acao: a ponte com o enum (modulo puro)
        calculo.ts             # as regras aplicadas aos dias de uma pessoa (modulo puro)
        descricao.ts           # como a regra se le na tela (modulo puro)
        schema.ts  types.ts  queries.ts  actions.ts  components/
      schema.ts  types.ts  queries.ts  actions.ts  components/
    postos/
      busca.ts                 # busca de funcionario da aba Responsavel ("use server")
      schema.ts  types.ts  queries.ts  actions.ts  components/
    eventos/
      cores.ts                 # cor e natureza de cada evento (modulo puro)
      schema.ts  types.ts  queries.ts  actions.ts  components/
    preenchimento/
      grade.ts                 # dias do periodo, chave da celula e totais (modulo puro)
      previsto.ts              # vigencias, turmas e derivacao do previsto (modulo puro)
      schema.ts  types.ts  queries.ts  actions.ts  components/
    extras/
      colaborador.ts           # o par origem+id do campo de pessoa (modulo puro)
      schema.ts  types.ts  queries.ts  actions.ts  components/
    movimentacoes/
      arquivos.ts              # tipos aceitos, assinatura e limites dos documentos (puro)
      compressao.ts            # reducao da imagem no navegador (client)
      documentos.ts            # conferencia e gzip no servidor (server-only)
      exportacao.ts            # a planilha .xlsx (server-only)
      busca.ts                 # busca de pessoa do modal (Server Action de leitura)
      schema.ts  types.ts  queries.ts  actions.ts  components/
    auth/
      schema.ts  types.ts  session.ts  login-lembrado.ts  queries.ts  actions.ts  components/
    acessos/
      areas.ts                 # catalogo das areas (modulo puro) + podeAcessar()
      schema.ts  types.ts  queries.ts  actions.ts  components/
    navegacao/
      modulos.ts               # catalogo dos modulos (modulo puro) + modulo de cada area
      icones.ts                # icone de cada modulo e de cada area
      types.ts  components/    # menu-lateral.tsx (Sidebar) e menu-usuario.tsx (rodape)
    ajuda/
      conteudo.ts              # o texto de ajuda de cada area (modulo puro)
      rota.ts                  # area e secoes da rota atual (modulo puro)
      components/              # botao-ajuda.tsx (botao fixo + Sheet)
    tema/
      temas.ts                 # catalogo dos temas e chave do localStorage (modulo puro)
      components/              # provedor-tema.tsx (next-themes) e submenu-tema.tsx
  db/
    index.ts                   # Pool pg singleton + instancia Drizzle
    schema/                    # tabelas (uma por arquivo, reexportadas)
    migrations/                # SQL versionado, gerado por drizzle-kit
  hooks/
    use-mobile.ts              # shadcn, reescrito com useSyncExternalStore
  lib/
    env.ts                     # validacao Zod das variaveis de ambiente
    postgres.ts                # reconhecimento de erro do Postgres (unique_violation)
    senha.ts                   # hash scrypt + senha provisoria (compartilhados com o seed)
    utils.ts                   # cn() do shadcn
scripts/
  seed-usuarios.mts            # cria usuario com senha provisoria (roda no Node puro)
```

Os grupos `(auth)` e `(portal)` nao aparecem na URL: separam o layout de
credencial do layout autenticado sem mexer nos links.

## 4. Fluxo de dados

### Leitura (`GET /competencias`)

1. `CompetenciasPage` (Server Component) chama `listarCompetencias()`.
2. `listarCompetencias()` executa `await connection()` — interrompe o prerender e
   marca a rota como dinamica (`ƒ` no output do build).
3. Drizzle emite o `SELECT` pelo Pool `pg`.
4. O RSC payload renderizado vai para o navegador; nenhum dado de banco
   atravessa a fronteira client sem passar por um Server Component.

Sem essa chamada a `connection()`, o Next resolveria a query no build e a pagina
serviria a lista congelada do momento do deploy.

### Escrita (`POST` de Server Action)

1. `<form action={formAction}>` envia `FormData`; `useActionState` expõe
   `pendente` e o estado de retorno.
2. `abrirCompetencia()` revalida a entrada com `abrirCompetenciaSchema`. Falha
   -> retorna `{ status: "error", erros }`, renderizado por campo, sem tocar no
   banco.
3. Sucesso -> `UPDATE` + `INSERT` na mesma transacao via Drizzle.
4. `refresh()` de `next/cache` atualiza a rota atual; a lista chega nova no
   mesmo roundtrip.
5. O formulario reseta e o toast de sucesso aparece.

O formulario funciona sem JavaScript (progressive enhancement): o Next injeta os
campos `$ACTION_*` no HTML.

### Autenticacao (`POST` de `/login`)

1. `src/proxy.ts` roda antes de tudo. Sem cookie de sessao e fora de `/login`,
   redireciona para `/login?redirecionar=<rota>`. E uma checagem **otimista**:
   olha so a presenca do cookie, sem tocar no banco, porque o proxy roda em toda
   navegacao (inclusive prefetch).
2. `entrar()` valida com `loginSchema`, busca o usuario e compara a senha com
   `verificarSenha()`. Login inexistente ainda roda um hash descartavel, para
   que o tempo de resposta nao denuncie quem esta cadastrado.
3. Sucesso -> `criarSessao()` grava a linha em `sessoes` (com o SHA-256 do
   token) e emite o cookie `portal_tg_sessao` — `httpOnly`, `sameSite=lax`,
   `secure` em producao.
   Com "Lembrar meu usuario" marcado, grava tambem `portal_tg_login_lembrado`
   (so o login, um ano) — desmarcado, apaga. E um cookie a parte, sem valor de
   credencial, e por isso o logout nao o toca.
4. Se `usuarios.senha_provisoria` for `true`, o destino vira `/trocar-senha`,
   ignorando o `?redirecionar=`.
5. Em toda rota autenticada, `exigirUsuario()` (a DAL) faz a checagem real:
   join `sessoes x usuarios`, sessao nao expirada, usuario ativo. Senha ainda
   provisoria -> redireciona para `/trocar-senha`.
6. `trocarSenha()` confere a senha atual, grava o novo hash, zera
   `senha_provisoria`, revoga **todas** as sessoes do usuario e abre uma nova
   para o navegador atual.

A tela de login le esse cookie no Server Component e devolve o campo preenchido
com o foco ja na senha. O valor passa pelo `loginSchema` na leitura: cookie e
entrada do usuario, e nao vira `defaultValue` sem validacao.

O `exigirUsuario()` e memoizado com `cache()` do React: layout, pagina e Server
Action da mesma requisicao compartilham uma consulta so. Por isso ele e repetido
em cada camada em vez de confiar apenas no layout de `(portal)` — layout nao roda
em toda navegacao, e Server Action nenhuma passa por ele.

### Autorizacao (`GET /acessos`, `GET /competencias`)

1. `obterUsuarioAtual()` carrega, junto da sessao, as areas concedidas ao
   usuario (`select` em `acessos` pelo `usuario_id`). Uma consulta por
   requisicao, nao por chamada, gracas ao mesmo `cache()`.
2. A rota chama `exigirAcesso("<area>")`, que delega a decisao a
   `podeAcessar()`: administrador passa sempre; os demais precisam da area na
   lista. Sem acesso -> `redirect("/")`.
3. As Server Actions da area repetem `exigirAcesso()` — elas nao passam pela
   pagina nem pelo layout.
4. O layout de `(portal)` monta o menu com `modulosVisiveis()` e
   `areasDaConta()`, e a home lista as mesmas areas como cartoes. E
   conveniencia: esconder o link nao autoriza nada.

Perder uma area tem efeito imediato, sem tocar nas sessoes: a DAL reconsulta
`acessos` a cada requisicao. Ja **desativar** um usuario derruba as sessoes na
hora, porque a sessao continuaria valida ate expirar.

### Navegacao (menu lateral)

1. O layout de `(portal)` chama `modulosVisiveis(usuario)`: cada modulo do
   catalogo fica so com as areas que passaram por `podeAcessar()`, e modulo sem
   opcao nenhuma some da lista.
2. `areasDaConta(usuario)` devolve as areas mapeadas para modulo `null` — hoje
   so `acessos`. Elas nao entram na navegacao por modulos: vao para o menu que
   abre no nome do usuario, junto de "Trocar senha", "Tema" e "Sair".
3. O layout passa as duas listas prontas para `<MenuLateral>` (Client
   Component), junto de um recorte do usuario (`nome`, `login`, `perfil`) — a
   `UsuarioSessao` inteira nao atravessa a fronteira.
4. No cliente, `usePathname()` marca a opcao ativa (e as telas filhas, como
   `/acessos/novo`) e abre o modulo que contem a rota atual. Aberto e fechado
   sao estado do componente, entao o que o usuario fizer no menu sobrevive as
   navegacoes seguintes.
5. `SidebarProvider` grava aberto/fechado no cookie `sidebar_state`; o layout
   le esse cookie no servidor e ja renderiza o menu no estado certo, sem piscar
   no primeiro paint.

Modulo e agrupamento visual: nao existe no banco, nao tem enum e nao participa
de nenhuma decisao de acesso. Reagrupar areas e editar `modulos.ts`, sem
migration. O preco e que a navegacao passa a exigir JavaScript (Radix
`Collapsible` e `DropdownMenu`) — as paginas continuam acessiveis por URL, mas
navegar e sair do portal, nao.

### Ajuda (o botao no canto da tela)

1. O layout de `(portal)` desenha `<BotaoAjuda>` uma vez, depois do conteudo.
   Toda tela autenticada ganha o botao sem que a pagina precise lembrar dele.
2. No cliente, `ajudaDaRota(usePathname())` acha a area pelo mesmo prefixo de
   `href` que o menu usa; fora de qualquer area (a home) vale `AJUDA_GERAL`.
3. Dentro da area, cada secao declara as `telas` de que fala. Tela terminada
   em `/` casa com o que vier depois; sem a barra, so com o caminho exato. Vale
   so o encaixe **mais longo**, porque `/funcionarios/importar` tambem comeca
   com `/funcionarios/` e a importacao nao e a ficha. As secoes que casam sobem
   para o topo com a marca "Nesta tela".
4. O painel e um `Sheet` (Radix Dialog) com o resumo da area e as secoes em
   paragrafos, passos numerados, termos e notas.

A ajuda e texto estatico: nao le banco nem sessao, e por isso e modulo puro. O
`Record<AreaPortal, Ajuda>` amarra o catalogo ao enum, como em `areas.ts` e
`modulos.ts` — area nova sem ajuda quebra o typecheck.

### Tema (claro, escuro, sistema)

1. O layout raiz envolve o portal inteiro em `<ProvedorTema>` (`next-themes`),
   inclusive as telas de login — o tema vale antes de haver sessao.
2. No HTML do servidor vai um script que le a escolha do `localStorage`
   (`portal-tg-tema`) e poe a classe `dark` no `<html>` antes do primeiro
   paint. O `<html>` leva `suppressHydrationWarning` porque essa classe nao
   existe no HTML que o servidor gerou.
3. O `globals.css` le a classe (`@custom-variant dark`) e troca os tokens; os
   componentes do shadcn e as cores de evento ja trazem as variantes `dark:`.
4. A escolha muda pelo submenu "Tema" no menu do usuario (Claro, Escuro,
   Sistema). "Sistema" e o padrao e acompanha o aparelho.

O destaque e **#6DC9A6** nos dois temas, declarado uma vez em `--destaque` e
repassado a `--primary`, `--ring` e `--sidebar-primary`. Por ser um verde claro,
o texto sobre ele e escuro (`--destaque-foreground`) e ele nao vira cor de texto
sobre fundo claro. A escolha fica no navegador, e nao no banco: e preferencia
do aparelho, e precisa valer na tela de login.

### Competencia (a base temporal)

Toda informacao do portal pertence a uma competencia — o periodo entre duas
datas, batizado pelo mes da data final (21/07 a 21/08 e Agosto). O portal mostra
so a competencia em vigor: virar a competencia esvazia as telas sem apagar nada.

1. `competenciaEmVigor()` (DAL memoizada) responde de que periodo sao os dados
   desta requisicao: a competencia consultada nesta sessao de login, se houver,
   senao a competencia `aberta` do portal. `null` significa "nao ha o que
   mostrar", e nao "mostre tudo".
2. Toda leitura de dado datado filtra por essa competencia; toda escrita comeca
   por `competenciaDeEscrita()`, que devolve a mesma competencia — a
   consultada, durante uma consulta — e recusa quando nao ha nenhuma. Quem
   manda `esperada` (formularios sem data) e recusado se a competencia em vigor
   mudou desde que a tela foi desenhada.
3. `abrirCompetencia()` encerra a atual e insere a nova **na mesma transacao**.
   O indice parcial unico sobre `status = 'aberta'` garante que duas requisicoes
   simultaneas nao deixem o portal com dois presentes ao mesmo tempo. Na mesma
   transacao, `levarGradeAdiante()` copia as linhas da grade (pessoa, funcao,
   turma, sigla e ordem) para a nova — sem as celulas nem a observacao da linha,
   e sem quem foi desativado — e grava como ancora das vigencias "desde sempre"
   sem ancora o primeiro dia da competencia que se encerra, para que o ciclo
   continue em vez de recomecar no dia 21.
4. `consultarCompetencia()` grava uma linha em `consultas_competencia` presa a
   sessao de login. Ate ela ser encerrada (ou a sessao acabar), essa sessao le
   e grava na competencia consultada; a aberta do portal nao muda e mais
   ninguem — nem o mesmo usuario em outro navegador — ve diferenca.
5. O layout de `(portal)` desenha a competencia em vigor na barra superior e,
   durante uma consulta, uma faixa com a saida — a troca vale para todas as
   telas, entao o aviso nao pode depender de cada pagina lembrar de dar.

O nome da competencia nao e digitado nem gravado: `competencias.referencia` e
coluna gerada (`date_trunc('month', data_fim)`) e o rotulo sai dela em
`periodo.ts`. Assim o nome nunca discorda do periodo, e o indice unico sobre
`referencia` impede duas competencias do mesmo mes.

A consulta vive no banco, e nao em cookie: ela decide **onde os dados sao lidos
e gravados**, e cookie e cliente. Ela nao tem prazo proprio: com escrita
liberada, uma consulta que expirasse sozinha mudaria o destino das gravacoes no
meio do trabalho. Quem a encerra e a pessoa, ou o fim da sessao (`cascade`).

### Escala (a regra da jornada)

A escala descreve o que era para acontecer no dia: entrada, saida, ciclo de
trabalho, intrajornada, hora extra ja prevista e quantas marcacoes o dia deve
ter. Ela nao registra nada — e a referencia contra a qual a marcacao de cada
funcionario sera lida.

1. O dia trabalhado vem de um **ciclo**, e nao de dias da semana: `dias_ciclo`
   diz de quantos em quantos dias o padrao se repete e `escala_folgas` marca
   quais posicoes sao folga — o que nao esta la e dia de trabalho. O 5x2 e um
   ciclo de 7 com folga no 6 e no 7; o 12x36, um ciclo de 2 com folga no dia 2
   (as 12 horas ja estao em `entrada`/`saida`); o **6x1 de folga alternada**, um
   ciclo de 14 com folga no 7 e no 13 — folga no domingo de uma semana e no
   sabado da outra. E esse ultimo que obriga a guardar posicoes: as duas folgas
   nao sao vizinhas, e nenhum par "N trabalhados x M de folga" as descreve.
2. O ciclo e um padrao; **em que dia ele comeca a valer e de cada funcionario**.
   Por isso a escala nao guarda data nenhuma e `ehDiaTrabalhado(data,
inicioCiclo, ciclo)` recebe o inicio de fora: a mesma 12x36 serve todas as
   turmas, e a coluna com essa data nasce junto do cadastro de funcionarios.
3. `listarEscalas()` e `obterEscala()` sao um `select` so — o ciclo sao duas
   colunas, entao nao ha tabela filha a juntar. As ativas vem primeiro.
4. `criarEscala()` / `atualizarEscala()` validam com o mesmo bloco de campos
   (`camposDaEscala` em `schema.ts`): a edicao acrescenta id e situacao, nunca
   uma regra diferente.
5. `virada_turno` nao chega do formulario: e coluna gerada (`saida < entrada`).
   A tela mostra o efeito antes de gravar chamando `temViradaDeTurno()` do mesmo
   modulo puro que a UI usa para duracao e rotulos.
6. Nao ha exclusao. `ativa = false` tira a escala das escolhas novas e a mantem
   disponivel para explicar as jornadas que ja foram interpretadas por ela.
7. Um dia do ciclo pode fugir do padrao — sair mais cedo, ser meio periodo, ter
   outro intervalo. Esse ajuste vira linha em `escala_excecoes`, presa a
   **posicao no ciclo** (`dia_ciclo`), e nao ao dia da semana: e o ciclo que diz
   o que e dia de trabalho, e a excecao so ajusta um desses dias.
8. `definirDiasDoCiclo()` recebe **todos** os dias trabalhados, cada um com a
   jornada inteira, e grava como excecao apenas os que diferem do padrao
   (`mesmaJornada()`). Devolver um dia aos valores da escala apaga o ajuste — nao
   ha checkbox de "este dia e diferente" a manter em dia com os campos.
9. Quais dias existem — e quais deles sao de trabalho — vem do banco
   (`dias_ciclo` + `escala_folgas`), e nao do formulario: campo `dia-6-*`
   postado na mao num 5x2, ou num dia de folga, e simplesmente ignorado. E
   encurtar o ciclo (ou marcar como folga um dia que era trabalhado) apaga, na
   mesma transacao do update, as excecoes que ficaram sem dia a que se referir.

A lista trabalha com dois parametros de URL: `?busca=` (um `<form method="get">`
em Server Component) e `?pagina=` (links de verdade). `listarEscalas(busca,
pagina)` faz o filtro e o recorte no banco e devolve `{ escalas, total, pagina,
paginas }`:

- a busca casa com nome, descricao e o rotulo do ciclo, montado em SQL — "5x2" e
  o que a coluna mostra, entao e o que a pessoa digita. `%` e `_` sao escapados
  antes de virar `ilike`: sao curingas do LIKE, e buscar "%" devolveria a tabela
  inteira;
- a pagina traz dez linhas por `limit/offset`. Offset, e nao cursor, porque a
  tela mostra numero de pagina e total — as duas coisas que cursor nao da — e a
  lista e de cadastro, com dezenas de linhas. `count(*)` vem com `cast(... as
int)`: o driver entrega bigint como string, e "10" > 9 compararia como texto;
- pagina alem do fim e presa na ultima, entao link velho nao abre tela vazia, e
  cada link carrega o termo de busca junto.

Estado em URL, e nao em estado de componente: o resultado cabe em um link,
sobrevive ao recarregar e a tela nao passa a depender de JavaScript.

`regraDoDia(data, inicioCiclo, escala, excecoes)` fecha o modelo: devolve `null`
em dia de folga e, em dia de trabalho, a excecao daquele dia do ciclo ou o
padrao da escala. E a funcao que a interpretacao da marcacao vai chamar para
cada dia da competencia — por isso ela mora no modulo puro, sem banco nem React:
quem carrega escala, excecoes e a data de inicio do ciclo e quem chama.

A conta do ciclo e uma diferenca de dias em UTC seguida de um resto duplo
(`((decorridos % tamanho) + tamanho) % tamanho`), para que o padrao valha
tambem para datas anteriores ao inicio — sem isso o resto negativo do JavaScript
transformaria folga em trabalho antes da data de virada.

Nenhuma dessas consultas passa por `competenciaEmVigor()`: escala e cadastro, e
nao dado datado. Datar a escala faria cada competencia nova comecar com a lista
vazia, pedindo o recadastro das mesmas jornadas.

### Funcionario (quem tem jornada)

A escala diz o **padrao** da jornada; o funcionario diz **de quem** e a partir de
**quando**. Sao os dois campos de `funcionarios` que fecham o modelo iniciado em
escalas:

1. `escala_id` e `inicio_ciclo` andam juntos ou nao andam — um `check` garante
   (`(escala_id is null) = (inicio_ciclo is null)`). Escala sem a data de virada
   nao responde "hoje e dia de trabalho?", e a data sozinha nao tem ciclo a
   comecar; a pendencia legitima e nao ter nenhum dos dois. O tipo
   `AtribuicaoDeEscala` repete a regra na aplicacao: um objeto anulavel, e nao
   dois campos anulaveis que a tela teria de combinar.
2. Os dois sao **anulaveis** de proposito. O relatorio da folha traz centenas de
   pessoas e nenhuma escala; travar o cadastro por isso impediria a importacao
   de terminar. Quem esta sem escala vira fila de trabalho: a lista conta
   (`?pendentes=1`) e o filtro isola.
3. Com o par preenchido, `ehDiaTrabalhado(hoje, inicioCiclo, escala)` e
   `diaDoCiclo(...)` — de `escalas/jornada.ts` — respondem por cada dia. A lista
   e a tela de edicao mostram isso para hoje: e a unica forma de conferir a
   atribuicao sem esperar a folha do mes, e e o que separa a turma A da turma B
   de um 12x36 (mesma escala, inicio de ciclo com um dia de diferenca).
4. `hoje` e calculado no **servidor** (`hojeNoPortal()`, em
   `competencias/periodo.ts`) e desce como prop. `toISOString()` daria a data em
   UTC, que a partir das 21h ja e a de amanha — erraria justamente no turno da
   noite. E calcula-lo no cliente faria a hidratacao divergir na virada do dia.
5. A identidade e o **CPF**, com digitos verificadores conferidos: a matricula se
   repete entre empresas (o codigo 1335 existe em duas) e o nome muda. E por CPF
   que a reimportacao reconhece quem ja existe.
6. A matricula e unica **por empresa** (`unique (empresa_id, lower(matricula))`).
   Nao ha indice separado para `empresa_id`: o unico ja o cobre, por ser a coluna
   mais a esquerda.
7. `atribuirEscala()` grava o mesmo par para varios de uma vez — os checkboxes da
   lista compartilham `name="funcionarios"` e chegam por `getAll()`, como as
   areas em `acessos`. E o caminho normal depois de uma importacao.
8. Escolher a escala — na edicao individual e no lote — passa por `CampoEscala`
   (`escalas/components/`): um combobox com a busca **dentro** da lista, sobre o
   `Popover` do Radix (que ja vem no pacote `radix-ui` instalado, entao nao
   entrou dependencia nova). E a unica excecao do portal ao `<select>` nativo,
   porque nenhum `select` comporta um campo de busca dentro dele — e, com uma
   dezena de escalas parecidas ("12x36 - 07:00 as 19:00", "12x36 - 07:00 as
   19:00 - Intra"), escolher sem digitar e conferir quatro linhas com o olho.
9. O valor sai num `input[type=hidden]` com o mesmo `name`, entao a Server
   Action recebe `escalaId` exatamente como recebia de um `select`: validacao,
   `check` do banco e gravacao nao sabem que o campo mudou. O preco e depender
   de JavaScript, registrado em "Pontos de atencao" do `CLAUDE.md` junto do menu
   lateral e dos checkboxes.
10. Cada opcao tem duas linhas: o **nome** e, abaixo e apagado, ciclo e
    horarios. Separados, e nao emendados num rotulo so, pelo mesmo motivo de a
    lista de escalas os manter em colunas proprias — o nome identifica a escala
    e o resto e consequencia das colunas. Concatenar repetia a informacao em
    nomes como "05x02 - 08:00 as 17:00 - sex 16:00", que ja dizem tudo isso, e
    ainda divergia na grafia (`5x2` contra `05x02`), como se fosse outra escala.
    A linha derivada continua porque nem todo nome carrega a jornada: nenhum dos
    sete "12x36" contem "1x1", que e como se procura por ciclo.
11. O termo casa contra as duas linhas, sem acento e sem caixa — filtrar por
    algo que a opcao nao mostra faria a lista encolher sem explicacao. Fechado,
    o campo mostra so o nome: o detalhe nao caberia sem truncar justamente o que
    identifica a escala. A linha que devolve ao estado vazio e um item da lista,
    e nao um botao a parte, para que o teclado a alcance; ela some quando ha
    termo digitado, que e quando ninguem esta procurando por ela.
12. Como as escalas, funcionario nao e apagado: `ativo = false`. E `ativo` e
    independente de `situacao` — quem esta de ferias segue ativo no portal.

### Importacao do relatorio da folha

O relatorio "Relacao de Empregados" nao e uma tabela limpa: repete o cabecalho a
cada pagina, concatena blocos de empresas diferentes, fecha cada bloco com um
total e termina com a legenda das situacoes. A leitura e uma varredura com
estado — qual empresa e qual cabecalho valem daqui para a frente — e nao um
`slice` a partir de uma linha fixa.

Ha **dois modelos** do mesmo relatorio, com os mesmos campos e corpos
diferentes, e um leitor so para os dois. O de varias empresas diz a razao social
no cabecalho de cada pagina (coluna A, ao lado de "Pagina:"); o de uma empresa
diz no titulo ("RELACAO DE EMPREGADOS ATIVOS - PREVSERV PORTARIA E LIMPEZA
LTDA") e nao tem coluna Situacao nenhuma.

1. `xlsx.ts` abre o arquivo: um `.xlsx` e um ZIP com XML dentro, e o modulo le o
   diretorio central, infla com `node:zlib` e transforma a primeira aba em
   celulas de texto. Sem dependencia de terceiros — as bibliotecas do ecossistema
   trazem o formato inteiro (escrita, graficos) e algumas exigem install script,
   que o npm 12 bloqueia. E o unico arquivo `server-only` da feature.
2. Cada celula carrega o **intervalo de colunas** que ocupa, lido de
   `<mergeCells>`. E o que resolve o caso real do relatorio: o cabecalho
   "Admissao" ocupa X-Y e o valor abaixo ocupa W-Y. Casar pela letra inicial
   diria que sao colunas diferentes e a admissao sairia vazia — erro que passa
   despercebido, ja que a coluna e opcional. `planilha.ts` casa por
   **sobreposicao**.
3. A empresa tem dois reconhecedores, e nenhum acerta o formato do outro
   (`empresaDaPagina` e `empresaDoTitulo`). O do titulo exige `-` com razao
   social depois: sem isso, a linha "RELACAO DE EMPREGADOS II" do primeiro
   modelo viraria uma empresa com esse nome a cada carga. O corte e no
   **primeiro** separador, para que razao social com hifen nao perca o fim.
4. **Coluna ausente nao e valor padrao.** `situacao` chega `null` quando o
   arquivo nao tem a coluna, e nao como "Trabalhando": assumir o padrao ali
   apagaria as ferias e o INSS que o outro relatorio ja informou. Celula vazia
   numa planilha que **tem** a coluna e outra coisa — ali o relatorio teve a
   chance de dizer e nao disse. Na gravacao, `null` vira o padrao no cadastro
   novo e **omite o campo** na atualizacao, como `escala_id` e o telefone.
5. As colunas sao encontradas pelo texto do cabecalho, sem acento e sem caixa
   ("Situação" e "SITUACAO" sao a mesma). Uma linha so vale como cabecalho quando
   traz Codigo, Nome e CPF — assim uma linha de dados com a palavra "Nome" no
   meio nao reposiciona a leitura inteira.
6. Nada e descartado em silencio: o que nao vira funcionario vira uma recusa com
   numero da linha e motivo (CPF invalido, CPF repetido no arquivo, data de
   admissao impossivel). Linha que nunca pretendeu ser um funcionario — total do
   bloco, legenda, rodape — simplesmente nao entra.
7. `planejarImportacao()` compara o arquivo com o cadastro e devolve o plano:
   empresas novas, quem criar, quem atualizar (com o diff campo a campo), quem
   esta igual e as recusas. A **previa e a gravacao chamam esta mesma funcao** —
   uma previa calculada por outro caminho nao prometeria nada.
8. Conflito de matricula e resolvido em memoria, e nao pelo indice unico: dentro
   de uma transacao, o INSERT recusado aborta tudo que veio antes, e uma carga de
   trezentas linhas cairia inteira por causa de uma. Detectado no plano, vira
   recusa e as outras entram.
9. A confirmacao **reenvia o arquivo**, e nao o plano exibido. A action e um POST
   publico (um plano forjado gravaria o que quisesse) e o cadastro pode ter
   mudado entre uma tela e outra — quem foi criado nesse meio tempo precisa
   aparecer como atualizacao, e nao como um insert que o indice vai recusar.
10. `escala_id` e `inicio_ciclo` ficam **fora** do `set` da atualizacao. E a
    promessa central: eles nascem no portal, a folha nao os conhece, e uma
    importacao mensal que os zerasse apagaria todo mes o unico trabalho que so o
    portal faz.
11. React reseta o formulario depois de toda Server Action, e num campo de arquivo
    isso apaga a escolha — nenhum navegador permite repovoar um `input[type=file]`
    por valor. A escolha e guardada num `ref` e devolvida ao campo a cada
    resposta; sem isso a segunda etapa nunca aconteceria.

### Analise de ponto (a leitura das marcacoes)

A escala diz o que era para acontecer e a marcacao diz o que aconteceu. A
analise e a leitura de uma contra a outra — e ela **nao esta no banco**.

1. O que se grava e a **batida**: `marcacoes` tem uma linha por (funcionario,
   data, hora). Nenhuma coluna diz "falta", "hora extra" ou "pendencia".
   Divergencia e consequencia da escala, e escala muda: atribuir uma escala a
   quem estava sem, corrigir o inicio de ciclo de uma turma ou ajustar um dia de
   excecao muda a leitura de dias que ja passaram, sem que uma unica marcacao
   precise ser reescrita. Gravar a conclusao criaria a versao velha do fato —
   mesmo motivo pelo qual `virada_turno` e coluna gerada e a excecao e deduzida
   por comparacao.
2. Uma linha por batida, e nao uma linha por dia com a lista de horarios: a
   batida e a unidade indivisivel do relogio, e e o indice unico
   `(funcionario, data, hora)` que faz a reimportacao ser idempotente — o mesmo
   arquivo enviado duas vezes nao duplica nada e nao exige apagar o que ja
   existia.
3. Marcacao e **dado datado**, ao contrario de escalas e funcionarios: toda
   leitura de `ponto/queries.ts` filtra por `competenciaEmVigor()`.
4. `apuracao.ts` e um modulo puro: recebe a janela, o inicio de ciclo, a escala,
   as excecoes e as batidas por data, e devolve `DiaApurado[]`. Sem banco, sem
   React, sem `Date` construido a partir de hora — a mesma disciplina de
   `escalas/jornada.ts`, e o que permite conferir a regra sem subir o portal.
5. **A janela apurada e a uniao dos periodos importados**, recortada pela
   competencia — e nao a competencia inteira. O relatorio do relogio costuma
   parar antes do fim do periodo (21/08 a 04/09, numa competencia que vai ate
   20/09); sem essa distincao, os dezesseis dias que faltam virariam dezesseis
   faltas para o cadastro inteiro. E o que a tabela `importacoes_ponto` existe
   para responder, e por isso a competencia sem carga nenhuma nao apura nada em
   vez de apurar tudo como falta.
6. **A virada de turno e o ponto delicado.** O relogio registra cada batida na
   data em que ela aconteceu, entao a jornada noturna de 22/08 aparece partida:
   a entrada (17:55) na linha do dia 22 e a saida (06:11) na linha do dia 23.
   Lidos dia a dia, os dois viram "marcacao incompleta" — duas pendencias onde
   havia um turno normal. Por isso os dias sao percorridos em ordem e cada turno
   com virada **reclama** do dia seguinte as batidas anteriores a sua propria
   entrada, marcando-as como consumidas.
7. O criterio da reclamacao sai da **escala**, e nao de uma margem escolhida a
   dedo: numa jornada que vira o dia a saida e sempre anterior a entrada, entao
   qualquer batida do dia seguinte antes do horario de entrada so pode estar
   fechando o turno da vespera — o turno do proprio dia seguinte comecaria em
   `entrada`.
8. **A regra do primeiro dia apurado.** Numa escala noturna, as batidas do
   primeiro dia anteriores ao horario de entrada fecham um turno que comecou na
   vespera, fora da janela. E o caso do 12x36 que entra as 17:55 do dia 20 e sai
   as 06:11 do dia 21: no dia 21 sobra uma batida solta, e ela nao e marcacao
   incompleta — e a metade visivel de um turno da competencia anterior. Quando
   esse primeiro dia e **folga**, a leitura fica ainda mais clara: nao havia
   turno para comecar ali, entao tres batidas soltas nao viram tres pendencias,
   viram nenhuma. Elas nao somem: vao para `ignoradas`, com o motivo, e a tela
   as mostra riscadas.
9. No **ultimo** dia da janela o problema e o espelho: a saida de um turno com
   virada cai depois do fim do periodo apurado e ainda nao existe. Isso vira
   `turno_em_aberto` (atencao), e nao marcacao incompleta — chamar de pendencia
   o que so depende do proximo arquivo mandaria alguem procurar um problema
   inexistente.
10. A ordem das perguntas de cada dia e a de quem confere na mao: era dia de
    trabalho? bateu? bateu quantas vezes? fecha a conta? O numero de batidas vem
    **antes** de qualquer soma de horas, porque somar um dia mal pareado produz
    um numero que parece certo e nao e.
11. As divergencias tem duas gravidades. `impeditiva` trava o fechamento (falta,
    marcacao impar, marcacoes a menos, trabalho em dia de folga) e vira fila de
    trabalho; `atencao` fecha mas pede conferencia (hora extra, debito,
    intrajornada curta, marcacoes a mais, turno em aberto).
12. `TOLERANCIA_MINUTOS` e 10 — o que a CLT (art. 58, §1o) nao considera jornada
    extraordinaria. Ela vale **em cada ponta** do turno: a entrada e a saida
    dentro da margem valem o horario previsto (`comPontasToleradas()`), e o
    saldo que sobra (`saldoToleradoMinutos`) e o que decide `hora_extra` e
    `debito_de_horas`. Aplicada so ao total do dia, entrar 06:52 e sair 17:09
    — as duas na margem — somava 17 minutos de hora extra. Ponta fora da margem
    entra inteira: nao e franquia. O `saldoMinutos` bruto continua ao lado,
    porque e o que o relogio registrou.
13. A conferencia recorta a pagina **em memoria**, ao contrario das listas de
    escalas e funcionarios. A ordem da tela e "quem tem mais pendencia
    primeiro", e pendencia nao existe no banco — ordenar em SQL exigiria gravar
    a conclusao, que e exatamente o que este modulo nao faz. O custo e limitado
    pelo cadastro (centenas de pessoas, milhares de batidas), e nao pelo tempo.

### Importacao do relatorio de marcacoes

O relatorio "Lista de Marcacoes Realizadas Simplificadas" e um TXT de larguras
fixas, bem mais simples do que o da folha: cabecalho uma vez so, uma linha por
pessoa/dia, um total no fim. O que ele **nao** tem e o que manda no desenho.

1. Nao ha nome de empresa, so o **codigo do relogio** (1144, 1147...), e nao ha
   CPF, so a matricula. O relatorio da folha e o contrario: razao social e CPF,
   nunca o codigo. Nenhum dos dois liga os dois lados sozinho — e a matricula
   sozinha nao identifica ninguem, porque o codigo 1335 existe em duas empresas
   e sao duas pessoas.
2. A ponte e `empresas.codigo`, preenchido pela propria tela de importacao:
   codigo desconhecido bloqueia o bloco inteiro daquele codigo e aparece na
   previa com um campo para associar. `associarEmpresa()` e uma action a parte
   porque grava **cadastro**, e nao carga: feita uma vez, vale para sempre. Um
   `<form>` por codigo, para que a recusa de um (codigo ja usado por outra
   empresa) nao derrube os outros.
3. A leitura ancora na **data**, e nao em posicao de coluna: e o unico campo com
   formato inconfundivel no meio da linha, entao o nome pode ter quantos espacos
   tiver. O espaco entre nome e data e opcional, porque o relatorio nao o
   garante — um nome que enche a coluna sai colado na data
   ("...BUENO DA SILVA21/08/2026"), e exigir o espaco descartaria essas linhas
   em silencio.
4. O marcador `i` colado no horario (`14:05i`) marca a batida **incluida a mao**
   no sistema de ponto, e vira a coluna `incluida`. Descarta-lo faria a tela
   tratar como igual o dia que o relogio registrou inteiro e o dia que alguem
   completou depois.
5. O periodo vem do cabecalho ("De 21/08/2026 a 04/09/2026"); o periodo coberto
   pelas linhas e so a rede de seguranca. A diferenca importa: um dia em que
   ninguem bateu ponto existe no cabecalho e nao existe nas linhas.
6. O rodape ("Total: 2840") e conferido contra o que a leitura entendeu, e a
   previa avisa quando os dois divergem — e o unico sinal de que existe uma
   linha em um formato que o leitor ainda nao conhece.
7. `planejarCarga()` e chamada pela previa **e** pela gravacao, como em
   funcionarios. A confirmacao reenvia o arquivo, e nao o plano: aqui a segunda
   razao (o cadastro pode ter mudado) e a regra, porque associar um codigo de
   empresa e justamente o que se faz entre as duas telas.
8. Data fora da competencia nao entra. A marcacao pertence ao periodo em que o
   dia caiu, e nao ao aberto quando alguem clicou em enviar: gravar 21/09 dentro
   de agosto o esconderia de setembro para sempre, porque o indice unico
   impediria a carga seguinte de traze-lo de volta.
9. Marcacoes e a linha de `importacoes_ponto` vao na **mesma transacao**: uma
   sem a outra mente. Marcacoes sem a carga deixariam batidas fora do periodo
   apurado; carga sem marcacoes faria o periodo passar a ser apurado com todo
   dia virando falta.
10. Carga que nao alcanca ninguem e recusada em vez de gravada — ela registraria
    um periodo como apurado sem ter apurado nada.

### Escala inferida do ponto (`GET /funcionarios/escalas-sugeridas`)

A conferencia le a marcacao contra uma escala conhecida e procura a
divergencia; esta tela faz o caminho inverso — a divergencia e o criterio, e o
que se procura e a escala.

1. `sugerirEscalasDoPonto()` carrega, num `Promise.all`, quem esta ativo e sem
   escala, o catalogo de escalas ativas (com as folgas pelo mesmo
   `folgasDaEscala`) e as batidas da competencia (a mesma leitura da apuracao,
   uma consulta para todo mundo).
2. `sugerirEscalas()` (puro) roda, por pessoa, cada escala em cada posicao
   possivel do ciclo. As batidas vao para o turno a que pertencem por
   `atribuirBatidas()` — sem isso a saida das 06:00 de um 12x36 noturno cairia
   no dia de folga e o padrao pareceria "trabalha todo dia".
3. A pontuacao compara, dia a dia do recorte da pessoa, o previsto da escala
   com a existencia de turno. O desempate e hierarquico: dias, horario (a
   mediana da entrada observada), quantidade de marcacoes.
4. A tela marca so as sugestoes confiaveis (90% dos dias, 30 minutos de
   horario) e mostra as demais com o motivo.
5. `definirEscalasSugeridas()` **recalcula** tudo e grava `escala_id` +
   `inicio_ciclo` de quem foi marcado e continua sem escala, numa transacao.

Nada disso e gravado alem do par escala/inicio: a sugestao e leitura, e reabrir
a tela depois de importar mais um arquivo a recalcula do zero.

### Pendencias e tratativas (`GET /ponto/pendencias`)

1. `exigirAcesso("ponto")` na rota; os seis parametros de filtro passam pelo Zod
   antes de virar consulta.
2. `listarPendencias()` chama `apurarTodos()` — a **mesma** leitura da
   conferencia — e achata o resultado: cada `divergencia` de cada `dia` de cada
   pessoa vira uma linha.
3. Em paralelo, carrega `tratativas_ponto` da competencia (indexada pela chave
   `funcionario|data|tipo`) e o resumo das mensagens de cada tratativa.
4. As duas metades sao juntadas em memoria. Ocorrencia sem linha gravada recebe
   `status: "aberta"` — a ausencia ja significa isso, e gravar uma linha para
   cada ocorrencia intocada seria gravar a ausencia de trabalho.
5. Filtro, ordem e recorte da pagina acontecem em memoria, como na conferencia e
   pelo mesmo motivo: a ordem depende de `encerrada` e de `gravidade`, que nao
   existem no banco.

A ordem e `encerrada` -> `gravidade` -> `data` -> `nome`. `encerrada` vem antes
da gravidade porque uma falta ja justificada nao e mais fila: mante-la no topo
faria a tela repetir todo dia um trabalho ja feito.

```
/ponto            uma linha por pessoa   "como esta o ponto de fulano?"
/ponto/pendencias uma linha por problema "o que ainda falta tratar?"
```

### Tratativa de uma ocorrencia (`POST` de `registrarTratativa`)

1. `exigirAcesso("ponto")`; `registrarTratativaSchema` valida chave, status e
   observacao (obrigatoria so para `descartada`).
2. `competenciaDaOcorrencia()` faz duas conferencias: `competenciaDeEscrita()`
   (o portal aceita escrita agora?) e a comparacao de datas (esta ocorrencia e
   deste periodo?). A segunda pega a tela deixada aberta durante a virada da
   competencia.
3. `obterOcorrencia()` reconstroi a ocorrencia do zero. A chave que o formulario
   manda nao e evidencia: sem isso, um POST forjado abriria tratativa para um
   dia que nunca teve divergencia.
4. `insert ... on conflict do update` sobre `(funcionario_id, data, tipo)`.
   Reabrir a mesma ocorrencia encontra a linha que ja existe, em vez de empilhar
   uma segunda opiniao sobre o mesmo dia.
5. `refresh()`.

A ocorrencia continua **nao existindo** no banco. Nao ha `ocorrencia_id` porque
nao ha tabela a que apontar — a tripla e a identidade natural, e e ela que a URL
carrega (`/ponto/pendencias/<funcionarioId>/<data>/<tipo>`).

### Mensagem ao colaborador (`POST` de `enviarMensagem`, Z-API)

Duas etapas na mesma action, pelo motivo mais simples possivel: **envio de
WhatsApp nao tem desfazer**.

```
etapa 1  formulario -> enviarMensagem(sem confirmar) -> previa (nada saiu)
etapa 2  previa     -> enviarMensagem(confirmar=1)   -> Z-API -> historico
```

1. `exigirAcesso("ponto")`; `enviarMensagemSchema` valida a chave e o texto
   (10..1000 caracteres, CRLF do `<textarea>` normalizado para LF).
2. `obterOcorrencia()` relê tudo. **So o texto vem do formulario**; destinatario,
   numero e ocorrencia sao lidos do cadastro — o numero pode ter sido corrigido
   entre uma tela e outra.
3. Sem `confirmar`, devolve `PreviaDaMensagem` e para. Nenhuma escrita aconteceu.
4. Com `confirmar=1`: confere as credenciais da Z-API e a competencia, garante a
   linha de tratativa (criando-a em `aberta` se preciso — a mensagem se prende a
   **tratativa**, nao a ocorrencia, e e isso que faz o historico sobreviver a uma
   mudanca de escala) e chama `enviarTextoNoWhatsapp()`.
5. O resultado vira linha em `mensagens_ponto`, com o texto e o telefone **como
   foram enviados**. Falha tambem vira linha, com o motivo.
6. Envio aceito move a tratativa de `aberta` para `em_tratativa`. Falha nao move
   nada — ninguem foi avisado. E o status so avanca a partir de `aberta`: quem ja
   marcou `justificada` nao volta atras por mandar outra mensagem.

O registro (passo 5) fica **fora** de transacao com a chamada HTTP: uma chamada
de rede nao volta atras com `rollback`. `enviarTextoNoWhatsapp()` nunca lanca —
toda falha volta como `{ ok: false, erro }`, porque quem chama grava a recusa.

As tres credenciais (`ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`) sao
opcionais: sem elas o portal sobe igual e so a tela do envio diz que a
integracao esta indisponivel.

### Destino da mensagem: colaborador ou responsavel do posto

Enquanto o contato direto passa por analise juridica, quem esta no grupo de
contato de um posto com responsavel tem a mensagem enviada ao **responsavel**.
O resto do fluxo acima nao muda.

```
funcionario --posto_contatos--> posto --responsavel_id--> responsavel
     |                                                        |
     | sem grupo, ou posto sem responsavel                    | com responsavel
     v                                                        v
 modeloDaMensagem() -> colaborador          modeloParaResponsavel() -> responsavel
                                            (colaborador, posto, dia, prazo de 3 dias)
```

1. `contatoDoFuncionario()` (em `postos/queries.ts`) diz o caminho;
   `destinoDaMensagem()` (em `ponto/contato.ts`) o transforma em quem recebe, com
   o telefone e o bloqueio. O painel usa `contatosDosFuncionarios()`, uma
   consulta so para todo mundo que tem ocorrencia.
2. Responsavel sem telefone ou desativado **bloqueia** o envio. A mensagem nao
   volta para o colaborador sem alguem decidir.
3. A previa devolve `destino` e `destinatarioId`; a confirmacao os compara com o
   destino relido. Se mudou entre as etapas, nada sai e a tela redesenha com o
   texto novo.
4. `mensagens_ponto` grava `destino` e `destinatario_id` junto do telefone.
5. O prazo de retorno (`prazoDaOcorrencia()`) e calculado: ultimo envio aceito ao
   responsavel + `PRAZO_RETORNO_DIAS`, enquanto a tratativa nao for encerrada. O
   painel mostra "Retorno ate" / "Prazo vencido" e conta os vencidos.
6. O chatbot consulta o mesmo contato depois de identificar o numero: com
   responsavel, encerra a conversa aberta (`encaminhado_ao_responsavel`), avisa
   uma vez por dia e devolve `com_responsavel`.

O fluxo direto anterior continua no codigo (e o caminho de quem nao tem
responsavel) e esta tambem na tag git `contato-direto-v1`. Reimplanta-lo para
todos e tirar os responsaveis dos postos.

### Envio consolidado (`GET /ponto/pendencias/responsaveis`, `POST` de `enviarConsolidado`)

Uma mensagem por responsavel com as pendencias do grupo que ainda nao foram
enviadas a ele, disparada a mao e com previa.

```
lerOcorrencias()  ->  listarResponsaveisComPendencias()  ->  tela (um card por responsavel)
                  ->  consolidadoDoResponsavel(id)       ->  previa (texto + assinatura SHA-256)
                  ->  consolidadoDoResponsavel(id)       ->  confirma: assinatura igual? -> Z-API
                                                             -> uma linha por ocorrencia, mesmo lote_id
```

1. `lerOcorrencias()` e a leitura do painel inteira (sem filtro nem pagina), com
   o dia e o ultimo envio aceito de cada ocorrencia.
2. `entraNoConsolidado()` (em `ponto/contato.ts`): falta ou marcacao incompleta
   (`tipoDoConsolidado()`, os tipos do chatbot), nao encerrada e sem envio
   aceito **a este** responsavel. O que ja foi e esta no prazo fica de fora.
3. Ate `OCORRENCIAS_POR_CONSOLIDADO` (30), por posto e por data, viram o texto
   de `modeloConsolidado()`; o resto fica para o envio seguinte.
4. A confirmacao manda so a assinatura do texto; a action o refaz e recusa se
   mudou. Depois: `garantirTratativa()` para cada ocorrencia, um envio a Z-API e,
   numa transacao, uma linha de `mensagens_ponto` por tratativa com o mesmo
   `lote_id`, e `aberta` -> `em_tratativa`.

### Preenchimento de escala (`GET /preenchimento/[postoId]`)

1. `exigirAcesso("preenchimento")` na rota. Nao ha parametro de modo: a grade e
   uma so.
2. `obterGrade()` resolve **tudo**: o posto (codigo e nome), as funcoes ativas
   e, quando ha competencia aberta, as linhas e as celulas. Uma leitura so, e
   nao duas: o codigo do posto sai do mesmo join das funcoes, e toda gravacao de
   dia chama `refresh()` — o que a tela consulta se paga uma vez por dia
   preenchido. Cada funcao vira uma faixa dentro da **mesma** tabela, inclusive
   a que nao tem ninguem: turno descoberto e o que quem monta a escala mais
   precisa ver.
3. `null` de `obterGrade()` e "este posto nao existe" — a rota da 404. Sem
   competencia aberta ela devolve as faixas das funcoes com `dias: []` e nenhuma
   linha, e a tela mostra o aviso de competencia fechada: sao dois vazios
   diferentes, e um 404 no segundo mentiria.
4. `diasDoPeriodo()` monta as colunas — 21/08 a 20/09 = 31 datas, contadas
   inteiras em UTC pelo mesmo motivo de `diaSeguinte()`.
5. Varias consultas, e nao um join so: ele repetiria a pessoa uma vez por dia e
   a celula uma vez por alteracao. As quatro que dependem da competencia (as
   siglas padrao, as linhas, as celulas do **realizado** e o historico) saem num
   `Promise.all` — em fila seriam quatro esperas em cada redesenho.
6. O historico vem **junto** com a grade, e nao ao abrir o modal: um roundtrip
   por dia aberto e justamente o que a rotina diaria nao aguenta. O recorte e por
   celula (`row_number` particionado), senao um dia muito remexido consumiria a
   cota dos outros.
7. O **previsto e derivado aqui**, e nao lido: para cada dia, `vigenciaDoDia()`
   escolhe o contrato que valia, e `preveTrabalho()` pergunta a ele. Os totais das
   duas faixas saem de `totalizar()` a cada leitura.

**As duas faixas nao sao a mesma coisa.** A do previsto e texto: ela sai do
contrato do posto e muda em Postos de trabalho, nao celula a celula. A do
realizado e um botao por dia, e clicar abre o `ModalDoDia` com tudo o que
aquele dia pode dizer — sigla, horario, quem cobriu, para onde a pessoa foi, o
bilhete e o historico.

**Um modal para a grade toda**, montado no nivel de cima e alimentado pela celula
aberta: um por dia seriam centenas de dialogos no DOM, cada um com o proprio
`useActionState`. O alvo do clique e o dia inteiro — a celula tem 40px, e mirar
um icone dentro dela seria pior que digitar.

**Abrir o dia nao pode redesenhar a grade.** Medido em desenvolvimento, o clique
custava 159ms de tarefa longa, em duas partes independentes:

- **87ms** eram as 620 celulas redesenhando por causa de um estado que so o modal
  usa. A tabela virou um componente proprio sob `memo`, e `aoAbrir` vem de um
  `useCallback` — sem isso a comparacao rasa falharia a cada render e o `memo`
  nao seguraria nada. Numa grade pequena esse custo era zero, e e assim que se
  sabe que era ele;
- **72ms** eram os ~314 `<option>` do campo "quem cobriu", montados junto com o
  modal. Esses nao foram adiados: foram **removidos**. A lista de pessoas nao
  vem mais com a grade, e o campo virou uma busca (`CampoPessoa`).

Com as duas, abrir um dia deixou de produzir tarefa longa nenhuma.

**O que sobrou nao e do Radix.** Em desenvolvimento a **primeira** abertura da
pagina ainda custa ~180ms mesmo com o modal ja sem lista nenhuma — e em
producao ela nao custa tarefa longa alguma. E o Turbopack avaliando o modulo do
modal pela primeira vez, e nao o `Dialog`: e a diferenca entre `next dev` e
`next start`, nao entre um primitivo e outro.

### A busca de quem cobriu (`buscarPessoas`)

O campo pergunta ao servidor conforme se digita, e tres coisas seguram a conta:

- **espera** (`ESPERA_DA_BUSCA`, 250ms): a consulta sai depois do silencio.
  Digitar "adriano" e **uma** ida, e nao sete — medido;
- **termo minimo** (`TERMO_MINIMO`, 2): uma letra casaria com quase todo o
  cadastro, e o teto devolveria vinte nomes arbitrarios. O campo diz o que
  falta em vez de ir ao banco;
- **teto** (`PESSOAS_POR_BUSCA`, 20), no proprio `select` — e por origem, senao
  um cadastro grande de freelancers empurraria os funcionarios para fora do
  recorte final.

Um contador de pedido descarta resposta atrasada: duas buscas em voo podem
voltar fora de ordem, e sem ele a resposta de "adr" sobrescreveria a de
"adriano" so por ter demorado mais.

`buscar` vive em `preenchimento/busca.ts`, e nao em `queries.ts` nem em
`actions.ts`: as leituras de `queries.ts` sao `server-only` e so um Server
Component as alcanca, e `actions.ts` e o arquivo das escritas. Esta e um
endpoint de leitura — o `"use server"` e o que a torna chamavel do campo —, e
como todo endpoint refaz `exigirAcesso()`.

O valor viaja num `input[type=hidden]`, como em `CampoEscala`: a action recebe
`pessoa` no mesmo formato `f:`/`l:` e nao sabe que o campo mudou. O que se
perde e o `required` do navegador — campo escondido fica fora da validacao
nativa —, entao a sigla que exige pessoa e cobrada pelo proprio modal antes de
enviar. O **destino** continua sendo um `<select>` e continua com `required`.

**A gravacao mora na grade, e nao no modal.** O `useActionState` e a camada
otimista (`useOptimistic`) vivem no componente de cima; o modal so monta a
celula que vai ser desenhada e despacha o formulario. Sao duas consequencias, e
as duas sao o ponto:

- a celula muda **antes** de o servidor responder. O que o dia passa a dizer ja
  esta no formulario, entao nada ali e adivinhacao — e um mes preenchido sao
  centenas de gravacoes, cada uma das quais parava a tela pelo roundtrip
  inteiro;
- o modal fecha no mesmo clique. Se o estado da action morasse dentro dele, o
  proprio fechamento levaria junto a resposta.

**E por isso que gravar um dia nao chama `refresh()`.** Ele redesenha a rota
inteira: medido em dev, o POST era ~330ms para uma action de ~60ms, e o GET da
mesma rota custa o mesmo tanto — o resto era o render. Preencher um dia so muda
tres coisas na tela, e as tres a grade sabe montar: a celula e o total da linha
ela desenhou no clique, e do historico so faltavam o autor e o instante, que a
action devolve em `DiaState.registro`. Com isso o POST caiu para ~110ms, dos
quais a gravacao em si e quase tudo.

O que a grade guarda entao e uma **camada da sessao** por cima do que veio do
servidor: as celulas gravadas e as linhas de historico ganhas. Ela e descartada
assim que uma leitura nova chega — `grade` so troca de identidade num
`refresh()` de outra action (incluir, retirar, turma, observacao), e essa
leitura ja inclui o que foi gravado aqui. Continuar sobrepondo esconderia o que
outra pessoa tenha mudado no meio tempo.

Recusa desfaz a celula (o valor anterior fica num `ref` ate a resposta chegar) e
vira aviso.

**O que a tela consegue barrar, ela barra sem servidor.** A sigla escolhida
decide se o dia precisa dizer quem cobriu ou para onde a pessoa foi
(`exige_pessoa`, `exige_destino`), e o campo vira `required` junto com ela; um
horario sem o outro tambem. E por isso que sigla e horario sao os unicos campos
controlados do modal. A action confere tudo de novo — ela e um POST publico, e
`required` nao e validacao.

O que difere do previsto sai **sublinhado**, e nao em outra cor: a cor da celula
ja e a do evento, e duas informacoes na mesma dimensao brigariam.

Os botoes por linha (turma, observacao, retirar do bloco) ficam **fora** dessa
tabela, numa secao propria: `<form>` dentro de `<form>` nao existe em HTML.

### Gravacao de um dia (`POST` de `salvarDia`)

1. `exigirAcesso("preenchimento")` e `competenciaDeEscrita()` — a aberta, ou a
   consultada durante uma consulta.
2. A linha e **relida do banco** na competencia de escrita e a data e conferida
   contra o periodo — duas comparacoes de string, porque `YYYY-MM-DD` ordena
   como data. Id postado na mao nao alcanca a grade de outro periodo, e data
   fora da competencia gravaria um dia que a tela nunca mais mostraria. Essa
   leitura e a da sigla escolhida saem juntas (`Promise.all`): nao dependem uma
   da outra, e em fila seriam duas esperas por dia preenchido.
3. Um POST por dia, e nao um envio da grade inteira: o realizado se preenche
   quando algo acontece naquele dia, e mandar seiscentas celulas para corrigir
   uma so obrigaria a action a adivinhar o que mudou.
4. O modal desenha **todos** os campos do dia, entao campo vazio **apaga** o que
   estava la. E o inverso do risco da versao anterior: la, campo que a tela por
   acaso nao desenhasse chegaria vazio e apagaria o dia sem que ninguem pedisse.
5. Sigla que pede detalhe (`exige_pessoa`, `exige_destino`) sem o detalhe e
   **recusa**, e nao pendencia: o modal desenha os dois campos na mesma tela,
   entao completar o dia nao cobra navegacao nenhuma. Na pratica quem recusa
   primeiro e o navegador, pelo `required`; a action e a rede de seguranca.
6. Celula que fica sem nenhum campo e **apagada**, e nao gravada vazia: ela seria
   indistinguivel de dia em branco, e o `check preenchimento_dias_nao_vazia` a
   recusaria. `limparDia()` existe ao lado porque apagar e outro gesto, e nao
   salvar cinco campos vazios.
7. A celula e o historico vao na **mesma transacao**. Celula sem historico
   apagaria a resposta de "quem mudou isso?"; historico sem a celula contaria uma
   alteracao que nao aconteceu. A linha guarda o estado **depois**, inclusive o
   estado vazio de quem apagou o dia.
8. Marcado como **extra**, o dia sincroniza uma linha em `extras` na mesma
   transacao (`sincronizarExtra()`), e pelo mesmo motivo do historico: extra sem
   a celula soma horas de uma cobertura que nao existe, e celula sem o extra
   esconde horas que alguem vai pagar. Ver "A cobertura que vira hora extra".
9. A caixa **Intrajornada nao usufruida** e uma coluna da propria celula
   (`preenchimento_dias.intrajornada`), e nao um lancamento como o extra: ela
   nao tem para onde ir — nao existe conferencia de intrajornada, e a rubrica do
   apontamento e digitada por quem fecha a folha. Ela conta como conteudo do
   dia, no `check preenchimento_dias_nao_vazia` e na conta de "celula vazia" da
   action: marcar so a caixa grava o dia, em vez de apaga-lo em silencio.
10. A resposta carrega a chave da celula e a linha de historico recem-gravada
    (id, autor, instante), e **nao ha `refresh()`**. A chave volta tambem na
    recusa: e por ela que a grade sabe qual dia desfazer. O extra tambem nao pede
    `refresh()`: ele muda **outra rota**, que e relida quando alguem a abre.

### A cobertura que vira hora extra (`sincronizarExtra`)

O modal do dia tem uma caixa **Extra**. Marcada, aquele dia lanca uma hora extra
na Conferencia — e o lancamento e uma linha de `extras` como qualquer outra, so
que apontando para a celula que a gerou (`extras.preenchimento_dia_id`).

Ele mora la, e nao numa tabela do preenchimento, porque quem confere as horas do
periodo le **uma** lista: venha ela da grade ou da tela de registro, e a mesma
pergunta ("quanto se deve neste periodo?"), e duas listas divergiriam no dia em
que alguem somasse so uma.

Cada campo tem uma origem, e nenhuma delas e digitada duas vezes:

| Campo do extra | De onde sai                                                     |
| -------------- | --------------------------------------------------------------- |
| pessoa         | **quem cobriu** o dia; sem contraparte, o dono da linha         |
| data           | o dia da celula                                                 |
| posto          | o posto da grade                                                |
| local          | o nome da **funcao** — o complemento que o posto sozinho nao da |
| horario        | a entrada e a saida da celula                                   |
| observacao     | o bilhete da celula                                             |
| competencia    | a mesma da escrita, ja conferida contra a data                  |

**A pessoa e a contraparte, e nao o dono da linha**, quando ha uma: o TE de uma
linha diz que **outra** pessoa cobriu aquele turno, e e ela quem fez as horas.
Sem contraparte, quem fez foi quem estava escalado.

**O horario e exigido, e nao derivado do previsto.** `extras` pede entrada e
saida (`not null`, e diferentes entre si), e e delas que sai a duracao que
alguem vai conferir e pagar. Tira-las do contrato da funcao faria o lancamento
mudar sozinho no dia em que o posto trocasse de escala — o oposto do que o
modulo de extras e (uma **entrada**, e nao uma consequencia). Quem quer o
horario da funcao tem o "Igual ao previsto" a um clique.

**O extra anterior sai sempre, antes de gravar o novo.** Desmarcar a caixa,
mudar o horario ou trocar quem cobriu mudam a chave do lancamento; um `update`
no lugar do par apagar+gravar deixaria para tras o extra da versao anterior do
dia. E quando a **celula** e apagada, o extra vai junto pela FK `cascade` — sem
a cobertura que o gerou, ele continuaria somando horas que ninguem fez.

**Extra ja lancado a mao e adotado, e nao recusado.** Se alguem ja registrou
aquele extra pela tela (mesma pessoa, dia, posto e entrada), o `insert` cai no
indice unico e vira `on conflict do update`: a linha existente passa a ser a
daquela celula. Recusar deixaria a grade sem gravar o dia por causa de um
lancamento feito pelo outro caminho.

**A grade nao guarda que o dia gerou extra.** `preenchimento_dias` nao tem
coluna nenhuma para isso: a leitura junta `extras` por `left join` e a celula
diz `extra: true` porque o lancamento existe. Um booleano a parte poderia
discordar dele — mesma familia de `virada_turno` e `competencias.referencia`.
O que **e** gravado e a marcacao no historico (`preenchimento_alteracoes.extra`):
marcar o extra cria horas a pagar, e "quem marcou isso, e quando?" e justamente
o que o historico responde.

**A recusa do modal mora no `onSubmit`, e nao dentro da action.** O React reseta
o formulario depois de **toda** action — inclusive a que devolveu sem enviar
nada —, e recusar la dentro limparia o que a pessoa acabou de digitar: os campos
nao controlados voltariam ao inicial e a caixa do extra se desmarcaria sozinha
(o Radix repassa o `reset` do formulario para o `onCheckedChange`), levando
junto o aviso que explicava a recusa. Com `preventDefault`, a action nem
comeca.

### O relogio de ponto na grade (so leitura)

`obterGrade()` traz, junto com a grade, duas coisas do modulo de ponto:

- a **janela importada** (`janelaApurada()`), recortada pela competencia;
- as **batidas** de quem esta escalado no posto, do primeiro dia da competencia
  ao dia seguinte ao ultimo (a saida do turno noturno do ultimo dia cai la),
  numa consulta so com `selectDistinct`.

`atribuirBatidas()` (em `preenchimento/relogio.ts`, modulo puro) poe cada batida
no dia do **turno**, e nao do calendario: num turno que vira o dia, batida do dia
seguinte antes da entrada fecha o turno da vespera — a regra da apuracao. A hora
de corte sai da vigencia da turma; na linha com sigla propria, da escala
cadastrada do funcionario. No primeiro dia da janela, batida antes da entrada
fecha um turno anterior a ela e nao conta.

`sinalDoDia()` roda na tela, com a celula **atual** (a camada de sessao
incluida), e devolve um de tres sinais:

| Sinal                 | Quando                                                      | Na grade |
| --------------------- | ----------------------------------------------------------- | -------- |
| `batida_sem_registro` | houve batida e o realizado esta em branco                   | azul     |
| `trabalho_sem_batida` | realizado de natureza trabalho, sem contraparte, sem batida | ambar    |
| `batida_em_ausencia`  | realizado de folga, falta ou afastamento, com batida        | ambar    |

Fora da janela nao ha sinal; freelancer nao tem batidas (`null`, e nao lista
vazia); celula sem sigla nao contradiz nada. O modal do dia mostra as batidas
(incluidas a mao marcadas com `*`, as da madrugada seguinte com "(dia
seguinte)"), as horas trabalhadas contra as previstas e o sinal.

**Nao e a apuracao.** A apuracao le as batidas contra a escala cadastrada e
grava tratativas; a grade le contra o proprio realizado e nao grava nada.
Levar as divergencias de la para ca faria as duas telas discordarem sobre o
mesmo dia.

### Varios dias de uma vez (`POST` de `preencherDias`)

O botao "Preencher varios dias", acima da grade, abre um formulario com as
pessoas (todas marcadas), o intervalo (do primeiro dia do periodo ate hoje) e o
que gravar: **igual ao previsto** ou uma sigla fixa.

1. `exigirAcesso`, Zod e `competenciaDeEscrita()`; o intervalo tem de caber na
   competencia aberta.
2. A grade e **relida** com `obterGrade()` — a mesma leitura da tela — junto do
   catalogo de eventos ativos. Toda linha pedida tem de ser deste posto: o
   formulario so oferece essas, mas a action e um POST publico.
3. Para cada pessoa e dia do intervalo: dia com registro e contado e deixado
   como esta; sem sigla escolhida, o dia sem previsto e contado e pulado; o
   resto vira uma celula so com a sigla (sem horario, sem pessoa, sem destino).
4. Celulas e historico na **mesma transacao**. A insercao e `on conflict do
nothing` com `returning`: quem preencheu um desses dias pelo modal entre a
   leitura e a gravacao ganha, e so o que de fato entrou vira historico.
5. `refresh()` — um lote muda dezenas de celulas, e a camada de sessao da grade
   e para um dia por vez. A mensagem diz quantos entraram, quantos ja tinham
   registro e quantos nao tinham previsto para copiar.

**Nunca sobrescreve.** A troca, a falta e a cobertura lancadas com cuidado sao
justamente os dias que o lote nao pode ver, e desfazer centenas de celulas nao
tem botao. Sigla que pede pessoa ou destino nem e oferecida: esses detalhes sao
de um dia. O formulario envia por `onSubmit`, e nao por `action`, para o React
nao resetar as caixas das pessoas numa recusa.

### O previsto (derivado, sem action nenhuma)

**Nao ha POST que grave previsto.** Ele sai de duas coisas, ambas cadastro:

- a **vigencia** de `funcao_ciclos` que vale naquele dia, na turma que a linha
  segue — `vigenciaDoDia()` escolhe a ultima que ja tinha comecado. Dia anterior
  a primeira vigencia fica **sem** previsto, e nao herda a seguinte: uma escala
  que passa a valer em 28/08 nao diz nada sobre o dia 21;
- a **ancora**, resolvida por `ancoraDaVigencia()` em tres passos: o
  `inicio_ciclo` da vigencia, o inicio da vigencia e — so na vigencia inicial,
  que nao tem data — o **primeiro dia do periodo**, que nao e um padrao bom e
  existe so para a grade nao ficar em branco.

O padrao vale **para tras** tambem: o dia anterior a ancora e a ultima posicao do
ciclo, e nao um dia sem regra — e por isso um 5x2 ancorado na segunda ja mostra o
sabado e o domingo anteriores como folga.

`ehDiaTrabalhado(data, inicioCiclo, ciclo)` — a mesma funcao que a apuracao do
ponto usa — decide cada dia. A sigla escrita sai de `funcoes_posto.evento_trabalho_id`
(o `D` de um turno diurno, o `N` de um noturno) com o evento `padrao` da natureza
`trabalho` como reserva; a de folga e sempre o `padrao` da natureza `folga`.
A **linha** pode trocar a sigla de trabalho (`preenchimento_linhas.evento_trabalho_id`):
e o `N` de quem cobre a noite numa grade de `D`, seguindo o mesmo ciclo. So a
letra muda. O horario do previsto sai **em branco** nos dias de trabalho dessa
linha, porque o da vigencia e o do turno da funcao — escreve-lo ao lado do `N`
seria um previsto que se contradiz. Escolher a mesma sigla da funcao nao conta
como excecao: o horario volta e a coluna do nome nao marca nada.
Faltando uma das duas, a faixa nasce em branco e a tela diz o que falta.

O vinculo com o modulo de **Escalas** caiu: nem a funcao nem a linha apontam mais
para `escalas`. O que continua vindo de la e a aritmetica de ciclo
(`escalas/jornada.ts` e modulo puro), porque reescrever a mesma conta aqui
criaria uma segunda versao da mesma regra.

Derivar em vez de gravar tem a consequencia esperada: **corrigir o contrato do
posto recalcula o mes inteiro**, para todo mundo naquela funcao, sem uma linha
reescrita. E o mesmo comportamento da apuracao do ponto quando a escala de
alguem muda — e a mesma razao pela qual gravar a conclusao criaria a versao velha
do fato.

### Inclusao na escala (`POST` de `incluirFuncionario` / `incluirFreelancer`)

O funcionario vem do cadastro; o freelancer **nasce na inclusao** — exigir que
alguem passe por outra tela antes de escalar quem apareceu hoje travaria o caso
de uso. O que a action nao faz e criar dois freelancers com o mesmo nome: ela
procura por `lower(nome)` e reaproveita o cadastro, gravando o codigo so quando
ele e novo (reescreve-lo transformaria uma inclusao em edicao silenciosa).

A mesma pessoa nao entra duas vezes no mesmo bloco (indice parcial unico), mas
entra em **outra funcao** no mesmo periodo: e assim que uma troca de posto no
meio do mes e registrada, com um bloco encerrando e o outro comecando.

### Conferencia de horas extras (`GET /extras`)

1. `exigirAcesso("extras")`; `?busca=` e `?pagina=` passam pelo Zod antes de
   virar filtro (`catch` nos dois: parametro torto e "sem filtro", nao erro).
2. `competenciaEmVigor()` recorta tudo. Sem competencia, a tela e o aviso e nao
   ha lista nem botao de registrar — `null` significa "nao ha o que mostrar".
3. `listarExtras()` faz duas consultas com o mesmo filtro: uma so das duas horas
   de cada linha (que da o total do periodo e a contagem, somando com a mesma
   `duracaoEmMinutos()` da tela) e outra da pagina, com os joins de funcionario,
   freelancer, posto e usuario que registrou.
4. A busca casa com tudo o que a linha exibe — nome, matricula ou codigo, posto,
   local, observacao e a data em `DD/MM/YYYY`. `%` e `_` sao escapados, e a
   pagina alem do fim cai na ultima.

A duracao nunca e coluna: ela sai de `hora_entrada` e `hora_saida` a cada
leitura, virada da meia-noite incluida — mesma razao pela qual a apuracao do
ponto nao tem coluna de falta.

**A lista tem duas origens, e uma so tabela.** O extra digitado aqui e o que
nasceu de uma cobertura marcada no modal do preenchimento vivem na mesma
`extras` e aparecem na mesma lista — o segundo com o selo **Grade**. Quem
confere o periodo precisa de uma soma, e nao de duas telas que se completam.
O selo muda o que a tela avisa, e nao o que ela deixa fazer: o extra da grade e
reescrito quando alguem regrava aquele dia, e apagado quando o dia e apagado.

Os filtros (`?posto=`, `?de=`, `?ate=`, `?tipo=`, `?origem=`) entram no mesmo
`where` da busca e **somam** com a competencia: sao lidos por
`filtrosExtrasSchema`, com `catch` por campo, e `hrefDosExtras()` os repete em
cada link de pagina. Tipo e origem saem das proprias colunas de `extras`
(`funcionario_id`/`freelancer_id` e `preenchimento_dia_id`), e nao dos joins.
As opcoes de posto vem de `listarPostosComExtra()` — os postos que aparecem nos
extras da competencia, inclusive desativados.

### Registro de um extra (`POST` de `registrarExtra`)

1. `exigirAcesso("extras")` e `competenciaDeEscrita()` — a aberta, ou a
   consultada durante uma consulta.
2. Zod valida os campos e a regra que so existe com eles juntos: ou se escolhe
   alguem da lista, ou se digita o nome de um freelancer novo, nunca os dois.
3. A data tem de cair dentro do periodo da competencia aberta; fora dele a
   action recusa com a mensagem no campo, e nao grava no periodo errado.
4. Em uma transacao: confere o posto (ativo), resolve a pessoa — funcionario
   ativo, freelancer ativo ou um freelancer criado ali pelo nome — e insere.
5. O indice parcial unico `(pessoa, data, posto, hora_entrada)` recusa o mesmo
   extra lancado duas vezes; a violacao vira mensagem no campo de entrada.

`atualizarExtra()` repete o caminho, com uma folga: manter o posto ou a pessoa
que **ja estavam gravados** vale mesmo que tenham sido desativados desde o
lancamento — trocar por outros continua exigindo cadastro ativo.
`excluirExtra()` apaga (o extra e uma entrada, como o afastamento) e termina em
`redirect()` para a lista, porque a tela aberta era a do extra que deixou de
existir.

### Apontamentos (`GET /apontamentos`, `POST` de `salvarApontamento`)

A lista parte de `funcionarios`, e nao de `apontamentos`: a pergunta da tela e
"quem falta apontar?", e quem falta e justamente quem nao tem linha.

1. `exigirAcesso("apontamentos")`; `?busca=`, `?empresa=`, `?status=`,
   `?inativos=` e `?pagina=` passam por `filtrosApontamentosSchema`, com `catch`
   por campo.
2. `listarApontamentos()` junta `apontamentos` por `left join` preso a
   `competenciaEmVigor()` — a condicao da competencia fica **no `on`**, e nao no
   `where`, senao quem nao tem linha sumiria da lista. Sem `?inativos=1`, a lista
   traz os ativos e qualquer inativo que ja tenha apontamento.
3. As contagens de apontados e de ativos sem apontamento ignoram o filtro: sao
   o andamento do fechamento.

A tela de uma pessoa (`/apontamentos/[funcionarioId]`) le o apontamento e,
em paralelo, `obterApuracao()` do modulo de ponto. `resumirEspelho()` soma o
que a apuracao ja concluiu dia a dia — saldo dos dias `hora_extra`, horas dos
dias `trabalho_em_folga`, intrajornada que faltou nos dias `intrajornada_curta`,
minutos entre 22h e 5h dos dias pareados — e o cartao os mostra ao lado do
formulario. Nada disso e gravado nem escrito nos campos.

Gravacao:

1. `exigirAcesso("apontamentos")` e `competenciaDeEscrita()`.
2. Zod le cada rubrica pela unidade: dias (inteiro), horas (`HH:MM` -> minutos,
   sem decimal), percentual (virgula ou ponto, duas casas), grau e sim/nao.
3. A action confere os dias contra o tamanho do periodo aberto
   (`diasDoPeriodo()`), que o `check` do banco nao conhece.
4. Apontamento vazio **apaga** a linha; senao, `insert ... on conflict
(competencia_id, funcionario_id) do update`. `refresh()` redesenha a tela.

`limparApontamento()` e o gesto de apagar, separado de "esvaziar tudo e salvar".

### Sugestao das regras (`sugestoesDaCompetencia`)

As regras de `regras_apontamento` transformam a grade da competencia no que
cada pessoa teria apontado. O resultado **nao e gravado**: ele e derivado a
cada leitura, como o previsto da grade e a apuracao do ponto.

1. `regrasAtivas()` le o cadastro (uma consulta para as regras, outra para as
   excecoes) e o entrega no formato do modulo puro.
2. `pessoasDaGrade()` monta, por funcionario escalado, um dia para **cada dia do
   periodo** — nao so os que tem celula. O dia carrega a natureza e a sigla do
   realizado, a marca de intrajornada, o posto, a funcao, a turma e, da vigencia
   que vale naquele dia (`vigenciaDoDia()`), o ciclo e a duracao do turno.
3. `sugerirApontamento()` aplica as regras **na ordem cadastrada**: casa o
   escopo (pessoa e dia), descarta as excecoes, conta os dias que disparam o
   gatilho e soma ou define o valor, respeitando o teto de cada coluna.

Os tres passos sao recortados em quem vai ser mostrado: a lista passa os
funcionarios da **pagina** e a ficha passa uma pessoa so (`sugestaoDoFuncionario()`),
e `pessoasDaGrade()` leva esse recorte para o `where` da consulta da grade. Varrer
a competencia inteira para marcar vinte linhas (ou desenhar um cartao) jogava fora
quase tudo o que calculava. Da sugestao de cada pessoa saem as marcas "ha sugestao
pronta" e "difere da sugestao".

A derivacao e memoizada por requisicao com `cache()` do React, chaveada pelos ids
**em texto** (ordenados, `join(",")`): `cache()` compara argumento por identidade,
e um array montado a cada chamada nunca acertaria o cache.

Gravar continua sendo um gesto: o botao da ficha escreve nos **campos** (a
observacao fica como esta) e `gerarApontamentos()` insere em lote com
`on conflict do nothing` — quem ja tem apontamento fica como esta.

### Exportacao dos apontamentos (`GET /apontamentos/exportar/{word,excel}`)

1. O botao da lista e um `<a href download>` com a busca e a empresa em vigor
   (`hrefDaExportacao()`); nao ha JavaScript no caminho.
2. `responderExportacao()` chama `exigirAcesso("apontamentos")` — a rota nao
   passa por layout — e le os parametros com o mesmo `filtrosApontamentosSchema`
   da lista.
3. `listarApontamentosParaExportar()` faz duas consultas em paralelo: os
   apontamentos da competencia em vigor com funcionario, empresa e autor (o
   `where` usa `recorteDaBusca()`, o mesmo da lista), e os postos em que cada
   pessoa esta na grade da competencia (`preenchimento_linhas` -> `funcoes_posto`
   -> `postos`), juntados em memoria.
4. O gerador monta o arquivo em memoria — `exceljs` (`writeBuffer`) ou `docx`
   (`Packer.toBuffer`) — e a resposta sai com o MIME do formato,
   `Content-Disposition: attachment; filename="apontamentos-AAAA-MM.ext"` e
   `Cache-Control: private, no-store`.

O que vai em cada coluna da planilha — cabecalho, ordem, conteudo e nota — esta
em `COLUNAS_DA_PLANILHA`, separado de como a celula e desenhada (`excel.ts`):
fonte 7 pelo estilo de cada coluna, horas como fracao de dia em `[h]:mm`,
gratificacao como percentual, marcacoes como "Sim", zero em branco, e a linha 1
com o texto girado 90° (de baixo para cima), fundo preto e fonte branca.

O relatorio em Word nao repete a planilha: totais por rubrica da competencia e,
por empresa (uma pagina cada), cada pessoa com as rubricas que tem em texto
corrido (`textoDasRubricas()`, uma frase por grupo), a observacao e quem alterou
por ultimo. Todo o texto e preto e so o nome do colaborador vai em negrito — a
cor e o negrito sao fixados nos estilos de titulo e em cada trecho.

### Movimentacoes (`GET /movimentacoes`, `POST` de `salvarMovimentacao`)

Leitura:

1. A pagina chama `exigirAcesso("movimentacoes")` e le `?busca=`, `?tipo=`,
   `?de=`, `?ate=`, `?documento=` e `?pagina=` com `filtrosMovimentacoesSchema`.
2. `listarMovimentacoes()` monta o recorte com `filtroDaLista()` — competencia em
   vigor + filtros; a busca casa justificativa, data (`to_char`) e, por
   `exists`, o nome ou a matricula de qualquer pessoa envolvida. Uma consulta
   agrupada por tipo da as contagens (e o total); outra traz a pagina.
3. `completar()` busca pessoas e documentos **das linhas da pagina** (`inArray`),
   uma consulta de cada; os documentos vem sem `conteudo`.
4. `PainelMovimentacoes` (client) desenha a tabela e o modal unico. A
   exportacao (`/movimentacoes/exportar`) usa o mesmo `filtroDaLista()`, sem
   paginar.

Gravacao (registro e edicao sao a mesma action):

1. Ao soltar (ou colar, ou escolher) um arquivo, `prepararArquivo()` le os
   primeiros bytes: PDF passa como esta (ate 2 MB); imagem e decodificada com
   `createImageBitmap` (orientacao EXIF), reduzida a 1800 px no maior lado e
   codificada em WebP 0,72 (JPEG se o navegador nao codificar WebP). O limite de
   4 documentos e conferido quando o arquivo fica pronto.
2. O `onSubmit` monta o `FormData` do formulario, acrescenta os arquivos prontos
   em `documentos` e chama a action dentro de `startTransition` — sem `<form
action>`, o React nao reseta o formulario e a recusa preserva o digitado.
3. `salvarMovimentacao()`: `exigirAcesso` -> `competenciaDeEscrita()` -> Zod
   (pessoas por tipo) -> data dentro do periodo -> `lerDocumentosEnviados()`
   (tamanho, tipo pela assinatura, nome limpo, gzip quando economiza 5% ou
   mais).
4. Na transacao: na edicao, a linha e travada (`for update`) e a contagem de
   documentos desconta os marcados para sair **sem apagar nada**; as pessoas
   sao conferidas contra o cadastro (nova precisa estar ativa). So depois de
   todas as conferencias vem as escritas: insert/update da movimentacao,
   pessoas regravadas inteiras, documentos removidos e os novos inseridos. A
   recusa e um valor devolvido pelo callback, e valor devolvido nao desfaz a
   transacao — por isso nenhuma escrita antes da ultima conferencia.
5. `refresh()` redesenha a lista; o modal fecha no retorno de sucesso.

O documento abre por `GET /movimentacoes/documentos/[id]`: `abrirDocumento()`
so encontra documento de movimentacao da competencia em vigor, desfaz o gzip e
responde `inline` com o tipo gravado, `nosniff` e `no-store`.

### Chatbot de ponto (`POST /api/whatsapp/webhook`)

```
Z-API ─POST─> /api/whatsapp/webhook?token=…
                │ segredo (tempo constante) · instancia · lerWebhook() (ignora grupo, fromMe, midia)
                ▼
          processarMensagem()  ── uma transacao ──────────────────────────────┐
                │ pg_advisory_xact_lock(telefone)                              │
                │ messageId ja gravado? -> "duplicada"                         │
                │ funcionario pelo numero (com/sem nono digito)                │
                │ contexto: obterApuracao() - tratativas encerradas            │
                │ atendimento aberto? responder(estado) : iniciar()            │
                │ grava a recebida, envia cada resposta e grava com o id       │
                │ confirmar -> tratativa justificada · consolidar() -> hash    │
                │              -> PDF -> comprovante -> encerra -> aviso final │
                └──────────────────────────────────────────────────────────────┘
```

A conversa (`fluxo.ts`) e pura; `processar.ts` grava e envia. O envio acontece
dentro da transacao e antes do `insert`, para a mensagem nascer com o id da
Z-API e nunca ser atualizada — e a transcricao do comprovante poder ser
reconstruida identica. Erro no processamento responde 500 e a Z-API reentrega;
a transacao ja voltou inteira.

Etapas: `data` -> (`tipo`, se o dia tem mais de uma ocorrencia) -> `motivo` ->
(`horarios` e/ou `descricao`, conforme o motivo) -> `confirmacao`. "cancelar" e
"reiniciar" valem em qualquer etapa; conversa parada ha 72 horas recomeca.

### Gestao de acessos (`POST` de Server Action)

1. `criarUsuario()` valida a entrada, confere que o login e livre, gera a senha
   provisoria, faz o hash **fora** da transacao (scrypt custa ~100 ms) e grava
   usuario + areas em uma transacao so.
2. A senha volta no estado do formulario e e exibida uma unica vez — o banco
   guarda apenas o hash, entao nao ha como reexibi-la.
3. `atualizarUsuario()` substitui as areas em bloco (`delete` + `insert` na
   mesma transacao) e, quando o usuario passa a inativo, revoga as sessoes.
4. `redefinirSenha()` grava um hash novo, remarca `senha_provisoria` e revoga
   as sessoes do alvo.

As travas de escalonamento de privilegio (quem promove, quem altera um
administrador, quem desativa a si mesmo) vivem nessas actions, nao na UI.

## 5. Modelo de dados

### `competencias`

| Coluna          | Tipo                 | Notas                                                     |
| --------------- | -------------------- | --------------------------------------------------------- |
| `id`            | `uuid`               | PK, `gen_random_uuid()`                                   |
| `data_inicio`   | `date`               | not null; dia de calendario, sem hora nem fuso            |
| `data_fim`      | `date`               | not null; `check (data_fim > data_inicio)`                |
| `referencia`    | `date`               | **coluna gerada**: `date_trunc('month', data_fim)`; unica |
| `status`        | `competencia_status` | enum `aberta`/`encerrada`; unica parcial em `aberta`      |
| `encerrada_em`  | `timestamptz`        | preenchida quando a proxima competencia e aberta          |
| `criado_em`     | `timestamptz`        | `now()`                                                   |
| `atualizado_em` | `timestamptz`        | `now()`, via `$onUpdate` do Drizzle                       |

Datas como `date` (e nao `timestamptz`) porque competencia e intervalo de dias
de calendario: virar instante so criaria a chance de o fuso empurrar o dia 21
para o 20. Pelo mesmo motivo elas trafegam como string `YYYY-MM-DD`
(`mode: "string"` no Drizzle) e `periodo.ts` formata recortando a string, sem
construir `Date`.

O nome vem da coluna gerada, nunca de um campo digitado. Os dois indices unicos
sao regra de negocio no banco, e nao so na action: um mes por competencia, uma
competencia aberta por vez.

### `consultas_competencia`

| Coluna           | Tipo          | Notas                                                              |
| ---------------- | ------------- | ------------------------------------------------------------------ |
| `sessao_id`      | `uuid`        | PK — uma consulta por sessao de login; FK -> `sessoes.id`, cascade |
| `competencia_id` | `uuid`        | FK -> `competencias.id`, cascade, indexada                         |
| `iniciada_em`    | `timestamptz` | `now()`                                                            |

Uma linha aqui faz **so aquela sessao** ler e gravar numa competencia
encerrada. Pedir outra consulta substitui a anterior (`on conflict` na PK), e o
logout a apaga junto com a sessao.

Timestamps sempre com timezone. Tamanhos de campo sao regra de negocio e ficam
no Zod, nao como `varchar(n)` no banco — permite ajustar sem migration.

### `escalas`

| Coluna                 | Tipo          | Notas                                                          |
| ---------------------- | ------------- | -------------------------------------------------------------- |
| `id`                   | `uuid`        | PK, `gen_random_uuid()`                                        |
| `nome`                 | `text`        | not null; indice unico sobre `lower(nome)`                     |
| `descricao`            | `text`        | opcional; `""` do formulario vira `null` no Zod                |
| `entrada`              | `time`        | not null, sem fuso                                             |
| `saida`                | `time`        | not null; `check (saida <> entrada)`                           |
| `dias_ciclo`           | `smallint`    | not null, default 7; `check` de 1 a 60                         |
| `intrajornada_minutos` | `integer`     | not null, default 0; `check` de 0 a 1439                       |
| `marcacoes_esperadas`  | `smallint`    | not null, default 2; `check` par, de 2 a 8                     |
| `horas_extras_minutos` | `integer`     | not null, default 0; `check` de 0 a 720                        |
| `virada_turno`         | `boolean`     | **coluna gerada**: `saida < entrada`                           |
| `ativa`                | `boolean`     | default `true`; inativa some das escolhas novas, nao e apagada |
| `criado_em`            | `timestamptz` | `now()`                                                        |
| `atualizado_em`        | `timestamptz` | `now()`, via `$onUpdate` do Drizzle                            |

Horarios como `time` (e nao `timestamptz`) porque a escala diz "entra as 22h",
nao "entra no instante X". Pelo mesmo motivo eles trafegam como string e
`jornada.ts` calcula em minutos, sem construir `Date` — hora de escala nao tem
dia a que pertencer, e o horario de verao moveria a jornada.

A virada de turno sai da coluna gerada, nunca de um campo digitado: e
consequencia dos horarios. O `check (saida <> entrada)` existe para que essa
consequencia tenha uma resposta so — entrada igual a saida seria "24h ou zero?".

### `escala_excecoes`

| Coluna                 | Tipo       | Notas                                                      |
| ---------------------- | ---------- | ---------------------------------------------------------- |
| `escala_id`            | `uuid`     | FK -> `escalas.id`, cascade; parte da PK                   |
| `dia_ciclo`            | `smallint` | posicao no ciclo, contando de 1; parte da PK; `check` 1-30 |
| `entrada`              | `time`     | not null; `check (saida <> entrada)`                       |
| `saida`                | `time`     | not null                                                   |
| `intrajornada_minutos` | `integer`  | not null, default 0                                        |
| `marcacoes_esperadas`  | `smallint` | not null, default 2; `check` par, de 2 a 8                 |
| `horas_extras_minutos` | `integer`  | not null, default 0                                        |
| `virada_turno`         | `boolean`  | **coluna gerada**: `saida < entrada`, como na escala       |

Uma linha por dia do ciclo que **difere** do padrao — dia igual a escala nao tem
linha nenhuma. A linha descreve o dia inteiro, e nao so o que mudou: sem colunas
anulaveis, interpretar nao depende de descobrir o que foi herdado.

O teto de 60 acompanha o de `dias_ciclo`; o limite real (dentro do ciclo e fora
dos dias de folga daquela escala) e cruzado entre tabelas, entao vive na action —
e um `delete` na mesma transacao do update cuida do ciclo que encurtou.

### `escala_folgas`

| Coluna      | Tipo       | Notas                                                |
| ----------- | ---------- | ---------------------------------------------------- |
| `escala_id` | `uuid`     | FK -> `escalas.id`, cascade; parte da PK             |
| `dia_ciclo` | `smallint` | posicao de folga no ciclo; parte da PK; `check` 1-60 |

Uma linha por dia de folga; o que nao esta aqui e dia de trabalho. Listar a
folga (e nao o trabalho) e mais curto, e e o que faz a escala ser, por padrao,
uma regra de trabalho.

Guardar **posicoes** — em vez de "N trabalhados x M de folga" — e o que permite
a escala em que a folga anda: o 6x1 que folga domingo numa semana e sabado na
outra e um ciclo de 14 dias com folga no 7 e no 13, duas folgas que nao sao
vizinhas. O 5x2 continua sendo o caso simples (ciclo de 7, folga no 6 e no 7) e
o 12x36 um ciclo de 2 com folga no dia 2 — as horas ja estao em
`entrada`/`saida`.

Nao ha coluna de data aqui — o ciclo e um padrao, e a data em que ele comeca a
valer pertence ao funcionario, nao a escala.

O modelo levou tres passos: a migration `0005` gravava dias da semana
(`escala_dias` + enum `dia_semana`), a `0006` trocou por `dias_trabalhados` x
`dias_folga`, e a `0009`/`0010` chegaram nas posicoes — convertendo o que ja
existia (`dias_ciclo = trabalhados + folga`, e uma linha de folga para cada dia
do bloco final) antes de derrubar as colunas antigas.

As folgas viajam junto da escala em um `int[]` montado por subconsulta
(`folgasDaEscala`, em `escalas/queries.ts`), e nao em uma segunda consulta:
elas nunca sao lidas sem a escala, e `funcionarios` le a escala pelo mesmo
caminho. O `::int` no `array_agg` e obrigatorio — `dia_ciclo` e `smallint`, e o
driver `pg` nao tem parser para `int2[]`.

### `empresas`

| Coluna          | Tipo          | Notas                                               |
| --------------- | ------------- | --------------------------------------------------- |
| `id`            | `uuid`        | PK, `gen_random_uuid()`                             |
| `nome`          | `text`        | not null; unique por `lower(nome)`                  |
| `cnpj`          | `text`        | so digitos, unique; `check` de 14 digitos. Opcional |
| `codigo`        | `text`        | codigo no relogio de ponto, unique; anulavel        |
| `ativa`         | `boolean`     | default `true`; inativa some das escolhas novas     |
| `criado_em`     | `timestamptz` | `now()`                                             |
| `atualizado_em` | `timestamptz` | `now()`, via `$onUpdate` do Drizzle                 |

Cadastro proprio, e nao uma coluna de texto no funcionario: o nome se repete por
centenas de linhas, e como texto corrigi-lo seria um UPDATE em massa e duas
grafias virariam dois empregadores. O relatorio da folha corta a razao social em
40 caracteres, entao a importacao cria a empresa com o que veio e o cadastro
corrige depois — por isso o nome completo mora aqui e nao e reescrito a cada
carga.

`codigo` e a ponte entre os dois relatorios do portal: o de marcacoes identifica
a empresa **so** pelo codigo do relogio (a coluna "Emp.": 1144, 1147...) e o da
folha **so** pela razao social. Sem ele a matricula nao identifica ninguem — o
codigo 1335 existe em duas empresas e sao duas pessoas. Anulavel porque a
empresa nasce pela importacao da folha, que nao o conhece; quem preenche e a
primeira carga de ponto que esbarrar no codigo, na tela de importacao.

### `funcionarios`

| Coluna          | Tipo          | Notas                                                                      |
| --------------- | ------------- | -------------------------------------------------------------------------- |
| `id`            | `uuid`        | PK, `gen_random_uuid()`                                                    |
| `empresa_id`    | `uuid`        | FK -> `empresas.id`, `on delete restrict`                                  |
| `matricula`     | `text`        | not null; o "Codigo" da folha, unique por `(empresa_id, lower(matricula))` |
| `nome`          | `text`        | not null                                                                   |
| `cpf`           | `text`        | not null, unique; 11 digitos sem mascara (`check`). E a identidade         |
| `cargo`         | `text`        | rotulo da folha, texto livre                                               |
| `telefone`      | `text`        | WhatsApp; so digitos com DDI, `check` de 10 a 15. Nasce no portal          |
| `admissao`      | `date`        | `mode: "string"`, `YYYY-MM-DD`                                             |
| `situacao`      | `smallint`    | codigo da folha, default 1; `check` de 1 a 99; rotulos em `situacoes.ts`   |
| `escala_id`     | `uuid`        | FK -> `escalas.id`, `on delete restrict`; anulavel, indexada               |
| `inicio_ciclo`  | `date`        | dia 1 do ciclo **desta pessoa**; anulavel                                  |
| `ativo`         | `boolean`     | default `true`; independente de `situacao`                                 |
| `criado_em`     | `timestamptz` | `now()`                                                                    |
| `atualizado_em` | `timestamptz` | `now()`, via `$onUpdate` do Drizzle                                        |

`check funcionarios_escala_com_inicio`: `(escala_id is null) = (inicio_ciclo is
null)`. Os dois campos so respondem juntos, e o banco recusa a combinacao que
pareceria um cadastro completo sem servir para nada.

`on delete restrict` nas duas FKs pelo mesmo motivo de `ativa` nas escalas:
apagar a empresa ou a escala levaria junto a explicacao de jornadas ja
interpretadas.

### `marcacoes`

| Coluna           | Tipo          | Notas                                                      |
| ---------------- | ------------- | ---------------------------------------------------------- |
| `id`             | `uuid`        | PK, `gen_random_uuid()`                                    |
| `competencia_id` | `uuid`        | FK -> `competencias.id`, `on delete restrict`              |
| `funcionario_id` | `uuid`        | FK -> `funcionarios.id`, `on delete restrict`              |
| `data`           | `date`        | `mode: "string"`, `YYYY-MM-DD`                             |
| `hora`           | `time`        | sem fuso; trafega como `HH:MM:SS`, a apuracao le `HH:MM`   |
| `incluida`       | `boolean`     | default `false`; batida digitada a mao no sistema de ponto |
| `criado_em`      | `timestamptz` | `now()`                                                    |

`unique (funcionario_id, data, hora)`: a mesma pessoa nao bate duas vezes no
mesmo minuto, e e esse indice que faz a reimportacao ser idempotente — reenviar
o relatorio nao duplica nem exige apagar o que ja existia. O
`index (competencia_id, funcionario_id, data)` e como a apuracao consulta; o
unico nao serve, porque `funcionario_id` a esquerda nao alcanca "a competencia
inteira".

**Nenhuma coluna de apuracao.** A batida e o fato bruto; falta, hora extra e
pendencia sao consequencia de le-la contra a escala, e sao recalculadas a cada
render. `competencia_id` sai da **data** na importacao, e nao da competencia
aberta no momento do envio: uma carga tardia nao joga agosto dentro de setembro.

### `importacoes_ponto`

| Coluna               | Tipo          | Notas                                                         |
| -------------------- | ------------- | ------------------------------------------------------------- |
| `id`                 | `uuid`        | PK, `gen_random_uuid()`                                       |
| `competencia_id`     | `uuid`        | FK -> `competencias.id`, `on delete restrict`; indexada       |
| `arquivo`            | `text`        | nome do arquivo enviado                                       |
| `periodo_inicio`     | `date`        | periodo declarado no cabecalho, ja recortado pela competencia |
| `periodo_fim`        | `date`        | `check periodo_fim >= periodo_inicio`                         |
| `marcacoes_lidas`    | `integer`     | batidas que o arquivo trouxe                                  |
| `marcacoes_gravadas` | `integer`     | quantas eram novas                                            |
| `importado_por`      | `uuid`        | FK -> `usuarios.id`, `on delete set null`                     |
| `criado_em`          | `timestamptz` | `now()`                                                       |

Existe por causa de **uma** pergunta que as marcacoes sozinhas nao respondem:
ate onde o periodo foi apurado. Dia sem marcacao pode ser falta ou pode ser dia
que o arquivo nem cobriu — e o relatorio costuma parar antes do fim da
competencia. A janela apurada e a uniao dos periodos importados, recortada pela
competencia.

### `tratativas_ponto`

| Coluna           | Tipo               | Notas                                                      |
| ---------------- | ------------------ | ---------------------------------------------------------- |
| `id`             | `uuid`             | PK, `gen_random_uuid()`                                    |
| `competencia_id` | `uuid`             | FK -> `competencias.id`, `on delete restrict`              |
| `funcionario_id` | `uuid`             | FK -> `funcionarios.id`, `on delete restrict`              |
| `data`           | `date`             | o dia da ocorrencia, `mode: "string"`                      |
| `tipo`           | `divergencia_tipo` | enum: os dez tipos de `apuracao.ts`                        |
| `status`         | `tratativa_status` | enum, default `aberta`                                     |
| `observacao`     | `text`             | o que se apurou; obrigatoria (na action) para `descartada` |
| `responsavel_id` | `uuid`             | FK -> `usuarios.id`, `on delete set null`                  |
| `criado_em`      | `timestamptz`      | `now()`                                                    |
| `atualizado_em`  | `timestamptz`      | `now()`; o upsert a escreve explicitamente, ver abaixo     |

`unique (funcionario_id, data, tipo)` — a identidade da ocorrencia. **Nao ha
`ocorrencia_id`**: a ocorrencia nao existe no banco, ela nasce da leitura das
batidas contra a escala a cada requisicao. A tripla e o que sobra de estavel, e
e ela que a URL carrega.

`index (competencia_id, status)`: como o painel consulta.

Enums: `divergencia_tipo` (`sem_marcacao`, `marcacao_em_afastamento`,
`marcacao_impar`, `marcacoes_a_menos`, `marcacoes_a_mais`, `trabalho_em_folga`,
`turno_em_aberto`, `intrajornada_curta`, `hora_extra`, `debito_de_horas`) e
`tratativa_status` (`aberta`, `em_tratativa`, `justificada`, `resolvida`,
`descartada`). `TipoDeDivergencia` deriva do primeiro, como `AreaPortal` deriva
de `area_portal`.

A ausencia de linha significa `aberta`: a maioria das ocorrencias nunca foi
tocada, e gravar uma linha para cada uma seria gravar a ausencia de trabalho.

Tratativa cuja divergencia deixou de existir fica orfa e some do painel — nao ha
mais o que tratar. Ela nao e apagada: se a mesma divergencia voltar, a chave a
reencontra e o historico volta junto.

`$onUpdate` do Drizzle so vale para `db.update()`; num `on conflict do update` o
`set` e SQL cru, entao a action escreve `atualizado_em` a mao.

### `mensagens_ponto`

| Coluna                | Tipo               | Notas                                                          |
| --------------------- | ------------------ | -------------------------------------------------------------- |
| `id`                  | `uuid`             | PK, `gen_random_uuid()`                                        |
| `tratativa_id`        | `uuid`             | FK -> `tratativas_ponto.id`, `on delete cascade`               |
| `destino`             | `mensagem_destino` | enum: `colaborador` (default), `responsavel`                   |
| `destinatario_id`     | `uuid`             | FK -> `funcionarios.id`, `restrict`; o responsavel que recebeu |
| `lote_id`             | `uuid`             | o envio consolidado de que a linha faz parte; nulo na avulsa   |
| `telefone`            | `text`             | so digitos com DDI, **como foi discado**                       |
| `conteudo`            | `text`             | o texto **como foi enviado**                                   |
| `status`              | `mensagem_status`  | enum: `enviada`, `falhou`                                      |
| `mensagem_externa_id` | `text`             | o id que a Z-API devolve quando aceita                         |
| `erro`                | `text`             | o motivo da recusa, em portugues, quando houve                 |
| `enviado_por`         | `uuid`             | FK -> `usuarios.id`, `on delete set null`                      |
| `criado_em`           | `timestamptz`      | `now()`                                                        |

`index (tratativa_id, criado_em)`: como a tela consulta o historico.

Texto e telefone ficam gravados como foram enviados, e nao por referencia ao
cadastro ou ao modelo: os dois mudam, e o historico precisa dizer o que a pessoa
recebeu naquele dia. Mesma razao pela qual `importacoes_ponto` guarda o nome do
arquivo.

`cascade`, e nao `restrict` como a maioria das FKs do portal: sem a tratativa a
mensagem e um texto solto, e nao um registro historico a preservar.

A falha tambem vira linha. Sem ela, "ninguem avisou o colaborador" e "o numero
esta errado" ficariam indistinguiveis, e as duas pedem acoes diferentes.

`enviada` e `falhou` sao os dois desfechos que o envio conhece — a Z-API
responde na hora se aceitou. Entregue e lida dependem de webhook, que o portal
ainda nao recebe; inventar os valores agora criaria estados que nada escreveria.

### `atendimentos_ponto`

O estado de cada conversa. Etapa (`atendimento_etapa`), desfecho
(`atendimento_desfecho`: `confirmado`, `cancelado`, `expirado`,
`sem_pendencia`; `null` enquanto aberta, com `check` amarrando a `encerrado_em`),
as respostas em colunas tipadas (`data`, `tipo`, `descricao_ocorrencia`,
`motivo`, `horarios text[]`, `descricao`), o ultimo menu em `opcoes jsonb` e a
`tratativa_id` preenchida na confirmacao. Indice unico parcial: um atendimento
aberto por telefone.

### `mensagens_whatsapp`

A transcricao, nos dois sentidos. `sequencia bigserial` e a ordem total;
`mensagem_externa_id` e o `messageId` da Z-API, unico entre as recebidas (e o
que barra a reentrega); `status` `recebida`/`enviada`/`falhou`, gravado no
`insert` e nunca atualizado. `momento` vem sempre de um `Date` do JavaScript.
FK `restrict`: a transcricao nao se apaga.

### `comprovantes_tratativa`

Um por atendimento confirmado. `conteudo` e o JSON canonico que foi hasheado,
`hash` o SHA-256 dele (`check` de 64 hexadecimais), `sequencia_final` a
mensagem que confirmou, `pdf bytea` o documento e `pdf_hash` o SHA-256 do
arquivo. Ligado a `atendimento_id`, `tratativa_id` e `funcionario_id`, todos
`restrict`.

### `afastamentos`

| Coluna           | Tipo               | Notas                                        |
| ---------------- | ------------------ | -------------------------------------------- |
| `id`             | `uuid`             | PK, `gen_random_uuid()`                      |
| `funcionario_id` | `uuid`             | FK -> `funcionarios.id`, `on delete cascade` |
| `tipo`           | `afastamento_tipo` | enum `ferias`                                | `atestado` | `inss` |
| `data_inicio`    | `date`             | inclusiva                                    |
| `data_fim`       | `date`             | inclusiva; `check data_fim >= data_inicio`   |
| `observacao`     | `text`             | numero do atestado, beneficio do INSS        |
| `criado_em`      | `timestamptz`      | `now()`                                      |
| `atualizado_em`  | `timestamptz`      | `now()`, via `$onUpdate` do Drizzle          |

O periodo em que a pessoa nao devia bater ponto. **Nao pertence a uma
competencia**, ao contrario das marcacoes: um INSS atravessa meses, e prende-lo
a um periodo o faria sumir justo enquanto ainda vale — a apuracao cruza por
data. Tambem nao se confunde com `funcionarios.situacao`, que e a foto que a
folha manda ("9 = Ferias" hoje) e nao diz de quando ate quando.

`cascade` na FK, ao contrario das outras: o afastamento nao explica nada
sozinho — sem a pessoa ele e linha orfa, e nao registro historico.

Nao ha constraint contra dois afastamentos sobrepostos da mesma pessoa: exigiria
`btree_gist` e um `exclude using gist` para um problema que nao corrompe nada
(um dia coberto duas vezes continua coberto). A action recusa porque
sobreposicao quase sempre e data digitada errada.

### `postos` e `funcoes_posto`

| Coluna           | Tipo          | Notas                                                                           |
| ---------------- | ------------- | ------------------------------------------------------------------------------- |
| `id`             | `uuid`        | PK, `gen_random_uuid()`                                                         |
| `codigo`         | `text`        | GP01, SG27; `check` de formato, unico por `lower(codigo)`                       |
| `nome`           | `text`        | unico por `lower(nome)`                                                         |
| `empresa_id`     | `uuid`        | FK -> `empresas.id`, `on delete restrict`; anulavel                             |
| `responsavel_id` | `uuid`        | FK -> `funcionarios.id`, `restrict`; anulavel — quem recebe a correcao do grupo |
| `ativo`          | `boolean`     | default `true`                                                                  |
| `criado_em`      | `timestamptz` | `now()`                                                                         |

| Coluna               | Tipo       | Notas                                              |
| -------------------- | ---------- | -------------------------------------------------- |
| `id`                 | `uuid`     | PK, `gen_random_uuid()`                            |
| `posto_id`           | `uuid`     | FK -> `postos.id`, `on delete restrict`            |
| `nome`               | `text`     | `unique (posto_id, lower(nome))`                   |
| `evento_trabalho_id` | `uuid`     | FK -> `eventos.id`, `on delete restrict`; anulavel |
| `observacao`         | `text`     | o texto livre do bloco                             |
| `ordem`              | `smallint` | posicao do bloco dentro do posto                   |
| `ativa`              | `boolean`  | default `true`                                     |

Dois niveis porque e assim que a escala e montada: o posto diz o lugar, a funcao
diz o turno ou o papel que se cobre ali, e **cada par tem a propria lista de
gente**. Achatar em um nivel juntaria numa lista unica pessoas que nunca se
substituem.

O nome da funcao e unico **dentro do posto**, e nao no portal: "PORTARIA" existe
em todo posto e sao portarias diferentes — mesmo raciocinio da matricula, unica
por empresa.

**O contrato da funcao mora em `funcao_ciclos`.** A funcao diz o que o posto e; o
que ele **exige**, e a partir de quando, e uma linha por turma e por vigencia.

### `posto_contatos`

| Coluna           | Tipo          | Notas                                          |
| ---------------- | ------------- | ---------------------------------------------- |
| `id`             | `uuid`        | PK, `gen_random_uuid()`                        |
| `posto_id`       | `uuid`        | FK -> `postos.id`, `on delete restrict`        |
| `funcionario_id` | `uuid`        | FK -> `funcionarios.id`, `restrict`; **unico** |
| `criado_em`      | `timestamptz` | `now()`                                        |
| `criado_por`     | `uuid`        | FK -> `usuarios.id`, `on delete set null`      |

O grupo de contato do posto: quem tem a correcao de ponto enviada ao
`postos.responsavel_id`. Cadastro, e nao dado datado — nao se confunde com a
grade, que muda todo mes. O indice unico em `funcionario_id` garante um grupo
por pessoa: com dois, nao haveria a quem mandar. Retirar alguem apaga a linha;
o historico das mensagens ja enviadas guarda o proprio destino.

### `funcao_ciclos`

| Coluna            | Tipo           | Notas                                           |
| ----------------- | -------------- | ----------------------------------------------- |
| `id`              | `uuid`         | PK, `gen_random_uuid()`                         |
| `funcao_id`       | `uuid`         | FK -> `funcoes_posto.id`, `on delete cascade`   |
| `turma`           | `funcao_turma` | `escala` \| `contraescala`; default `escala`    |
| `vigencia_inicio` | `date`         | anulavel: `null` = desde sempre                 |
| `dias_ciclo`      | `smallint`     | tamanho do ciclo em dias                        |
| `folgas`          | `smallint[]`   | posicoes de folga dentro do ciclo, default `{}` |
| `entrada`         | `time`         | sem fuso                                        |
| `saida`           | `time`         |                                                 |
| `inicio_ciclo`    | `date`         | a ancora: onde cai a posicao 1; anulavel        |

**A vigencia e aberta**: cada linha vale ate a proxima da mesma turma comecar.
Guardar tambem a data final criaria duas datas a manter em dia a cada troca, e
com elas a chance de buraco e de sobreposicao — o "ate 27/08" e consequencia de
a proxima comecar em 28/08, e nao informacao. `funcao_ciclos_vigencia_unica`
impede duas vigencias da mesma turma no mesmo dia; `funcao_ciclos_inicial_unica`
(parcial, `where vigencia_inicio is null`) impede duas "desde sempre".

**Escala e contraescala sao duas escalas completas**, e nao a mesma com a ancora
deslocada: cada uma tem ciclo, folgas, horario e vigencias proprios. Sao duas e
nao N porque e assim que a operacao fala, e porque um posto com tres padroes
simultaneos seria outra funcao.

`inicio_ciclo` diz em que dia cai a **posicao 1**; sem ela, a posicao 1 cai no
inicio da vigencia. Vale a pena dize-la quando a troca acontece no meio da
semana — um 5x2 que passa a valer numa quarta continua ancorando na segunda.

`funcao_ciclos_folgas_no_ciclo` garante que sobre ao menos um dia de trabalho:
um ciclo so de folgas geraria um mes inteiro de folga.

As folgas sao **posicoes** do ciclo, e nao dias da semana, pelo mesmo motivo de
`escala_folgas`: ha escala em que a folga anda (o 6x1 alternado e um ciclo de 14
com folga no 7 e no 13). Sao um `smallint[]` em vez de tabela filha porque nunca
sao lidas nem escritas sem a vigencia, que ja e um `<form>` so.

`cascade` no `funcao_id` (e nao `restrict` como as outras FKs do modulo) porque
a vigencia nao explica nada sem a funcao: seria o contrato de um turno que nao
existe. Mesma razao de `escala_folgas`.

Cadastro, e nao dado datado: nenhuma query da feature chama
`competenciaEmVigor()`. Posto que saiu de operacao e desativado, nunca apagado —
as duas FKs sao `restrict`.

### `eventos`

| Coluna          | Tipo              | Notas                                                           |
| --------------- | ----------------- | --------------------------------------------------------------- |
| `id`            | `uuid`            | PK, `gen_random_uuid()`                                         |
| `codigo`        | `text`            | a sigla da celula (D, N, F); unico por `lower(codigo)`          |
| `rotulo`        | `text`            | unico por `lower(rotulo)`                                       |
| `descricao`     | `text`            | anulavel                                                        |
| `natureza`      | `evento_natureza` | `trabalho` \| `folga` \| `falta` \| `afastamento` \| `outro`    |
| `cor`           | `evento_cor`      | `cinza` \| `verde` \| `azul` \| `ambar` \| `vermelho` \| `roxo` |
| `exige_horario` | `boolean`         | default `false`                                                 |
| `padrao`        | `boolean`         | `unique (natureza) where padrao`                                |
| `ativo`         | `boolean`         | default `true`                                                  |

Tabela, e nao enum no codigo, porque quem inventa evento e a operacao: a
planilha de origem ja traz TP, TI, TT, TE, TF e MEIO, cada um com um sentido
local, e enum obrigaria uma migration a cada sigla nova.

A `natureza` e enum porque ela **decide contagem** — e o que separa "nao
trabalhou porque folgou" de "nao trabalhou porque faltou". A `cor` e enum curto
em vez de hexadecimal livre: 31 colunas com cor escolhida a dedo por cadastro
viram um mosaico ilegivel, e hexadecimal nao acompanha o tema claro/escuro.

O indice parcial `eventos_padrao_por_natureza` e o mesmo arranjo de
`competencias_unica_aberta`: a regra "existe no maximo um padrao por natureza" e
do banco. Marcar um novo padrao desmarca o anterior na mesma transacao, em vez
de recusar — quando so pode existir um, trocar qual e ele e a operacao que a
pessoa quis fazer.

### `freelancers`

| Coluna     | Tipo      | Notas                                                   |
| ---------- | --------- | ------------------------------------------------------- |
| `id`       | `uuid`    | PK, `gen_random_uuid()`                                 |
| `nome`     | `text`    | unico por `lower(nome)`                                 |
| `codigo`   | `text`    | o numero pelo qual a operacao o chama; unico e anulavel |
| `telefone` | `text`    | so digitos com DDI, mesmo `check` de `funcionarios`     |
| `ativo`    | `boolean` | default `true`                                          |

Cadastro deliberadamente magro: sem CPF, matricula ou empresa, porque exigi-los
travaria o caso de uso — o freela entra na grade no dia em que aparece, e quem
monta a escala nao tem a documentacao dele em maos.

Existe como tabela, e nao como texto solto na linha da grade, para que o mesmo
freelancer seja reencontravel no mes seguinte: como texto, "Joao" de agosto e
"Joao " de setembro seriam duas pessoas.

### `preenchimento_linhas`

| Coluna               | Tipo           | Notas                                                              |
| -------------------- | -------------- | ------------------------------------------------------------------ |
| `id`                 | `uuid`         | PK, `gen_random_uuid()`                                            |
| `competencia_id`     | `uuid`         | FK -> `competencias.id`, `on delete restrict`                      |
| `funcao_id`          | `uuid`         | FK -> `funcoes_posto.id`, `on delete restrict`                     |
| `funcionario_id`     | `uuid`         | FK -> `funcionarios.id`, `restrict`; anulavel                      |
| `freelancer_id`      | `uuid`         | FK -> `freelancers.id`, `restrict`; anulavel                       |
| `turma`              | `funcao_turma` | qual das duas escalas da funcao a pessoa segue                     |
| `evento_trabalho_id` | `uuid`         | FK -> `eventos.id`, `restrict`; anulavel = herda a sigla da funcao |
| `observacao`         | `text`         | "Troca de escala", "Ferias de 01/09 a 30/09"                       |
| `ordem`              | `smallint`     | posicao dentro do bloco                                            |

`check preenchimento_linhas_uma_pessoa`: `(funcionario_id is null) <> (freelancer_id is null)`.
Um dono, e um so — linha sem ninguem nao e escala de pessoa nenhuma; com os dois
nao responde de quem e o dia. Sao duas colunas em vez de uma coluna polimorfica
com campo "tipo" porque as duas tem integridade referencial de verdade.

Os dois indices unicos sao **parciais** (`where funcionario_id is not null`, e o
espelho): uma das colunas e sempre nula, e `null` nao repete em indice unico —
sem o `where`, a mesma pessoa entraria duas vezes desde que a outra coluna
estivesse vazia, que e sempre.

**A linha nao guarda ciclo nenhum: so a turma.** `turma` diz qual das duas
escalas da funcao aquela pessoa segue. E o que faz duas pessoas da mesma
Portaria Remota 12x36 se alternarem em vez de folgarem no mesmo dia — sem isso o
turno ficaria descoberto metade do mes.

Duas opcoes, e nao uma data por pessoa: o contrato de cada turma vive na funcao,
e escolher entre as duas impede que alguem invente, sem querer, um padrao que o
posto nao tem.

**Dado datado**, ao contrario de postos, eventos e freelancers: cada
competencia tem as proprias linhas e celulas, e a anterior continua inteira para
quem consultar o periodo. Na virada as linhas sao copiadas para a nova — com a
turma, a sigla e a ordem —, e as celulas nao: a grade de setembro nasce com o
efetivo de agosto e o realizado em branco. O ciclo continua de onde parou,
porque a virada fixa a ancora das vigencias que dependiam do inicio do periodo.

### `preenchimento_dias`

| Coluna         | Tipo      | Notas                                      |
| -------------- | --------- | ------------------------------------------ |
| `id`           | `uuid`    | PK, `gen_random_uuid()`                    |
| `linha_id`     | `uuid`    | FK -> `preenchimento_linhas.id`, `cascade` |
| `data`         | `date`    | `mode: "string"`, `YYYY-MM-DD`             |
| `evento_id`    | `uuid`    | FK -> `eventos.id`, `restrict`; anulavel   |
| `hora_entrada` | `time`    | sem fuso; anulavel                         |
| `hora_saida`   | `time`    | anulavel                                   |
| `observacao`   | `text`    | o bilhete do dia                           |
| `intrajornada` | `boolean` | `false`; o intervalo que nao foi usufruido |

`unique (linha_id, data)` — uma celula por dia; e tambem o indice
pelo qual a grade carrega o bloco inteiro. `index (data)` responde "quem esta
escalado no dia 25?" sem varrer a competencia.

`check preenchimento_dias_horario_completo`: `(hora_entrada is null) = (hora_saida is null)`.
Entrada sem saida nao mede jornada nenhuma.

`check preenchimento_dias_nao_vazia`: pelo menos um campo — sigla, horario,
contraparte, destino, observacao **ou** a intrajornada nao usufruida, que e uma
coisa a dizer sobre o dia mesmo sem sigla nenhuma. A linha so
existe quando ha algo a dizer sobre aquele dia — dia em branco nao tem linha, do
mesmo jeito que ocorrencia sem tratativa nao tem linha em `tratativas_ponto`.

`cascade` no `linha_id` (e nao `restrict` como as outras FKs) porque a celula nao
explica nada sozinha: sem a linha ela e um dia sem dono. Mesma razao de
`afastamentos`.

`data` guarda o dia inteiro em vez de "coluna 5 do periodo": a competencia pode
ter o periodo corrigido, e uma posicao relativa passaria a apontar para outro dia
sem nada acusar.

`check preenchimento_dias_uma_pessoa`: a contraparte e uma so. Mesma familia do
`preenchimento_linhas_uma_pessoa`, com a diferenca de que aqui **nenhuma** e o
caso comum — a maioria dos dias nao tem com quem se trocar.

**As duas faixas sao duas linhas, e nao duas colunas.** "Quem trabalha dia 25?" e
"quem trabalhou dia 25?" sao lidas do mesmo jeito, uma embaixo da outra — que e
como a planilha de origem as desenha, com nome e matricula mesclados nas duas.

**As cinco situacoes nao sao um enum.** Cobertura de extra, troca de turno, troca
de posto, falta e substituicao sao eventos como qualquer outro; o que muda e o
que o dia pede, e isso e cadastro (`exige_pessoa`, `exige_destino`). Uma sexta
situacao nao custa migration nenhuma — que e a mesma razao pela qual `eventos` e
tabela e nao enum.

### `preenchimento_alteracoes`

| Coluna                  | Tipo          | Notas                                             |
| ----------------------- | ------------- | ------------------------------------------------- |
| `id`                    | `uuid`        | PK, `gen_random_uuid()`                           |
| `linha_id`              | `uuid`        | FK -> `preenchimento_linhas.id`, `cascade`        |
| `data`                  | `date`        | `mode: "string"`                                  |
| `evento_id`             | `uuid`        | FK -> `eventos.id`, `set null`                    |
| `hora_entrada`          | `time`        | o estado **depois** da alteracao                  |
| `hora_saida`            | `time`        |                                                   |
| `pessoa_funcionario_id` | `uuid`        | FK -> `funcionarios.id`, `set null`               |
| `pessoa_freelancer_id`  | `uuid`        | FK -> `freelancers.id`, `set null`                |
| `funcao_destino_id`     | `uuid`        | FK -> `funcoes_posto.id`, `set null`              |
| `observacao`            | `text`        |                                                   |
| `extra`                 | `boolean`     | `false`; se o dia lancava hora extra              |
| `intrajornada`          | `boolean`     | `false`; se o dia dizia que o intervalo nao houve |
| `usuario_id`            | `uuid`        | FK -> `usuarios.id`, `set null`                   |
| `criado_em`             | `timestamptz` | `now()`                                           |

`index (linha_id, data, criado_em)` — o historico de uma celula, do mais novo
para o mais antigo, que e como o modal do dia consulta.

**Guarda o estado depois, e nao "o que mudou".** O que mudou e a diferenca entre
duas linhas vizinhas, e calcular na leitura evita gravar a mesma conclusao duas
vezes — mesma razao pela qual a apuracao do ponto nao tem coluna de falta. Pelo
mesmo motivo nao ha coluna `acao`: a primeira linha de uma celula e a criacao, e
a linha com tudo nulo e a exclusao.

As FKs sao `set null` (e nao `restrict` como as da celula): o historico nao pode
impedir que um evento ou uma funcao sejam removidos um dia, e uma referencia
perdida aqui degrada a leitura de uma linha antiga — nao corrompe a escala.

Ele existe porque a escala do dia a dia e reescrita o tempo todo — a cobertura
que mudou de nome, o turno que voltou atras, a falta que virou atestado — e
"quem mudou isso, e quando?" nao pode depender da memoria de quem preencheu.

### `extras`

| Coluna                 | Tipo          | Notas                                                              |
| ---------------------- | ------------- | ------------------------------------------------------------------ |
| `id`                   | `uuid`        | PK, `gen_random_uuid()`                                            |
| `competencia_id`       | `uuid`        | FK -> `competencias.id`, `restrict`; sai da **data** do extra      |
| `data`                 | `date`        | `mode: "string"`, dentro do periodo da competencia                 |
| `funcionario_id`       | `uuid`        | FK -> `funcionarios.id`, `restrict`; anulavel                      |
| `freelancer_id`        | `uuid`        | FK -> `freelancers.id`, `restrict`; anulavel                       |
| `posto_id`             | `uuid`        | FK -> `postos.id`, `restrict`                                      |
| `local`                | `text`        | complemento do posto; `check` de nao vazio                         |
| `hora_entrada`         | `time`        | sem fuso, como em `escalas`                                        |
| `hora_saida`           | `time`        | `check hora_entrada <> hora_saida`; menor que a entrada vira o dia |
| `observacao`           | `text`        | anulavel                                                           |
| `preenchimento_dia_id` | `uuid`        | FK -> `preenchimento_dias.id`, `cascade`; anulavel                 |
| `registrado_por_id`    | `uuid`        | FK -> `usuarios.id`, `on delete set null`                          |
| `criado_em`            | `timestamptz` | `now()`                                                            |

Indices: `(competencia_id, data)` para a lista; `funcionario_id`,
`freelancer_id` e `posto_id` para "quantos extras esta pessoa (ou este posto)
fez"; e dois **parciais unicos** por `(pessoa, data, posto_id, hora_entrada)` —
um por coluna de pessoa, porque a outra e sempre nula e `null` nao repete em
indice unico.

Ha ainda um parcial unico por `preenchimento_dia_id`: um extra por celula da
grade. E ele que permite a leitura da grade juntar os dois lados por um `left
join` simples — sem ele, uma celula com dois extras duplicaria a linha inteira.

`check extras_uma_pessoa`: `(funcionario_id is null) <> (freelancer_id is null)`
— uma pessoa, e uma so, com o mesmo arranjo de `preenchimento_linhas`.

`preenchimento_dia_id` e a **origem** do extra: `null` no que foi lancado pela
tela de registro, preenchido no que veio de uma cobertura marcada no modal do
dia. Ele nao muda o que a tela deixa fazer — o extra da grade se edita e se
apaga como outro qualquer —, mas muda o que ela avisa, porque regravar aquele
dia o reescreve e apagar o dia o apaga.

Nao ha coluna de duracao: ela sai dos dois horarios a cada leitura. Esta e a
hora extra **reconhecida** (uma entrada, digitada por alguem); a hora extra que
a apuracao aponta continua sendo calculada em `apuracao.ts` e nao esta em tabela
nenhuma.

### `apontamentos`

| Coluna                       | Tipo                 | Notas                                             |
| ---------------------------- | -------------------- | ------------------------------------------------- |
| `id`                         | `uuid`               | PK, `gen_random_uuid()`                           |
| `competencia_id`             | `uuid`               | FK -> `competencias.id`, `restrict`               |
| `funcionario_id`             | `uuid`               | FK -> `funcionarios.id`, `restrict`               |
| `vt_dias`, `vr_dias`         | `smallint`           | `0` a `31`; a action limita ao tamanho do periodo |
| `cesta_basica`               | `boolean`            |                                                   |
| `he_50_minutos`              | `integer`            | minutos, `0` a `44640` (744 h); idem 60% e 100%   |
| `adicional_noturno_minutos`  | `integer`            | minutos                                           |
| `intrajornada_minutos`       | `integer`            | intervalo nao concedido, em minutos               |
| `insalubridade`              | `insalubridade_grau` | `minimo`/`medio`/`maximo`; `null` = nao tem       |
| `periculosidade`             | `boolean`            |                                                   |
| `assiduidade`                | `boolean`            | premio assiduidade; nao e deduzido das faltas     |
| `gratificacao_percentual`    | `numeric(5,2)`       | `mode: "number"`, `0` a `100`                     |
| `faltas_escala`              | `smallint`           | dias; idem `faltas_folga`                         |
| `dsr_descontados`            | `smallint`           | quantos DSR perdem o pagamento                    |
| `observacao`                 | `text`               | anulavel                                          |
| `atualizado_por_id`          | `uuid`               | FK -> `usuarios.id`, `on delete set null`         |
| `criado_em`, `atualizado_em` | `timestamptz`        | `now()`                                           |

Indice unico `(competencia_id, funcionario_id)` — um apontamento por pessoa na
competencia, e o alvo do `on conflict` da gravacao — e indice em
`funcionario_id`.

`check apontamentos_nao_vazio`: pelo menos uma rubrica diferente de zero,
desmarcada ou sem grau, ou uma observacao que nao seja so espaco. A ausencia de
linha ja diz "nada apontado".

**Uma coluna por rubrica, e nao uma linha por lancamento.** Cada rubrica tem
unidade propria, e numa tabela `(tipo, quantidade)` o "12" nao diria se sao dias
ou horas nem teria `check` da propria unidade. Rubrica nova custa uma migration,
mais uma entrada no catalogo de `rubricas.ts` — que desenha o formulario e o
resumo da lista.

Nenhuma coluna guarda valor em reais nem base de calculo: o portal nao calcula
salario.

### `movimentacoes`, `movimentacao_pessoas` e `movimentacao_documentos`

`movimentacoes`:

| Coluna                       | Tipo                | Notas                                     |
| ---------------------------- | ------------------- | ----------------------------------------- |
| `id`                         | `uuid`              | PK, `gen_random_uuid()`                   |
| `competencia_id`             | `uuid`              | FK -> `competencias.id`, `restrict`       |
| `tipo`                       | `movimentacao_tipo` | `falta`, `troca_interna`, `troca_escala`  |
| `data`                       | `date`              | dentro do periodo da competencia (action) |
| `justificativa`              | `text`              | `check` nao vazia                         |
| `registrado_por_id`          | `uuid`              | FK -> `usuarios.id`, `on delete set null` |
| `criado_em`, `atualizado_em` | `timestamptz`       | `now()`                                   |

Indice em `(competencia_id, data)`.

`movimentacao_pessoas`: `movimentacao_id` (FK, `cascade`), `papel`
(`movimentacao_papel`: `ausente`, `cobertura`, `envolvido`), `funcionario_id`
**ou** `freelancer_id` (`check movimentacao_pessoas_uma_pessoa`, FKs
`restrict`) e `ordem`. Indices unicos parciais impedem a mesma pessoa duas vezes
na mesma movimentacao. Quantas pessoas cada tipo pede (uma ausente e no maximo
uma cobertura na falta; de 2 a 6 envolvidos nas trocas) e regra do Zod.

`movimentacao_documentos`: `movimentacao_id` (FK, `cascade`), `nome`,
`tipo_mime` (conferido pela assinatura: JPEG, PNG, WebP ou PDF),
`tamanho_original` (o que chegou), `tamanho` (o que esta guardado),
`compressao` (`documento_compressao`: `nenhuma`/`gzip`), `conteudo` (`bytea`),
`enviado_por_id` e `criado_em`. `check`: `tamanho = octet_length(conteudo)`.

**O arquivo mora no banco**, como o PDF de `comprovantes_tratativa`: entra no
backup do Postgres, sai com a movimentacao e nao depende de uma pasta que o
deploy por tar teria de preservar. O espaco fica contido pela reducao da imagem
no navegador, pelo gzip seletivo e pelo teto de 4 x 2 MB.

### `regras_apontamento` e `regra_apontamento_excecoes`

| Coluna                      | Tipo                  | Notas                                                         |
| --------------------------- | --------------------- | ------------------------------------------------------------- |
| `id`                        | `uuid`                | PK, `gen_random_uuid()`                                       |
| `nome`                      | `text`                | unico por `lower(nome)`                                       |
| `descricao`                 | `text`                | anulavel                                                      |
| `ativa`                     | `boolean`             | inativa continua cadastrada e para de alimentar               |
| `ordem`                     | `smallint`            | ordem de aplicacao; `definir` sobrescreve o que veio antes    |
| `empresa_id`, `cargo`       | `uuid`, `text`        | escopo da pessoa; `cargo` casa por trecho, sem caixa          |
| `funcionario_id`            | `uuid`                | escopo da pessoa — a regra de uma so                          |
| `posto_id`, `funcao_id`     | `uuid`                | escopo do dia                                                 |
| `turma`                     | `funcao_turma`        | escopo do dia                                                 |
| `evento_id`                 | `uuid`                | a sigla do dia — e assim que "turno N" vira regra             |
| `ciclo_dias`/`ciclo_folgas` | `smallint`            | os dois ou nenhum (`check`)                                   |
| `jornada_minutos`           | `integer`             | duracao do turno da vigencia (720 = 12h)                      |
| `gatilho`                   | `regra_gatilho`       | `dia_trabalhado`/`dia_de_falta`/`dia_com_intrajornada`/`fixo` |
| `rubrica`                   | `apontamento_rubrica` | espelha o catalogo de `rubricas.ts`                           |
| `acao`                      | `regra_acao`          | `somar` ou `definir`                                          |
| `quantidade`                | `integer`             | dias, minutos, ou 1/0 na marcacao                             |
| `percentual`                | `numeric(5,2)`        | `mode: "number"`                                              |
| `grau`                      | `insalubridade_grau`  | so na rubrica de insalubridade                                |
| `atualizado_por_id`         | `uuid`                | FK -> `usuarios.id`, `on delete set null`                     |

`check regras_apontamento_um_valor`: exatamente um de `quantidade`,
`percentual` e `grau` — a unidade e da rubrica, e duas colunas preenchidas se
contradizem. `check regras_apontamento_ciclo_completo`: ciclo pela metade nao
filtra nada.

`regra_apontamento_excecoes` tem `regra_id` (`cascade`) e **um** alvo por linha
(`check`): empresa, posto, funcao ou funcionario. Tabela, e nao coluna "exceto
empresa X", porque a excecao e uma lista — e como coluna ela obrigaria a
cadastrar uma regra por empresa so para deixar uma de fora.

O resultado das regras nao tem tabela: a sugestao e derivada a cada leitura.

### `usuarios`

| Coluna             | Tipo             | Notas                                                            |
| ------------------ | ---------------- | ---------------------------------------------------------------- |
| `id`               | `uuid`           | PK, `gen_random_uuid()`                                          |
| `login`            | `text`           | not null, unique, sempre minusculo (normalizado no Zod)          |
| `nome`             | `text`           | not null                                                         |
| `perfil`           | `perfil_usuario` | enum `administrador` \| `usuario`, default `usuario`             |
| `senha_hash`       | `text`           | not null, formato `scrypt$N$r$p$salt$hash`                       |
| `senha_provisoria` | `boolean`        | default `true`; enquanto `true`, a DAL so libera `/trocar-senha` |
| `ativo`            | `boolean`        | default `true`; `false` barra o login e invalida a sessao        |
| `ultimo_acesso_em` | `timestamptz`    | atualizado a cada login bem-sucedido                             |
| `criado_em`        | `timestamptz`    | `now()`                                                          |
| `atualizado_em`    | `timestamptz`    | `now()`, via `$onUpdate` do Drizzle                              |

Perfil e enum no banco (e nao `text` livre) para que um valor invalido falhe no
`INSERT`, nao so na validacao da aplicacao.

### `sessoes`

| Coluna       | Tipo          | Notas                                                 |
| ------------ | ------------- | ----------------------------------------------------- |
| `id`         | `uuid`        | PK, `gen_random_uuid()`                               |
| `usuario_id` | `uuid`        | FK -> `usuarios.id`, `on delete cascade`, indexada    |
| `token_hash` | `text`        | not null, unique — SHA-256 do token que vai no cookie |
| `expira_em`  | `timestamptz` | not null, uma semana a partir do login                |
| `criado_em`  | `timestamptz` | `now()`                                               |

O cookie carrega o token opaco (256 bits aleatorios); a tabela guarda so o
digest. Um dump de `sessoes` nao permite se passar por ninguem. SHA-256 puro
basta aqui — diferente de senha, o token nao tem entropia para forcar.

### `acessos`

| Coluna         | Tipo          | Notas                                                                   |
| -------------- | ------------- | ----------------------------------------------------------------------- |
| `usuario_id`   | `uuid`        | FK -> `usuarios.id`, `on delete cascade`; parte da PK                   |
| `area`         | `area_portal` | enum: `competencias`, `acessos`, `escalas`, `funcionarios`, `ponto`; PK |
| `concedido_em` | `timestamptz` | `now()`                                                                 |

Uma linha por area concedida. Tabela (e nao uma coluna `text[]` em `usuarios`)
para manter integridade referencial e impedir a mesma area duas vezes; a PK
composta ja indexa `usuario_id`, que e como a DAL consulta a cada requisicao.

Nao ha tabela de perfis ou cargos: o acesso e exatamente esta lista. A unica
excecao e `usuarios.perfil = 'administrador'`, que vale por todas as areas.

## 6. Infraestrutura

- **Local**: `docker compose up -d` sobe `postgres:18-alpine` como
  `portal-tg-db`, exposto em `localhost:5434` (5432 e 5433 ja estao ocupadas
  nesta maquina), com volume `pgdata` em `/var/lib/postgresql` e healthcheck
  `pg_isready`.
- **Configuracao**: `.env` (fora do git) alimenta simultaneamente o Docker
  Compose, o Next e o drizzle-kit. `.env.example` e a referencia versionada.
  `src/lib/env.ts` valida no boot e falha com mensagem acionavel.
- **Integracao externa**: `ZAPI_BASE_URL`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN` e
  `ZAPI_CLIENT_TOKEN` habilitam o envio de WhatsApp das tratativas de ponto. As
  tres ultimas sao **opcionais** e andam juntas: sem elas o portal sobe igual e
  so a tela do envio informa que a integracao esta indisponivel. `src/lib/env.ts`
  trata `""` como ausente, porque um `.env` copiado do exemplo tem a chave sem
  valor.
- **Conexao**: um `Pool` do `pg` por processo, guardado em `globalThis` fora de
  producao para sobreviver ao hot reload.
- **Healthcheck**: `GET /api/health` responde `200` com `db: "ok"` ou `503`
  com `status: "degraded"` quando o `select 1` falha — verificado nos dois
  caminhos.
- **Primeiro usuario**: `npm run db:seed` cria `luis.ferreira` como
  Administrador com senha provisoria, impressa uma unica vez no terminal. O
  script e idempotente; `-- --forcar` redefine a senha e derruba as sessoes
  abertas daquele usuario. Dali em diante o cadastro acontece em `/acessos` — o
  seed existe so para o ovo antes da galinha, e compartilha com o portal o
  modulo `src/lib/senha.ts` (hash e geracao da senha provisoria).

## 7. Decisoes e trade-offs

| Decisao                                       | Alternativa descartada                     | Por que                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js fullstack                             | API Node + SPA Vite                        | um deploy, menos infra; a API externa pode nascer depois como Route Handler                                                                               |
| Drizzle ORM                                   | Prisma                                     | schema em TS, SQL previsivel, sem engine binaria nem geracao de client                                                                                    |
| Server Actions                                | rotas REST internas                        | menos boilerplate e um roundtrip por mutacao; REST fica para clientes externos                                                                            |
| `useActionState` + Zod                        | react-hook-form                            | o preset Nova do shadcn nao traz o componente `form`; menos dependencias e validacao unica no servidor                                                    |
| Sem `cacheComponents`                         | `use cache` + `cacheLife`/`cacheTag`       | leitura dinamica e mais simples de raciocinar agora; migrar quando houver conteudo cacheavel                                                              |
| Renderizacao dinamica por rota                | ISR/prerender                              | conteudo do portal muda por requisicao; evita servir dados do build                                                                                       |
| Areas por usuario                             | perfis/cargos (RBAC)                       | poucas areas e combinacoes individuais; papel fixo viraria excecao antes de virar padrao                                                                  |
| Enum `area_portal` no banco                   | `text` livre ou tabela de areas            | area invalida falha no INSERT; o catalogo de rotulos e rotas fica no codigo, onde a UI precisa dele                                                       |
| Senha provisoria gerada                       | gestor escolhe a senha do usuario          | ninguem alem do dono conhece a senha final; a exibicao unica limita a janela de exposicao                                                                 |
| Menu lateral por modulos                      | header horizontal com todas as areas       | o header nao comporta a lista crescer; expandir por modulo mantem o menu curto sem esconder nada                                                          |
| Modulo so no codigo                           | enum `modulo_portal` + FK no banco         | modulo e apresentacao; reagrupar areas nao deveria custar migration nem mexer em autorizacao                                                              |
| Competencia como base temporal                | filtro de data escolhido em cada tela      | o recorte e o mesmo para o portal inteiro; deixar cada tela decidir espalharia a regra — e o esquecimento                                                 |
| Nome derivado da data final                   | campo `nome` digitado no cadastro          | nome e consequencia do periodo; coluna gerada nunca discorda dele, e o indice unico do mes vem de graca                                                   |
| Uma competencia aberta por vez                | varias abertas, com escolha na tela        | "onde isso vai ser gravado?" precisa ter uma resposta so; o indice parcial faz o banco garantir                                                           |
| Consulta temporaria por usuario               | trocar a competencia ativa do portal       | consultar o passado nao pode mudar o presente de quem esta trabalhando                                                                                    |
| Consulta gravada no banco                     | cookie ou parametro na URL                 | ela decide quais dados aparecem; cookie e cliente, e cliente e adulteravel                                                                                |
| Consulta aceita escrita                       | consulta somente leitura                   | corrigir o periodo anterior e rotina; so ler obrigava a reabrir a competencia para todo mundo                                                             |
| Consulta presa a sessao                       | por usuario, com prazo de 30 minutos       | com escrita liberada, expirar no meio do trabalho mudaria o destino das gravacoes                                                                         |
| Escala fora da competencia                    | escala datada, uma por competencia         | a regra da jornada nao muda ao virar o periodo; datar forcaria recadastrar as mesmas escalas todo mes                                                     |
| Virada de turno derivada                      | checkbox "vira o turno" no cadastro        | virada e consequencia de `saida < entrada`; campo a parte poderia discordar dos horarios gravados                                                         |
| Escala desativada, nunca apagada              | exclusao com FK restritiva                 | a escala explica jornadas ja interpretadas; apagar reescreveria o passado                                                                                 |
| Ciclo em dias (5x2, 6x1, 1x1)                 | dias da semana marcados na escala          | e assim que a jornada e contratada; dia da semana nao expressa 12x36 nem 4x2                                                                              |
| 12x36 gravado como ciclo 1x1                  | ciclo com unidade (dias ou horas)          | as 12 horas ja estao nos horarios; grava-las tambem no ciclo criaria duas versoes do mesmo fato                                                           |
| Folgas como posicoes no ciclo                 | par "N trabalhados x M de folga"           | ha escala cuja folga anda (6x1 alternado: ciclo de 14 com folga no 7 e no 13), e par de numeros nao a descreve                                            |
| Inicio do ciclo no funcionario                | data de virada na propria escala           | a escala e o padrao; com a data nela, cada turma exigiria uma copia da mesma escala                                                                       |
| Excecao por posicao no ciclo                  | excecao por dia da semana                  | o ciclo ja decide o que e dia de trabalho; dia da semana nao existe num 12x36, que anda pela semana toda                                                  |
| Excecao com o dia inteiro                     | colunas anulaveis so com o que mudou       | interpretar nao pode depender de saber o que foi herdado e o que foi sobrescrito                                                                          |
| Excecao deduzida por comparacao               | checkbox "este dia e diferente"            | dia igual ao padrao nao vira linha; o checkbox e mais um estado para manter em dia com os campos                                                          |
| Empresa como cadastro proprio                 | nome da empresa em coluna de texto         | o nome vem truncado do relatorio e se repete por centenas de linhas; corrigi-lo nao pode ser UPDATE em massa                                              |
| CPF como identidade                           | matricula, ou o par empresa+matricula      | a matricula se repete entre empresas e o nome muda; so o CPF responde "e a mesma pessoa?"                                                                 |
| Escala e inicio de ciclo anulaveis            | colunas obrigatorias no funcionario        | o relatorio da folha nao traz jornada; obrigar travaria a importacao de 314 pessoas em vez de enfileirar                                                  |
| Os dois juntos ou nenhum (`check`)            | deixar cada campo livre                    | escala sem a data de virada nao responde "hoje e dia de trabalho?"; seria cadastro completo que nao serve                                                 |
| Importacao preserva a jornada                 | sobrescrever tudo com o arquivo            | escala e inicio de ciclo nascem no portal; carga mensal que os zerasse apagaria o unico trabalho proprio                                                  |
| Confirmacao reenvia o arquivo                 | devolver o plano exibido na previa         | a action e um POST publico e o cadastro muda entre as telas; o que o cliente devolve nao e evidencia                                                      |
| Leitor de `.xlsx` proprio                     | SheetJS, exceljs ou similar                | o uso e ler celulas de uma aba; as bibliotecas trazem o formato inteiro e algumas exigem install script                                                   |
| Conflito de matricula no plano                | deixar o indice unico recusar              | dentro da transacao o INSERT recusado aborta a carga toda; detectar em memoria deixa as outras entrarem                                                   |
| Dois modelos de relatorio, um leitor so       | um leitor por modelo                       | os campos sao os mesmos e so o corpo muda; dois leitores divergiriam no primeiro ajuste de regra                                                          |
| Coluna ausente lida como `null`               | tratar ausencia como o valor padrao        | o modelo de uma empresa nao traz Situacao; assumir 1 apagaria as ferias e o INSS que o outro relatorio informou                                           |
| Dados e jornada em formularios separados      | um formulario so na tela de edicao         | origens diferentes e momentos diferentes; juntos, salvar um cargo reenviaria a escala e podia apaga-la                                                    |
| Combobox de escala sobre o Popover            | select nativo com filtro ao lado           | select nativo nao comporta busca dentro; o Popover ja vem no radix-ui instalado, entao nao entra dependencia                                              |
| Apuracao calculada, nunca gravada             | colunas de falta/extra em `marcacoes`      | divergencia e consequencia da escala, e escala muda; gravar a conclusao criaria a versao velha do fato                                                    |
| Uma linha por batida                          | uma linha por dia com lista de horas       | a batida e a unidade do relogio, e o indice unico `(funcionario, data, hora)` torna a recarga idempotente                                                 |
| Janela apurada vinda das cargas               | apurar a competencia inteira               | o relatorio para antes do fim do periodo; sem a janela, cada dia nao coberto viraria falta para todo mundo                                                |
| Virada resolvida pela entrada da escala       | margem de horas em volta da meia-noite     | numa jornada que vira o dia, batida do dia seguinte antes da entrada so pode fechar o turno da vespera                                                    |
| `empresas.codigo` como ponte                  | casar so pela matricula do relogio         | o codigo 1335 existe em duas empresas; nenhum dos dois relatorios liga codigo e razao social sozinho                                                      |
| Recorte da conferencia em memoria             | `order by` e `offset` no `select`          | a ordem e por pendencia, que nao existe no banco; ordenar em SQL exigiria gravar justamente o que nao se grava                                            |
| Tratativa gravada, ocorrencia calculada       | tabela de ocorrencias materializada        | o problema e consequencia da escala e muda com ela; so o trabalho humano sobre ele e fato novo                                                            |
| Chave `(funcionario, data, tipo)`             | `ocorrencia_id` numa tabela propria        | nao ha tabela a que apontar; a tripla e a identidade natural, e e ela que a URL carrega                                                                   |
| Ausencia de linha significa `aberta`          | uma linha por ocorrencia, ja no INSERT     | a maioria nunca foi tocada; grava-las seria gravar a ausencia de trabalho, e refazer isso a cada carga                                                    |
| Painel por ocorrencia                         | painel por pessoa, com contador            | uma falta e uma hora extra sao duas conversas, com desfechos que podem nao coincidir                                                                      |
| Previa obrigatoria antes do envio             | um botao unico "enviar"                    | envio de WhatsApp nao tem desfazer; o numero e o destinatario sao relidos do cadastro, so o texto vem da tela                                             |
| Falha de envio gravada                        | registrar so o que deu certo               | "ninguem avisou" e "o numero esta errado" pedem acoes diferentes e ficariam iguais na tela                                                                |
| Z-API por `fetch`, sem SDK                    | biblioteca do provedor                     | e um POST com tres credenciais e um corpo de dois campos; o SDK traria mais superficie do que resolve                                                     |
| Telefone so em digitos, com DDI               | guardar como foi digitado                  | e o formato que a Z-API quer; guardar mascarado obrigaria cada envio a refazer a limpeza                                                                  |
| Posto e funcao em dois niveis                 | um cadastro so, com a funcao no nome       | cada par posto+funcao tem a propria lista de gente; achatar juntaria quem nunca se substitui                                                              |
| Evento como tabela                            | enum `evento_tipo` no banco                | quem inventa sigla e a operacao (TP, TI, TT, MEIO); enum pediria uma migration por sigla nova                                                             |
| Cor do evento como enum curto                 | hexadecimal livre no cadastro              | 31 colunas com cor a dedo viram mosaico, e hexadecimal nao acompanha o tema claro/escuro                                                                  |
| Previsto digitado, com sugestao               | previsto derivado da escala a cada render  | previsto e decisao (a troca combinada nao esta em ciclo nenhum), e freelancer nao tem escala a derivar                                                    |
| Previsto e realizado em duas linhas           | duas colunas na mesma celula               | as duas perguntas sao lidas uma embaixo da outra, que e como a planilha de origem as desenha                                                              |
| Grade em um `<form>` so                       | um formulario (ou um POST) por celula      | preencher uma linha sao 31 celulas; salvar a cada tecla viraria 31 POSTs                                                                                  |
| Envio manda todas as celulas visiveis         | o cliente enviar so o que ele mudou        | "o que mudou" e a versao do cliente sobre o banco; a comparacao no servidor e a unica confiavel                                                           |
| Painel do dia sobre a celula                  | tela (ou modo) separada por tipo de campo  | preencher escala e rotina diaria; trocar de tela por dia corrigido custaria uma navegacao e o que nao foi salvo                                           |
| Grade por posto, funcao como faixa            | uma tela (e um link) por funcao            | a escala de um lugar se le inteira; quatro telas para conferir uma portaria e o que se estava tentando evitar                                             |
| Funcao vazia tambem desenhada                 | grupos montados a partir das linhas        | turno descoberto e o que quem monta a escala mais precisa ver, e assim ele sumiria da tela                                                                |
| Secoes em abas                                | cartoes empilhados na mesma rolagem        | a grade e larga demais para dividir a rolagem; mesmo arranjo (e mesmo `forceMount`) da tela de funcionarios                                               |
| Sigla e horario na mesma caixa                | um campo para cada um                      | uma tecla no dia normal e o horario junto quando muda; separados, seriam duas visitas a mesma celula                                                      |
| Situacao como evento + duas flags             | enum de tipos de ocorrencia no codigo      | cobertura, troca de turno/posto e substituicao sao siglas; o que muda e o que o dia pede, e isso e cadastro                                               |
| Historico como log de estados                 | colunas "antes" e "depois" na alteracao    | o que mudou e a diferenca entre duas linhas vizinhas; grava-la seria gravar a conclusao duas vezes                                                        |
| Historico atras da celula                     | coluna ou linha extra na grade             | a escala inteira precisa continuar sendo uma sigla por dia; quem quer o detalhe abre o dia                                                                |
| Estado por celula                             | um objeto de estado para a grade toda      | 620 celulas redesenhando a cada tecla; por celula, a cor ainda acompanha o que se digita                                                                  |
| Freelancer com cadastro leve                  | texto solto na linha, ou funcionario       | sem cadastro nao se reencontra no mes seguinte; como funcionario, exigiria CPF que ninguem tem na hora                                                    |
| Celula vazia apagada                          | linha com os tres campos nulos             | seria indistinguivel de dia em branco e ocuparia uma linha para dizer que nao ha o que dizer                                                              |
| Extra reconhecido gravado                     | deduzir o extra so da apuracao do ponto    | a apuracao muda com a escala; o que alguem apurou e reconheceu e fato novo, e some se nao for gravado                                                     |
| Extra dentro da competencia                   | cadastro sem data, filtrado na tela        | ele e pago e conferido por periodo; a competencia sai da data do extra, e nao da que estava aberta ao digitar                                             |
| Duracao calculada a cada leitura              | coluna de minutos gravada no registro      | mesma razao dos totais da grade: corrigir o horario corrige a conta, sem versao velha do fato                                                             |
| Colaborador num campo so, com prefixo         | dois campos, ou um campo de tipo + um id   | quem procura o nome nao sabe de que tabela ele vem; as duas colunas mantem integridade referencial de verdade                                             |
| Freelancer criado no proprio registro         | exigir cadastro previo do freelancer       | quem cobre extra as vezes e quem nao esta na folha; outra tela antes travaria o registro do dia em que aconteceu                                          |
| Posto como FK, local como texto               | os dois em texto, ou os dois em cadastro   | o posto ja e cadastro e organiza a operacao; o local muda de nome antes de virar cadastro                                                                 |
| Extra apagavel                                | desativar, como escala e posto             | e uma entrada, e nao um fato interpretado: enquanto a linha errada existir, ela soma horas que ninguem fez                                                |
| Celula otimista, modal fechando no clique     | esperar a resposta para redesenhar o dia   | um mes sao centenas de gravacoes; o formulario ja sabe o que o dia passou a dizer, entao nada ali e adivinhacao                                           |
| Cabecalho do posto vindo de `obterGrade()`    | `obterPostoDaGrade()` a parte para a tela  | `refresh()` redesenha a tela inteira a cada dia gravado; a segunda leitura de `postos` se pagava em todas elas                                            |
| `preenchimento_dias` sem coluna `faixa`       | manter a faixa e as linhas de `previsto`   | so o realizado ocupa linha desde que o previsto virou derivado; a coluna e as linhas velhas nao eram mais lidas                                           |
| Gravar um dia sem `refresh()`                 | revalidar a rota a cada dia preenchido     | redesenhar a rota custava ~200ms sobre uma action de ~60ms para trazer o que a tela ja sabia; a resposta carrega o que mudou                              |
| Apontamento com uma coluna por rubrica        | tabela de lancamentos `(tipo, quantidade)` | cada rubrica tem unidade propria (dias, minutos, grau, percentual); uma coluna so de quantidade nao diria qual, nem teria `check`                         |
| Horas apontadas em minutos, digitadas `HH:MM` | horas decimais (`12,5`)                    | "1,30" e lido ora como uma hora e meia, ora como uma hora e trinta; com dois pontos nao ha duvida                                                         |
| Espelho ao lado, sem preencher campos         | sugerir as rubricas a partir da apuracao   | a apuracao nao sabe se a hora e 50%, 60% ou 100%, nem se a falta foi abonada; o numero aparece, e quem fecha decide                                       |
| Apontamento vazio apaga a linha               | gravar a linha zerada                      | linha zerada e indistinguivel de nenhuma linha; a ausencia ja diz "nada apontado", como na celula da grade                                                |
| Regras de apontamento como cadastro           | condicoes no codigo, por empresa e posto   | quem inventa as condicoes e a operacao; cada ajuste viraria deploy, e a regra precisa ser conferivel na tela                                              |
| Sugestao derivada a cada leitura              | somar a rubrica dentro do salvar do dia    | acumular gravaria a conclusao: corrigir a celula depois deixaria o VT do mes errado para sempre                                                           |
| Sugestao gravada por gesto                    | gravar o apontamento junto com a grade     | o apontamento e entrada; o lote nunca sobrescreve quem ja foi lancado a mao                                                                               |
| Escopo por conjuncao + excecoes em tabela     | uma regra por empresa, ou expressao livre  | "todas menos a LC" cabe numa regra so, e o vocabulario fechado continua conferivel na tela                                                                |
| Ordem do cadastro decide o conflito           | a regra mais especifica vence              | definir sobrescreve, e quem le a lista de cima para baixo ve o resultado; especificidade nao se confere                                                   |
| `docx` + `exceljs` para exportar              | gerar CSV, ou HTML salvo como `.doc`       | CSV nao carrega formato de duracao nem nota de cabecalho, e `.doc` de HTML abre com aviso; as duas geram OOXML de verdade no servidor, sem install script |
| Planilha sem titulo nem total                 | cabecalho decorado e linha de soma         | a planilha e importada na folha; toda linha que nao e funcionario teria de ser apagada antes                                                              |
| Horas como duracao `[h]:mm`                   | texto "12:30" na celula                    | texto nao soma; sem o `[h]`, 55:10 apareceria como 07:10                                                                                                  |
| Download por Route Handler                    | Server Action que devolve o arquivo        | download e `GET`; `<a href download>` funciona sem JS e o navegador ja salva com o nome da resposta                                                       |
| Posto vindo da grade da competencia           | coluna de posto no funcionario             | a pessoa e escalada por periodo, e pode estar em dois postos; cadastro fixo mentiria no mes da troca                                                      |
| Ajuda num painel, fora das telas              | paragrafo explicativo no topo de cada tela | o texto que explica era lido uma vez e empurrava o trabalho para baixo em toda visita; no painel ele fica a um clique e a tela fica com o que muda        |
| Conteudo da ajuda no codigo                   | tabela editavel pelo portal                | o texto acompanha o comportamento da tela e muda no mesmo commit; no banco, ele envelheceria sem ninguem ver                                              |

## 8. Pendencias conhecidas

| Tema                        | Situacao                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticacao e autorizacao  | implementadas em `src/features/auth/` (sessao) e `src/features/acessos/` (areas por usuario). Falta: rate limit no login, expiracao/rotacao de senha e trilha de auditoria das concessoes                                                                                                                                                                                                                         |
| Testes automatizados        | nenhum. Proximo passo: Vitest para `periodo.ts` (nome e limites do periodo) e `jornada.ts` (duracao com virada de turno), `schema.ts`/`actions.ts` e um teste de fumaca de `/competencias`                                                                                                                                                                                                                        |
| CI                          | nenhuma pipeline. Minimo util: `lint` + `typecheck` + `build` + `db:migrate` contra um Postgres de servico                                                                                                                                                                                                                                                                                                        |
| Deploy                      | nao definido. Decidir entre Vercel (com Postgres gerenciado) e container proprio                                                                                                                                                                                                                                                                                                                                  |
| Observabilidade             | apenas `console.error`. Falta logger estruturado e rastreio de erros                                                                                                                                                                                                                                                                                                                                              |
| Migrations em producao      | `drizzle-kit migrate` roda manualmente; falta amarrar ao processo de deploy                                                                                                                                                                                                                                                                                                                                       |
| Paginacao                   | `listarEscalas()` (10) e `listarFuncionarios()` (20) ja recortam no banco por `?pagina=`; `listarCompetencias()` continua carregando a tabela inteira — mesmo tratamento quando o historico crescer                                                                                                                                                                                                               |
| Marcacoes                   | implementadas em `src/features/ponto/`: carga do relatorio do relogio, apuracao contra a escala e tratativa por ocorrencia (status, observacao e mensagem ao colaborador). Falta o passo seguinte — fechar a competencia com o resultado apurado                                                                                                                                                                  |
| Retorno da mensagem         | o portal envia e registra o envio, mas nao le a resposta: `mensagem_status` para em `enviada`/`falhou`. Entregue e lida dependem de webhook da Z-API, e ainda nao ha rota para receber                                                                                                                                                                                                                            |
| Horas extras                | o modulo de conferencia (`src/features/extras/`) registra o extra reconhecido, com busca e total do periodo. Falta cruza-lo com a apuracao: registrar o extra nao encerra a ocorrencia `hora_extra` no painel de pendencias, nem o contrario                                                                                                                                                                      |
| Empresas                    | criadas pela importacao da folha e editaveis so por SQL: nao ha tela de cadastro. O nome vem truncado em 40 caracteres pelo relatorio, e corrigi-lo (ou informar o CNPJ) ainda depende do banco. So o `codigo` do relogio tem tela — a da importacao de ponto                                                                                                                                                     |
| Apontamentos                | implementados em `src/features/apontamentos/`: rubricas por funcionario e competencia, com o espelho de ponto ao lado, exportacao em Word e Excel e regras que sugerem o apontamento a partir da grade. Falta confirmar o layout da planilha com o sistema da folha (VA = cesta basica; insalubridade e DSR sem coluna) e cruzar a sugestao com a apuracao do ponto — hoje as duas leituras convivem sem se falar |
| Desbloqueio por funcionario | previsto, ainda nao implementado: hoje a consulta abre a competencia inteira, para leitura e escrita. O recorte por funcionario entra como escopo em `consultas_competencia`                                                                                                                                                                                                                                      |
