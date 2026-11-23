CREATE TYPE "public"."documento_compressao" AS ENUM('nenhuma', 'gzip');--> statement-breakpoint
CREATE TYPE "public"."movimentacao_papel" AS ENUM('ausente', 'cobertura', 'envolvido');--> statement-breakpoint
CREATE TYPE "public"."movimentacao_tipo" AS ENUM('falta', 'troca_interna', 'troca_escala');--> statement-breakpoint
ALTER TYPE "public"."area_portal" ADD VALUE 'movimentacoes';--> statement-breakpoint
CREATE TABLE "movimentacao_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimentacao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamanho_original" integer NOT NULL,
	"tamanho" integer NOT NULL,
	"compressao" "documento_compressao" NOT NULL,
	"conteudo" "bytea" NOT NULL,
	"enviado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimentacao_documentos_tamanho_valido" CHECK (tamanho > 0 and tamanho_original > 0 and tamanho = octet_length(conteudo))
);
--> statement-breakpoint
CREATE TABLE "movimentacao_pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimentacao_id" uuid NOT NULL,
	"papel" "movimentacao_papel" NOT NULL,
	"funcionario_id" uuid,
	"freelancer_id" uuid,
	"ordem" smallint NOT NULL,
	CONSTRAINT "movimentacao_pessoas_uma_pessoa" CHECK ((funcionario_id is null) <> (freelancer_id is null))
);
--> statement-breakpoint
CREATE TABLE "movimentacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"tipo" "movimentacao_tipo" NOT NULL,
	"data" date NOT NULL,
	"justificativa" text NOT NULL,
	"registrado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimentacoes_justificativa_preenchida" CHECK (length(btrim(justificativa)) > 0)
);
--> statement-breakpoint
ALTER TABLE "movimentacao_documentos" ADD CONSTRAINT "movimentacao_documentos_movimentacao_id_movimentacoes_id_fk" FOREIGN KEY ("movimentacao_id") REFERENCES "public"."movimentacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacao_documentos" ADD CONSTRAINT "movimentacao_documentos_enviado_por_id_usuarios_id_fk" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacao_pessoas" ADD CONSTRAINT "movimentacao_pessoas_movimentacao_id_movimentacoes_id_fk" FOREIGN KEY ("movimentacao_id") REFERENCES "public"."movimentacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacao_pessoas" ADD CONSTRAINT "movimentacao_pessoas_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacao_pessoas" ADD CONSTRAINT "movimentacao_pessoas_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimentacao_documentos_movimentacao_idx" ON "movimentacao_documentos" USING btree ("movimentacao_id");--> statement-breakpoint
CREATE INDEX "movimentacao_pessoas_movimentacao_idx" ON "movimentacao_pessoas" USING btree ("movimentacao_id");--> statement-breakpoint
CREATE INDEX "movimentacao_pessoas_funcionario_idx" ON "movimentacao_pessoas" USING btree ("funcionario_id");--> statement-breakpoint
CREATE INDEX "movimentacao_pessoas_freelancer_idx" ON "movimentacao_pessoas" USING btree ("freelancer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movimentacao_pessoas_funcionario_unico" ON "movimentacao_pessoas" USING btree ("movimentacao_id","funcionario_id") WHERE funcionario_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "movimentacao_pessoas_freelancer_unico" ON "movimentacao_pessoas" USING btree ("movimentacao_id","freelancer_id") WHERE freelancer_id is not null;--> statement-breakpoint
CREATE INDEX "movimentacoes_competencia_idx" ON "movimentacoes" USING btree ("competencia_id","data");