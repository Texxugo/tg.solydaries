@AGENTS.md

# Portal TG

Portal web em Next.js com shadcn/ui e PostgreSQL. Este arquivo registra as
decisoes e convencoes do projeto; a arquitetura detalhada esta em
[docs/architecture.md](docs/architecture.md). **Atualize os dois sempre que
tomar uma decisao relevante.**

## Stack

| Camada          | Escolha                                                          | Versao              |
| --------------- | ---------------------------------------------------------------- | ------------------- |
| Runtime         | Node.js                                                          | 24.x                |
| Framework       | Next.js (App Router, Turbopack)                                  | 16.3.4              |
| UI              | React + shadcn/ui (preset Nova, primitivos Radix) + Tailwind CSS | 19.2.8 / Tailwind 4 |
| Banco           | PostgreSQL (Docker Compose)                                      | 18-alpine           |
| Acesso a dados  | Drizzle ORM + drizzle-kit (driver `pg`)                          | 0.45 / 0.31         |
| Validacao       | Zod                                                              | 4.x                 |
| Exportacao      | docx (Word) + exceljs (Excel) + pdf-lib (comprovantes)           | 9.7 / 4.4 / 1.17    |
| Package manager | npm                                                              | 12.x                |

Autenticacao e propria (sessao em banco + cookie httpOnly), sem biblioteca de
auth. Detalhes na secao "Autenticacao".

## Comandos

```bash
npm run db:up         # sobe o PostgreSQL via Docker Compose
npm run dev           # dev server em http://localhost:3000
npm run db:generate   # gera migration a partir do schema Drizzle
npm run db:migrate    # aplica migrations pendentes
npm run db:seed       # cria luis.ferreira (Administrador) com senha provisoria
npm run db:studio     # Drizzle Studio
npm run lint          # ESLint
npm run typecheck     # next typegen && tsc --noEmit
npm run build         # build de producao
npm run format        # Prettier
npm run db:down       # derruba o banco (use -v manualmente para apagar dados)
```

Primeira execucao: `cp .env.example .env` -> `npm run db:up` -> `npm run db:migrate`
-> `npm run db:seed` -> `npm run dev`. O seed imprime a senha provisoria uma
unica vez.

## Convencoes

### Organizacao por feature, nao por tipo

Cada dominio vive em `src/features/<feature>/`:

| Arquivo       | Papel                                                         |
| ------------- | ------------------------------------------------------------- |
| `schema.ts`   | schemas Zod de entrada                                        |
| `types.ts`    | tipos e constantes compartilhados (estado de formulario etc.) |
| `queries.ts`  | leituras, consumidas por Server Components                    |
| `actions.ts`  | escritas (`"use server"`)                                     |
| `components/` | componentes da feature                                        |

`src/components/ui/` e gerado pelo shadcn CLI e nao conhece o dominio.
`src/features/competencias/` e a fatia vertical de referencia — copie o padrao
dela.

### Regras que quebram o build se ignoradas

- **Um arquivo `"use server"` so pode exportar funcoes async.** Tipos e
  constantes vao para `types.ts`. Exportar um objeto de `actions.ts` derruba a
  rota em runtime.
- **Toda query nao cacheada comeca com `await connection()`** (de `next/server`).
  Sem isso o Next resolve a query no build e a pagina serve dados congelados.
- Apos uma mutacao, use **`refresh()` de `next/cache`** dentro da Server Action
  (API do Next 16; substitui o `revalidatePath` para atualizar a rota atual).

### Dados

- Acesso ao banco so em Server Components, Server Actions e Route Handlers.
  Nenhum componente client importa `@/db`. `queries.ts` usa `import "server-only"`
  para que a violacao falhe no build.
- Server Actions sao endpoints POST publicos: **sempre** revalide a entrada com
  Zod dentro da action, mesmo que o formulario ja valide no client.
- Nomes de colunas em `snake_case` no banco, `camelCase` no TypeScript.
- **Nunca edite uma migration ja aplicada.** Toda mudanca de schema gera uma
  nova migration com `npm run db:generate`.

### Formularios

`useActionState` + Server Action + componentes shadcn. Sem react-hook-form: o
preset atual do shadcn nao traz o componente `form`, e o par
`useActionState`/Zod cobre o caso com menos dependencias. Erros por campo vem do
`z.flattenError(...).fieldErrors`; mensagens gerais vao para toast (`sonner`).

### Navegacao

O portal e um menu lateral (`sidebar` do shadcn) com **modulos expansiveis**: cada
modulo tem um nome e, aberto, lista as areas daquele modulo que o usuario pode
abrir. A gestao de acessos nao e modulo — ela mora no menu que abre ao clicar no
nome do usuario, no rodape.

| Arquivo                                 | Papel                                                        |
| --------------------------------------- | ------------------------------------------------------------ |
| `navegacao/modulos.ts`                  | catalogo dos modulos + de que modulo e cada area             |
| `navegacao/icones.ts`                   | icone de cada modulo e de cada area                          |
| `navegacao/types.ts`                    | `UsuarioDoMenu`, o recorte da sessao que o menu desenha      |
| `navegacao/components/menu-lateral.tsx` | a `Sidebar`: modulos, opcoes e rota ativa                    |
| `navegacao/components/menu-usuario.tsx` | rodape: nome do usuario -> areas da conta, senha, tema, sair |

Regras:

- **Modulo e apresentacao, nao autorizacao.** A concessao continua sendo area a
  area em `acessos`; modulo so agrupa o que ja passou por `podeAcessar()`. Por
  isso o catalogo de modulos nao vai para o banco e `areas.ts` nao sabe que
  modulos existem.
- **Area com modulo `null` sai do menu de modulos e entra no menu do usuario.**
  Hoje so `acessos`: e configuracao da conta, nao um modulo de trabalho. Modulo
  sem nenhuma opcao liberada nao aparece — nao ha o que expandir.
- **O layout filtra, o menu so desenha.** `modulosVisiveis()` e `areasDaConta()`
  rodam no Server Component e o menu recebe a lista pronta, junto de um recorte
  do usuario (nome, login, perfil) — nao a `UsuarioSessao` inteira.
- **O logout continua sendo POST.** O `<form action={sair}>` fica fora do dropdown
  e o item o alcanca pelo atributo `form`: o item desmonta junto com o menu no
  clique, e form desmontado no meio do submit nao chega a Server Action.
- O modulo que contem a rota atual abre sozinho (chegou pela home, pela URL ou
  por um redirect). Fora isso, abrir e fechar e do usuario — por isso estado
  ajustado no render, e nao `open` derivado do `pathname`.

### Ajuda (orientacao de uso)

Um botao fixo no canto inferior direito (`CircleHelp`) abre, num `Sheet`, a
ajuda da area aberta: o que ela faz, como configura-la e como usa-la.

| Arquivo                            | Papel                                                |
| ---------------------------------- | ---------------------------------------------------- |
| `ajuda/conteudo.ts`                | o texto de cada area + `AJUDA_GERAL` (modulo puro)   |
| `ajuda/rota.ts`                    | `ajudaDaRota()`: area e secoes da tela (modulo puro) |
| `ajuda/components/botao-ajuda.tsx` | o botao fixo e o painel                              |

Regras:

- **O "por que" e o "como" moram na ajuda, e nao na tela.** A tela fica com o
  que e dela: titulo, competencia, periodo, contagens, estado vazio e aviso de
  consequencia (`Abrir a proxima encerra Outubro/2026`, `Nada e gravado sem
confirmacao`, a senha provisoria que aparece uma vez so). Paragrafo que
  explica o conceito ou o modo de usar vai para `conteudo.ts`. **Tela nova nao
  ganha paragrafo explicativo no cabecalho** — ganha secao na ajuda.
- **Um `Record<AreaPortal, Ajuda>`**, como em `areas.ts` e `modulos.ts`: area
  nova sem ajuda quebra o typecheck. Isso faz da ajuda o **sexto passo** de uma
  area nova.
- **A area sai da URL, e nao de prop.** O botao vive no layout, que nao sabe que
  pagina esta desenhando; `usePathname()` acha a area pelo mesmo prefixo de
  `href` do menu. Fora de area (a home) vale `AJUDA_GERAL`, com a ordem de
  configuracao do portal.
- **`telas` liga a secao a subtela, e vale o encaixe mais longo.** Tela com `/`
  no fim casa com o que vier depois (`/extras/` = qualquer extra aberto); sem a
  barra, so o caminho exato (`/extras` = a lista). Sem o "mais longo",
  `/funcionarios/importar` traria as secoes da ficha, porque tambem comeca com
  `/funcionarios/`. As secoes que casam sobem com a marca "Nesta tela"; as
  demais seguem na ordem do catalogo.
- **O texto usa os rotulos da tela.** Botao, aba e campo citados na ajuda sao
  os que a pessoa le na tela ("Pede horario na celula", e nao `exigeHorario`).
  Renomeou na tela, renomeie na ajuda — nada confere isso sozinho.
- **Modulo puro e texto estatico**: nao le banco nem sessao, entao nao ha o que
  autorizar. Quem chegou a tela ja passou por `exigirAcesso()`.

### Tema (claro e escuro)

O submenu "Tema", no menu do usuario, troca entre Claro, Escuro e Sistema
(padrao). O destaque do portal e **#6DC9A6** nos dois temas.

| Arquivo                             | Papel                                               |
| ----------------------------------- | --------------------------------------------------- |
| `tema/temas.ts`                     | catalogo dos temas e chave do `localStorage` (puro) |
| `tema/components/provedor-tema.tsx` | o `ThemeProvider` do `next-themes`, no layout raiz  |
| `tema/components/submenu-tema.tsx`  | o submenu do menu do usuario                        |
| `src/app/globals.css`               | os tokens de `:root` e `.dark`, com `--destaque`    |

Regras:

- **Cor nova entra como token, e nunca como `#hex` ou `bg-white` no componente.**
  Os tokens (`bg-background`, `text-muted-foreground`, `bg-primary`...) ja
  trocam com o tema; cor fixa fica certa num tema e errada no outro. Cor de
  paleta do Tailwind (`text-amber-700`) so com o par `dark:` ao lado, como em
  `eventos/cores.ts`.
- **O destaque mora em `--destaque`**, e `--primary`, `--ring` e
  `--sidebar-primary` apontam para ele. Trocar a cor e mudar uma linha.
- **Texto sobre o destaque e escuro** (`--destaque-foreground`): branco sobre
  #6DC9A6 nao chega a 2:1 de contraste. Pela mesma razao o verde nao vira cor
  de texto sobre fundo claro (`text-primary`) — ele marca fundo, borda, foco e
  o item ativo.
- **A escolha fica no `localStorage`, e nao no banco.** E preferencia do
  aparelho, e precisa valer na tela de login, antes de haver sessao. O script
  do `next-themes` aplica a classe antes do primeiro paint, e por isso o
  `<html>` leva `suppressHydrationWarning`.
- **O script do tema so e executavel no HTML do servidor** (`scriptProps` com
  `text/plain` no cliente): o React 19 acusa em dev todo `<script>` renderizado
  por componente, e no cliente ele nao tem o que fazer — ja rodou.

### Competencias (base temporal)

Todo dado do portal pertence a uma **competencia**: o periodo entre duas datas,
batizado pelo mes da data final (21/07 a 21/08 = Agosto/2026). O portal exibe
so a competencia em vigor — abrir a proxima esvazia as telas sem apagar nada.

| Arquivo                            | Papel                                                          |
| ---------------------------------- | -------------------------------------------------------------- |
| `competencias/periodo.ts`          | nome, formatacao e limites do periodo (modulo puro)            |
| `competencias/queries.ts`          | a DAL: `competenciaEmVigor`, `competenciaDeEscrita`            |
| `competencias/actions.ts`          | `abrirCompetencia`, `consultarCompetencia`, `encerrarConsulta` |
| `src/db/schema/competencias.ts`    | `competencias` + `consultas_competencia`                       |
| `src/app/(portal)/competencias/**` | competencia ativa, abertura e historico                        |

Regras:

- **Toda leitura de dado datado filtra por `competenciaEmVigor()` e toda escrita
  comeca por `competenciaDeEscrita()`** — do mesmo jeito, e pelos mesmos
  motivos, que `exigirUsuario()`. Uma tela que esquece o filtro mostra dado de
  outro periodo sem que nada acuse.
- **`null` de `competenciaEmVigor()` significa "nao ha o que mostrar"**, nunca
  "mostre tudo". Sem competencia aberta, a tela mostra estado vazio e as actions
  recusam a escrita.
- **O nome nunca e digitado.** `competencias.referencia` e coluna **gerada**
  (`date_trunc('month', data_fim)`) e o rotulo sai dela; o indice unico sobre ela
  impede duas competencias do mesmo mes. Mudou a data final, mudou o nome.
- **Uma competencia aberta por vez**, garantida por indice parcial unico
  (`where status = 'aberta'`). Nao existe "encerrar" avulso: abrir a proxima
  encerra a atual na mesma transacao, porque portal sem competencia aberta nao
  aceita escrita nenhuma.
- **A virada leva a escalacao dos postos, e nao o preenchimento.** Na mesma
  transacao, `levarGradeAdiante()` (em `preenchimento/virada.ts`) copia as
  linhas da grade — pessoa, funcao, turma, sigla e ordem — para a competencia
  nova; nenhuma celula de `preenchimento_dias` vai junto, e a observacao da
  linha tambem nao (e do mes). Fica para tras quem foi desativado (pessoa,
  funcao ou posto). A competencia encerrada nao perde nada.
- **A ordem da escala nao reinicia na virada.** A vigencia "desde sempre" sem
  ancora ancora no primeiro dia da competencia em vigor, entao recomecaria o
  ciclo a cada periodo (o 12x36 que fechou o mes trabalhando trabalharia de
  novo no dia 21). A virada grava como ancora o primeiro dia da competencia que
  se encerra — a mesma que ela ja usava —, e a seguinte continua de onde parou.
- **Datas sao `date` e trafegam como string `YYYY-MM-DD`** (`mode: "string"`).
  Nada em `periodo.ts` constroi `Date` a partir delas: `new Date("2026-08-21")`
  e lido como UTC e, em fuso negativo, imprime 20/08.
- **Consultar uma competencia encerrada e trabalhar nela.** Durante a consulta
  a sessao le **e grava** na competencia consultada: `competenciaDeEscrita()`
  devolve a de `competenciaEmVigor()`, e todas as telas (grade, apontamentos,
  extras, ponto) funcionam como na aberta. A aberta do portal nao muda —
  ninguem mais ve diferenca.
- **A consulta e da sessao de login, e nao do usuario.** Ela vive em
  `consultas_competencia` com PK `sessao_id` e `cascade` de `sessoes`: dura ate
  alguem clicar em "Voltar a competencia ativa" ou a sessao acabar (logout,
  expiracao, troca de senha), e o mesmo usuario em outro navegador continua na
  aberta. Nao ha prazo proprio — com escrita liberada, uma consulta que expirasse
  sozinha mudaria o destino das gravacoes no meio do trabalho. Vive no banco, e
  nao em cookie, porque decide onde os dados sao gravados.
- **Formulario sem data manda a competencia em que foi desenhado.**
  `competenciaDeEscrita(formData.get("competenciaId"))` recusa se a competencia
  em vigor mudou — sem isso, uma tela aberta antes de a consulta ser encerrada
  (em outra aba) gravaria na aberta o que foi digitado olhando a anterior. Hoje:
  apontamento (salvar e remover) e inclusao na grade. Actions cuja entrada tem
  data (dia da grade, extra, ponto, tratativa) ja se protegem conferindo a data
  contra o periodo, e as que apontam para uma linha conferem o `competencia_id`
  dela. **Action datada nova sem nenhum dos dois precisa do campo escondido.**
- O periodo seguinte comeca no dia seguinte ao fim do anterior: a action recusa
  inicio que invada a competencia anterior, e o formulario ja sugere a data.

### Escalas (regras de jornada)

A escala e a **regra** da jornada, nao o registro dela: horarios, ciclo de
trabalho, intrajornada, horas extras previstas, quantas marcacoes o dia deve
ter e se o turno vira o dia. E contra ela que a marcacao de cada funcionario
sera interpretada — o que e trabalho previsto, o que e intervalo e o que sobra
como extra.

| Arquivo                       | Papel                                                  |
| ----------------------------- | ------------------------------------------------------ |
| `escalas/jornada.ts`          | ciclo, regra do dia, duracao e virada (modulo puro)    |
| `escalas/queries.ts`          | `listarEscalas`, `obterEscala`                         |
| `escalas/actions.ts`          | `criarEscala`, `atualizarEscala`, `definirDiasDoCiclo` |
| `src/db/schema/escalas.ts`    | `escalas` + `escala_folgas` + `escala_excecoes`        |
| `src/app/(portal)/escalas/**` | lista, cadastro e edicao                               |

Regras:

- **Escala e cadastro, nao dado datado: nao pertence a competencia.** Nenhuma
  query da feature chama `competenciaEmVigor()`. Se pertencesse, virar a
  competencia esvaziaria a lista e cada periodo comecaria pedindo o recadastro
  das mesmas jornadas.
- **A virada de turno nunca e digitada.** `escalas.virada_turno` e coluna
  **gerada** (`saida < entrada`), pelo mesmo motivo de `competencias.referencia`:
  e consequencia dos horarios, e campo a parte so criaria a chance de a escala se
  contradizer. Por isso tambem a entrada nao pode ser igual a saida (`check`) —
  seria "24h ou zero?" sem resposta.
- **A quantidade de marcacoes e sempre par**, entre 2 e 8: toda entrada tem a
  saida correspondente. E o numero que denuncia marcacao faltando antes de
  qualquer calculo de horas.
- **Escala nao e apagada, e desativada** (`ativa`). Ela explica jornadas ja
  interpretadas; apagar reescreveria o passado. Nao ha action de exclusao.
- **Horarios sao `time` sem fuso e trafegam como string** (`HH:MM` no
  formulario, `HH:MM:SS` no banco). `jornada.ts` nunca constroi `Date` a partir
  de uma hora — hora de escala nao tem dia a que pertencer, e o horario de verao
  moveria a jornada. As datas do ciclo sao contadas inteiras em UTC, pelo mesmo
  motivo de `diaSeguinte()` em `periodo.ts`.
- **Nome unico por `lower(nome)`** (indice unico, nao consulta previa): duas
  escalas que so diferem na caixa sao o mesmo nome para quem le.
- **O dia trabalhado vem de um ciclo, nao do dia da semana**: `dias_ciclo` diz de
  quantos em quantos dias o padrao se repete e `escala_folgas` marca **quais
  posicoes sao folga**. O que nao esta la e dia de trabalho.
- **Sao posicoes, e nao "N trabalhados x M de folga", por causa da folga que
  anda**: o 6x1 que folga domingo numa semana e sabado na outra e um ciclo de 14
  dias com folga nos dias 7 e 13 — as duas folgas nao sao vizinhas, e nenhum par
  de numeros descreve isso. O 5x2 e um ciclo de 7 com folga no 6 e no 7, e o
  **12x36 e um ciclo de 2 com folga no dia 2** (as 12 horas ja estao em
  `entrada`/`saida`, e repeti-las no ciclo criaria duas versoes do mesmo fato).
  O apelido de mercado vive em `nome`.
- **`rotuloDoCiclo()` so devolve "TxF" quando as folgas fecham o ciclo.** Um
  ciclo de 14 com folga no 7 e no 13 nao e "12x2" — os doze dias de trabalho nao
  sao seguidos —, entao o rotulo vira "14 dias". A busca da lista repete essa
  regra em SQL (`rotuloDoCicloEmSql`), porque ela depende de outra tabela e
  coluna gerada nao alcanca: as duas mudam juntas, e divergir custa uma busca
  que nao encontra, nao um dado errado.
- **A data em que o ciclo comeca a valer nao esta na escala: e do funcionario.**
  A escala guarda so o padrao, entao a mesma 12x36 serve todas as turmas. Por
  isso `ehDiaTrabalhado(data, inicioCiclo, ciclo)` recebe o inicio de fora — a
  coluna correspondente nasce com o cadastro de funcionarios.
- **Dia do ciclo que foge do padrao vira linha em `escala_excecoes`** (o 5o dia
  do 5x2 que sai uma hora mais cedo, o dia de meio periodo). A excecao e presa a
  **posicao no ciclo**, e nao ao dia da semana: e o ciclo que diz o que e dia de
  trabalho, e a excecao so ajusta um desses dias. `dia_ciclo` fica dentro de
  `dias_ciclo` e nunca cai num dia de folga — encurtar o ciclo, ou marcar como
  folga um dia que era trabalhado, apaga as excecoes que sobraram na mesma
  transacao do update.
- **A linha de excecao descreve o dia inteiro**, e nao so o que mudou: sem
  colunas anulaveis nao existe "herdou ou sobrescreveu?" na hora de interpretar.
  `regraDoDia()` devolve a excecao ou o padrao, e `null` em dia de folga.
- **Excecao e o que difere, e nao um campo que alguem marca.** O formulario
  manda todos os dias trabalhados e `definirDiasDoCiclo()` compara com o padrao
  (`mesmaJornada()`): dia igual nao vira linha, e devolver o dia ao padrao apaga
  o ajuste. Mesma logica de `virada_turno` — nada que seja consequencia se
  digita.
- **Busca e pagina moram na URL (`?busca=`, `?pagina=`) e recortam no `select`.**
  Formulario `method="get"` e links de verdade em Server Components: o resultado
  e compartilhavel, sobrevive ao recarregar e funciona sem JavaScript. Os dois
  parametros passam pelo Zod (`buscaEscalasSchema`, `paginaEscalasSchema`) antes
  de virar consulta, e `%`/`_` sao escapados no termo: sem isso, buscar "%"
  traria a tabela inteira.
- **A lista pagina de `ESCALAS_POR_PAGINA` em `ESCALAS_POR_PAGINA` (10) por
  `offset`**, e nao por cursor: a tela mostra numero de pagina e total, que e
  justamente o que cursor nao da. Pagina alem do fim cai na ultima (`Math.min`),
  entao link velho nao vira tela vazia — e o termo de busca viaja em cada link,
  senao virar a pagina descartaria o filtro sem avisar.
- **Quantos dias o formulario tem vem do banco, nao do post.** A action le
  `dias_trabalhados` da escala e so olha os campos `dia-N-*` dentro desse
  intervalo; campo postado na mao nao inventa um sexto dia num 5x2.

### Funcionarios (quem tem jornada)

A escala diz o **padrao** da jornada; o funcionario diz **de quem** e a partir de
**quando**. Sao os dois campos que fecham o modelo comecado em escalas — sem
eles `ehDiaTrabalhado()` nao tem ancora.

| Arquivo                            | Papel                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `funcionarios/cpf.ts`              | normalizacao e digitos verificadores (modulo puro)                                                     |
| `funcionarios/situacoes.ts`        | catalogo das situacoes da folha (modulo puro)                                                          |
| `funcionarios/telefone.ts`         | normalizacao, conferencia e formatacao do WhatsApp (modulo puro)                                       |
| `funcionarios/planilha.ts`         | leitura do relatorio: celulas -> funcionarios (puro)                                                   |
| `funcionarios/importacao.ts`       | plano da carga: criar, atualizar, recusar (puro)                                                       |
| `funcionarios/xlsx.ts`             | leitor minimo de `.xlsx` (ZIP + XML), `server-only`                                                    |
| `funcionarios/queries.ts`          | `listarFuncionarios`, `obterFuncionario`, `listarEmpresas`                                             |
| `funcionarios/actions.ts`          | `criarFuncionario`, `atualizarFuncionario`, `definirJornada`, `atribuirEscala`, `importarFuncionarios` |
| `src/db/schema/funcionarios.ts`    | `empresas` + `funcionarios`                                                                            |
| `src/app/(portal)/funcionarios/**` | lista, cadastro, importacao e edicao                                                                   |

Regras:

- **Dados e jornada sao telas separadas, com actions separadas.** Na edicao sao
  duas **abas** com formularios independentes — `atualizarFuncionario()` para o
  que vem da folha e `definirJornada()` para escala e inicio de ciclo (mesmo
  arranjo da tela de editar escala, com dados e dias do ciclo). Nao e so
  arrumacao — e nem so apresentacao: com uma action so, salvar uma correcao de cargo reenviaria a
  jornada, e um campo que o formulario por acaso nao desenhasse chegaria vazio,
  **apagando a escala de quem ja tinha uma**. No cadastro os dois vao no mesmo
  envio (nao ha a quem atribuir jornada antes de a pessoa existir), mas em
  secoes distintas.
