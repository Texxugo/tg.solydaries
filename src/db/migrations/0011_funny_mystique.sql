ALTER TYPE "public"."area_portal" ADD VALUE 'ponto';--> statement-breakpoint
CREATE TABLE "importacoes_ponto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"arquivo" text NOT NULL,
	"periodo_inicio" date NOT NULL,
	"periodo_fim" date NOT NULL,
	"marcacoes_lidas" integer DEFAULT 0 NOT NULL,
	"marcacoes_gravadas" integer DEFAULT 0 NOT NULL,
	"importado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "importacoes_ponto_periodo_valido" CHECK (periodo_fim >= periodo_inicio)
);
--> statement-breakpoint
CREATE TABLE "marcacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"data" date NOT NULL,
	"hora" time NOT NULL,
	"incluida" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "codigo" text;--> statement-breakpoint
ALTER TABLE "importacoes_ponto" ADD CONSTRAINT "importacoes_ponto_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes_ponto" ADD CONSTRAINT "importacoes_ponto_importado_por_usuarios_id_fk" FOREIGN KEY ("importado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcacoes" ADD CONSTRAINT "marcacoes_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcacoes" ADD CONSTRAINT "marcacoes_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "importacoes_ponto_competencia_idx" ON "importacoes_ponto" USING btree ("competencia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marcacoes_unica" ON "marcacoes" USING btree ("funcionario_id","data","hora");--> statement-breakpoint
CREATE INDEX "marcacoes_competencia_idx" ON "marcacoes" USING btree ("competencia_id","funcionario_id","data");--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_codigo_unico" ON "empresas" USING btree ("codigo");--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_codigo_valido" CHECK (codigo is null or codigo ~ '^[0-9A-Za-z-]{1,20}$');