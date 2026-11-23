CREATE TYPE "public"."afastamento_tipo" AS ENUM('ferias', 'atestado', 'inss');--> statement-breakpoint
CREATE TABLE "afastamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"tipo" "afastamento_tipo" NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "afastamentos_periodo_valido" CHECK (data_fim >= data_inicio)
);
--> statement-breakpoint
ALTER TABLE "afastamentos" ADD CONSTRAINT "afastamentos_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "afastamentos_funcionario_idx" ON "afastamentos" USING btree ("funcionario_id","data_inicio");