- **Ferias, atestado e INSS sao periodos, e nao a `situacao` da folha.** A
  folha manda a foto de hoje ("9 = Ferias"); `afastamentos` guarda o intervalo,
  com inicio e fim, que e do que a apuracao precisa. Terceira aba do cadastro,
  ao lado de dados e jornada.
- **O afastamento nao pertence a competencia.** Um INSS atravessa meses, e
  prende-lo a um periodo o faria sumir justo enquanto ainda vale. A apuracao
  cruza por **data** (`afastamentosNaJanela`), e nao por competencia — ao
  contrario das marcacoes.
- **Dia coberto sai da auditoria, mas nao da tela.** Sem previsto, sem falta e
  fora das somas; continua listado com o motivo, porque sumir seria
  indistinguivel de dia que a carga do relogio nao trouxe. `totalizar()` nao o
  conta em `diasPrevistos`: a escala previa, o afastamento desfez.
- **Batida em dia coberto vira `marcacao_em_afastamento` (atencao).** Contradicao
  entre cadastro e relogio nao passa em silencio — ou a data do afastamento esta
  errada, ou alguem trabalhou quando nao devia. Nao trava o fechamento.
- **Afastamento e a unica coisa que se apaga no modulo.** E uma **entrada**, e nao
  um fato ja interpretado como a escala: data errada nao se corrige desativando,
  porque enquanto a linha existir ela continua tirando dias da apuracao.
- **O telefone e o unico campo dos dados que nao vem da folha.** O relatorio
  "Relacao de Empregados" nao traz numero nenhum, entao ele nasce no portal e a
  importacao nunca o toca — nem para preencher, nem para apagar, exatamente como
  `escala_id` e `inicio_ciclo`. E ele que destrava o contato pela tela de
  pendencias; quem esta sem numero aparece como "sem telefone" no painel.
- **`definirJornada()` aceita o par vazio.** E como se tira uma escala atribuida
  por engano; sem isso, a unica saida seria o banco.
- **As abas usam `forceMount` + `data-[state=inactive]:hidden`.** As duas coisas
  sao necessarias: sem `forceMount` o Radix desmonta a aba escondida e o que
  estivesse digitado e nao salvo se perde ao dar uma olhada na outra; **com**
  `forceMount` esta versao do Radix nao marca `hidden`, e os dois paineis
  apareceriam empilhados. Os dois `<form>` convivem no DOM sem se misturar,
  porque cada campo pertence ao seu.
- **Funcionario e cadastro, nao dado datado: nao pertence a competencia.**
  Nenhuma query da feature chama `competenciaEmVigor()`, pelo mesmo motivo das
  escalas — ninguem e recontratado ao virar o periodo.
- **`escala_id` e `inicio_ciclo` andam juntos ou nao andam**, garantido por
  `check` (`(escala_id is null) = (inicio_ciclo is null)`). Escala sem a data de
  virada nao responde "hoje e dia de trabalho?"; a data sozinha nao tem ciclo a
  comecar. O tipo `AtribuicaoDeEscala` repete a regra: um objeto anulavel, e nao
  dois campos que a tela teria de combinar.
- **Os dois sao anulaveis de proposito.** O relatorio da folha traz centenas de
  pessoas e nenhuma escala; obrigar travaria a importacao. Quem esta sem escala
  vira fila de trabalho — a lista conta e `?pendentes=1` isola.
- **O inicio de ciclo e o que separa as turmas.** Mesma 12x36, um dia de
  diferenca no inicio, e uma turma trabalha quando a outra folga. Por isso a
  atribuicao em lote e por turma, e nao por escala.
