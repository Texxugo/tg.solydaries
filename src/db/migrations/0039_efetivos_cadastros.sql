CREATE TYPE "public"."efetivo_comportamento" AS ENUM('falta_sem_cobertura', 'cobertura', 'troca', 'simples');--> statement-breakpoint
ALTER TYPE "public"."area_portal" ADD VALUE 'efetivos';--> statement-breakpoint
CREATE TABLE "efetivo_tipos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rotulo" text NOT NULL,
	"comportamento" "efetivo_comportamento" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "efetivo_tipos_rotulo_unico" ON "efetivo_tipos" USING btree (lower("rotulo"));--> statement-breakpoint
CREATE UNIQUE INDEX "locais_nome_unico" ON "locais" USING btree (lower("nome"));--> statement-breakpoint
-- Cadastros iniciais do lancamento de efetivo. Ficam na migration, e nao num
-- seed, para chegarem tambem a producao. `on conflict do nothing` porque o
-- indice e por `lower(nome)`: rodar de novo, ou ja ter cadastrado a mao, nao
-- duplica nem falha.
INSERT INTO "locais" ("nome") VALUES ('Portaria'), ('Ronda'), ('CFTV'), ('Zeladoria')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "efetivo_tipos" ("rotulo", "comportamento") VALUES
  ('Falta sem cobertura', 'falta_sem_cobertura'),
  ('Cobertura de falta', 'cobertura'),
  ('Troca interna', 'troca'),
  ('Dobra/Hora extra', 'simples'),
  ('Folga trabalhada', 'simples'),
  ('Atestado', 'simples')
ON CONFLICT DO NOTHING;
