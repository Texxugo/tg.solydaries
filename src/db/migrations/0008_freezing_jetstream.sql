ALTER TYPE "public"."area_portal" ADD VALUE 'funcionarios';--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_cnpj_valido" CHECK (cnpj is null or cnpj ~ '^[0-9]{14}$')
);
--> statement-breakpoint
CREATE TABLE "funcionarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"matricula" text NOT NULL,
	"nome" text NOT NULL,
	"cpf" text NOT NULL,
	"cargo" text,
	"admissao" date,
	"situacao" smallint DEFAULT 1 NOT NULL,
	"escala_id" uuid,
	"inicio_ciclo" date,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcionarios_cpf_valido" CHECK (cpf ~ '^[0-9]{11}$'),
	CONSTRAINT "funcionarios_situacao_valida" CHECK (situacao >= 1 and situacao <= 99),
	CONSTRAINT "funcionarios_escala_com_inicio" CHECK ((escala_id is null) = (inicio_ciclo is null))
);
--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_nome_unico" ON "empresas" USING btree (lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_cnpj_unico" ON "empresas" USING btree ("cnpj");--> statement-breakpoint
CREATE UNIQUE INDEX "funcionarios_cpf_unico" ON "funcionarios" USING btree ("cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "funcionarios_matricula_unica" ON "funcionarios" USING btree ("empresa_id",lower("matricula"));--> statement-breakpoint
CREATE INDEX "funcionarios_escala_idx" ON "funcionarios" USING btree ("escala_id");