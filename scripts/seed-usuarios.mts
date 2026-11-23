/**
 * Cria (ou recria) um usuario do portal.
 *
 * Roda fora do Next, direto no Node 24 — que faz type stripping nativo:
 *
 *   npm run db:seed                       # luis.ferreira / Administrador
 *   npm run db:seed -- --senha=SuaSenha10 # senha provisoria escolhida
 *   npm run db:seed -- --login=maria.silva --nome="Maria Silva" --perfil=usuario
 *   npm run db:seed -- --forcar           # redefine a senha de quem ja existe
 *
 * Sem `--senha`, uma senha provisoria aleatoria e gerada e impressa uma unica
 * vez. Em qualquer caso o usuario nasce com `senha_provisoria = true`, entao o
 * primeiro acesso cai obrigatoriamente em /trocar-senha.
 *
 * Usa `pg` com SQL cru de proposito: importar `src/db` traria o alias `@/` e o
 * `src/lib/env`, que so resolvem dentro do bundler do Next. O unico modulo
 * compartilhado e o de senha, para que nem o formato do hash nem a geracao da
 * senha provisoria divirjam do portal.
 *
 * Depois do primeiro administrador, o caminho normal e a tela de Acessos
 * (`/acessos`) — este script existe para o ovo antes da galinha.
 */
import { parseArgs } from "node:util";

import pg from "pg";

import { criarHashSenha, gerarSenhaProvisoria } from "../src/lib/senha.ts";

process.loadEnvFile?.(".env");

const PERFIS = ["administrador", "usuario"] as const;
type Perfil = (typeof PERFIS)[number];

const { values } = parseArgs({
  options: {
    login: { type: "string", default: "luis.ferreira" },
    nome: { type: "string", default: "Luis Ferreira" },
    perfil: { type: "string", default: "administrador" },
    senha: { type: "string" },
    forcar: { type: "boolean", default: false },
  },
});

const login = values.login!.trim().toLowerCase();
const nome = values.nome!.trim();
const perfil = values.perfil as Perfil;

if (!PERFIS.includes(perfil)) {
  console.error(`Perfil invalido: "${values.perfil}". Use ${PERFIS.join(" ou ")}.`);
  process.exit(1);
}

const senhaFoiInformada = typeof values.senha === "string" && values.senha.length > 0;
const senhaProvisoria = senhaFoiInformada ? values.senha! : gerarSenhaProvisoria();

if (senhaProvisoria.length < 10) {
  console.error("A senha provisoria precisa de pelo menos 10 caracteres.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL nao definida. Copie .env.example para .env.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  const senhaHash = await criarHashSenha(senhaProvisoria);

  const { rows } = await pool.query<{ id: string; criado: boolean }>(
    `insert into usuarios (login, nome, perfil, senha_hash, senha_provisoria, ativo)
     values ($1, $2, $3, $4, true, true)
     on conflict (login) do update
       set nome = excluded.nome,
           perfil = excluded.perfil,
           senha_hash = case when $5 then excluded.senha_hash else usuarios.senha_hash end,
           senha_provisoria = case when $5 then true else usuarios.senha_provisoria end,
           ativo = true
     returning id, (xmax = 0) as criado`,
    [login, nome, perfil, senhaHash, values.forcar],
  );

  const { id, criado } = rows[0];

  // Trocar a senha invalida as sessoes abertas daquele usuario.
  if (!criado && values.forcar) {
    await pool.query("delete from sessoes where usuario_id = $1", [id]);
  }

  console.log("");
  console.log(criado ? "Usuario criado." : "Usuario ja existia e foi atualizado.");
  console.log(`  login  : ${login}`);
  console.log(`  nome   : ${nome}`);
  console.log(`  perfil : ${perfil}`);

  // Administrador enxerga todas as areas por definicao; os demais nascem sem
  // nenhuma e dependem de alguem liberar em /acessos.
  if (perfil !== "administrador") {
    console.log("  areas  : nenhuma (libere na tela de Acessos)");
  }

  if (criado || values.forcar) {
    console.log(`  senha  : ${senhaProvisoria}   <- provisoria, exibida so agora`);
    console.log("");
    console.log("No primeiro acesso o portal exige a troca desta senha.");
  } else {
    console.log("");
    console.log("Senha mantida. Use --forcar para redefinir uma senha provisoria.");
  }

  console.log("");
} catch (erro) {
  console.error("Falha ao criar o usuario:", erro);
  process.exitCode = 1;
} finally {
  await pool.end();
}
