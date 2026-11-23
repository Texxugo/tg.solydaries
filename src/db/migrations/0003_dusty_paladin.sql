CREATE TYPE "public"."competencia_status" AS ENUM('aberta', 'encerrada');--> statement-breakpoint
CREATE TABLE "competencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"referencia" date GENERATED ALWAYS AS ((date_trunc('month', data_fim::timestamp))::date) STORED,
	"status" "competencia_status" DEFAULT 'aberta' NOT NULL,
	"encerrada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competencias_periodo_valido" CHECK (data_fim > data_inicio)
);
--> statement-breakpoint
CREATE TABLE "consultas_competencia" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"competencia_id" uuid NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultas_competencia" ADD CONSTRAINT "consultas_competencia_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultas_competencia" ADD CONSTRAINT "consultas_competencia_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competencias_referencia_unica" ON "competencias" USING btree (referencia);--> statement-breakpoint
CREATE UNIQUE INDEX "competencias_unica_aberta" ON "competencias" USING btree (status) WHERE status = 'aberta';--> statement-breakpoint
CREATE INDEX "consultas_competencia_competencia_idx" ON "consultas_competencia" USING btree ("competencia_id");