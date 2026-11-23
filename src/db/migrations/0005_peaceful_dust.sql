CREATE TYPE "public"."dia_semana" AS ENUM('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado');--> statement-breakpoint
ALTER TYPE "public"."area_portal" ADD VALUE 'escalas';--> statement-breakpoint
CREATE TABLE "escala_dias" (
	"escala_id" uuid NOT NULL,
	"dia" "dia_semana" NOT NULL,
	CONSTRAINT "escala_dias_escala_id_dia_pk" PRIMARY KEY("escala_id","dia")
);
--> statement-breakpoint
CREATE TABLE "escalas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"entrada" time NOT NULL,
	"saida" time NOT NULL,
	"intrajornada_minutos" integer DEFAULT 0 NOT NULL,
	"marcacoes_esperadas" smallint DEFAULT 2 NOT NULL,
	"horas_extras_minutos" integer DEFAULT 0 NOT NULL,
	"virada_turno" boolean GENERATED ALWAYS AS ((saida < entrada)) STORED NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escalas_horario_valido" CHECK (saida <> entrada),
	CONSTRAINT "escalas_intrajornada_valida" CHECK (intrajornada_minutos >= 0 and intrajornada_minutos < 1440),
	CONSTRAINT "escalas_marcacoes_validas" CHECK (marcacoes_esperadas >= 2 and marcacoes_esperadas <= 8 and marcacoes_esperadas % 2 = 0),
	CONSTRAINT "escalas_horas_extras_validas" CHECK (horas_extras_minutos >= 0 and horas_extras_minutos <= 720)
);
--> statement-breakpoint
ALTER TABLE "escala_dias" ADD CONSTRAINT "escala_dias_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escalas_nome_unico" ON "escalas" USING btree (lower("nome"));