- **Escolher a escala passa por `CampoEscala`** (em `escalas/components/`): um
  combobox com a busca **dentro** da lista, sobre o `Popover` do Radix. E a
  unica excecao do portal ao `<select>` nativo — nenhum `select` comporta um
  campo de busca dentro dele. O valor viaja num `input[type=hidden]`, entao a
  action continua recebendo `escalaId` como antes: validacao e gravacao nao
  sabem que o campo mudou. O preco e depender de JavaScript (ver "Pontos de
  atencao"); a lista de empresas e a de situacoes continuam em `select` nativo,
  porque nenhuma das duas precisa de busca.
- **A identidade e o CPF**, com digitos verificadores conferidos: a matricula se
  repete entre empresas (o codigo 1335 existe em duas) e o nome muda. A
  matricula e unica **por empresa**; nao ha indice separado para `empresa_id`
  porque o unico composto ja o cobre.
- **`hoje` vem do servidor** (`hojeNoPortal()`, em `competencias/periodo.ts`).
  `toISOString()` daria a data em UTC, que a partir das 21h ja e a de amanha —
  erraria justo no turno da noite; e calcular no cliente faria a hidratacao
  divergir na virada do dia.
- **Situacao e o codigo da folha** (1 = Trabalhando, 9 = Ferias...), guardado
  como veio. Reduzir a ativo/inativo perderia **por que** a pessoa nao bateu
  ponto, que e o que decide como o dia sem marcacao e lido. `ativo` e outra
  coisa: quem esta de ferias segue ativo no portal.
- **Funcionario nao e apagado, e desativado** — mesma razao das escalas. As duas
  FKs sao `on delete restrict`.

### Importacao do relatorio da folha

O relatorio "Relacao de Empregados" nao e uma tabela limpa: repete o cabecalho a
cada pagina, concatena blocos de empresas diferentes e termina com a legenda das
situacoes. A leitura e uma varredura com estado, nao um `slice` de linha fixa.

- **Dois modelos de relatorio, um leitor so.** O de **varias empresas** diz a
  razao social no cabecalho de cada pagina (coluna A, ao lado de "Pagina:"); o
  de **uma empresa** diz no titulo ("RELACAO DE EMPREGADOS ATIVOS - PREVSERV
  PORTARIA E LIMPEZA LTDA"). Sao dois reconhecedores em `lerRelatorio()`, e
  nenhum acerta o formato do outro — o titulo so vale com `-` e razao social
  depois, senao a linha "RELACAO DE EMPREGADOS II" do primeiro modelo viraria
  uma empresa com esse nome. O corte e no **primeiro** separador: razao social
  com hifen perderia o fim se fosse pelo ultimo.
- **Coluna ausente nao e valor padrao.** `LinhaDoRelatorio.situacao` e `null`
  quando o arquivo **nao tem a coluna** — o modelo de uma empresa nao traz
  Situacao. Assumir "Trabalhando" ali diria que quem estava de ferias ou no INSS
  voltou, apagando o que o outro relatorio informou. Celula **vazia** numa
  planilha que tem a coluna e outra coisa: ali o relatorio teve a chance de
  dizer e nao disse, entao vale o padrao. Na gravacao, `null` vira
  `SITUACAO_TRABALHANDO` no cadastro novo (nao ha situacao anterior a preservar)
  e **omite o campo** na atualizacao — mesma regra de `escala_id` e do telefone.
- **A previa e a gravacao chamam a mesma funcao** (`planejarImportacao`). Uma
  previa calculada por outro caminho nao prometeria nada.
- **A confirmacao reenvia o arquivo, nao o plano exibido.** A action e um POST
  publico (plano forjado gravaria o que quisesse) e o cadastro pode ter mudado
  entre as telas — quem entrou nesse meio tempo precisa virar atualizacao, e nao
  um insert que o indice vai recusar.
- **A importacao nunca toca `escala_id` nem `inicio_ciclo`.** Eles nascem no
  portal, a folha nao os conhece, e uma carga mensal que os zerasse apagaria todo
  mes o unico trabalho que so o portal faz.
- **Celula e um intervalo de colunas, nao uma letra.** No relatorio o cabecalho
  "Admissao" ocupa X-Y e o valor abaixo ocupa W-Y; casar pela letra inicial faria
  a admissao sair vazia — e a coluna e opcional, entao o erro passaria despercebido.
  `planilha.ts` casa por **sobreposicao**, com os intervalos lidos de `<mergeCells>`.
- **Nada e descartado em silencio**: CPF invalido, CPF repetido no arquivo e data
  impossivel viram recusa com numero da linha e motivo, e as outras linhas entram.
- **Conflito de matricula e detectado no plano**, e nao pelo indice unico: dentro
  de uma transacao o INSERT recusado aborta tudo, e uma carga de trezentas linhas
  cairia inteira por causa de uma.
- **Empresa nova e criada na mesma transacao dos funcionarios.** Nome truncado em
  40 caracteres pelo relatorio — a carga cria com o que veio e nao reescreve o
  nome nas cargas seguintes.

### Analise de ponto (a leitura das marcacoes)

A escala diz o que era para acontecer; a marcacao diz o que aconteceu. A analise
e a leitura de uma contra a outra — e ela **nao esta no banco**.

| Arquivo                     | Papel                                                      |
| --------------------------- | ---------------------------------------------------------- |
| `ponto/relatorio.ts`        | leitura do TXT do relogio: linhas -> batidas (modulo puro) |
| `ponto/apuracao.ts`         | as batidas lidas contra a escala (modulo puro)             |
| `ponto/carga.ts`            | plano da carga: gravar, ignorar, recusar (modulo puro)     |
| `ponto/queries.ts`          | `conferirCompetencia`, `obterApuracao`, `janelaApurada`    |
| `ponto/actions.ts`          | `importarMarcacoes`, `associarEmpresa`                     |
| `src/db/schema/ponto.ts`    | `marcacoes` + `importacoes_ponto`                          |
| `src/app/(portal)/ponto/**` | conferencia, importacao e o dia a dia de cada pessoa       |

Regras:

- **So a batida e gravada; a divergencia e calculada a cada leitura.** Nenhuma
  coluna de `marcacoes` diz "falta", "hora extra" ou "pendencia". Divergencia e
  consequencia da escala, e escala muda — atribuir uma escala a quem estava sem,
  corrigir o inicio de ciclo de uma turma ou ajustar um dia de excecao muda a
  leitura de dias que ja passaram, sem uma unica linha reescrita. Gravar a
  conclusao criaria a versao velha do fato, como faria uma `virada_turno`
  digitada.
- **Uma linha por batida**, e nao uma por dia com a lista de horarios: e a
  unidade indivisivel do relogio, e o indice unico `(funcionario, data, hora)` e
  o que torna a recarga idempotente — reenviar o arquivo nao duplica nem exige
  apagar o que ja existia.
- **Marcacao e dado datado**: toda leitura filtra por `competenciaEmVigor()`, ao
  contrario de escalas e funcionarios. E `competencia_id` sai da **data** na
  importacao, nao da competencia aberta na hora do envio.
- **A janela apurada e a uniao dos periodos importados**, recortada pela
  competencia — nunca a competencia inteira. O relatorio para antes do fim do
  periodo (21/08 a 04/09, numa competencia ate 20/09), e sem a janela os dias
  nao cobertos virariam faltas para o cadastro inteiro. E para isso que
  `importacoes_ponto` existe; competencia sem carga nenhuma **nao apura nada**,
  em vez de apurar tudo como falta.
- **A virada de turno e resolvida reclamando a cauda do dia seguinte.** O relogio
  registra cada batida na data em que ela aconteceu, entao a jornada noturna de
  22/08 aparece partida: entrada (17:55) no dia 22, saida (06:11) no dia 23.
  Lidos dia a dia, virariam duas "marcacoes incompletas". O criterio sai da
  escala, e nao de uma margem escolhida a dedo: numa jornada que vira o dia a
  saida e sempre anterior a entrada, entao batida do dia seguinte **antes do
  horario de entrada** so pode fechar o turno da vespera.
- **No primeiro dia apurado, a batida anterior a entrada e ignorada** (escala que
  vira o dia): ela fecha um turno iniciado na vespera, fora da janela. Quando
  esse primeiro dia e **folga**, isso e a regra inteira — nao havia turno para
  comecar ali, entao tres batidas soltas no dia 21 nao viram tres pendencias,
  viram nenhuma. Elas nao somem: vao para `ignoradas`, com o motivo, e a tela as
  mostra riscadas.
- **No ultimo dia da janela o problema e o espelho**: a saida do turno com virada
  cai depois do fim do periodo e ainda nao existe. Isso e `turno_em_aberto`
  (atencao), e nao marcacao incompleta — chamar de pendencia o que so depende do
  proximo arquivo mandaria alguem procurar um problema inexistente.
- **A contagem de batidas vem antes de qualquer soma de horas.** Somar um dia mal
  pareado produz um numero que parece certo e nao e; o numero de marcacoes e o
  que denuncia a batida faltando.
- **Duas gravidades.** `impeditiva` trava o fechamento (falta, marcacao impar,
  marcacoes a menos, trabalho em dia de folga) e vira fila; `atencao` fecha mas
  pede conferencia (hora extra, debito, intrajornada curta, marcacoes a mais,
  turno em aberto).
- **`TOLERANCIA_MINUTOS` e 10, e vale em cada ponta do turno.** E o que a CLT
  (art. 58, par. 1o) nao considera jornada extraordinaria. A entrada e a saida
  dentro da margem **valem o horario previsto** (`comPontasToleradas()`), e e
  o saldo que sobra (`saldoToleradoMinutos`) que decide `hora_extra` e
  `debito_de_horas`. So no total do dia nao bastava: entrar 06:52 e sair 17:09
  esta na margem nas duas batidas e somava 17 minutos de hora extra que ninguem
  pediu, e o espelho do apontamento os lancava. **Nao e franquia**: ponta fora
  da margem entra inteira, entao 07:20 e vinte minutos de atraso, e nao dez. As
  batidas do meio nao mudam — o intervalo tem a propria regra.
- **O saldo bruto fica na tela; o tolerado decide.** `saldoMinutos` continua
  sendo `trabalhado - previsto` como o relogio registrou, e e o que as telas
  mostram ao lado das horas trabalhadas; `saldoToleradoMinutos` e a conclusao,
  e e ele que o espelho do apontamento soma como hora extra. Fato de um lado,
  leitura do outro — como em todo o modulo.
- **A conferencia recorta a pagina em memoria**, ao contrario das listas de
  escalas e funcionarios: a ordem e "quem tem mais pendencia primeiro", e
  pendencia nao existe no banco. Ordenar em SQL exigiria gravar justamente a
  conclusao que este modulo nao grava. O custo e limitado pelo cadastro.
- **`sem_escala` nao encabeca a lista**, embora impeca a apuracao: e pendencia de
  **cadastro**, e logo depois de uma importacao da folha e a maioria do cadastro
  (303 de 314, no primeiro periodo). Na frente, enterraria as pendencias de ponto
  sob centenas de linhas de tracos. A fila deles tem lugar proprio: o filtro de
  status aqui e `?pendentes=1` em Funcionarios.

### Importacao do relatorio de marcacoes

O relatorio "Lista de Marcacoes Realizadas Simplificadas" e um TXT de larguras
fixas, bem mais simples do que o da folha: cabecalho uma vez so, uma linha por
pessoa/dia, um total no fim. O que ele **nao** tem e o que manda no desenho.

- **Nao ha razao social, so o codigo do relogio; nao ha CPF, so a matricula.** O
  relatorio da folha e o contrario. Nenhum dos dois liga os dois lados sozinho —
  e a matricula sozinha nao identifica ninguem, porque o codigo 1335 existe em
  duas empresas e sao duas pessoas.
- **A ponte e `empresas.codigo`**, preenchido pela propria tela de importacao:
  codigo desconhecido bloqueia o bloco inteiro e aparece na previa com um campo
  para associar. `associarEmpresa()` e action a parte porque grava **cadastro**,
  nao carga: feita uma vez, vale para sempre. Um `<form>` por codigo, para que a
  recusa de um nao derrube os outros.
- **A leitura ancora na data**, e nao em posicao de coluna: e o unico campo com
  formato inconfundivel no meio da linha. O espaco entre nome e data e
  **opcional**, porque o relatorio nao o garante — nome que enche a coluna sai
  colado na data ("...BUENO DA SILVA21/08/2026"), e exigi-lo descartaria essas
  linhas em silencio.
- **O `i` colado no horario (`14:05i`) marca a batida incluida a mao** e vira a
  coluna `incluida`. Descarta-lo faria a tela tratar como igual o dia que o
  relogio registrou inteiro e o dia que alguem completou depois.
- **O periodo vem do cabecalho**; o coberto pelas linhas e so a rede de
  seguranca. A diferenca importa: um dia em que ninguem bateu ponto existe no
  cabecalho e nao existe nas linhas. O rodape ("Total: 2840") e conferido contra
  o que a leitura entendeu — e o unico sinal de que ha linha num formato que o
  leitor ainda nao conhece.
- **A previa e a gravacao chamam `planejarCarga()`**, e a confirmacao reenvia o
  arquivo, nao o plano. Aqui a razao "o cadastro pode ter mudado" e a regra e nao
  a excecao: associar um codigo de empresa e justamente o que se faz entre as
  duas telas.
- **Data fora da competencia nao entra.** A marcacao pertence ao periodo em que o
  dia caiu: gravar 21/09 dentro de agosto o esconderia de setembro para sempre,
  porque o indice unico impediria a carga seguinte de traze-lo de volta.
- **Marcacoes e a linha de `importacoes_ponto` vao na mesma transacao.** Uma sem
  a outra mente: marcacoes sem a carga deixariam batidas fora do periodo
  apurado; carga sem marcacoes faria o periodo passar a ser apurado com todo dia
  virando falta. Carga que nao alcanca ninguem e recusada pelo mesmo motivo.

### Escalas sugeridas pelo ponto

A folha nao traz jornada e o cadastro nasce sem escala — trezentas pessoas, uma
a uma. O relogio traz: **em que dias a pessoa trabalha** e **em que horario**.
Esta leitura vira sugestao de `escala_id` + `inicio_ciclo`, conferida em lote.

| Arquivo                                            | Papel                                                 |
| -------------------------------------------------- | ----------------------------------------------------- |
| `ponto/inferencia.ts`                              | as batidas contra o catalogo de escalas (modulo puro) |
| `ponto/queries.ts`                                 | `sugerirEscalasDoPonto()`                             |
| `ponto/actions.ts`                                 | `definirEscalasSugeridas()`                           |
| `ponto/components/escalas-sugeridas.tsx`           | a conferencia e a gravacao em lote                    |
| `src/app/(portal)/funcionarios/escalas-sugeridas/` | a tela, ao lado da fila que ela resolve               |

Regras:

- **A inferencia escolhe entre as escalas cadastradas; nao inventa nenhuma.**
  Derivar o ciclo do zero criaria um catalogo paralelo, cheio de variacoes de
  uma escala so (a que tem uma falta no meio do mes). Escala e cadastro, e quem
  cria e quem opera — se nenhuma do catalogo explica a pessoa, a tela diz isso.
- **Cada escala e testada em todas as posicoes do ciclo.** O ciclo diz o padrao
  e a ancora diz onde ele comeca: sao `dias_ciclo` deslocamentos, e nao um. Sem
  isso, um 12x36 so seria reconhecido em quem por acaso trabalhou no primeiro
  dia da janela. O `inicio_ciclo` sugerido e a data que cai na posicao 1.
- **A atribuicao das batidas ao turno vem de `preenchimento/relogio.ts`.** Numa
  jornada que vira o dia a saida cai na data seguinte, e sem devolve-la ao turno
  o 12x36 noturno parece trabalhar todos os dias — o acerto cai de 98 pessoas
  para 37. E a mesma regra da apuracao; uma segunda versao divergiria no
  primeiro caso de borda.
- **O desempate e hierarquico, e nao uma nota unica**: dias, depois horario,
  depois marcacoes. Os dias identificam o ciclo; o **horario** separa o 12x36
  diurno do noturno (o ciclo dos dois e identico); as **marcacoes** separam a
  escala que marca o intervalo da que nao marca (06:00-18:00 com 2 ou com 4).
  Somar tudo deixaria dez horas de diferenca serem compensadas por um dia a
  mais de acerto.
- **O recorte e por pessoa, da primeira a ultima batida**, e sempre dentro da
  janela apurada. Quem foi admitido ou desligado no meio do periodo tem dias
  vazios que nao sao folga, e conta-los como tal faz o ciclo errado ganhar —
  assim como contar os dias que **nenhum arquivo cobriu**.
- **Menos de `DIAS_MINIMOS` (6) dias com batida nao sustenta um ciclo**: com
  quatro dias metade do catalogo acerta por acaso. Essas pessoas aparecem na
  lista com o motivo, e nao somem.
- **Confiavel e 90% dos dias e 30 minutos de horario** — so essas vem marcadas.
  As demais continuam na tela, porque "o ponto nao explica esta pessoa" tambem
  e resposta, e some-la esconderia quem mais precisa de olhar.
- **A action recalcula a sugestao; do formulario vem so quem foi marcado.** Ela
  e um POST publico, e um plano vindo do cliente gravaria a escala que quisesse
  em quem quisesse — mesma razao pela qual a importacao reenvia o arquivo, e
  nao a previa. Se a competencia em vigor mudou entre desenhar e confirmar, a
  gravacao e recusada.
- **So grava em quem continua sem escala** (`where escala_id is null`): quem foi
  cadastrado a mao nesse meio tempo vale mais que o lote, como em
  `preencherDias()`.
- **A tela exige as duas areas** (`ponto` e `funcionarios`): ela mostra batidas
  e grava cadastro de pessoal.
- **Nada da sugestao e gravado** — nem o percentual, nem os dias que
  divergiram. Ela e leitura, como a apuracao: importar mais um arquivo ou
  corrigir uma escala muda a sugestao sem nenhuma linha reescrita.

### Pendencias e tratativas (o que se faz com a ocorrencia)

A apuracao diz o que nao fecha. A **tratativa** e o que alguem fez a respeito:
com quem se falou, o que se apurou, em que pe ficou. E a unica coisa do modulo
de ponto que e fato novo, e nao consequencia — por isso e a unica que se grava.

| Arquivo                                | Papel                                                      |
| -------------------------------------- | ---------------------------------------------------------- |
| `ponto/tratativas.ts`                  | catalogo dos status e `tratativaEncerrada()` (modulo puro) |
| `ponto/mensagens.ts`                   | o modelo do texto enviado ao colaborador (modulo puro)     |
| `ponto/zapi.ts`                        | o cliente HTTP da Z-API, `server-only`                     |
| `ponto/queries.ts`                     | `listarPendencias`, `obterOcorrencia`                      |
| `ponto/actions.ts`                     | `registrarTratativa`, `enviarMensagem`                     |
| `funcionarios/telefone.ts`             | normalizacao e formatacao do numero (modulo puro)          |
| `src/db/schema/ponto.ts`               | `tratativas_ponto` + `mensagens_ponto` + enums             |
| `src/app/(portal)/ponto/pendencias/**` | o painel e a tela de cada ocorrencia                       |

Regras:

- **A ocorrencia nao tem id porque nao tem tabela.** Ela nasce da leitura das
  batidas contra a escala, a cada requisicao. A tratativa se prende a
  `(funcionario, data, tipo)` — a identidade natural da ocorrencia —, e e essa
  tripla que o indice unico protege e que a URL carrega
  (`/ponto/pendencias/<id>/<data>/<tipo>`).
- **A ausencia de linha ja significa `aberta`.** A maioria das ocorrencias nunca
  teve linha nenhuma em `tratativas_ponto`, e e assim que o painel funciona
  desde a primeira carga sem ninguem precisar "abrir" nada. Gravar `aberta` para
  todas seria gravar a ausencia de trabalho.
- **Tratativa cuja divergencia sumiu some da tela, mas nao do banco.** Corrigir
  a escala, importar a batida que faltava ou lancar o atestado apaga a
  ocorrencia — nao ha mais o que tratar. A linha fica: se a mesma divergencia
  voltar, a chave a reencontra e o historico da conversa volta junto. Abrir a
  ocorrencia pela URL nesse estado mostra o registro com o aviso de que a
  divergencia nao aparece mais, em vez de um 404 que faria parecer que ela se
  perdeu.
- **`TipoDeDivergencia` deriva do enum `divergencia_tipo` do banco**, como
  `areas.ts` deriva de `area_portal`. A ocorrencia continua nao sendo gravada,
  mas o tipo e parte da chave da tratativa: como `text` livre, um erro de
  digitacao criaria uma tratativa que nunca mais casaria com ocorrencia nenhuma,
  em silencio. O `IDS_DIVERGENCIA` que o Zod usa sai de `apuracao.ts`, e nao do
  enum, para que `schema.ts` continue podendo ser lido por componente client.
- **`descartada` exige observacao.** "Isto nao era ocorrencia" sem motivo
  escrito e indistinguivel de alguem limpando a fila — e e justamente o caso em
  que quem le depois precisa saber por que o dia sumiu do painel.
- **O painel ordena por `encerrada` antes de gravidade.** Uma falta ja
  justificada nao e mais fila; deixa-la no topo por ser impeditiva faria a tela
  repetir todo dia um trabalho ja feito, que e a maneira mais rapida de alguem
  parar de olhar para ela. O recorte da pagina e em memoria, como o da
  conferencia e pelo mesmo motivo: a ordem depende de algo que nao existe no
  banco.
- **A conferencia e o painel partem da mesma leitura** (`apurarTodos()`). Duas
  leituras montadas em separado divergiriam, e um dia a lista diria "3
  pendencias" com o painel mostrando quatro linhas.

### Mensagem ao colaborador (Z-API)

- **Quem esta no grupo de contato de um posto com responsavel nao recebe a
  mensagem: ela vai para o responsavel.** Ver "Responsavel do posto (contato
  pelo grupo)". As regras abaixo valem para os dois destinos.
- **A previa e obrigatoria porque envio de WhatsApp nao tem desfazer.** A mesma
  action faz as duas etapas: sem `confirmar`, devolve destinatario, numero,
  ocorrencia e o texto inteiro; com ele, envia. Mesmo arranjo da importacao de
  marcacoes.
- **A confirmacao reenvia so o texto.** Ele e do usuario, que pode te-lo
  editado. Destinatario e numero sao **relidos do cadastro** dentro da action: o
  que o cliente devolve nao e evidencia, e o numero pode ter sido corrigido
  entre uma tela e outra.
- **A mensagem se prende a tratativa, e nao a ocorrencia** — que nao existe no
  banco. Por isso o envio comeca criando a linha de tratativa (em `aberta`), e e
  isso que faz o historico sobreviver a uma mudanca de escala que apague a
  divergencia.
- **Texto e telefone sao gravados como foram enviados.** Os dois mudam, e o
  historico precisa dizer o que a pessoa recebeu naquele dia, e nao o que ela
  receberia hoje. Mesma razao pela qual `importacoes_ponto` guarda o nome do
  arquivo.
- **A falha tambem vira linha.** Sem ela, "ninguem avisou o colaborador" e "o
  numero esta errado" ficariam indistinguiveis, e as duas pedem acoes
  diferentes. Por isso `enviarTextoNoWhatsapp()` nunca lanca: toda falha volta
  como `{ ok: false, erro }`, porque quem chama grava a recusa.
- **Envio aceito move `aberta` para `em_tratativa`; envio que falhou nao move
  nada** — ninguem foi avisado. E o status so avanca a partir de `aberta`: quem
  ja marcou `justificada` nao volta para `em_tratativa` por mandar mais uma
  mensagem.
- **O registro vem depois da chamada HTTP, e fora de transacao com ela**: uma
  chamada de rede nao volta atras com `rollback`.
- **O texto do erro guardado nunca carrega credencial nem corpo cru da
  resposta** — ele aparece na tela e no historico.
- **O telefone nasce no portal, e a importacao nunca o toca.** O relatorio da
  folha nao traz telefone nenhum, entao a carga mensal nao o preenche nem o
  apaga — pelo mesmo motivo (e com o mesmo cuidado) de `escala_id` e
  `inicio_ciclo`. Guardado so em digitos e com DDI, que e o formato que a Z-API
  quer; sem DDI, o portal assume o 55.
- **A conferencia do numero e de tamanho, e nao de formato** (10 a 15 digitos):
  nao ha regex que descreva os planos de numeracao de todos os paises sem
  recusar alguem legitimo. O que a faixa pega e o que de fato acontece — campo
  pela metade, DDD esquecido, texto no lugar do numero.
- **A Z-API e opcional.** Sem `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN` e
  `ZAPI_CLIENT_TOKEN` o portal inteiro funciona e a tela da ocorrencia diz que o
  envio esta indisponivel; status e observacao continuam sendo gravados. Quem so
  confere ponto nao precisa de WhatsApp.

### Chatbot de correcao de ponto (webhook da Z-API)

O colaborador conversa com o WhatsApp do RH e corrige a ocorrencia sozinho:
identificacao pelo numero, a ocorrencia pendente, a data, o motivo (menu), os
horarios ou a explicacao, o resumo e a confirmacao explicita. Confirmado, a
tratativa vira `justificada` e nasce um comprovante em PDF com hash.

| Arquivo                                                 | Papel                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `ponto/atendimento/fluxo.ts`                            | a conversa: etapa + mensagem -> resposta e proxima etapa (modulo puro) |
| `ponto/atendimento/motivos.ts`                          | os motivos do menu e o que cada um pede (modulo puro)                  |
| `ponto/atendimento/webhook.ts`                          | leitura do payload da Z-API e variantes do numero (modulo puro)        |
| `ponto/atendimento/consolidacao.ts`                     | conteudo consolidado, JSON canonico e SHA-256                          |
| `ponto/atendimento/pdf.ts`                              | o PDF do comprovante (`pdf-lib`), `server-only`                        |
| `ponto/atendimento/processar.ts`                        | uma mensagem: bloqueio, estado, envio, gravacao e finalizacao          |
| `ponto/atendimento/queries.ts`                          | comprovantes, conferencia de integridade e atendimentos                |
| `src/db/schema/atendimentos.ts`                         | `atendimentos_ponto` + `mensagens_whatsapp` + `comprovantes_tratativa` |
| `ponto/atendimento/receber.ts`                          | o webhook: segredo, tamanho, leitura e processamento                   |
| `src/app/api/whatsapp/webhook/route.ts`                 | o webhook "Ao receber", com `?token=`                                  |
| `src/app/api/whatsapp/webhook/[token]/route.ts`         | o mesmo webhook, com o segredo no caminho                              |
| `src/app/(portal)/ponto/comprovantes/[id]/pdf/route.ts` | o download do PDF                                                      |

Regras:

- **Quem tem responsavel no grupo de contato nao e atendido**: recebe o aviso
  de que a correcao passa pelo responsavel do posto, e a conversa aberta e
  encerrada como `encaminhado_ao_responsavel`. Ver "Responsavel do posto".
- **O atendimento so comeca com a palavra-chave "Ponto", enviada sozinha**
  (`PALAVRA_CHAVE`, `ehPalavraChave()` em `fluxo.ts`). O numero e o WhatsApp
  oficial da empresa e recebe de tudo: sem conversa aberta, qualquer outra
  mensagem responde `sem_palavra_chave` e **nem e gravada** — nao e atendimento,
  e guardar a conversa alheia seria guardar o que ninguem pediu. Numero
  desconhecido so recebe o aviso se mandou a palavra-chave. Dentro de uma
  conversa, "Ponto" vale como "reiniciar".
- **A conversa e uma maquina de estados pura** (`fluxo.ts`), como a apuracao:
  recebe etapa, rascunho e contexto e devolve a transicao. Nao le banco nem
  envia nada — `processar.ts` faz isso.
- **Uma mensagem, uma transacao, com `pg_advisory_xact_lock` por numero.** A
  reentrega da Z-API espera a primeira terminar e encontra a mensagem ja gravada
  (duplicidade); duas mensagens seguidas sao lidas em ordem; e o estado vive na
  mesma transacao da mensagem, entao queda no meio nao deixa conversa pela
  metade. Erro responde 500 de proposito: a transacao voltou, e a reentrega
  reprocessa.
- **O envio acontece dentro da transacao, antes do `insert`.** A mensagem
  enviada nasce com o id da Z-API (ou com o erro) e **nunca e atualizada** — e
  e isso que permite reconstruir o conteudo do comprovante depois. O custo e
  segurar a transacao durante o HTTP, e a pessoa pode receber a pergunta de novo
  se a gravacao falhar depois do envio.
- **O estado fica em colunas tipadas**, e nao em JSON solto: data, tipo, motivo,
  horarios e descricao. So o ultimo menu e `jsonb` — e ele que diz o que
  "responda 2" significava na tela da pessoa, mesmo que a lista de ocorrencias
  tenha mudado entre a pergunta e a resposta.
- **Todo menu vai numerado no texto, alem da lista de opcoes.** A lista do
  WhatsApp nao aparece em todo aparelho; o numero funciona em qualquer um. A
  resposta vale pelo id da lista ou pelo numero.
- **O contexto e relido a cada mensagem.** Ocorrencia que deixou de estar
  pendente no meio da conversa (carga nova, RH encerrou) recomeca o atendimento
  dizendo por que. So entram ocorrencias nao encerradas.
- **O robo so atende falta e marcacao incompleta** (`sem_marcacao`,
  `marcacao_impar`, `marcacoes_a_menos` — `TIPOS_DO_ATENDIMENTO`, em
  `motivos.ts`). Hora extra, debito, intrajornada, marcacoes a mais, trabalho em
  folga e turno em aberto ficam so no painel: nao sao algo que o colaborador
  corrija informando horarios, e sim decisao de quem confere o ponto.
- **A data digitada e validada contra as ocorrencias existentes.** Data sem
  ocorrencia pendente e recusada com a lista de novo; nao abre correcao.
- **Horarios em quantidade par**, sem exigir ordem crescente (turno que vira o
  dia). Numero impar recriaria a pendencia que a pessoa quer corrigir.
- **A confirmacao so vale explicita**: a opcao da lista, o `1` ou "sim",
  "confirmo". "Ok" ou emoji repetem o resumo.
- **Identificacao pelo numero com e sem o nono digito** (`variantesDoTelefone`).
  Numero desconhecido ou em dois cadastros recebe no maximo um aviso por dia — o
  WhatsApp do RH recebe mensagem de qualquer pessoa.
- **Conversa parada ha mais de 72 horas recomeca** (`expirado`): confirmar dados
  velhos contra uma ocorrencia que ja pode ser outra nao vale o atalho.
- **O hash vem antes do PDF, e mora em coluna propria.** `consolidar()` gera o
  JSON canonico (chaves ordenadas) de identificacao + correcao + confirmacao +
  transcricao ate a mensagem que confirmou, e o SHA-256 dele. O PDF recebe o
  hash pronto e so o exibe. A mensagem de encerramento fica **fora** do
  conteudo: ela anuncia o comprovante.
- **A integridade e conferida a cada abertura da tela, de dois jeitos**: o hash
  contra o `conteudo` gravado, e a transcricao reconstruida das linhas de
  `mensagens_whatsapp` (pela mesma `transcricaoAte()` da geracao) contra a do
  conteudo. O segundo pega uma mensagem editada no banco mesmo que alguem tenha
  recalculado o hash.
- **`momento` sempre vem de um `Date` do JavaScript**, nunca do `now()` do
  banco: o Postgres guarda microssegundos, o JavaScript le milissegundos, e a
  reconstrucao daria outro texto.
- **Confirmar grava `justificada` e acrescenta a observacao embaixo da que o RH
  ja tivesse escrito** — nunca a sobrescreve.
- **O PDF usa a Helvetica padrao** (WinAnsi): acentos passam, emoji sai como `?`
  so no documento — o conteudo gravado e o hash guardam o texto original.
- **`ZAPI_CHATBOT_ATIVO=false` desliga so a conversa.** O webhook continua
  conferindo o segredo e respondendo 200 — sem 200 a Z-API reentrega para
  sempre —, mas nada e lido, gravado nem enviado. E assim que se para o robo sem
  apagar a URL no painel da Z-API, que e configuracao de fora do portal.
- **O webhook nasce desligado.** Sem `ZAPI_WEBHOOK_SECRET` responde 503; com ele,
  exige o segredo na URL, como `?token=` ou como ultimo segmento do caminho
  (`/api/whatsapp/webhook/<segredo>`) — os dois formatos passam por
  `receberWebhook()` e sao comparados em tempo constante. A Z-API nao assina o
  que envia. Com `ZAPI_INSTANCE_ID`, mensagem de outra instancia e ignorada.

### Responsavel do posto (contato pelo grupo)

O contato direto com o colaborador (a mensagem manual e o chatbot) esta em
analise juridica. Enquanto ela nao conclui, a correcao de ponto de quem esta no
**grupo de contato** de um posto vai para o **responsavel** pelo posto: uma
mensagem por ocorrencia, com o colaborador, o posto, o dia, as marcacoes e um
prazo de 3 dias corridos para o retorno. Quem nao esta em grupo nenhum continua
exatamente como antes.

| Arquivo                                          | Papel                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `postos/queries.ts`                              | `obterGrupoDeContato`, `contatoDoFuncionario(s)`                          |
| `postos/actions.ts`                              | `definirResponsavel`, `incluirNoGrupo`, `retirarDoGrupo`, `trazerDaGrade` |
| `postos/busca.ts`                                | `buscarFuncionarios`, a busca do campo (so funcionarios)                  |
| `postos/components/responsavel-do-posto.tsx`     | a aba Responsavel do posto                                                |
| `ponto/contato.ts`                               | destino da mensagem, bloqueio e prazo de retorno (modulo puro)            |
| `ponto/mensagens.ts`                             | `modeloParaResponsavel()` e `modeloConsolidado()`                         |
| `ponto/queries.ts`                               | `listarResponsaveisComPendencias`, `consolidadoDoResponsavel`             |
| `ponto/actions.ts`                               | `enviarConsolidado`, a mensagem unica ao responsavel                      |
| `ponto/components/envio-consolidado.tsx`         | previa e envio por responsavel                                            |
| `src/app/(portal)/ponto/pendencias/responsaveis` | a tela "Envio aos responsaveis"                                           |
| `src/db/schema/postos.ts`                        | `postos.responsavel_id` + `posto_contatos`                                |
| `src/db/schema/ponto.ts`                         | `mensagens_ponto.destino` + `destinatario_id`                             |

Regras:

- **O fluxo direto continua no codigo, e nao num ramo.** Ele e o caminho de
  quem nao tem responsavel, entao reimplanta-lo depois da analise e ajuste de
  cadastro (postos sem responsavel), e nao reversao. O estado anterior a esta
  mudanca tambem esta na tag git `contato-direto-v1`.
- **O grupo e cadastro, e nao a grade.** `posto_contatos` nao pertence a
  competencia: a grade muda todo mes, e quem cobre dois postos teria dois
  responsaveis. "Trazer quem esta na grade deste posto" e so um atalho para
  montar o grupo, e nao um vinculo.
- **Uma pessoa, um grupo** (indice unico em `funcionario_id`): com dois, nao
  haveria a quem mandar. Quem ja esta em outro grupo e recusado com o posto na
  mensagem, e nao movido — trocar de responsavel e decisao sobre os dois postos.
  O atalho da grade pula essas pessoas e diz quantas e onde.
- **O responsavel nao entra no proprio grupo**, nos dois sentidos: a mensagem
  sobre o ponto dele chegaria a ele escrita como se fosse sobre outra pessoa. No
  grupo de **outro** posto ele pode estar.
- **Com responsavel, a mensagem nunca volta ao colaborador em silencio.**
  Responsavel sem telefone ou desativado **bloqueia** o envio
  (`BloqueioDoDestino`), com aviso e link na tela; cair no contato direto seria
  justamente o que a analise juridica quer evitar. O `ativo` do responsavel por
  isso nao filtra `contatosDosFuncionarios()`. Posto **sem** responsavel e o
  unico caso em que o grupo nao muda nada.
- **O destino e relido e comparado na confirmacao.** A previa devolve
  `destino` e `destinatarioId` em campos ocultos; se o responsavel foi
  atribuido ou tirado entre as duas etapas, a action recusa, chama `refresh()` e
  a tela volta com o texto novo. Sem isso, o texto escrito para o colaborador
  sairia para o responsavel. Telefone e destinatario continuam vindo do
  cadastro, como antes — o cliente so prova que viu o mesmo destino.
- **A mensagem grava a quem foi** (`destino` + `destinatario_id`), como ja
  gravava o telefone: o grupo muda, e o historico precisa dizer quem foi
  avisado naquele dia.
- **O prazo e calculado, e nao gravado.** `prazoDaOcorrencia()` conta
  `PRAZO_RETORNO_DIAS` (3) dias corridos a partir do ultimo envio **aceito**, e
  so quando esse envio foi ao responsavel e a tratativa nao foi encerrada.
  Reenviar renova, porque o texto novo promete a data nova. "Recebimento" e
  aproximado pelo envio aceito pela Z-API (ver "Pontos de atencao").
- **"Sem telefone" passa a ser do destino.** `semTelefone` no resumo do painel
  conta quem nao pode ser avisado — o colaborador sem numero, ou o responsavel
  sem numero ou desativado. `prazosVencidos` conta os prazos estourados.
- **O chatbot nao atende quem tem responsavel.** Depois de identificar o
  numero, `processar.ts` consulta o contato: com responsavel, encerra a conversa
  aberta (`encaminhado_ao_responsavel`), avisa no maximo uma vez por dia que a
  correcao passa pelo responsavel e devolve `com_responsavel`. O responsavel que
  manda "Ponto" sobre o proprio ponto e atendido normalmente.
- **O envio consolidado e uma mensagem por responsavel, disparada a mao.** A
  tela "Envio aos responsaveis" lista quem tem pendencia no grupo; cada um tem
  previa e confirmacao, como a mensagem avulsa. Nada sai sozinho nem em lote
  para varios responsaveis de uma vez — envio de WhatsApp nao tem desfazer.
- **Entra so falta e marcacao incompleta** (`tipoDoConsolidado()`, que reusa os
  `TIPOS_DO_ATENDIMENTO` do chatbot): sao o que o responsavel resolve
  perguntando ao colaborador. Hora extra, debito, intrajornada e os demais sao
  decisao de quem confere o ponto e ficam so no painel — e fora das contagens
  da tela do consolidado.
- **Entra so o que ainda nao foi enviado a ele** (`entraNoConsolidado()`): nao
  encerrada e sem envio aceito a este responsavel — nunca enviada, so falhas,
  ou enviada ao colaborador ou ao responsavel anterior. O que ja foi e esta no
  prazo fica de fora, para o prazo nao ser renovado sem ninguem pedir.
- **O texto do consolidado nao se edita, e nao volta do formulario.** Ele e a
  lista do que vai ser dado como avisado; editado, poderia tirar uma ocorrencia
  que o historico registraria como enviada. Volta so a **assinatura**
  (SHA-256 do texto), e a action refaz o envio com a mesma
  `consolidadoDoResponsavel()` da previa e recusa se o texto mudou — carga
  nova, tratativa encerrada, responsavel trocado ou a virada do dia (o prazo
  esta no texto).
- **Uma linha de `mensagens_ponto` por ocorrencia, com o mesmo `lote_id`**, e
  nao uma tabela de envios: historico, prazo e "ja foi enviado?" continuam
  lendo so `mensagens_ponto`. O texto se repete em cada linha, e e o preco de
  nada mais precisar saber que o consolidado existe.
- **No maximo `OCORRENCIAS_POR_CONSOLIDADO` (30) por mensagem**, por posto e por
  data, numeradas para a resposta citar o item. As demais ficam para o envio
  seguinte, e a previa diz quantas.
- **O consolidado e o painel saem da mesma leitura** (`lerOcorrencias()`), pelo
  mesmo motivo de `apurarTodos()`: as contagens das duas telas nao podem
  divergir.
- **A aba exige a area `postos`**, como o resto do cadastro; a busca de
  funcionario e propria (`buscarFuncionarios`) porque a de `preenchimento` traz
  freelancers e exige outra area. As duas servem o mesmo `CampoPessoa`, que
  recebe a busca por prop.

### Postos e eventos (o que a grade precisa saber antes)

| Arquivo                       | Papel                                                                     |
| ----------------------------- | ------------------------------------------------------------------------- |
| `postos/queries.ts`           | `listarPostos`, `obterPosto`, `listarBlocos`                              |
| `postos/actions.ts`           | `criar/atualizarPosto`, `criar/atualizarFuncao`, `salvar/removerVigencia` |
| `src/db/schema/postos.ts`     | `postos` + `funcoes_posto` + `funcao_ciclos` (vigencias)                  |
| `eventos/cores.ts`            | cor e natureza de cada evento (modulo puro)                               |
| `eventos/queries.ts`          | `listarEventos`, `listarEventosAtivos`                                    |
| `src/db/schema/postos.ts`     | `postos` + `funcoes_posto`                                                |
| `src/db/schema/eventos.ts`    | `eventos` + enums `evento_natureza` e `evento_cor`                        |
| `src/app/(portal)/postos/**`  | lista, cadastro e as funcoes de cada posto                                |
| `src/app/(portal)/eventos/**` | lista e cadastro das siglas                                               |

Regras:

- **Posto e funcao sao dois niveis, e a grade desenha a funcao.** O posto diz o
  lugar (GP01), a funcao diz o turno ou o papel que se cobre ali (Portaria
  remota, Lider, CCO). Sao dois porque **cada par tem a propria lista de
  gente**: achatar em um nivel juntaria numa lista unica pessoas que nunca se
  substituem. O nome da funcao e unico **dentro do posto** — "PORTARIA" existe
  em todo posto e sao portarias diferentes, mesma logica da matricula por
  empresa.
- **Posto e evento sao cadastro, nao dado datado.** Nenhuma query das duas
  features chama `competenciaEmVigor()`, pelo mesmo motivo de escalas e
  funcionarios — "F" nao muda de significado ao virar o periodo. A unica coisa
  datada em `postos/queries.ts` e a contagem de pessoas do bloco, que conta
  linhas de `preenchimento_linhas`.
- **O ciclo da funcao e o contrato do posto, e nao uma escala cadastrada.**
  `funcao_ciclos` guarda `dias_ciclo`, `folgas` (posicoes) e `entrada`/`saida` —
  sem nenhum vinculo com o modulo de Escalas. Se a Portaria Remota e 4x2 por
  contrato, o previsto dela e 4x2 seja quem for que a cubra neste mes: a pessoa
  alocada muda, a exigencia do posto nao.
- **O contrato e uma lista de vigencias, e nao um estado.** Escala muda no meio
  da competencia ("12x36 ate 27/08, 4x2 a partir de 28/08"), e uma configuracao
  unica na funcao obrigaria a reescrever o passado para descrever o futuro. Cada
  linha vale **ate a proxima da mesma turma comecar**: guardar tambem a data
  final criaria duas datas a manter em dia a cada troca, e com elas a chance de
  buraco e de sobreposicao. `vigencia_inicio` nulo e "desde sempre", e so pode
  haver um por turma (indice parcial).
- **Escala e contraescala sao duas escalas completas**, e nao a mesma com a
  ancora deslocada: cada uma tem ciclo, folgas, horario e vigencias proprios. Sao
  duas e nao N porque e assim que a operacao fala, e porque um posto com tres
  padroes simultaneos seria outra funcao.
- **A ancora (`inicio_ciclo` da vigencia) diz onde cai a posicao 1.** Sem ela, a
  posicao 1 cai no inicio da vigencia. Vale a pena dize-la quando a troca
  acontece no meio da semana — um 5x2 que passa a valer numa quarta continua
  ancorando na segunda.
- **Folgas sao posicoes do ciclo, e nao dias da semana** — mesma razao (e mesmo
  formato) de `escala_folgas`: ha escala em que a folga anda, e nenhum par
  "N trabalhados x M de folga" descreve um 6x1 alternado. Sao um `smallint[]`
  em vez de tabela filha porque nunca sao lidas nem escritas sem a vigencia, que
  ja e um `<form>` so.
- **Evento e tabela, e nao enum no codigo**, ao contrario de `area_portal`: quem
  inventa sigla e a operacao (a planilha ja traz TP, TI, TT, TE, MEIO), e enum
  pediria migration a cada sigla nova. Ja a `natureza` **e** enum, porque ela
  decide contagem — e o que separa "nao trabalhou porque folgou" de "nao
  trabalhou porque faltou".
- **A cor e um enum curto, e nao hexadecimal livre.** Trinta e uma colunas com
  cor escolhida a dedo por cadastro viram um mosaico ilegivel, e hexadecimal nao
  acompanha o tema claro/escuro. Cada valor vira um par de classes em
  `eventos/cores.ts`, escritas **por extenso**: o Tailwind varre o codigo
  procurando classes literais, e `bg-${cor}-100` simplesmente nao entra no CSS.
- **No maximo um evento `padrao` por natureza**, garantido por indice parcial
  unico. Marcar um novo desmarca o anterior na mesma transacao — mesmo arranjo
  de `abrirCompetencia()`: quando so pode existir um, trocar qual e ele e a
  operacao que a pessoa quis fazer, e recusar obrigaria a editar dois cadastros.
- **A funcao e uma linha fechada, com o contrato ao lado do nome.** Aberta, ela
  e um formulario de dados mais duas listas de vigencias — um posto com sete
  funcoes abria dezessete telas de formulario de uma vez. Fechada, a linha ja
  responde o que quase sempre se quer saber (`Escala 12x36 · 06:00-18:00 → 4x2 ·
06:00-18:00 desde 28/08`), e **turma sem vigencia aparece em vermelho**: e ela
  que faz a faixa nascer em branco na grade. Uma aberta por vez, pelo mesmo
  motivo — duas ja devolvem a tela para a rolagem.
- **Funcao aberta uma vez continua montada, so escondida** (`hidden`), como as
  abas com `forceMount`: fechar para dar uma olhada em outra nao pode levar
  junto o que foi digitado e nao salvo. O que nao se faz e montar todas de
  saida, que era o que enchia a aba de campos que ninguem pediu para editar.
- **Vigencia tambem e linha, e nao formulario aberto.** Sao seis campos cada, e
  duas turmas por funcao. A linha diz o que a vigencia faz (`4x2 · 06:00-18:00`,
  `Vale desde 28/08 · folgas 5 6 · ancora 25/08`) e os campos aparecem em
  Editar; adicionar tambem e um gesto, e nao um formulario permanente ao pe de
  cada turma.
- **Uma funcao por `<form>`, e nao um formulario para o posto inteiro.** As
  funcoes sao independentes: corrigir o horario de uma nao deveria reenviar as
  outras. Mesmo raciocinio que separa `atualizarFuncionario()` de
  `definirJornada()`.
- **Dados e funcoes sao abas**, como em funcionarios e com o mesmo
  `forceMount`: os dados do posto se mexem uma vez, no cadastro, e as funcoes
  sao remexidas o tempo todo. Codigo, nome e empresa ficam **fora** das abas —
  sao a identificacao da tela.
- **Nada e apagado; posto, funcao e evento sao desativados.** Eles explicam
  escalas de competencias encerradas — apagar deixaria aquelas celulas sem
  significado.

### Preenchimento de escala (a grade do periodo)

A escala diz o padrao e o funcionario diz de quem ela e; o **preenchimento** diz
quem cobre cada posto em cada dia do periodo, e o que de fato aconteceu. E a
planilha de conferencia, dentro do portal.

| Arquivo                             | Papel                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `preenchimento/grade.ts`            | dias do periodo, leitura da celula e totais (modulo puro)                       |
| `preenchimento/previsto.ts`         | vigencias, turmas e derivacao do previsto (modulo puro)                         |
| `preenchimento/relogio.ts`          | batidas do ponto por turno e o sinal de cada dia (modulo puro)                  |
| `preenchimento/queries.ts`          | `obterGrade` (do posto), `listarDisponiveis`, `resumo`                          |
| `preenchimento/actions.ts`          | `salvarDia`, `limparDia`, `incluir*`, `preencherDias`, `definirPrevistoDaLinha` |
| `src/db/schema/preenchimento.ts`    | `freelancers` + `preenchimento_linhas` + `preenchimento_dias`                   |
| `src/db/schema/extras.ts`           | onde o dia marcado como **Extra** lanca as horas                                |
| `src/app/(portal)/preenchimento/**` | a lista de postos e a grade de cada um, em abas                                 |
| `src/components/ui/dialog.tsx`      | o modal do dia (Radix Dialog, escrito a mao como `sheet.tsx`)                   |

Regras:

- **A grade e dado datado**, ao contrario de postos e eventos: toda leitura
  comeca por `competenciaEmVigor()` e toda escrita por `competenciaDeEscrita()`.
  `null` significa "nao ha o que mostrar" — sem competencia aberta a tela e o
  aviso, e nao a escala de um periodo qualquer. As **linhas** seguem de uma
  competencia para a outra na virada; as **celulas**, nunca.
- **Cada pessoa ocupa duas linhas: previsto e realizado.** Duas linhas, e nao
  duas colunas na mesma celula, porque "quem trabalha dia 25?" e "quem trabalhou
  dia 25?" sao lidas do mesmo jeito, uma embaixo da outra — que e exatamente
  como a planilha de origem as desenha.
- **O previsto nao e gravado: ele e derivado, a cada leitura.** Sai do ciclo
  declarado pela **funcao do posto** (contrato) e do inicio de ciclo da
  **linha** (qual turma ela segue), pela mesma `ehDiaTrabalhado()` da apuracao
  do ponto. Nao
  ha linha de `preenchimento_dias` para ele, action que o escreva nem botao que
  o gere: corrigir o contrato do posto recalcula o mes inteiro na hora. Grava-lo
  criaria a versao velha do fato — o mes montado discordando do que o posto
  passou a exigir —, que e a mesma razao pela qual `marcacoes` nao tem coluna de
  falta.
- **A configuracao e consultada por dia, e nao uma vez para o periodo**
  (`vigenciaDoDia()`): vale a ultima vigencia da turma que ja tinha comecado. E
  assim que "12x36 ate 27/08, 4x2 a partir de 28/08" aparece na mesma faixa sem
  que nada seja reescrito.
- **Dia anterior a primeira vigencia fica sem previsto**, e nao herda a
  seguinte. Uma escala que passa a valer em 28/08 nao diz nada sobre o dia 21 —
  inventar que dizia seria escrever no passado do posto.
- **A ancora tem tres origens, nesta ordem** (`ancoraDaVigencia()`): o
  `inicio_ciclo` da vigencia, o inicio da vigencia e — so na vigencia inicial,
  que nao tem data — o primeiro dia do periodo. O terceiro nao e um padrao bom, e
  so existe para a grade nao ficar em branco: a competencia abre numa data
  qualquer do calendario.
- **O padrao vale para tras tambem.** O dia anterior a ancora e a ultima posicao
  do ciclo, e nao um dia sem regra — e por isso um 5x2 ancorado na segunda ja
  mostra o sabado e o domingo anteriores como folga, mesmo eles caindo antes da
  data digitada.
- **A turma da pessoa escolhe qual das duas escalas ela segue**, e nao uma data
  digitada por linha: o contrato de cada turma esta na funcao, e assim ninguem
  inventa sem querer um padrao que o posto nao tem. Trocar de turma recalcula o
  previsto daquela pessoa na hora.
- **A linha escolhe tambem a sigla do previsto** (`preenchimento_linhas.evento_trabalho_id`):
  o `N` de quem cobre a noite numa grade em que os outros sao `D`. Nula herda a
  da funcao, que continua sendo o caso comum. E da linha, e nao so da funcao,
  porque o mesmo turno pode ter metade das pessoas de dia e metade de noite no
  mesmo ciclo — separar em duas funcoes so para trocar a letra duplicaria as
  vigencias e partiria a grade em duas faixas. Turma e sigla sao um formulario
  so (`definirPrevistoDaLinha`), porque respondem a mesma pergunta: como sai o
  previsto desta pessoa.
- **A sigla da linha troca so a letra; o horario do previsto sai em branco.** Ciclo
  e folgas continuam os da vigencia, e e assim que o diurno e o noturno da mesma
  turma se alternam juntos. O horario nao acompanha: a vigencia descreve o turno
  da **funcao** (o 06:00-18:00 de uma portaria de dia), e escreve-lo ao lado do
  `N` seria um previsto que se contradiz. Escolher a mesma sigla da funcao nao e
  excecao — o horario volta, e a coluna do nome nao marca nada.
- **Sem as duas siglas padrao, o previsto nasce em branco.** Ele escreve o
  `evento_trabalho_id` da funcao (ou o `padrao` de natureza `trabalho`) e o
  `padrao` de natureza `folga`. Faltando um dos dois, a faixa fica vazia e a
  tela diz o que falta — inventar uma sigla que ninguem cadastrou seria pior.
- **A grade e do posto, e o menu so lista postos.** A funcao nao vira tela nem
  link: ela e uma **faixa dentro da mesma tabela**, com as colunas dos dias
  alinhadas de cima a baixo. Separar cada turno numa tela propria obrigaria a
  abrir quatro para conferir uma portaria — e a escala de um lugar se le
  inteira. `obterGrade(postoId)` devolve `grupos`, um por funcao.
- **`obterGrade()` devolve tambem o posto, e a tela nao le `postos` duas vezes.**
  O codigo e o nome saem do mesmo join das funcoes. Nao e microotimizacao: toda
  gravacao de dia chama `refresh()`, que redesenha a tela inteira — o que se
  consulta ali se paga uma vez por dia preenchido. Pela mesma razao as listas de
  pessoas do modal sao as **mesmas** da aba Incluir (uma consulta, um payload), e
  as quatro leituras que dependem da competencia saem num `Promise.all`.
- **`null` de `obterGrade()` e "este posto nao existe" (404).** Sem competencia
  aberta ela devolve as faixas das funcoes com `dias: []` e nenhuma linha: a tela
  precisa distinguir "posto inexistente" de "nao ha periodo a desenhar".
- **Toda funcao ativa vira faixa, mesmo a que nao tem ninguem.** Montar os
  grupos so a partir das linhas faria o turno descoberto sumir da tela, e turno
  sem ninguem e justamente o que quem monta a escala precisa enxergar — por isso
  a faixa aparece com "sem ninguem".
- **O que gruda na faixa da funcao e o conteudo, e nao a celula.** Com `colSpan`
  a celula ocupa a largura inteira da tabela, e `sticky left-0` nela nao segura
  nada: o nome da funcao sai pela esquerda ao rolar ate o dia 20. Quem recebe o
  `sticky` e o `<span>` de dentro.
- **A inclusao escolhe a funcao; a grade nao.** Com uma funcao so o campo vira
  `hidden` — perguntar o obvio e ruido no formulario que mais se usa no dia a
  dia. `listarDisponiveis()` nao filtra quem ja esta no posto: a mesma pessoa
  pode estar em dois turnos, e a repeticao **dentro da mesma funcao** continua
  barrada pelo indice parcial unico.
- **As secoes da tela sao abas** (Grade, Incluir, Pessoas), como em funcionarios,
  com o mesmo par `forceMount` + `data-[state=inactive]:hidden`: sem
  `forceMount` o Radix desmonta a aba escondida e a grade perde a rolagem
  horizontal e o dia aberto so por uma olhada em outra; sem a classe, os paineis
  apareceriam empilhados. Competencia, posto e periodo ficam **fora** das abas —
  sao a identificacao da tela.
- **A faixa P e somente leitura; so a R se preenche.** Clicar num dia do
  realizado abre um **modal** (`ModalDoDia`) com tudo o que aquele dia pode
  dizer: sigla, horario, quem cobriu, para onde a pessoa foi e o bilhete. O
  previsto nao abre nada — ele muda em Postos de trabalho, e nao celula a
  celula.
- **A tabela e memoizada, e a razao e o modal.** Abrir e fechar o dia mexe em
  estado que so o modal usa, e sem `memo` isso redesenhava as **620** celulas
  junto: 87ms de tarefa longa por abertura, contra nenhuma numa grade pequena.
  Por isso `aoAbrir` vem de um `useCallback` — funcao nova a cada render
  derrubaria a comparacao rasa e o `memo` nao valeria nada.
- **A lista de quem cobriu entra depois que o modal aparece**
  (`useDeferredValue(true, false)`). Sao trezentas e tantas pessoas, e monta-las
  junto com o modal custava outros 72ms — o clique inteiro travava 159ms. O
  primeiro render sai sem a lista (so com a pessoa ja escolhida, para o campo
  nao piscar vazio) e o React monta o resto em segundo plano, interrompivel.
- **Um modal para a grade toda, e nao um por celula.** Ele vive no nivel de cima
  e recebe a celula aberta; um por dia seriam centenas de dialogos no DOM, cada
  um com o proprio `useActionState`. O dia inteiro e o alvo do clique — a celula
  tem 40px, e mirar um icone dentro dela seria pior que digitar.
- **A celula muda antes de o servidor responder, e o modal fecha no clique.**
  A grade desenha o dia com o que o formulario ja diz; recusa desfaz a celula e
  vira aviso. Sem isso, cada dia preenchido cobrava o roundtrip inteiro de tela
  parada — e um mes tem centenas deles.
- **Gravar um dia nao chama `refresh()`.** Ele redesenha a rota inteira, e isso
  custava **tres vezes** a propria gravacao (~200ms de render sobre ~60ms de
  action, medidos em dev) para trazer de volta o que a tela ja sabia. Preencher
  um dia so muda tres coisas: a celula, o total da linha e o historico daquele
  dia — as duas primeiras a grade desenhou no clique, e da terceira so faltavam
  o autor e o instante, que a action **devolve** (`DiaState.registro`). As
  outras actions do modulo (incluir, retirar, turma, observacao) continuam
  chamando `refresh()`: elas mudam a estrutura da grade, e nao um dia.
- **A camada da sessao e descartada quando uma leitura nova chega.** `grade` so
  troca de identidade num `refresh()` de outra action, e essa leitura ja inclui
  os dias gravados aqui; continuar sobrepondo esconderia o que outra pessoa
  mudou no meio tempo.
- **O `useActionState` mora na grade, e nao no modal.** Quem fecha no clique nao
  pode ser quem guarda o estado da gravacao: desmontado no meio do envio, o modal
  levaria junto a resposta. E a camada otimista precisa viver acima da celula que
  ela redesenha.
- **Um POST por dia (`salvarDia`), e nao um envio da grade inteira.** O
  realizado se preenche quando algo acontece naquele dia; mandar seiscentas
  celulas para corrigir uma so obrigaria a action a adivinhar o que mudou. O
  modal desenha **todos** os campos, entao campo vazio apaga o que estava la —
  o que ele nao desenhasse e que nao poderia ser comparado.
- **Celula sem nenhum campo e apagada, e nao gravada vazia** (`check
preenchimento_dias_nao_vazia`): ela seria indistinguivel de dia em branco e
  ocuparia uma linha para dizer que nao ha o que dizer. "Apagar este dia" e um
  botao a parte porque e outro gesto — nao e limpar cinco campos um a um.
- **Sigla que pede detalhe e recusa, e nao pendencia.** `TE` sem dizer quem
  cobriu nao grava: o modal desenha os dois campos na mesma tela, entao completar
  o dia nao cobra navegacao nenhuma. Quem barra primeiro e o proprio navegador —
  escolher a sigla marca o campo como `required`, e o dia incompleto para de
  custar um roundtrip para ser recusado. A action confere de novo: ela e um POST
  publico, e `required` nao e validacao.
- **Varios dias de uma vez, so nos dias em branco** (`preencherDias`, botao
  "Preencher varios dias" acima da grade). Pessoas, intervalo e o que gravar —
  "igual ao previsto" ou uma sigla fixa (ferias de um mes inteiro). Dia que ja
  tem registro fica como esta, **sempre**: sobrescrever em lote apagaria sem
  ninguem ver a troca ou a falta lancada com cuidado, e desfazer centenas de
  celulas nao tem botao. O conflito com quem gravou pelo modal no meio tempo e
  `on conflict do nothing` — o dia do modal vale mais que o lote.
- **O lote tira o previsto de `obterGrade()`, e nao de uma conta refeita na
  action.** Mesmo principio da previa e da gravacao da importacao: duas
  derivacoes divergiriam no primeiro detalhe (a sigla propria da linha, a
  vigencia que troca no meio do mes), e o lote gravaria um dia diferente do que
  a faixa P mostrava.
- **O lote grava so a sigla, sem horario.** Em branco, o dia seguiu a jornada da
  funcao — que e o que "nada mudou" quer dizer. Sigla que pede quem cobriu ou
  para onde a pessoa foi nem aparece na lista: esses detalhes sao de um dia, e
  nao de um intervalo. Nenhum extra e lancado, e nenhuma intrajornada e marcada.
  Cada dia gravado ganha a propria
  linha de historico, na mesma transacao.
- **O lote chama `refresh()`, ao contrario de `salvarDia`.** Ele muda dezenas de
  celulas e de totais, e a camada de sessao da grade existe para um dia por vez.
  O numero no botao ("Preencher 84 dias") sai da mesma conta, feita na tela
  antes de enviar, com o que ja foi gravado nesta sessao.
- **"Igual ao previsto" escreve nos campos, e nao no banco.** E o caso mais
  comum — o dia ter acontecido como estava previsto —, mas quem clica ainda pode
  ajustar o horario antes de gravar. O dia so vira registro quando alguem
  confirma.
- **O que difere do previsto aparece sublinhado.** Nao mais uma cor: a cor da
  celula ja e a do evento, e duas informacoes na mesma dimensao brigariam.
- **Cinco situacoes, cinco siglas — e o que elas pedem e cadastro.** Cobertura
  de extra, troca de turno, troca de posto, falta e substituicao sao eventos
  como qualquer outro; o que os distingue e `eventos.exige_pessoa` e
  `eventos.exige_destino`, que fazem o painel cobrar **com quem** e **para
  onde**. Uma sexta situacao nao custa migration nenhuma.
- **A cobertura que virou hora extra e uma caixa no dia — e o lancamento mora
  em `extras`.** Marcada, aquele dia cria (ou reescreve) uma linha da
  Conferencia de horas extras apontando para a celula
  (`extras.preenchimento_dia_id`), na mesma transacao da gravacao e pelo mesmo
  motivo do historico: extra sem a celula soma horas de uma cobertura que nao
  existe, e celula sem o extra esconde horas que alguem vai pagar. Ele mora la, e
  nao numa tabela daqui, porque quem confere o periodo le **uma** lista.
- **O extra e de quem cobriu, e nao do dono da linha.** O `TE` de uma linha diz
  que **outra** pessoa cobriu aquele turno, e e ela quem fez as horas; sem
  contraparte, quem fez foi quem estava escalado. O posto e o da grade e o
  `local` e o nome da **funcao** — o complemento que o posto sozinho nao da.
- **O extra exige o horario do dia, e nao o herda do previsto.** `extras` pede
  entrada e saida, e e delas que sai a duracao que alguem vai conferir e pagar;
  tira-las do contrato da funcao faria o lancamento mudar sozinho quando o posto
  trocasse de escala — o oposto do que o modulo de extras e. Quem quer o horario
  da funcao tem o "Igual ao previsto" a um clique.
- **Desmarcar apaga o lancamento, e apagar o dia leva o extra junto** (FK
  `cascade`). O anterior sai sempre antes de o novo entrar: mudar o horario ou
  trocar quem cobriu muda a chave do extra, e um `update` deixaria para tras o da
  versao anterior do dia. Extra que **ja existia** lancado a mao (mesma pessoa,
  dia, posto e entrada) e adotado por `on conflict do update`, e nao recusado — a
  grade nao pode ficar sem gravar o dia por causa de um lancamento feito pelo
  outro caminho.
- **A celula nao guarda que o dia gerou extra.** Nao ha coluna disso em
  `preenchimento_dias`: a leitura junta `extras` por `left join` e a celula diz
  `extra: true` porque o lancamento existe. O que **e** gravado e a marcacao no
  historico (`preenchimento_alteracoes.extra`) — marcar o extra cria horas a
  pagar, e e disso que "quem mudou isso, e quando?" trata.
- **A intrajornada que nao houve e uma caixa do dia — e fica no dia.** Marcada,
  aquele dia diz que o intervalo nao foi usufruido: a pessoa ficou no posto
  direto. E **booleano**, e nao minutos: quantos minutos o intervalo teria ja
  esta declarado no contrato da funcao e na escala cadastrada, e repeti-los na
  celula criaria a versao velha do fato no dia em que a jornada mudasse — a
  mesma razao pela qual a celula nao guarda a duracao do dia. Ao contrario do
  extra, **nao vira lancamento em modulo nenhum**: nao ha conferencia de
  intrajornada, e a rubrica do apontamento continua sendo de quem fecha a folha.
  Marcar so ela mantem a celula (ela entra no `check
preenchimento_dias_nao_vazia`): "nao teve intervalo" e uma coisa a dizer sobre
  o dia, mesmo sem sigla nenhuma.
- **A grade le o relogio de ponto, mas nunca se preenche por ele.** Cada dia do
  realizado ganha um **ponto** quando a grade e o relogio discordam — azul
  quando houve batida e o dia esta em branco, ambar quando o dia diz trabalho e
  nao houve batida, ou diz folga/falta/afastamento e houve. O modal mostra as
  batidas do dia, as horas trabalhadas e as previstas. Nada disso e gravado: e
  leitura cruzada a cada abertura, como a apuracao.
- **O sinal compara as batidas com o que a grade diz, e nao com a apuracao do
  ponto.** A apuracao le a marcacao contra a **escala cadastrada** do
  funcionario; a grade tem o proprio previsto (o contrato do posto). Trazer o
  "falta" da apuracao para ca faria as duas telas se contradizerem num dia em
  que a grade mostra folga.
- **As batidas vao para o dia do turno, e nao do calendario** (`atribuirBatidas()`),
  com a regra da apuracao: num turno que vira o dia, batida do dia seguinte antes
  da entrada fecha o turno da vespera. A hora de corte sai da vigencia da turma;
  na linha com sigla propria (cujo previsto nao tem horario), da escala
  cadastrada da pessoa — a mesma que o ponto usa. Sem isso, o 06:00 de um 12x36
  noturno cairia no dia de folga e a grade acusaria "bateu na folga" um dia sim,
  um dia nao.
- **Fora da janela importada nao ha sinal nenhum.** Depois do ultimo arquivo,
  "sem batida" e "ainda nao importado", e nao ausencia — mesma regra da
  `janelaApurada()`. Freelancer nao bate ponto e nunca ganha sinal. Dia com
  contraparte nao acusa "trabalho sem batida": o `TE` ou a troca dizem que outra
  pessoa cobriu o turno.
- **O sinal usa a celula atual.** Ele e calculado na tela, com o que a camada de
  sessao ja desenhou: preencher o dia apaga o ponto no mesmo clique, sem esperar
  leitura nova. As batidas vem com `obterGrade()`, numa consulta so por posto.
- **O historico e por celula, e fica atras dela** (`preenchimento_alteracoes`).
  A grade continua sendo uma sigla por dia; quem quer saber quem mudou o que, e
  quando, abre o dia. E assim que a alteracao fica guardada sem atrapalhar a
  leitura do mes.
- **O freelancer nasce na inclusao, sem cadastro previo.** Exigir outra tela
  antes de escalar quem apareceu hoje travaria o caso de uso. O que a action nao
  faz e criar dois com o mesmo nome: procura por `lower(nome)` e reaproveita,
  gravando o codigo so quando o cadastro e novo — reescreve-lo transformaria uma
  inclusao em edicao silenciosa.
- **A mesma pessoa nao entra duas vezes no mesmo bloco, mas entra em outra
  funcao.** E assim que uma troca de posto no meio do mes e registrada, com um
  bloco encerrando e o outro comecando. Os indices unicos sao **parciais**
  porque uma das duas colunas de dono e sempre nula, e `null` nao repete.
- **Retirar alguem do bloco e a unica exclusao do modulo**, pela mesma razao do
  afastamento: incluir a pessoa errada e engano de digitacao, e enquanto a linha
  existir ela ocupa um lugar na escala do posto. As celulas vao junto
  (`cascade`) — sem a linha, sao dias sem dono. O cadastro do freelancer fica.
- **Os botoes por linha ficam fora da grade.** `<form>` dentro de `<form>` nao
  existe em HTML, e separar evita que retirar alguem por engano leve junto o que
  ainda nao foi salvo nas celulas.
- **Os totais do rodape sao calculados a cada leitura**, nunca gravados: mudou
  uma celula, mudou o total. Mesma razao pela qual a apuracao do ponto nao tem
  coluna de falta.

### Conferencia de horas extras

A apuracao do ponto **calcula** a hora extra a partir da marcacao contra a
escala; esta tela **registra** a que foi reconhecida: quem fez, em que horario,
em que posto, em que local e o que explica o dia. E uma entrada, e nao uma
consequencia — por isso e a unica hora extra que o portal grava.

| Arquivo                      | Papel                                                |
| ---------------------------- | ---------------------------------------------------- |
| `extras/colaborador.ts`      | o par origem+id que o campo de pessoa carrega (puro) |
| `extras/queries.ts`          | `listarExtras`, `obterExtra`, `listarColaboradores`  |
| `extras/actions.ts`          | `registrarExtra`, `atualizarExtra`, `excluirExtra`   |
| `src/db/schema/extras.ts`    | `extras`                                             |
| `src/app/(portal)/extras/**` | lista com busca, registro e edicao                   |

Regras:

- **O extra e dado datado**, ao contrario de escalas, postos e funcionarios:
  toda leitura comeca por `competenciaEmVigor()` e toda escrita por
  `competenciaDeEscrita()`. `null` significa "nao ha o que mostrar" — sem
  competencia aberta a tela e o aviso, e o botao de registrar nem aparece.
- **A competencia sai da data do extra, e nao da que estava aberta na hora de
  digitar.** A action recusa dia fora do periodo, pelo mesmo motivo da carga de
  marcacoes: gravar 21/09 dentro de agosto o esconderia de setembro para
  sempre.
- **A duracao nao e coluna.** Ela sai de `hora_entrada` e `hora_saida` a cada
  leitura, pela mesma `duracaoEmMinutos()` das escalas — inclusive a virada da
  meia-noite (`saida < entrada`). O total do rodape e a soma do **filtro
  inteiro**, e nao da pagina: quem confere quer saber quanto o periodo tem.
- **O colaborador e um funcionario ou um freelancer**, nunca os dois e nunca
  nenhum (`check extras_uma_pessoa`), com o mesmo par de colunas de
  `preenchimento_linhas`. O campo e um so: o valor carrega a origem junto do id
  (`f:` e `l:`, os mesmos prefixos do modal do dia da grade).
- **O freelancer nasce no proprio formulario**, como na inclusao da grade e pela
  mesma razao — quem cobre um extra as vezes e justamente quem nao esta na
  folha. Nome que ja existe reaproveita o cadastro (`lower(nome)`), e nao cria
  um homonimo. Escolher da lista **e** digitar um nome novo e recusado: com os
  dois preenchidos nao ha como saber qual deles a pessoa quis.
- **Posto e cadastro; local e texto.** O posto e FK (`restrict`) porque ja
  existe como cadastro e e por ele que a operacao se organiza; o local e o
  complemento que o posto sozinho nao da ("Portaria 2", "Fortaleza II") e que
  muda de nome antes de virar cadastro.
- **O mesmo extra nao entra duas vezes**: indice parcial unico por
  `(pessoa, data, posto, hora_entrada)`. Dois extras no mesmo dia continuam
  valendo — basta comecarem em horarios diferentes.
- **O extra tem duas origens e uma so tabela.** O digitado nesta tela e o que
  nasceu de uma cobertura marcada no modal do preenchimento vivem na mesma
  `extras` e somam na mesma lista — o segundo com o selo **Grade** e com
  `preenchimento_dia_id` preenchido. Duas telas que se completassem dariam duas
  respostas para "quanto se deve neste periodo?". O selo muda o que a tela
  **avisa**, e nao o que ela deixa fazer: o extra da grade se edita e se apaga
  como outro qualquer, mas regravar aquele dia o reescreve.
- **Extra se apaga**, ao contrario de escala, posto e evento. E a mesma razao do
  afastamento: e uma entrada, e nao um fato ja interpretado — enquanto a linha
  errada existir, ela continua somando horas que ninguem fez. A exclusao termina
  em `redirect()` na propria action, porque a tela aberta e a do extra que
  deixou de existir.
- **A edicao aceita manter o posto ou a pessoa que ja estavam gravados, mesmo
  desativados** — e a tela os acrescenta a lista por isso. Sem essa folga,
  corrigir a observacao de um extra antigo esbarraria num cadastro que nao tem
  nada a ver com a correcao; **trocar** por outro continua exigindo cadastro
  ativo.
- **Filtros sao parametros da URL, como a busca** (`?posto=`, `?de=`,
  `?ate=`, `?tipo=`, `?origem=`), lidos de uma vez por `filtrosExtrasSchema`
  com um `catch` por campo: filtro torto e "sem esse filtro", e um recusado nao
  derruba os outros. Eles **somam** com a competencia, nunca a substituem — data
  de outro periodo so nao encontra nada. "De" depois de "ate" troca as pontas.
  `hrefDosExtras()` carrega todos em cada link de pagina, e filtrar de novo
  volta para a primeira. O filtro de posto lista **os postos que tem extra na
  competencia** (`listarPostosComExtra()`), e nao os ativos: posto sem extra so
  levaria a tela vazia, e posto desativado depois de receber extras precisa
  continuar filtravel. Com filtro, o total do rodape diz "neste recorte".
- **Busca e pagina moram na URL (`?busca=`, `?pagina=`) e recortam no `select`**,
  como em escalas. A busca casa com tudo o que a linha mostra — colaborador,
  matricula ou codigo, posto, local, observacao e a data no formato da tela
  (`to_char(data, 'DD/MM/YYYY')`) —, e `%`/`_` sao escapados no termo.

### Movimentacoes (faltas e trocas)

O registro das faltas, trocas internas e trocas de escala da competencia: o
tipo, a data, a justificativa, as pessoas envolvidas e os documentos (atestado,
print da conversa da troca). Uma tela so — lista com filtros e um modal que
registra e edita.

| Arquivo                             | Papel                                                           |
| ----------------------------------- | --------------------------------------------------------------- |
| `movimentacoes/arquivos.ts`         | tipos aceitos, assinatura e limites dos documentos (puro)       |
| `movimentacoes/compressao.ts`       | reducao da imagem no navegador (client)                         |
| `movimentacoes/documentos.ts`       | conferencia e gzip no servidor (`server-only`)                  |
| `movimentacoes/queries.ts`          | `listarMovimentacoes`, `...ParaExportar`, `abrirDocumento`      |
| `movimentacoes/actions.ts`          | `salvarMovimentacao` (registro e edicao), `excluirMovimentacao` |
| `movimentacoes/busca.ts`            | a busca de pessoa do modal, com o acesso desta area             |
| `movimentacoes/exportacao.ts`       | a planilha `.xlsx` (`server-only`)                              |
| `preenchimento/procura.ts`          | a consulta de pessoa que as duas buscas compartilham            |
| `src/db/schema/movimentacoes.ts`    | `movimentacoes` + `movimentacao_pessoas` + `..._documentos`     |
| `src/app/(portal)/movimentacoes/**` | a lista, o download do documento e a exportacao                 |

Regras:

- **A movimentacao e dado datado**: leitura por `competenciaEmVigor()`, escrita
  por `competenciaDeEscrita()`, e a data precisa cair no periodo (a action tem
  data, entao nao precisa do campo escondido `competenciaId`).
- **E registro, e nao leitura: nao alimenta nada.** Registrar uma falta nao
  muda a grade, nao encerra ocorrencia do ponto e nao lanca falta no
  apontamento — mesma convivencia do extra com a apuracao.
- **O tipo decide quem a movimentacao pede.** Falta: quem faltou (obrigatorio)
  e quem cobriu (opcional, nunca o mesmo). Trocas: de 2 a 6 envolvidos, no
  mesmo pe (`papel = envolvido`) — numa troca nao ha quem "saiu" e quem
  "entrou". Pessoas sao funcionarios ou freelancers, com o mesmo par `f:`/`l:`
  de extras e da grade.
- **Pessoas numa tabela filha**, e nao colunas: a troca tem duas ou mais, e a
  busca por nome precisa alcancar todas (`exists`, e nao `join`, para nao
  repetir a linha).
- **Documento entra por arrastar e soltar, colar (Ctrl+V) ou seletor — nunca
  por link.** Link aponta para fora e apodrece; o atestado precisa estar no
  portal.
- **A imagem e reduzida no navegador**, antes do envio: 1800 px no maior lado,
  WebP 0,72 (JPEG se o navegador nao codificar WebP). Reduzir no servidor
  pediria `sharp`, com o install script que o npm 12 bloqueia — e a foto de
  10 MB nem precisa atravessar a rede. Se a reducao sair maior que o original
  (print pequeno), vale o original.
- **O servidor nao confia na reducao.** Confere de novo o tamanho (2 MB por
  arquivo, 4 por movimentacao) e o tipo **pelos primeiros bytes** (JPEG, PNG,
  WebP, PDF) — nunca pela extensao nem pelo `type` do navegador. Tenta `gzip` e
  so o guarda se economizar 5%: JPEG e WebP ja vem comprimidos, PDF varia.
- **O arquivo mora no banco** (`bytea`), como o PDF do comprovante: entra no
  backup, sai junto com a movimentacao (`cascade`) e nao depende de pasta que o
  deploy por tar teria de preservar.
- **O envio monta o `FormData` a mao** (`onSubmit` + `startTransition`), e nao
  por `<form action>`: os arquivos reduzidos moram no estado da fila, e nao num
  `input[type=file]`. Bonus: o React nao reseta o formulario, e a recusa
  preserva o que foi digitado.
- **O limite de documentos e conferido quando o arquivo fica pronto**, e nao
  quando entra: um `.txt` recusado depois nao pode ter tomado a vaga de um PDF
  bom. O que passa do limite fica listado como recusado, e nao some.
- **Nenhuma escrita antes da ultima conferencia.** A recusa e valor devolvido
  pelo callback da transacao, e valor devolvido **nao** desfaz a transacao — so
  excecao desfaz. Por isso a edicao conta os documentos que ficam
  (`notInArray`) em vez de apagar os marcados primeiro.
- **Quem ja estava na movimentacao vale mesmo desativado**; pessoa nova precisa
  estar ativa. Mesma folga da edicao de extras.
- **Movimentacao se apaga**, com pessoas e documentos: e entrada, como o extra.
  O botao pede segundo clique.
- **O documento abre `inline`, so na competencia em vigor**, com o tipo gravado,
  `nosniff` e `no-store` — atestado e dado de saude.
- **Filtros na URL** (`?busca=`, `?tipo=`, `?de=`, `?ate=`, `?documento=`,
  `?pagina=`), com as regras de extras (`catch` por campo, pontas trocadas). A
  exportacao usa o mesmo `filtroDaLista()` da tela, sem paginar.

### Efetivos (lancamento diario)

O efetivo de cada posto no dia — quem esteve, em que local e em que horario —,
lancado a partir do que chega pelo WhatsApp, com as excecoes do dia. A consulta
semanal entrega isso organizado para quem monta a escala.

| Arquivo                                           | Papel                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `efetivos/types.ts`                               | area, rotas, catalogo dos comportamentos e estado dos formularios         |
| `efetivos/horario.ts`                             | "0730" -> 07:30 e o intervalo do turno que vira o dia (modulo puro)       |
| `efetivos/queries.ts`                             | catalogos, postos, locais por uso no posto e a lista do dia               |
| `efetivos/actions.ts`                             | catalogos, `salvarLancamento`, `excluirLancamento`, freelancer na hora    |
| `efetivos/busca.ts`                               | a busca de pessoa, com o acesso desta area                                |
| `efetivos/components/caixa-de-busca.tsx`          | campo que e a propria busca (posto, pessoa, local)                        |
| `efetivos/components/campo-pessoa-do-efetivo.tsx` | busca de pessoa no servidor + "Inserir como freelancer"                   |
| `efetivos/rascunho.ts`                            | monta o rascunho "Copiar da mesma equipe (D-2)", sem gravar               |
| `efetivos/components/copiar-d2.tsx`               | o botao, o rascunho com caixas e a confirmacao                            |
| `efetivos/conflitos.ts`                           | turno, sobreposicao com virada do dia e conflitos do dia (modulo puro)    |
| `efetivos/components/painel-do-dia.tsx`           | postos sem efetivo, faltas e conflitos da data                            |
| `efetivos/components/aviso-de-conflito.tsx`       | o aviso que pede "Lancar mesmo assim"                                     |
| `efetivos/semana.ts`                              | semana de segunda a domingo e a grade por posto (modulo puro)             |
| `efetivos/exportacao.ts`                          | a planilha da semana: abas Semana e Lancamentos (`server-only`)           |
| `efetivos/components/grade-da-semana.tsx`         | a grade de um posto na semana                                             |
| `src/db/schema/efetivos.ts`                       | `locais` + `efetivo_tipos` + `efetivos` (os lancamentos)                  |
| `src/app/(portal)/efetivos/**`                    | lancamento, consulta semanal (`/semana` + `/semana/exportar`) e cadastros |

Regras:

- **Reaproveita funcionarios, postos e freelancers.** A pessoa do lancamento e
  `f:`/`l:` como em extras, movimentacoes e na grade; nada de flag de
  freelancer no funcionario.
- **Local e lista global, e nao funcao do posto.** A funcao e o contrato do
  posto (ciclo, vigencias); o local e so o "onde" do lancamento, igual para
  todos. A ordem no lancamento sai do uso do posto, e nao de coluna.
- **Tipo de excecao e tabela propria, e nao `eventos`.** Eventos sao as siglas
  da grade; misturar ofereceria "D" e "F" como excecao. O que cada tipo faz e o
  `comportamento` (enum: `falta_sem_cobertura`, `cobertura`, `troca`,
  `simples`) — tipo novo escolhe um deles e nao pede migration.
- **O comportamento nao muda depois de criado.** Ele decide como os lancamentos
  ja gravados sao lidos; a edicao so renomeia e (des)ativa.
- **Os cadastros iniciais vem na migration** (`0039`), com `on conflict do
nothing`, para chegarem tambem a producao.
- **Nada e apagado; local e tipo sao desativados**, pela mesma razao de postos
  e eventos.
- **E registro, e nao alimenta nada** (grade, movimentacoes, extras), como as
  movimentacoes.
- **O lancamento vale por data, e nao por competencia** — como os afastamentos.
  O D-2 do dia 21 cai na competencia anterior, e a semana atravessa a virada;
  nenhuma leitura ou escrita do lancamento passa por `competenciaEmVigor()`.
- **Data e posto moram na URL** (`?data=&posto=`): sao eles que decidem a lista
  e a ordem dos locais, que o servidor le. A tela ajusta o estado no render
  quando a URL muda por fora (menu, voltar).
- **O campo de busca e o proprio `<input>`** (`CaixaDeBusca`), e nao o botao com
  popover de `CampoPessoa`: lanca-se dezenas por dia, e abrir antes de digitar
  seria uma tecla a mais por pessoa. Enter e Tab escolhem o destacado so depois
  de digitar ou usar as setas — atravessar um campo preenchido nao troca o valor.
- **O foco anda na hora** (`focus()` sincrono, nao `requestAnimationFrame`):
  quem digita rapido ja esta na tecla seguinte, e o "07" cairia no local.
- **O horario normaliza no blur lendo o estado, e nao o DOM**: depois de
  adicionar, o foco salta para a pessoa antes de o React redesenhar os campos
  limpos, e o `blur` reescreveria o valor velho.
- **Excluir: botao sempre `submit`, o primeiro clique cancela o envio.** Trocar
  o `type` no clique nao serve — o React redesenha antes de o navegador executar
  o clique, e o primeiro clique ja apagava.
- **Freelancer nasce no campo de pessoa**, com o mesmo criterio de nome
  (`lower(nome)`) da grade e dos extras; desativado nao e reativado em silencio.
- **Quem lancou e quem editou ficam na linha** (`criado_por`/`atualizado_por`).
- **O que a excecao pede sai do comportamento do tipo, lido do banco** — e nao
  de campo do formulario. Cobertura: quem faltou (obrigatorio, nunca a propria
  pessoa). Troca: com quem trocou **ou** de qual posto veio. Falta sem
  cobertura e simples: so o tipo e a observacao. O que o tipo nao aceita e
  descartado na action, mesmo que chegue no POST.
- **A falta de quem foi coberto e lida, e nao gravada**: e a contraparte da
  linha de cobertura. Faltas do dia = linhas `falta_sem_cobertura` (a pessoa da
  linha) + contrapartes de `cobertura`. Nenhuma segunda linha a divergir.
- **A edicao grava a excecao inteira**: desmarcar a caixa limpa tipo,
  contraparte, origem e observacao. Trocar de tipo no formulario limpa os
  detalhes do anterior.
- **O botao Adicionar fica depois da excecao**, e nao ao lado da saida: e a
  ordem do Tab (saida, Tab, Espaco marca a excecao). Enter na caixa e no
  `<select>` envia por `requestSubmit()` — nenhum dos dois envia sozinho.
- **D-2 e rascunho, e nao gravacao.** `montarRascunhoDaEquipe()` (em
  `efetivos/rascunho.ts`) le o posto em D-2 e devolve a equipe base sem gravar;
  `confirmarRascunho()` grava as marcadas numa transacao, com `on conflict do
nothing` (quem ja foi lancado com a mesma entrada fica como esta) e pulando
  quem foi desativado.
- **Equipe base = quem e da escala, e nao quem estava la.** Linha sem excecao
  entra; na cobertura entra **quem faltou** (e da equipe), e nao quem cobriu;
  na falta sem cobertura entra quem faltou. Troca, dobra, folga trabalhada e
  os demais simples nao entram — sao listados como "nao copiados". Nenhuma
  excecao e copiada.
- **Conflito de horario pede confirmacao, e nao recusa.** A dobra legitima
  existe; a action devolve `conflitos` sem gravar, e o reenvio com
  `confirmarConflito=1` grava. Vale para o lancamento e para o rascunho de D-2.
- **O conflito e calculado em minutos absolutos** (`efetivos/conflitos.ts`,
  modulo puro): os turnos de D-1 a D+1 sao comparados contra uma data de
  referencia, e o 19:00-07:00 de ontem vira [-300, 420) visto de hoje.
  Encostar nao e conflito. Cada lancamento vira o turno da pessoa (ausente na
  falta sem cobertura) e, na cobertura, tambem o turno **ausente** de quem
  faltou: presente contra ausente e conflito ("consta como falta"); dois
  ausentes nao. A contraparte da troca nao vira turno — o que ela fez no
  horario e incerto.
- **O botao do aviso foca quando o envio termina**, e nao com `autoFocus`: o
  aviso nasce dentro da resposta da action, com o envio pendente e o botao
  `disabled`, e botao desabilitado nao recebe foco.
- **O painel do dia e uma leitura so** (`obterPainelDoDia`): postos ativos sem
  lancamento, faltas (dos mesmos turnos do conflito) e os conflitos ja gravados.
- **A semana e de segunda a domingo** (`segundaDaSemana()`, em UTC, sem fuso
  no caminho) e qualquer dia dela serve de `?semana=`. Filtros na URL e GET
  comum, como em extras e movimentacoes.
- **A grade da semana sai de uma funcao so** (`montarSemana()`, em
  `efetivos/semana.ts`): a tela e a planilha nunca divergem no que poem numa
  celula. A falta coberta entra na linha de quem faltou, lida da contraparte.
- **`listarLancamentos({ de, ate, postoId })` e a leitura unica** dos
  lancamentos: a lista do dia, a semana e a exportacao usam a mesma.
- **A planilha tem duas abas**: Semana (a grade, com as cores da tela) e
  Lancamentos (uma linha por lancamento, com filtro automatico e data como
  data de verdade). Route Handler GET, `no-store`, como as outras exportacoes.
- **Tabelas largas ficam em `w-0 min-w-full`** e rolam dentro da secao: o
  `main` do layout e item de flex e cresceria ate a largura minima delas. A da
  semana e `table-fixed`, para os dias alinharem de um posto para o outro.
- **O campo de pessoa e um so** (`CampoPessoaDoEfetivo`), para quem esta no
  posto e para a contraparte; so o primeiro cadastra freelancer.

### Apontamentos (fechamento da folha)

O apontamento e o que cada funcionario tem a receber ou a descontar na
competencia — VT, VR, cesta basica, horas extras de 50/60/100%, adicional
noturno, intrajornada, insalubridade, periculosidade, assiduidade, gratificacao,
faltas e DSR —, lancado por quem fecha a folha com o espelho de ponto ao lado.
**O portal nao calcula salario**: registra as quantidades que a folha vai valorar.

| Arquivo                                                        | Papel                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `apontamentos/rubricas.ts`                                     | catalogo das rubricas, unidade, leitura e escrita (modulo puro) |
| `apontamentos/espelho.ts`                                      | a apuracao do ponto resumida nas rubricas (modulo puro)         |
| `apontamentos/queries.ts`                                      | `listarApontamentos`, `obterApontamento`                        |
| `apontamentos/actions.ts`                                      | `salvar/limparApontamento`, `limparApontamentosDaCompetencia`   |
| `apontamentos/exportacao/planilha.ts`                          | as colunas da planilha, na ordem da folha (modulo puro)         |
| `apontamentos/exportacao/relatorio.ts`                         | totais e agrupamento do relatorio (modulo puro)                 |
| `apontamentos/exportacao/excel.ts`                             | gera o `.xlsx` com `exceljs`, `server-only`                     |
| `apontamentos/exportacao/word.ts`                              | gera o `.docx` com `docx`, `server-only`                        |
| `apontamentos/exportacao/dados.ts`                             | `listarApontamentosParaExportar` (apontados + postos da grade)  |
| `apontamentos/exportacao/resposta.ts`                          | o download: acesso, recorte, gerador e cabecalhos               |
| `src/db/schema/apontamentos.ts`                                | `apontamentos` + enum `insalubridade_grau`                      |
| `src/app/(portal)/apontamentos/**`                             | lista da competencia e a ficha de cada pessoa                   |
| `src/app/(portal)/apontamentos/exportar/{word,excel}/route.ts` | os dois downloads (`GET`)                                       |

Regras:

- **O apontamento e dado datado**: toda leitura comeca por
  `competenciaEmVigor()` e toda escrita por `competenciaDeEscrita()`. A
  competencia e a aberta — o apontamento nao tem data propria que a decida.
- **Uma linha por funcionario e competencia, com uma coluna por rubrica**, e nao
  uma tabela de lancamentos `(tipo, quantidade)`. Cada rubrica tem unidade
  propria (dias, minutos, grau, percentual, sim/nao), e numa coluna so de
  quantidade o "12" nao diria qual — nem teria `check` da propria unidade.
  Rubrica nova custa migration **e** entrada no catalogo de `rubricas.ts`; o
  `Record<Rubrica, ...>` quebra o typecheck se a segunda faltar, e e o catalogo
  que desenha o formulario, o resumo da lista e a leitura do `FormData`.
- **Horas sao minutos inteiros, digitados `HH:MM`**, sem decimal: "1,30" e lido
  ora como hora e meia, ora como uma hora e trinta. O campo e texto, e nao
  `type="time"`, porque horas do mes passam de 23:59. O percentual aceita
  virgula — ele nao tem minutos para confundir.
- **Insalubridade e grau, e nao sim/nao** (`minimo`/`medio`/`maximo`, `null` =
  nao tem): e o grau que a folha precisa para lancar o adicional.
- **Apontamento vazio nao e gravado** (`check apontamentos_nao_vazio`). Salvar
  com tudo em branco apaga a linha, e a ausencia dela ja diz "nada apontado" —
  mesma regra da celula da grade. A observacao sozinha conta: "conferido, nada a
  lancar" e um apontamento.
- **O formulario manda o apontamento inteiro**, e nao a diferenca: campo vazio e
  zero. Um POST por pessoa, com `on conflict (competencia_id, funcionario_id) do
update` — duas pessoas salvando juntas terminam com a ultima gravacao, e nao
  com um erro de unicidade.
- **Os dias nao passam do tamanho da competencia**, e as faltas somadas tambem
  nao. O `check` do banco so conhece o teto de 31; o periodo, so a action.
- **O espelho de ponto e referencia, e nunca preenchimento.** `resumirEspelho()`
  soma o que `apuracao.ts` ja concluiu dia a dia (saldo dos dias `hora_extra`,
  horas dos dias `trabalho_em_folga`, intrajornada que faltou nos dias
  `intrajornada_curta`, minutos entre 22h e 5h dos dias pareados) e o cartao os
  mostra ao lado. A apuracao nao sabe se a hora e 50%, 60% ou 100%, nem se a
  falta foi abonada — quem fecha a folha decide. Nada vai para os campos.
- **O noturno do espelho e hora de relogio**, sem a hora reduzida de 52min30s:
  reduzir ja seria calcular. Ele conta minuto a minuto, porque o par e o
  intervalo noturno podem virar a meia-noite, e as combinacoes sao onde uma
  intersecao de intervalos erra.
- **A lista parte de `funcionarios`, e o `left join` prende a competencia no
  `on`.** No `where`, quem nao tem apontamento sumiria — e e justamente essa a
  fila. Sem `?inativos=1` ela traz os ativos **e** qualquer inativo que ja tenha
  apontamento: quem saiu no meio do periodo ainda pode ter o que receber, mas
  nao deve engordar a fila de todo mes. As contagens de apontados e pendentes
  ignoram o filtro, como o "sem escala" de funcionarios.
- **O resumo do espelho aparece a quem tem a area de apontamentos**, porque e
  parte do trabalho de apontar; o dia a dia continua sendo da area de ponto, e o
  link para ele so aparece a quem a tem.
- **A chave do formulario muda a cada recusa** (`tentativa`). O checkbox do Radix
  volta ao valor da montagem quando o React reseta o formulario depois da action;
  sem remontar, a marcacao recusada sumiria junto com o erro que a explicava.
- **"Remover apontamento" e outro gesto**, e nao "esvaziar e salvar", pela mesma
  razao do "Apagar este dia". Apontamento e entrada, como o extra: lancado na
  pessoa errada, a linha diria a folha que ha o que pagar.
- **"Limpar competencia" apaga todos os apontamentos do periodo, com
  confirmacao num modal.** E o recomeco do fechamento (lote gerado com regra
  errada, horas importadas no periodo errado). Ignora busca e empresa da lista:
  o modal diz o numero da competencia inteira, e e esse numero que volta no
  formulario (`quantidade`). A action apaga numa transacao e desfaz se o
  `returning` trouxer outro numero — confirmar "apagar 40" nao pode apagar 41.
  O modal so fecha quando a resposta volta: `<form>` desmontado no meio do
  envio nao chega a Server Action.

Exportacao:

- **Dois formatos, dois leitores.** O Excel e para **importar** na folha: uma
  linha por funcionario, cabecalho na linha 1, sem titulo acima nem total
  abaixo — toda linha que nao fosse funcionario teria de ser apagada a mao. O
  Word e para **ler**: totais da competencia, depois cada empresa e cada pessoa
  com as rubricas que ela tem **em texto corrido** ("Beneficios: vale-transporte
  (22 dias), vale-refeicao (22 dias) e cesta basica."), uma frase por grupo, e a
  observacao.
- **As colunas da planilha seguem o layout da folha, e nao o catalogo de
  rubricas**, com os cabecalhos exatamente assim: CÓDIGO, COLABORADOR, EMPRESA,
  POSTO DE TRABALHO, CARGO, VT, VR, H.EXTRA (50%)/(60%), INTRAJORNADA,
  H.EXTRA (100%), ADN, FALTAS, GRAT, PERICULOSIDADE, VA, ASSIDUIDADE,
  OBSERVAÇÕES. Tres juntam rubricas: H.EXTRA (50%)/(60%) soma as duas, FALTAS
  soma escala e folga, VA e a cesta basica. Onde o cabecalho abreviado nao diz o
  que a coluna e (FALTAS, VA, ADN, GRAT, POSTO), vai **nota no cabecalho**.
  Insalubridade e desconto de DSR nao tem coluna — estao no Word. Mudar o layout
  e mexer so em `COLUNAS_DA_PLANILHA`.
- **Formato da planilha: fonte 7 no documento inteiro**, e a primeira linha com
  o texto **na vertical, de baixo para cima** (`textRotation: 90`), fundo preto e
  fonte branca. `90` gira no sentido anti-horario; `"vertical"` empilharia as
  letras, que e outra coisa. A fonte chega as linhas pelo **estilo da coluna** —
  o `exceljs` aplica o estilo da coluna a toda celula criada depois —, e a altura
  do cabecalho sai do titulo mais longo. Com o titulo de pe, as colunas numericas
  so precisam caber o valor, e as dezessete cabem numa pagina.
- **Word: todo o texto preto, e so o nome do colaborador em negrito** (por
  enquanto). Os estilos de titulo do Word vem com cor de tema e negrito, entao a
  cor e o negrito sao fixados nos **estilos** (titulo, niveis 1 a 6 e hiperlink,
  inclusive os nao usados — quem aplicar "Titulo 2" depois nao ve o azul voltar)
  **e** em cada trecho, com `bold: false` explicito. O cabecalho da tabela de
  resumo se distingue pelo fundo cinza, e nao por negrito.
- **Horas vao como duracao, e nao como texto**: fracao de dia com formato
  `[h]:mm`, para a folha poder somar a coluna. O `[h]` e o que impede o Excel de
  zerar a contagem a cada 24 horas (55:10 de noturno sairia 07:10). Zero e "nao"
  ficam em branco, como na tela.
- **O posto sai da grade da competencia**, e nao do cadastro: o funcionario nao
  tem posto — ele e escalado numa funcao de um posto a cada periodo, e pode estar
  em dois. Quem nao esta em grade nenhuma sai com a coluna vazia.
- **A exportacao e dos apontados**, respeitando a busca e a empresa da lista
  (`recorteDaBusca()`, o mesmo filtro das duas). Status, inativos e pagina nao
  entram: "sem apontamento" nao tem o que exportar, e o arquivo nao pagina.
- **Download e Route Handler, e nao Server Action**: e `GET` de um arquivo, e um
  `<a href download>` baixa sem JavaScript e com o nome certo. O link e `<a>`, e
  nao `Link` — o `Link` tentaria navegar e fazer prefetch de um arquivo. A rota
  chama `exigirAcesso()` como uma pagina, porque nao passa por layout nenhum.
- **Exporta a competencia em vigor**, e nao so a aberta: exportar e leitura, e
  quem consulta uma competencia encerrada baixa o que esta vendo (o Word avisa).
- **`Cache-Control: private, no-store`**: e dado de folha, e nenhum cache
  intermediario guarda uma copia.

### Regras de apontamento (o que a grade vira em rubrica)

A grade diz quem cobriu cada dia; a regra diz o que aquilo vale na folha — um
dia trabalhado que paga VT, o dia sem intervalo que vira hora, a empresa que
sempre paga periculosidade. O resultado e **sugestao**: quem grava continua
sendo quem fecha a folha.

| Arquivo                                   | Papel                                                           |
| ----------------------------------------- | --------------------------------------------------------------- |
| `apontamentos/regras/campos.ts`           | rubrica, gatilho e acao — a ponte com o enum do banco (puro)    |
| `apontamentos/regras/calculo.ts`          | as regras aplicadas aos dias de uma pessoa (modulo puro)        |
| `apontamentos/regras/descricao.ts`        | como a regra se le na tela (modulo puro)                        |
| `apontamentos/regras/queries.ts`          | o cadastro e `sugestoesDaCompetencia` / `sugestaoDoFuncionario` |
| `apontamentos/regras/actions.ts`          | `criar/atualizar/excluirRegra`, `gerarApontamentos`             |
| `src/db/schema/regras-apontamento.ts`     | `regras_apontamento` + `regra_apontamento_excecoes` + enums     |
| `src/app/(portal)/apontamentos/regras/**` | lista, cadastro e edicao das regras                             |

Regras:

- **A sugestao e derivada a cada leitura, e nunca acumulada.** Somar `+1 VT`
  dentro do `salvarDia` da grade gravaria a conclusao: corrigir a celula depois
  deixaria o VT do mes errado para sempre. Mesma razao do previsto da grade e da
  apuracao do ponto — e por isso preencher a escala nao escreve em apontamento
  nenhum.
- **Ela vira linha por gesto**: o botao "Usar a sugestao" na ficha (que escreve
  nos **campos**, como o "Igual ao previsto" do modal do dia) e o "Gerar pelas
  regras" da lista, que grava **so para quem ainda nao tem apontamento** — o
  lancado a mao vale mais que o lote, como em `preencherDias`. Quem ja tem
  aparece marcado como "difere da sugestao", e a ficha mostra os dois lados.
- **A regra e cadastro, e nao dado datado.** Nenhuma query do cadastro chama
  `competenciaEmVigor()`; datada e a leitura da grade que ela alimenta.
- **O escopo e uma conjuncao, e coluna nula nao filtra.** Empresa, cargo e
  pessoa olham o cadastro; posto, funcao, turma, sigla, ciclo e jornada olham o
  **dia** — a pessoa cobre dois postos no mesmo mes, e o contrato da funcao
  troca no meio do periodo.
- **Ciclo e um par: tamanho e quantidade de folgas.** Um 5x1 e um ciclo de 6
  dias com 1 folga e o 12x36 e um ciclo de 2 com 1 folga — filtrar so pelas
  folgas daria as tres horas extras do 5x1 a quem faz 12x36. O `check
regras_apontamento_ciclo_completo` obriga os dois juntos.
- **A excecao e tabela, e nao "exceto empresa X" numa coluna.** E ela que faz
  "todas as empresas menos a LC" caber numa regra so, em vez de uma regra por
  empresa; e e assim que o adicional noturno ganha excecao por pessoa.
- **A ordem do cadastro e a ordem da aplicacao**, e nao "a regra mais especifica
  vence": `definir` sobrescreve o que as anteriores acumularam, e quem le a
  lista de cima para baixo ve o que vai acontecer. Heuristica de especificidade
  seria mais curta de escrever e impossivel de conferir na tela.
- **Marcacao e grau so aceitam `definir`**: "periculosidade duas vezes" nao quer
  dizer nada. O Zod recusa a soma, e o `check regras_apontamento_um_valor`
  guarda a outra metade — uma regra tem um valor so, na unidade da rubrica.
- **O dia sem celula nao dispara gatilho nenhum**, mas continua existindo na
  conta: os dias vem do periodo inteiro, e nao so das celulas preenchidas. E o
  que faz a regra `fixo` valer para quem esta escalado com a grade em branco.
- **Quem nao esta na grade nao tem sugestao.** A regra le o preenchimento, entao
  funcionario sem linha em posto nenhum continua sendo apontado a mao.
- **A sugestao nunca toca a observacao**: ela e do humano que fechou a folha, e
  por isso tambem fica de fora da comparacao que marca "difere da sugestao".
- **A lista deriva so a sugestao de quem ela mostra.** A varredura e por pessoa
  e por dia do periodo, e derivar a competencia inteira para marcar vinte linhas
  jogava fora quase tudo o que calculava — por isso `sugestoesDaCompetencia()`
  recebe os funcionarios da pagina e corta a leitura da grade com `inArray`. A
  ficha pede a sugestao de uma pessoa so, pelo mesmo caminho.
- **A memoizacao e por chave de texto, e nao pela lista.** `cache()` do React
  compara argumento por identidade, e um array novo a cada chamada nunca
  acertaria: `derivarSugestoes()` recebe os ids ordenados num `join(",")`, e e
  isso que faz a lista e a ficha reusarem a mesma derivacao na requisicao.

### Autenticacao

Implementacao propria em `src/features/auth/` (sem NextAuth/Auth.js: o portal
tem um provedor unico — login e senha no proprio banco — e a dependencia nao
pagaria por si).

| Arquivo             | Papel                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| `session.ts`        | ciclo de vida da sessao: token, cookie, revogacao (`server-only`)                  |
| `login-lembrado.ts` | cookie de conveniencia com o ultimo login, para preencher o campo                  |
| `queries.ts`        | a DAL: `obterUsuarioAtual`, `exigirUsuario`, `exigirAcesso`, `exigirAdministrador` |
| `actions.ts`        | `entrar`, `trocarSenha`, `sair`                                                    |
| `src/proxy.ts`      | checagem otimista (so a presenca do cookie) + `?redirecionar=`                     |
| `src/lib/senha.ts`  | hash scrypt e senha provisoria, compartilhados com o script de seed                |

Regras:

- **A autorizacao mora na DAL, nao no proxy.** O `src/proxy.ts` roda em toda
  navegacao (inclusive prefetch) e por isso nao toca no banco: ele so redireciona
  quem nem cookie tem. Sessao viva, usuario ativo e senha ja trocada sao
  verificados em `exigirUsuario()`, perto dos dados.
- **Toda rota autenticada e toda Server Action chamam `exigirUsuario()`.** Um
  layout com a checagem nao basta: layout nao roda em toda navegacao e Server
  Action nenhuma passa por ele. A DAL e memoizada com `cache()` do React, entao
  repetir a chamada custa uma consulta por requisicao.
- **Senha provisoria bloqueia o portal inteiro.** Enquanto
  `usuarios.senha_provisoria` for `true`, `exigirUsuario()` manda para
  `/trocar-senha` — a unica rota que passa `permitirSenhaProvisoria: true`.
- **Hash com `scrypt` da lib padrao do Node**, nao bcrypt/argon2: ambos exigem
  build nativo via install script, bloqueado pelo npm 12 (ver "Pontos de
  atencao"). Formato `scrypt$N$r$p$salt$hash`, comparado com `timingSafeEqual`.
- **A sessao vive no banco** (`sessoes`), nao em JWT autocontido: logout, troca
  de senha e desativacao de usuario revogam o acesso na hora. O cookie carrega
  um token opaco de 256 bits; a tabela guarda so o SHA-256 dele.
- Login invalido, usuario inexistente e conta inativa retornam **a mesma
  mensagem**, e o caminho "usuario nao existe" ainda roda um hash descartavel
  para nao vazar por tempo de resposta quem esta cadastrado.
- `?redirecionar=` so aceita caminho interno (`/...`, nunca `//...`), senao vira
  open redirect.

### Autorizacao por area

Nao existem perfis nem cargos predefinidos: **o acesso e uma lista de areas por
usuario**, gravada em `acessos` (uma linha por area concedida). A feature
`src/features/acessos/` cadastra usuarios e concede essas areas.

| Arquivo                       | Papel                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| `areas.ts`                    | catalogo das areas (rotulo, descricao, rota) + `podeAcessar()` |
| `queries.ts`                  | `listarUsuarios`, `obterUsuario`                               |
| `actions.ts`                  | `criarUsuario`, `atualizarUsuario`, `redefinirSenha`           |
| `src/app/(portal)/acessos/**` | lista, cadastro e edicao                                       |
| `src/db/schema/acessos.ts`    | enum `area_portal` + tabela `acessos`                          |

Regras:

- **`administrador` e o unico privilegio implicito.** Quem tem o perfil enxerga
  todas as areas e e o unico que exibe badge ao lado do nome — nao ha perfil
  intermediario a rotular. Todo o resto e area concedida uma a uma.
- **Toda rota e toda Server Action de uma area chamam `exigirAcesso(area)`**, do
  mesmo jeito e pelos mesmos motivos que `exigirUsuario()`. O menu esconder o
  link e conveniencia, nao autorizacao.
- **Uma area nova exige seis passos**: valor no enum `area_portal` (com
  migration), entrada no catalogo de `areas.ts`, modulo em
  `navegacao/modulos.ts`, icone em `navegacao/icones.ts`, ajuda em
  `ajuda/conteudo.ts` e o `exigirAcesso` na rota. Os quatro
  `Record<AreaPortal, ...>` quebram o typecheck se algum passo do meio faltar;
  so a rota depende de disciplina.
- **`areas.ts` e um modulo puro** (so `import type` do schema): e importado por
  componentes client e pela DAL, e nenhum dos dois deve arrastar o Drizzle nem
  React para o outro lado. Icone de area, por ser apresentacao, fica na pagina.
- **"Lembrar meu usuario" guarda so o login, em cookie separado da sessao.**
  Nunca senha, nunca token: o cookie nao autentica nada e por isso sobrevive ao
  logout. So e gravado apos autenticar (nao ha por que lembrar um login que nem
  existe) e e revalidado no `loginSchema` na leitura — cookie e entrada do
  usuario como qualquer outra.
- **A senha nunca e digitada por quem cadastra.** O portal gera a senha
  provisoria, mostra **uma unica vez** no retorno da action e guarda so o hash.
  Redefinir gera outra e derruba as sessoes abertas daquele usuario.
- **Travas contra se trancar do lado de fora**: ninguem desativa a propria
  conta, remove o proprio perfil de administrador nem tira de si a area
  `acessos`. Quem nao e administrador tambem nao promove ninguem nem altera um
  administrador. Todas as travas vivem na action — o formulario so esconde o
  campo, e campo escondido nao e autorizacao (por isso os `<input type="hidden">`
  ao lado dos checkboxes desabilitados).
- Formularios de edicao levam `key` derivada dos dados do servidor: campo nao
  controlado ignora `defaultValue`/`defaultChecked` novo, e sem remontar a tela
  exibiria o estado anterior depois do `refresh()`.

## Pontos de atencao

- **O Drizzle 0.45 embrulha o erro do `pg`.** O SQLSTATE (`23505` e afins) vai
  parar em `cause`, entao checar `erro.code` no topo sempre da falso e a action
  cai na mensagem generica. Use `ehViolacaoDeUnicidade()` de `src/lib/postgres.ts`,
  que percorre a corrente de causas.
- **Sem competencia aberta o portal nao grava nada.** Depois de `db:migrate` em
  um banco vazio, o primeiro passo em `/competencias` e abrir a primeira — antes
  disso `competenciaDeEscrita()` recusa toda escrita datada.
- **`competencias.referencia` e coluna gerada**: nao a inclua em `insert`/`update`
  (o Postgres recusa) e nao a edite a mao. Ela e recalculada a partir de `data_fim`.
- **`escalas.virada_turno` tambem e coluna gerada**, pela mesma razao e com a
  mesma consequencia: ela sai de `saida < entrada` e nao entra em `insert`/`update`.
- **React reseta o formulario depois de toda Server Action**, e num
  `input[type=file]` isso apaga a escolha — nenhum navegador deixa repovoar o
  campo por valor. A tela de importacao guarda o arquivo num `ref` e o devolve ao
  campo a cada resposta; sem isso o botao de confirmar envia vazio e a `required`
  bloqueia o envio **em silencio**, sem nenhum erro na tela.
- **O leitor de `.xlsx` e proprio** (`funcionarios/xlsx.ts`) e cobre so o que o
  relatorio usa: ZIP sem ZIP64, `deflate`, primeira aba, sem estilos. Data chega
  como numero de serie do Excel e a conversao vive em `planilha.ts` — quem sabe o
  que a coluna significa. Planilha de outra origem pode precisar de mais formato.
  O `exceljs` entrou depois, para **gerar** a planilha de apontamentos; a
  importacao continua no leitor proprio, que ja estava testado contra o
  relatorio real. Trocar um pelo outro e uma decisao a parte.
- **Nao edite nem apague linhas de `mensagens_whatsapp` ou `comprovantes_tratativa`.**
  O comprovante e conferido reconstruindo a transcricao a partir delas: uma
  mensagem corrigida no banco faz a tela acusar "Conteudo alterado", e e esse o
  comportamento desejado. Nao ha action que as altere.
- **O webhook precisa de URL publica com HTTPS.** Em desenvolvimento a Z-API nao
  alcanca `localhost`: teste com o payload simulado (um POST em
  `/api/whatsapp/webhook?token=...`) e um stub local no lugar de `ZAPI_BASE_URL`.
  Com `ZAPI_BASE_URL` apontando para a Z-API de verdade, um telefone de teste no
  cadastro recebe mensagem de verdade.
- **O `pdf-lib` so roda no servidor** (`atendimento/pdf.ts` e `server-only`).
- **O `exceljs` e o `docx` so rodam no servidor** (`excel.ts` e `word.ts` sao
  `server-only`). Nao importe os dois em componente client: o `exceljs` sozinho
  tem megabytes, e a pagina so precisa de `hrefDaExportacao()`, que mora no
  modulo puro `exportacao/tipos.ts`.
- **Ao reler a planilha com o `exceljs`, celula de hora volta como `Date`**: o
  leitor converte todo numero com formato de data/hora. O valor gravado e a
  fracao de dia — confira no XML (`xl/worksheets/sheet1.xml`), e nao pela API de
  leitura.
- **`funcionarios.escala_id` e `inicio_ciclo` sao anulaveis, mas nunca sozinhos**
  (`check funcionarios_escala_com_inicio`). Gravar um sem o outro falha no banco
  antes de falhar no Zod.
- **Nao ha tela de cadastro de empresas.** Elas nascem pela importacao, com o
  nome truncado em 40 caracteres pelo relatorio; corrigir o nome ou informar o
  CNPJ ainda depende de SQL.
- **A apuracao do ponto nao esta no banco.** Nao procure coluna de falta ou de
  hora extra em `marcacoes`: tudo sai de `apuracao.ts` a cada leitura. Mudou a
  escala de alguem, mudou o passado dessa pessoa — o que e o comportamento
  desejado, e nao um bug.
- **Sem carga de ponto, a competencia nao apura nada.** `janelaApurada()` devolve
  `null` e a tela mostra estado vazio; e a diferenca entre "ninguem bateu ponto"
  e "ninguem importou o arquivo". A janela sai de `importacoes_ponto`, entao
  apagar essas linhas a mao desapura o periodo inteiro.
- **O relatorio de ponto so identifica a empresa pelo codigo do relogio.** Sem
  `empresas.codigo` preenchido, a carga recusa o bloco inteiro daquele codigo —
  nao e erro do arquivo. A associacao e feita na propria tela de importacao e
  vale para sempre.
- **A cauda do turno noturno do ultimo dia da janela nao existe ainda.** Ela cai
  no dia seguinte, fora do periodo apurado, e o dia fica como `turno_em_aberto`
  ate a proxima carga estender a janela. Se a competencia tambem acabar ali, ele
  so fecha na competencia seguinte.
- **A sugestao de escala precisa de janela, e a competencia recem-aberta nao
  tem.** Com menos de 6 dias importados a tela nasce vazia e diz por que —
  nao e defeito. O caminho e importar mais dias ou **consultar a competencia
  anterior** e aplicar de la: escala e inicio de ciclo sao cadastro, e nao dado
  datado, entao valem para frente.
- **A sugestao nao fica gravada em lugar nenhum.** Nao procure percentual de
  acerto nem "escala sugerida" em `funcionarios`: o que a confirmacao grava e
  `escala_id` e `inicio_ciclo`, iguais aos digitados a mao. Reabrir a tela
  recalcula tudo do zero.
- **A ocorrencia de ponto nao tem id, e a tratativa nao aponta para uma.** A
  chave e `(funcionario, data, tipo)`, porque nao existe tabela de ocorrencias a
  que apontar. Nao procure `ocorrencia_id` em `tratativas_ponto`.
- **Tratativa cuja divergencia deixou de existir some do painel** e continua no
  banco. Isso e o comportamento desejado, e nao registro perdido: se a
  divergencia voltar, a chave reencontra a linha e o historico volta junto. Pela
  URL, a ocorrencia ainda abre — com o aviso de que a leitura atual nao a acusa
  mais.
- **Sem as tres variaveis da Z-API o envio de mensagens fica indisponivel**, e
  so ele: o portal sobe normalmente e o resto da tratativa (status e observacao)
  continua gravando. As tres andam juntas — com duas de tres a chamada sairia e
  voltaria 401.
- **Mensagem enviada nao se apaga nem se reescreve.** O texto e o telefone ficam
  gravados como foram enviados, e uma falha e uma linha como outra qualquer.
  Corrigir o numero no cadastro nao muda o historico, e e para isso que ele
  serve.
- **O `<textarea>` posta CRLF.** O `conteudo` da mensagem passa por um
  `replaceAll("
", "
")` no Zod: sem isso o texto gravado teria `
`
  invisiveis que nao estavam no modelo.
- **A grade depende do catalogo de `eventos`.** Depois de `db:migrate` em um
  banco vazio ele esta vazio, e o modal do dia nao tem sigla nenhuma a oferecer.
  O minimo util e um evento de natureza `trabalho` e um de `folga`, ambos
  marcados como `padrao` — sao eles que o **previsto** escreve; sem os dois, a
  faixa P nasce em branco por mais completo que o ciclo esteja.
- **A grade nao abre posto nenhum sem funcao ativa.** E a funcao que vira faixa
  (e que declara o ciclo): um posto sem funcao nenhuma abre com o aviso, e nao
  com grade.
- **A grade nao tem campo de digitacao.** A faixa do previsto e texto, e a do
  realizado e um botao por dia que abre o modal.
- **Funcao sem vigencia nao gera previsto**, e a faixa nasce em branco com "sem
  vigencia definida". Nao e erro: e cadastro faltando. As vigencias se declaram
  em **Postos de trabalho**, na aba Funcoes.
- **A rota da grade e `/preenchimento/[postoId]`**, e nao mais por funcao. Ao
  renomear um segmento dinamico, o `next dev` continua servindo 404 pela rota
  antiga ate ser reiniciado — nao e erro do codigo.
- **Cuidado com `useState(prop)` no modal do dia.** O React reaproveita a
  instancia e `useState` **nao** se reinicia quando a prop muda: sem cuidado, o
  dia aberto mostraria os campos do anterior. Por isso a `key` do `Conteudo`
  carrega `linha:data` — e por isso so sigla e horario sao controlados (sao os
  campos de que o `required` depende); o resto e `defaultValue`.
- **Nao procure previsto em `preenchimento_dias`.** A tabela guarda so o
  realizado, e nao ha mais coluna `faixa`: ela e o enum `preenchimento_faixa`
  sairam na migration 0023, junto das linhas de `previsto` que as versoes
  anteriores gravavam e ninguem mais lia.
- **Nao tire o `memo` da tabela nem o `useCallback` do `aoAbrir`.** Os dois
  andam juntos: sem o segundo, o primeiro nao segura nada, e abrir um dia volta
  a redesenhar as 620 celulas. Toda prop nova que a tabela receber precisa ser
  estavel entre renders, ou o `memo` se perde em silencio — nao ha erro, so a
  lentidao de volta.
- **Nao procure coluna de extra em `preenchimento_dias`.** "Este dia lanca hora
  extra?" e lido da existencia da linha em `extras` que aponta para a celula. Um
  booleano aqui poderia discordar do lancamento — mesma familia de
  `virada_turno` e `competencias.referencia`.
- **A recusa do modal do dia mora no `onSubmit`, e nao dentro da action.** O
  React reseta o formulario depois de **toda** action, inclusive a que devolveu
  sem enviar nada: recusar la dentro limparia o que a pessoa acabou de digitar —
  os campos nao controlados voltam ao inicial e a caixa do extra se desmarca
  sozinha, porque o Radix repassa o `reset` do formulario para o
  `onCheckedChange`, levando junto o aviso que explicava a recusa. Conferir no
  `onSubmit` com `preventDefault` e o que impede a action de comecar.
- **Nao acrescente `refresh()` a `salvarDia`/`limparDia`.** Ele saiu de
  proposito: redesenhar a rota custava ~200ms sobre uma gravacao de ~60ms. O que
  a tela precisa da resposta ja volta nela, e a grade tem uma camada de sessao
  para isso. Se um dia a gravacao passar a mudar algo **fora** da celula, do
  total da linha e do historico do dia, essa decisao precisa ser revista — nao
  basta reduzir consulta. Gravar o extra nao a revisa: ele muda **outra rota**
  (`/extras`), que e relida quando alguem a abre.
- **O travamento ao abrir o modal era do Firefox.** No Chrome a abertura ja
  estava limpa depois do `memo` e da busca assincrona; em desenvolvimento sobra
  a primeira abertura (~180ms), que e o Turbopack avaliando o modulo do modal e
  nao aparece em producao. Nao ha o que otimizar no `Dialog` — se o assunto
  voltar, a primeira pergunta e "em que navegador?".
- **A caixa de intrajornada da grade nao alimenta o apontamento.** Sao tres
  leituras do mesmo assunto, e nenhuma alimenta a outra: a grade **registra**
  que o intervalo nao houve naquele dia, a apuracao do ponto **calcula**
  `intrajornada_curta` das batidas contra a escala cadastrada, e a rubrica
  "Intrajornada" do apontamento e **digitada** por quem fecha a folha. Mesma
  historia da hora extra, e pelo mesmo motivo.
- **O ponto da grade nao e a pendencia do ponto.** Um dia pode ter ponto ambar na
  grade e nenhuma ocorrencia no painel, ou o contrario: a grade compara as
  batidas com o realizado, e a apuracao compara com a escala cadastrada. Nao e
  bug — sao duas perguntas. Batida "que nao aparece" num dia costuma estar no
  dia anterior, reclamada pela virada do turno; o modal marca essas com "(dia
  seguinte)".
- **Mudar o ciclo de uma funcao reescreve o previsto de todo mundo nela**, em
  todas as competencias abertas pela tela, porque nada daquilo esta gravado.
  E o comportamento desejado — o previsto e a exigencia do posto —, mas e uma
  mudanca de cadastro com efeito no mes inteiro.
- **Previsto `N` sem horario numa grade de `D` nao e bug.** E a linha com sigla
  propria: ela segue o ciclo da vigencia, mas o horario da vigencia e do turno da
  funcao, e o portal nao inventa o da noite. O "Igual ao previsto" do modal
  preenche so a sigla nesses dias. Se o noturno precisa de horario no previsto,
  o caminho hoje e uma funcao Noturno propria, com vigencias proprias — como
  GP01 e GP02 fazem.
- **A turma da linha so muda o previsto daquela pessoa.** `escala` e o padrao;
  `contraescala` e a outra metade do posto, com ciclo e vigencias proprios. Quem
  esta na contraescala aparece marcado na coluna do nome.
- **Vigencia com ciclo e sem ancora quase sempre erra o dia** quando ela e a
  **inicial** (sem data): ai a posicao 1 cai no primeiro dia da competencia, e
  21/08 e uma sexta — um 5x2 folgaria quarta e quinta. Se as folgas "nao
  encaixaram", e aqui que se olha primeiro. Nas demais vigencias a posicao 1 cai
  no dia em que ela passa a valer, que ja e uma data escolhida.
- **A contraescala nao herda nada da escala.** Se ela tem so a vigencia inicial e
  a escala trocou em 28/08, quem esta na contraescala continua no padrao antigo —
  o que costuma ser exatamente o certo, mas nao e automatico.
- **Um ciclo de 2 dias com 1 folga aparece como `12x36`**, e nao como o `1x1` de
  `escalas`: os dois numeros saem da propria jornada (12 horas trabalhadas, 36
  ate a proxima entrada). Fora desse formato o rotulo continua sendo o de dias.
- **A cor da celula sai de classes literais em `eventos/cores.ts`.** Nao monte
  `bg-${cor}-100`: o Tailwind varre o codigo-fonte procurando classes escritas
  por extenso, e a classe montada em runtime nao entra no CSS — a celula sai sem
  cor, sem erro nenhum.
- **A hora extra do modulo de conferencia nao e a da apuracao do ponto.** Uma e
  registro (tabela `extras`, digitado por alguem), a outra e leitura da marcacao
  contra a escala (calculada a cada requisicao, sem coluna nenhuma). O portal
  ainda nao as cruza: registrar o extra nao encerra a ocorrencia `hora_extra` no
  painel de pendencias, nem o contrario.
- **Sem posto ativo nao se registra extra**, e o campo e obrigatorio: a tela de
  registro mostra o aviso em vez do formulario. Depois de `db:migrate` em um
  banco vazio, o caminho e cadastrar o posto em `/postos` antes.
- **A duracao do extra nao esta no banco** — nao procure coluna de horas em
  `extras`. Ela sai dos dois horarios a cada leitura, e o total da lista soma o
  filtro inteiro em memoria (uma consulta so das duas colunas), e nao em SQL:
  reescrever a virada da meia-noite la criaria uma segunda versao da regra.
- **O apontamento nao e a apuracao do ponto, e nenhum dos dois alimenta o
  outro.** As horas extras, faltas e intrajornada do espelho sao leitura da
  marcacao contra a escala; as do apontamento sao o que alguem decidiu lancar.
  Um apontamento nao encerra ocorrencia no painel de pendencias, e corrigir a
  escala depois nao mexe no apontamento ja gravado.
- **Nao procure horas decimais em `apontamentos`.** As colunas `*_minutos` sao
  minutos inteiros; `12:30` no formulario e `750` no banco.
  `gratificacao_percentual` e `numeric(5,2)` em `mode: "number"` — volta como
  `number`, e nao como a string que o `numeric` do Drizzle devolve por padrao.
- **Preencher a escala nao escreve apontamento nenhum.** A regra so produz
  sugestao, lida da grade a cada abertura da tela: nao ha gatilho no banco nem
  chamada em `salvarDia`. Se o apontamento de alguem "nao atualizou", nao ha o
  que depurar na grade — ele so muda quando alguem usa a sugestao ou gera pelas
  regras.
- **Rubrica nova exige tres passos**: coluna em `apontamentos` (com migration),
  entrada no catalogo de `rubricas.ts` e valor no enum `apontamento_rubrica`
  (outra migration). Os dois `Record<...>` de `rubricas.ts` e `regras/campos.ts`
  quebram o typecheck se algum faltar.
- **A sugestao respeita o teto das colunas**: regra mal cadastrada que somasse
  40 dias de VT num mes de 31 e cortada no limite, porque o banco recusaria a
  gravacao inteira depois.
- **Competencia encerrada so aceita escrita pela consulta.** Nao ha trava por
  modulo: quem consulta uma competencia encerrada aponta, preenche a grade e
  lanca extra nela normalmente. Quem nao consulta grava sempre na aberta.
- **O fluxo de contato direto anterior ao responsavel do posto esta na tag
  `contato-direto-v1`.** Ele nao foi removido do codigo — continua sendo o
  caminho de quem nao tem responsavel. Reimplanta-lo para todos e tirar os
  responsaveis dos postos (ou esvaziar os grupos); o chatbot volta a atender as
  mesmas pessoas sozinho.
- **O prazo de retorno conta do envio, e nao da entrega.** A mensagem promete
  "3 dias a partir do recebimento", mas o portal so sabe quando a Z-API aceitou
  o envio — o status de entrega e lida depende de um webhook que ele nao
  recebe. Para o WhatsApp, sao quase sempre o mesmo instante.
- **Nao procure prazo em coluna nenhuma.** Ele sai do `criado_em` da ultima
  mensagem aceita ao responsavel mais `PRAZO_RETORNO_DIAS`; mudar a constante
  muda o prazo das mensagens ja enviadas, cujo texto prometeu outra data.
- **Responsavel sem telefone ou desativado trava as mensagens do grupo
  inteiro**, e de proposito: nada volta para o colaborador sem alguem decidir.
  O painel conta essas ocorrencias em "nao tem a quem avisar".
- **Porta do PostgreSQL: 5434**, nao 5432 — as portas 5432 e 5433 ja estao
  ocupadas por outros projetos nesta maquina. Configurada em `.env`.
- **Volume do Postgres 18** monta `/var/lib/postgresql` (nao `.../data`). A
  imagem 18+ mudou a convencao e falha o healthcheck com o caminho antigo.
- **`npm audit` reporta um CVE moderado do esbuild** (dev server) vindo
  transitivamente do `drizzle-kit`. E devDependency de CLI e o `fix --force`
  regride o drizzle-kit para 0.18.1 (breaking). Risco aceito conscientemente;
  reavalie ao atualizar o drizzle-kit.
- **`npm audit` reporta tambem o `uuid@8` que vem do `exceljs` 4.4** (a ultima
  versao publicada). A falha e de `v3`/`v5`/`v6` chamados com `buf`, e o
  `exceljs` so usa `v4`; o `fix --force` regride o `exceljs` para 3.4 (breaking).
  Risco aceito; reavalie se sair versao nova do `exceljs`.
- **npm 12 bloqueia install scripts.** `esbuild` e `unrs-resolver` estao
  aprovados em `allowScripts` no `package.json`. Novas dependencias com
  postinstall precisam de `npm install-scripts approve <pkg>`.
- **O menu lateral depende de JavaScript** (Radix: `Collapsible` nos modulos e
  `DropdownMenu` no menu do usuario). Sem JS as paginas continuam abrindo por
  URL e os formularios de competencias e de login continuam enviando por progressive
  enhancement, mas a navegacao e o logout ficam inacessiveis. Mesma historia dos
  checkboxes do shadcn (Radix renderiza um `button` com input espelho escondido),
  que a tela de acessos usa.
- **`CampoEscala` tambem depende de JavaScript**, e e a unica excecao do portal
  ao `<select>` nativo: e um combobox com busca interna (`Popover` do Radix), e
  `select` nenhum comporta um campo de busca dentro. Sem JS o campo abre mas nao
  lista, entao a jornada nao pode ser definida — o resto do cadastro de
  funcionarios continua funcionando, e a importacao tambem. Se isso passar a
  incomodar, o caminho e um `<noscript>` com um `select` simples ao lado.
- **`npm run db:seed` e so para o primeiro administrador.** Depois disso o
  caminho e `/acessos`; usuario criado pelo seed com `--perfil=usuario` nasce
  sem area nenhuma.
- **A senha provisoria do seed aparece uma vez so.** `npm run db:seed` e
  idempotente: rodar de novo nao redefine a senha de quem ja existe. Para gerar
  outra, `npm run db:seed -- --forcar` (isso tambem derruba as sessoes abertas
  daquele usuario).
- **`scripts/seed-usuarios.mts` roda no Node puro**, sem o bundler do Next: nada
  de alias `@/` la dentro. Por isso ele fala SQL cru via `pg` e so importa
  `../src/lib/senha.ts` (que exige `allowImportingTsExtensions` no tsconfig).
- **`src/hooks/use-mobile.ts` foi reescrito com `useSyncExternalStore`.** A
  versao gerada pelo shadcn CLI chama `setState` dentro de um efeito, o que o
  `react-hooks` do eslint-config-next reprova. Refaca a troca se um
  `shadcn add` sobrescrever o arquivo.
- **O corpo da Server Action vai ate 9 MB** (`serverActions.bodySizeLimit` em
  `next.config.ts`), por causa dos documentos das movimentacoes (4 x 2 MB). Nao
  suba alem de 10 MB sem subir junto o `proxyClientMaxBodySize`: o `proxy.ts`
  bufferiza so 10 MB e o resto chegaria truncado. Na VPS, o **nginx** tambem
  limita: `sites-available/tg` tem `client_max_body_size 20M`. Um servidor novo
  sem essa linha fica no padrao de 1 MB, e envio maior volta 413 antes de
  chegar ao Next.
- **Nao procure os documentos das movimentacoes em pasta nenhuma**: estao em
  `movimentacao_documentos.conteudo`, `gzip` quando `compressao = 'gzip'`. O
  download (`abrirDocumento()`) desfaz o gzip; uma leitura direta pelo SQL nao.
- **Foto HEIC (iPhone) so entra se o navegador a abrir.** O Chrome no Windows
  nao abre, e o campo recusa com o aviso de salvar como JPG ou mandar um print.
- O bloco `nextjs-agent-rules` no `AGENTS.md` e reescrito pelo `next dev`; commite
  junto em vez de remover.

## Historico de decisoes

| Data       | Decisao                                                                     | Motivo                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-03 | Next.js fullstack no lugar de API + SPA separadas                           | UI e API no mesmo deploy; menos peças móveis para um portal                                                                                      |
| 2026-09-03 | Drizzle ORM no lugar de Prisma                                              | schema em TS, SQL explicito, sem engine binaria                                                                                                  |
| 2026-09-03 | PostgreSQL via Docker Compose                                               | ambiente reprodutivel, sem instalacao na maquina                                                                                                 |
| 2026-09-03 | Sem autenticacao no scaffold inicial                                        | validar a base primeiro. Superada ainda em 2026-09-03 pelas tres linhas de auth abaixo                                                           |
| 2026-09-03 | Sem `cacheComponents`                                                       | comportamento dinamico por requisicao e mais simples de raciocinar agora; reavaliar quando houver leitura cacheavel                              |
| 2026-09-03 | Sem testes automatizados ainda                                              | pendencia consciente, ver docs/architecture.md                                                                                                   |
| 2026-09-03 | Auth propria no lugar de NextAuth/Auth.js                                   | provedor unico (login+senha no proprio banco); a dependencia nao pagaria por si                                                                  |
| 2026-09-03 | Sessao em banco no lugar de JWT autocontido                                 | logout, troca de senha e desativacao precisam revogar acesso na hora                                                                             |
| 2026-09-03 | `scrypt` do Node no lugar de bcrypt/argon2                                  | npm 12 bloqueia install scripts, e ambos exigem build nativo; scrypt e KDF com custo de memoria e vem no runtime                                 |
| 2026-09-03 | Troca de senha forcada via flag `senha_provisoria`                          | a DAL barra o portal inteiro ate a troca; nao depende de o usuario lembrar de trocar                                                             |
| 2026-09-03 | Acesso por area individual, sem perfis nem cargos                           | o portal tem poucas areas e cada pessoa acumula um conjunto proprio; papel fixo so viraria excecao                                               |
| 2026-09-03 | `administrador` mantido como unico privilegio implicito                     | alguem precisa poder promover e destravar o resto; e o unico rotulo com significado, por isso o unico com badge                                  |
| 2026-09-03 | Area `acessos` concedivel a nao-administrador                               | delegar o cadastro sem entregar o portal inteiro; as actions barram escalonamento de privilegio                                                  |
| 2026-09-03 | Senha provisoria gerada pelo portal                                         | quem cadastra nunca escolhe (nem conhece) a senha final; o hash e a unica copia guardada                                                         |
| 2026-09-03 | Menu lateral com modulos expansiveis no lugar do header                     | o header em linha nao comporta a lista crescer; modulo agrupa areas sem virar mais um nivel de permissao                                         |
| 2026-09-03 | Modulo so no codigo, sem tabela nem enum no banco                           | modulo e apresentacao; a autorizacao continua area a area e o agrupamento muda sem migration                                                     |
| 2026-09-03 | Acessos fora dos modulos, no menu do usuario                                | e configuracao da conta, nao um modulo de trabalho; fica junto de trocar senha e sair                                                            |
| 2026-09-03 | Modulo de competencias como base temporal do portal                         | todo dado nasce dentro de um periodo e so a competencia em vigor aparece; o recorte e um so para o portal inteiro                                |
| 2026-09-03 | Nome da competencia derivado do mes da data final                           | nome e consequencia do periodo: coluna gerada no banco, nunca campo digitado                                                                     |
| 2026-09-03 | Consulta temporaria por usuario, gravada no banco                           | consultar o passado nao muda o presente de quem trabalha; cookie decidiria dados visiveis do lado do cliente                                     |
| 2026-09-03 | Modulo de avisos removido                                                   | era o scaffold inicial da fatia vertical; competencias assume esse papel e avisos nao entraria no produto                                        |
| 2026-09-04 | Escala como cadastro, fora da competencia                                   | a regra da jornada nao muda de significado ao virar o periodo; datar a escala forcaria recadastro a cada competencia                             |
| 2026-09-04 | Virada de turno derivada dos horarios                                       | virada e consequencia (`saida < entrada`), nao informacao: coluna gerada nunca discorda dos horarios                                             |
| 2026-09-04 | Escala desativada em vez de excluida                                        | ela explica jornadas ja interpretadas; apagar reescreveria o passado                                                                             |
| 2026-09-04 | Dia trabalhado por ciclo, nao por dia da semana                             | e assim que a jornada e contratada (5x2, 6x1, 12x36); dia da semana nao expressa 12x36 nem 4x2                                                   |
| 2026-09-04 | Ciclo sempre em dias, com 12x36 gravado como 1x1                            | as 12 horas ja estao nos horarios da jornada; grava-las tambem no ciclo criaria duas versoes do mesmo fato                                       |
| 2026-09-04 | Inicio do ciclo no funcionario, nao na escala                               | a escala e o padrao; a data de virada e de cada pessoa, entao uma 12x36 so serve todas as turmas                                                 |
| 2026-09-05 | Ciclo como tamanho + posicoes de folga (supera 09-04)                       | ha escala em que a folga anda (6x1 alternado = ciclo de 14 com folga no 7 e no 13); par de numeros nao descreve isso                             |
| 2026-09-04 | Excecao presa a posicao do ciclo, nao ao dia da semana                      | o ciclo ja decide o que e dia de trabalho; dia da semana nao existe num 12x36, que anda pela semana toda                                         |
| 2026-09-04 | Excecao descreve o dia inteiro, sem coluna anulavel                         | interpretar nao pode depender de descobrir o que foi herdado e o que foi sobrescrito                                                             |
| 2026-09-04 | Excecao deduzida por comparacao com o padrao                                | dia igual ao padrao nao vira linha, e devolver o dia ao padrao apaga o ajuste — nada de checkbox a manter em dia                                 |
| 2026-09-04 | Escalas dentro do modulo "Gestao"                                           | e cadastro base como competencias; modulo e so apresentacao e reagrupar depois nao custa migration                                               |
| 2026-09-05 | Empresa como cadastro proprio, nao coluna de texto                          | o nome vem truncado do relatorio e se repete por centenas de linhas; corrigi-lo nao pode ser UPDATE em massa                                     |
| 2026-09-05 | CPF como identidade do funcionario                                          | a matricula se repete entre empresas e o nome muda; so o CPF responde "e a mesma pessoa?" na reimportacao                                        |
| 2026-09-05 | Escala e inicio de ciclo anulaveis, mas nunca sozinhos                      | a folha nao traz jornada (obrigar travaria a carga); um sem o outro nao diz se hoje e dia de trabalho                                            |
| 2026-09-05 | Importacao preserva escala e inicio de ciclo                                | eles nascem no portal; carga mensal que os zerasse apagaria todo mes o unico trabalho que so o portal faz                                        |
| 2026-09-05 | Importacao em duas etapas, confirmando com o arquivo                        | a previa precisa valer: mesma funcao de planejamento, e o plano do cliente nao e evidencia num POST publico                                      |
| 2026-09-05 | Leitor de .xlsx proprio, sem dependencia                                    | o uso e ler celulas de uma aba; as bibliotecas trazem o formato inteiro e algumas exigem install script                                          |
| 2026-09-30 | Dois modelos de relatorio da folha, um leitor so                            | o corpo muda (uma empresa no titulo, varias no cabecalho de pagina) e os campos sao os mesmos; dois leitores divergiriam                         |
| 2026-09-30 | Coluna ausente lida como `null`, e nao como valor padrao                    | o modelo de uma empresa nao traz Situacao; assumir 1 diria que quem estava de ferias voltou, apagando o que o outro informou                     |
| 2026-09-05 | Atribuicao de escala em lote, a partir da lista                             | a folha traz centenas sem escala e quem faz a mesma turma comeca no mesmo dia; um a um seria o mesmo dado 300 vezes                              |
| 2026-09-05 | Combobox com busca interna para escolher a escala                           | busca ao lado do campo nao resolve: quem escolhe entre uma dezena de escalas espera digitar dentro da propria lista                              |
| 2026-09-05 | Dados e jornada em telas e actions separadas                                | origens diferentes (folha x portal); com uma action so, salvar um cargo reenviaria — e podia apagar — a escala                                   |
| 2026-09-05 | Afastamento como periodo proprio, fora da competencia                       | a folha so manda a foto de hoje; o INSS atravessa meses e um periodo datado sumiria enquanto ainda vale                                          |
| 2026-09-05 | Dia coberto sai da auditoria mas continua na lista                          | sem previsto e sem falta; sumir seria indistinguivel de dia que a carga do relogio nao trouxe                                                    |
| 2026-09-05 | Batida em afastamento vira atencao, nao silencio                            | contradicao entre cadastro e relogio e erro de um dos dois; descartar a batida esconderia os dois casos                                          |
| 2026-09-05 | Apuracao calculada a cada leitura, nunca gravada                            | divergencia e consequencia da escala, e escala muda; gravar a conclusao criaria a versao velha do fato                                           |
| 2026-09-05 | Marcacao gravada uma linha por batida                                       | e a unidade do relogio, e o indice unico (funcionario, data, hora) torna a reimportacao idempotente                                              |
| 2026-09-05 | Janela apurada vinda das cargas, nao da competencia                         | o relatorio para antes do fim do periodo; sem a janela, cada dia nao coberto viraria falta para todo o cadastro                                  |
| 2026-09-05 | Virada de turno resolvida pela entrada da escala                            | numa jornada que vira o dia, batida do dia seguinte antes da entrada so pode fechar o turno da vespera                                           |
| 2026-09-05 | Batidas do primeiro dia antes da entrada ignoradas                          | elas fecham um turno iniciado fora da janela; em dia de folga, tres batidas soltas nao sao tres pendencias                                       |
| 2026-09-05 | `empresas.codigo` como ponte entre os dois relatorios                       | o de ponto so traz o codigo do relogio e o da folha so a razao social; a matricula sozinha nao identifica ninguem                                |
| 2026-09-06 | Tratativa gravada, ocorrencia continua calculada                            | o que se grava e o trabalho humano sobre o problema; o problema em si e consequencia da escala e muda com ela                                    |
| 2026-09-06 | Chave `(funcionario, data, tipo)` no lugar de um id                         | nao ha tabela de ocorrencias a que apontar, e a tripla e a identidade natural — a mesma que a URL carrega                                        |
| 2026-09-06 | Ausencia de linha significa `aberta`                                        | a maioria das ocorrencias nunca foi tocada; gravar uma linha para cada uma seria gravar a ausencia de trabalho                                   |
| 2026-09-06 | Painel por ocorrencia, e nao por pessoa                                     | quem tem uma falta e uma hora extra tem duas conversas, com desfechos que podem nao coincidir                                                    |
| 2026-09-06 | Previa obrigatoria antes de qualquer envio                                  | envio de WhatsApp nao tem desfazer; o destinatario e o numero sao relidos do cadastro, so o texto vem do formulario                              |
| 2026-09-06 | Falha de envio gravada como linha do historico                              | sem ela, "ninguem avisou" e "o numero esta errado" ficariam iguais na tela, e as duas pedem acoes diferentes                                     |
| 2026-09-06 | Z-API como integracao opcional, sem biblioteca                              | e um POST com tres credenciais; sem elas o portal sobe igual e so o envio fica indisponivel                                                      |
| 2026-09-06 | Telefone no funcionario, preservado pela importacao                         | a folha nao traz numero, e uma carga mensal que o zerasse apagaria todo mes o cadastro que so o portal faz                                       |
| 2026-09-06 | Posto e funcao em dois niveis                                               | cada par posto+funcao tem a propria lista de gente; um nivel so juntaria numa lista quem nunca se substitui                                      |
| 2026-09-06 | Evento como tabela, natureza como enum                                      | quem inventa sigla e a operacao; ja a natureza decide contagem, e valor invalido nela precisa falhar no INSERT                                   |
| 2026-09-06 | Cor do evento como enum curto, sem hexadecimal                              | 31 colunas com cor a dedo viram mosaico ilegivel, e hexadecimal nao acompanha o tema claro/escuro                                                |
| 2026-09-06 | Grade por competencia, com previsto e realizado                             | a escala do mes e do mes; virar a competencia comeca uma grade nova e a anterior fica inteira para consulta                                      |
| 2026-09-06 | Previsto digitado, com sugestao pela escala                                 | previsto e decisao (a troca combinada nao esta em ciclo nenhum) e freelancer nao tem escala a derivar                                            |
| 2026-09-06 | Previsto e realizado em duas linhas, nao duas colunas                       | as duas perguntas sao lidas uma embaixo da outra — e como a planilha de origem ja as desenha                                                     |
| 2026-09-06 | Grade num `<form>` so, com um campo por celula                              | um formulario por celula seria 31 POSTs para preencher uma linha; o servidor e quem compara com o gravado                                        |
| 2026-09-06 | Tres modos sobre a mesma grade, e nao tres telas                            | so muda qual campo da celula o input escreve; tres campos por celula nao cabem em 620 delas                                                      |
| 2026-09-06 | Estado por celula, e nao um estado da grade inteira                         | 620 celulas redesenhando a cada tecla travariam a tela; por celula, a cor ainda acompanha o que se digita                                        |
| 2026-09-06 | Freelancer com cadastro leve, criado na inclusao                            | quem monta a escala nao tem a documentacao dele em maos; sem cadastro, nao se reencontra a mesma pessoa no mes seguinte                          |
| 2026-09-07 | Painel do dia sobre a celula (supera os tres modos)                         | o preenchimento e rotina diaria; trocar de tela por dia corrigido cobraria uma navegacao e perderia o nao salvo                                  |
| 2026-09-07 | Sigla e horario digitados na mesma caixa do dia                             | uma tecla no dia normal e o horario junto quando muda; ao sair da celula o horario vai para o campo proprio                                      |
| 2026-09-07 | Cobertura, trocas e substituicao como evento + flags                        | sao siglas que a operacao inventa; o que muda e o que o dia pede, e isso e cadastro                                                              |
| 2026-09-07 | Detalhe faltando marca pendencia, e nao recusa                              | travar obrigaria a completar cada dia na hora, e o dia ficaria sem registro nenhum enquanto isso                                                 |
| 2026-09-07 | Historico como log de estados, atras da celula                              | o que mudou e a diferenca entre duas linhas; e a grade continua sendo uma sigla por dia para quem le o mes                                       |
| 2026-09-07 | Estado das celulas na grade + `memo` (supera 09-06)                         | o painel precisa ler e escrever o dia aberto; o `memo` e o que impede as 620 de redesenharem a cada tecla                                        |
| 2026-09-07 | Grade por posto, com as funcoes como faixas internas                        | a escala de um lugar se le inteira; uma tela por turno obrigaria a abrir quatro para conferir uma portaria                                       |
| 2026-09-07 | Funcao sem ninguem tambem vira faixa                                        | turno descoberto e o que quem monta a escala mais precisa ver; montar os grupos pelas linhas o faria sumir                                       |
| 2026-09-07 | Secoes do preenchimento em abas, como em funcionarios                       | montar a escala, incluir gente e cuidar de quem ja esta nela sao tarefas de momentos diferentes                                                  |
| 2026-09-07 | Padrao do previsto na linha da grade, nao no cadastro                       | freelancer nao tem jornada cadastrada, quem veio da folha ainda nao tem, e cobrir outro turno muda o ciclo so neste mes                          |
| 2026-09-07 | Cadastro do funcionario como reserva do padrao                              | evita redigitar todo mes a jornada de quem ja a tem, sem fazer a montagem da grade depender de arrumar o cadastro antes                          |
| 2026-09-07 | Dados e funcoes do posto em abas                                            | os dados se mexem uma vez e as funcoes o tempo todo; quem vem criar um turno nao deveria passar pelo cadastro do posto                           |
| 2026-09-08 | Hora extra reconhecida gravada, ao lado da apurada                          | a apuracao le a marcacao contra a escala e muda com ela; o extra reconhecido e trabalho humano, e nao consequencia                               |
| 2026-09-08 | Extra como dado datado, dentro da competencia                               | ele e pago e conferido por periodo; a competencia sai da data do extra, e nao da que estava aberta ao digitar                                    |
| 2026-09-08 | Duracao calculada a cada leitura, nunca gravada                             | mesma razao dos totais da grade: corrigir o horario corrige a conta, sem coluna a atualizar nem versao velha do fato                             |
| 2026-09-08 | Colaborador como funcionario ou freelancer, num campo so                    | quem procura o nome nao sabe de que tabela ele vem; as duas colunas mantem integridade referencial de verdade                                    |
| 2026-09-08 | Freelancer novo criado no proprio registro                                  | quem cobre extra as vezes e quem nao esta na folha; exigir cadastro previo travaria o registro do dia em que aconteceu                           |
| 2026-09-08 | Posto como FK e local como texto livre                                      | o posto ja e cadastro e organiza a operacao; o local muda de nome antes de virar cadastro                                                        |
| 2026-09-08 | Extra se apaga, como o afastamento                                          | e uma entrada, e nao um fato interpretado: enquanto a linha errada existir, ela soma horas que ninguem fez                                       |
| 2026-09-09 | Previsto derivado do ciclo da funcao, sem nada gravado                      | e a exigencia do posto, e nao a jornada de quem cobre: corrigir o contrato recalcula o mes sem reescrever linha                                  |
| 2026-09-09 | Ciclo e horario na funcao, turma na linha da grade                          | duas pessoas do mesmo 12x36 precisam alternar; o ciclo e do posto, so a defasagem e de cada um                                                   |
| 2026-09-09 | Vinculo com o modulo de Escalas removido do preenchimento                   | escala cadastrada e do funcionario e muda com ele; o previsto do posto nao pode depender de quem por acaso o cobre                               |
| 2026-09-09 | Realizado por modal ao clicar no dia (supera a digitacao)                   | os cinco campos do dia cabem numa tela so, e a sigla que pede detalhe passa a recusar em vez de virar pendencia                                  |
| 2026-09-09 | Contador de pessoas por funcao removido da tela                             | o que a faixa precisa dizer e o contrato do turno (4x2 06:00-18:00), e nao quantas linhas ela tem                                                |
| 2026-09-09 | Ancora do ciclo na funcao, com a linha sobrescrevendo                       | um 5x2 ancora na segunda por contrato; ancorar no primeiro dia da competencia faria ele folgar quarta e quinta                                   |
| 2026-09-09 | Contrato da funcao como lista de vigencias abertas                          | escala muda no meio da competencia; uma configuracao unica obrigaria a reescrever o passado para descrever o futuro                              |
| 2026-09-09 | Contraescala como escala completa, e nao ancora deslocada                   | o mesmo posto tem duas metades com ciclo e horario proprios; deslocar a ancora nao descreveria 5x2 contra 12x36                                  |
| 2026-09-09 | Turma na linha em vez de data por pessoa                                    | o contrato de cada turma vive na funcao; escolher entre duas opcoes impede inventar padrao que o posto nao tem                                   |
| 2026-09-10 | Celula otimista, com o modal fechando no clique                             | um mes sao centenas de gravacoes; o formulario ja sabe o que o dia passou a dizer, e esperar a resposta parava a tela                            |
| 2026-09-10 | `useActionState` da grade, e nao do modal                                   | quem fecha no clique nao pode guardar o estado da gravacao; desmontado no meio do envio, levaria a resposta junto                                |
| 2026-09-10 | Cabecalho do posto vindo de `obterGrade()`                                  | `refresh()` redesenha a tela inteira a cada dia gravado, e a segunda leitura de `postos` se pagava em todas elas                                 |
| 2026-09-10 | Coluna `faixa` removida de `preenchimento_dias`                             | so o realizado ocupa linha desde que o previsto virou derivado; a coluna e as linhas de `previsto` nao eram mais lidas                           |
| 2026-09-10 | Gravar um dia sem `refresh()`, com a resposta carregando o que mudou        | redesenhar a rota custava ~200ms sobre uma action de ~60ms para trazer o que a tela ja sabia: a celula, o total e o historico                    |
| 2026-09-10 | Tabela memoizada e lista de pessoas adiada no modal                         | abrir um dia travava 159ms: 87ms redesenhando 620 celulas que nao mudaram e 72ms montando 314 `<option>` de uma vez                              |
| 2026-09-10 | Busca assincrona no lugar do `select` de quem cobriu                        | trezentos nomes viajavam com a grade e viravam `<option>` a cada abertura; buscar sob demanda tira os dois custos de uma vez                     |
| 2026-09-10 | Cobertura marcada como Extra lanca direto em `extras`                       | quem confere o periodo le uma lista so; a grade ja sabe a pessoa, o dia, o posto e o horario da cobertura                                        |
| 2026-09-10 | Extra ligado a celula por FK, sem booleano na celula                        | o lancamento e o registro e a celula so aponta para ele; um booleano a parte poderia discordar do que `extras` diz                               |
| 2026-09-10 | Extra do dia exige o horario, em vez de herdar o previsto                   | extra e entrada, e nao consequencia: derivado do contrato, ele mudaria sozinho no dia em que o posto trocasse de escala                          |
| 2026-09-10 | Recusa do modal do dia movida para o `onSubmit`                             | o React reseta o formulario depois de toda action, e recusar dentro dela apagava o que a pessoa tinha acabado de digitar                         |
| 2026-09-10 | Funcoes e vigencias fechadas, com o contrato na linha                       | sete funcoes abriam 38 formularios e 389 campos de uma vez; achar a que se queria mexer custava mais que a edicao                                |
| 2026-09-13 | Sigla do previsto escolhida por linha, herdando da funcao                   | o mesmo turno tem gente de dia e de noite no mesmo ciclo; duas funcoes so para trocar a letra duplicariam vigencias e faixas                     |
| 2026-09-13 | Linha com sigla propria sai sem horario no previsto                         | a vigencia descreve o turno da funcao; escrever 06:00-18:00 ao lado de um N seria um previsto que se contradiz                                   |
| 2026-09-13 | Preencher varios dias de uma vez, so em dia branco                          | abrir o modal dia a dia para o que nao mudou custava o mes inteiro; sobrescrever em lote apagaria o que foi lancado com cuidado                  |
| 2026-09-13 | Lote tira o previsto de `obterGrade()`                                      | uma segunda derivacao do previsto divergiria da faixa P, e o lote gravaria um dia que a tela nao mostrava                                        |
| 2026-09-13 | Filtros da lista de extras na URL, somando com a competencia                | intervalo de datas, tipo e origem nao se expressam em texto livre; na URL o recorte e compartilhavel e funciona sem JS                           |
| 2026-09-13 | Grade cruza o realizado com as batidas, sem preencher nada                  | quem monta a escala precisa ver o dia em branco com batida e o dia que contradiz o relogio; preencher pelo relogio nao foi pedido                |
| 2026-09-13 | Sinal da grade contra o realizado, e nao a divergencia da apuracao          | a apuracao usa a escala cadastrada e a grade o contrato do posto; misturar as duas faria as telas se contradizerem                               |
| 2026-09-13 | Modulo de apontamentos para o fechamento da folha                           | registrar por funcionario e competencia o que a folha vai valorar; o portal registra quantidades e nao calcula salario                           |
| 2026-09-13 | Apontamento com uma coluna por rubrica                                      | cada rubrica tem unidade propria; numa tabela de lancamentos o "12" nao diria se sao dias ou horas, nem teria `check`                            |
| 2026-09-13 | Horas do apontamento em minutos, digitadas `HH:MM`                          | "1,30" e lido ora como hora e meia, ora como uma hora e trinta; com dois pontos nao ha duvida                                                    |
| 2026-09-13 | Espelho de ponto ao lado do apontamento, sem preencher campos               | a apuracao nao sabe se a hora e 50%, 60% ou 100%, nem se a falta foi abonada; quem fecha a folha decide                                          |
| 2026-09-13 | Insalubridade apontada por grau, e nao sim/nao                              | e o grau (10, 20 ou 40%) que a folha precisa para lancar o adicional                                                                             |
| 2026-09-13 | `docx` e `exceljs` para gerar Word e Excel                                  | geram os dois formatos no servidor sem install script; a importacao da folha continua no leitor de `.xlsx` proprio                               |
| 2026-09-13 | Apontamentos exportados em Word (leitura) e Excel (importacao)              | quem le quer os totais e so o que cada pessoa tem; quem importa quer uma linha por funcionario e nada alem disso                                 |
| 2026-09-13 | Planilha no layout da folha, com nota nas colunas que somam rubricas        | Horas Extras (50%+60%), Faltas (escala+folga) e VA (cesta basica) juntam rubricas; a nota diz o que foi somado                                   |
| 2026-09-13 | Download por Route Handler e `<a href download>`                            | e `GET` de arquivo: baixa sem JavaScript, com nome, e a rota confere o acesso como uma pagina                                                    |
| 2026-09-13 | Planilha com cabecalhos da folha, fonte 7 e titulo na vertical              | layout pedido pela folha; com o titulo de pe as dezessete colunas cabem numa pagina, e a nota explica as abreviacoes                             |
| 2026-09-13 | Rubricas do Word em texto corrido, tudo preto e so o nome em negrito        | leitura de cima a baixo sem repetir cabecalho de tabela por pessoa; enfase unica no nome, cor fixada nos estilos e nos trechos                   |
| 2026-09-17 | Chatbot de correcao como maquina de estados pura                            | a regra da conversa precisa ser conferida sem WhatsApp; `processar.ts` so grava e envia                                                          |
| 2026-09-17 | Uma transacao por mensagem, com bloqueio por numero                         | resolve a reentrega da Z-API, a ordem de mensagens seguidas e a retomada sem estado pela metade                                                  |
| 2026-09-17 | Envio antes do `insert`, sem atualizar a linha depois                       | a transcricao precisa ser reconstruivel identica para conferir o hash do comprovante                                                             |
| 2026-09-17 | Menus numerados no texto alem da lista de opcoes                            | a lista do WhatsApp nao aparece em todo aparelho; o numero funciona em qualquer um                                                               |
| 2026-09-17 | Hash do conteudo consolidado antes do PDF, em coluna propria                | o PDF e apresentacao; a prova e o JSON canonico e o SHA-256 guardados no banco                                                                   |
| 2026-09-17 | Integridade conferida por hash e por reconstrucao                           | o hash prova que o conteudo nao mudou; a reconstrucao prova que as mensagens de origem tambem nao                                                |
| 2026-09-17 | `pdf-lib` com fonte padrao para o comprovante                               | gera no servidor sem install script nem arquivo de fonte; emoji vira `?` so no documento                                                         |
| 2026-09-17 | Webhook desligado sem segredo na URL                                        | a Z-API nao assina o webhook; endpoint que responde em nome do RH nao pode nascer aberto                                                         |
| 2026-09-17 | Segredo do webhook aceito tambem no caminho da URL                          | o painel da Z-API ja usava `/webhook/<token>`; os dois formatos chamam a mesma funcao                                                            |
| 2026-09-17 | Robo do WhatsApp so para falta e marcacao incompleta                        | hora extra e as demais sao decisao de quem confere o ponto, e nao correcao que o colaborador informa                                             |
| 2026-09-21 | Atendimento aberto so pela palavra-chave "Ponto"                            | o robo vai para o WhatsApp oficial; responder a qualquer mensagem transformaria toda conversa com a empresa em atendimento de ponto              |
| 2026-09-21 | Consulta de competencia encerrada aceita escrita                            | corrigir e completar o periodo anterior e trabalho de rotina; consultar so para ler obrigava a reabrir a competencia inteira                     |
| 2026-09-21 | Consulta presa a sessao de login, sem prazo proprio                         | com escrita liberada, expirar sozinha mudaria o destino das gravacoes no meio do trabalho; o logout devolve a aberta                             |
| 2026-09-21 | Formulario sem data envia a competencia em que foi desenhado                | uma tela aberta antes de encerrar a consulta gravaria na aberta; a data ja protege os demais, o id protege apontamento e inclusao                |
| 2026-09-22 | Virada copia as linhas da grade, sem as celulas                             | o efetivo de cada posto nao muda porque o periodo virou; o que foi feito em cada dia e do mes e fica nele                                        |
| 2026-09-24 | Intrajornada nao usufruida como caixa do dia, so na grade                   | quantos minutos o intervalo teria ja esta no contrato da funcao; a grade so sabe que naquele dia ele nao houve, e nao ha conferencia a alimentar |
| 2026-09-22 | Virada ancora a vigencia "desde sempre" sem ancora                          | ancorada no inicio de cada competencia, a escala recomecava a cada virada; ancorar no inicio da que se encerra nao muda o passado                |
| 2026-09-24 | Regras de apontamento como cadastro, e nao condicoes no codigo              | quem inventa as condicoes e a operacao (empresa que passa a pagar cesta, posto com adicional); cada ajuste viraria deploy                        |
| 2026-09-24 | Sugestao derivada da grade a cada leitura, nunca acumulada no salvar do dia | somar +1 VT ao gravar o dia deixaria o mes errado quando alguem corrigisse a celula                                                              |
| 2026-09-24 | A sugestao vira linha por gesto (botao na ficha, lote na lista)             | o apontamento continua sendo entrada; o lote nunca sobrescreve quem ja foi lancado a mao                                                         |
| 2026-09-24 | Escopo por conjuncao, com excecoes em tabela propria                        | "todas as empresas menos a LC" cabe numa regra so, e a excecao por pessoa nao vira coluna nova                                                   |
| 2026-09-24 | Ciclo no escopo como tamanho + folgas                                       | 5x1 e um ciclo de 6 com 1 folga e o 12x36 e um de 2 com 1 folga; so as folgas dariam as 3h de um ao outro                                        |
| 2026-09-24 | Ordem do cadastro decide, e nao a regra mais especifica                     | `definir` sobrescreve, e quem le a lista de cima para baixo ve o resultado; especificidade nao se confere na tela                                |
| 2026-09-30 | Escala inferida do ponto, escolhendo entre as cadastradas                   | a folha nao traz jornada e o relogio traz; inferir o ciclo do zero criaria um catalogo paralelo de variacoes                                     |
| 2026-09-30 | Sugestao recalculada na action, com o cliente dizendo so quem               | mesma razao da importacao: plano vindo do formulario gravaria a escala que quisesse em quem quisesse                                             |
| 2026-10-01 | Modulo de Ajuda num painel, com os textos explicativos saindo das telas     | o paragrafo que explica era lido uma vez e empurrava o trabalho para baixo em toda visita; a tela fica com o que muda (periodo, estado, aviso)   |
| 2026-10-01 | Ajuda escolhida pela URL, com a secao da subtela no topo                    | o botao vive no layout, que nao sabe a pagina; o encaixe mais longo separa a importacao da ficha sem rota por rota                               |
| 2026-10-02 | Correcao de ponto pelo responsavel do posto, com grupo de contato           | o contato direto esta em analise juridica; o responsavel recebe a ocorrencia de quem esta no grupo, e quem nao esta segue igual                  |
| 2026-10-02 | Grupo de contato como cadastro, um grupo por pessoa                         | a grade muda todo mes e quem cobre dois postos teria dois responsaveis; com dois grupos nao haveria a quem mandar                                |
| 2026-10-02 | Responsavel sem contato bloqueia, e nao devolve ao colaborador              | voltar ao contato direto em silencio desfaria justamente o que a analise juridica pediu                                                          |
| 2026-10-02 | Prazo de 3 dias calculado do ultimo envio, sem coluna                       | e o envio mais uma constante; reenviar renova, e encerrar a tratativa tira o prazo da tela                                                       |
| 2026-10-02 | Chatbot nao atende quem tem responsavel                                     | a correcao do grupo passa pelo responsavel; o robo atender o colaborador seria o contato direto por outra porta                                  |
| 2026-10-02 | Fluxo direto preservado no codigo e na tag `contato-direto-v1`              | continua sendo o caminho de quem nao tem responsavel; reimplantar e ajuste de cadastro, e nao reversao                                           |
| 2026-10-06 | Tema claro/escuro com `next-themes`, destaque #6DC9A6                       | o shadcn ja trazia os tokens de `.dark`; a escolha fica no navegador porque vale no login e e do aparelho, e nao da conta                        |
| 2026-10-07 | Envio consolidado por responsavel, manual e com previa                      | uma mensagem por ocorrencia afogava o responsavel; disparo automatico ou em lote tiraria a conferencia de algo sem desfazer                      |
| 2026-10-07 | Consolidado so com o que ainda nao foi enviado a ele                        | reenviar o que esta no prazo renovaria o prazo sem ninguem pedir; a cobranca continua sendo gesto na ocorrencia                                  |
| 2026-10-07 | Texto do consolidado fixo, conferido por assinatura                         | o texto e a lista do que fica como avisado; editado, o historico registraria como enviada uma ocorrencia que saiu do texto                       |
| 2026-10-07 | Consolidado como linhas de `mensagens_ponto` com `lote_id`                  | historico, prazo e o filtro do proximo envio continuam lendo uma tabela so                                                                       |
| 2026-10-07 | Consolidado so com falta e marcacao incompleta                              | os mesmos tipos do chatbot: o que o responsavel resolve perguntando; hora extra e debito sao decisao de quem confere                             |
| 2026-10-09 | Tolerancia de 10 minutos por ponta do turno, e nao so no total do dia       | entrar 06:52 e sair 17:09 esta na margem nas duas batidas; somadas, viravam 17 minutos de hora extra no espelho                                  |
| 2026-10-09 | Modulo de movimentacoes (falta, troca interna, troca de escala)             | registrar o que fugiu da escala com justificativa e documento; e registro, e nao alimenta grade, ponto nem apontamento                           |
| 2026-10-09 | Documentos no banco (`bytea`), e nao em pasta do servidor                   | backup e exclusao andam com o registro, e o deploy por tar nao precisa preservar diretorio; o tamanho fica contido pela compressao               |
| 2026-10-09 | Imagem reduzida no navegador (WebP), servidor so confere e tenta gzip       | `sharp` exige install script (bloqueado pelo npm 12); reduzir antes do envio poupa rede e espaco, e o servidor recusa o que passar do teto       |
| 2026-10-09 | Tipo do documento pelos primeiros bytes, e nao pela extensao                | extensao e `type` vem do cliente; so imagem e PDF entram, e o download responde com o tipo conferido                                             |
| 2026-11-12 | Modulo de efetivos com locais globais e tipos de excecao proprios           | lancamento diario do efetivo por posto; local nao e funcao do posto, e excecao nao e sigla da grade — o tipo carrega um comportamento fechado    |
| 2026-11-12 | Efetivo por data, e nao por competencia                                     | o D-2 e a semana atravessam a virada do periodo; mesmo arranjo dos afastamentos                                                                  |
| 2026-11-12 | Conflito de horario pede confirmacao, e nao bloqueia                        | a dobra legitima existe; nada e gravado sem a decisao, e os confirmados ficam no painel do dia                                                   |
| 2026-11-23 | Limpar os apontamentos da competencia, com confirmacao e contagem conferida | recomecar o fechamento sem SQL; a action recusa se o numero mudou, porque a confirmacao vale para o que a pessoa leu                             |
