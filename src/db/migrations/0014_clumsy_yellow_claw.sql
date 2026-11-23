CREATE TYPE "public"."evento_cor" AS ENUM('cinza', 'verde', 'azul', 'ambar', 'vermelho', 'roxo');--> statement-breakpoint
CREATE TYPE "public"."evento_natureza" AS ENUM('trabalho', 'folga', 'falta', 'afastamento', 'outro');--> statement-breakpoint
CREATE TYPE "public"."preenchimento_faixa" AS ENUM('previsto', 'realizado');--> statement-breakpoint
ALTER TYPE "public"."area_portal" ADD VALUE 'postos';--> statement-breakpoint
ALTER TYPE "public"."area_portal" ADD VALUE 'eventos';--> statement-breakpoint
ALTER TYPE "public"."area_portal" ADD VALUE 'preenchimento';--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"rotulo" text NOT NULL,
	"descricao" text,
	"natureza" "evento_natureza" NOT NULL,
	"cor" "evento_cor" DEFAULT 'cinza' NOT NULL,
	"exige_horario" boolean DEFAULT false NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funcoes_posto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posto_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"escala_id" uuid,
	"evento_trabalho_id" uuid,
	"observacao" text,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"empresa_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "postos_codigo_valido" CHECK (codigo ~ '^[0-9A-Za-z-]{1,20}$')
);
--> statement-breakpoint
CREATE TABLE "freelancers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"codigo" text,
	"telefone" text,
	"observacao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freelancers_telefone_valido" CHECK (telefone is null or telefone ~ '^[0-9]{10,15}$')
);
--> statement-breakpoint
CREATE TABLE "preenchimento_dias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linha_id" uuid NOT NULL,
	"data" date NOT NULL,
	"faixa" "preenchimento_faixa" NOT NULL,
	"evento_id" uuid,
	"hora_entrada" time,
	"hora_saida" time,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preenchimento_dias_horario_completo" CHECK ((hora_entrada is null) = (hora_saida is null)),
	CONSTRAINT "preenchimento_dias_nao_vazia" CHECK (evento_id is not null or hora_entrada is not null or observacao is not null)
);
--> statement-breakpoint
CREATE TABLE "preenchimento_linhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"funcao_id" uuid NOT NULL,
	"funcionario_id" uuid,
	"freelancer_id" uuid,
	"observacao" text,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preenchimento_linhas_uma_pessoa" CHECK ((funcionario_id is null) <> (freelancer_id is null))
);
--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD CONSTRAINT "funcoes_posto_posto_id_postos_id_fk" FOREIGN KEY ("posto_id") REFERENCES "public"."postos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD CONSTRAINT "funcoes_posto_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD CONSTRAINT "funcoes_posto_evento_trabalho_id_eventos_id_fk" FOREIGN KEY ("evento_trabalho_id") REFERENCES "public"."eventos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postos" ADD CONSTRAINT "postos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_linha_id_preenchimento_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."preenchimento_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_funcao_id_funcoes_posto_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "public"."funcoes_posto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_codigo_unico" ON "eventos" USING btree (lower("codigo"));--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_rotulo_unico" ON "eventos" USING btree (lower("rotulo"));--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_padrao_por_natureza" ON "eventos" USING btree ("natureza") WHERE padrao;--> statement-breakpoint
CREATE UNIQUE INDEX "funcoes_posto_nome_unico" ON "funcoes_posto" USING btree ("posto_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "postos_codigo_unico" ON "postos" USING btree (lower("codigo"));--> statement-breakpoint
CREATE UNIQUE INDEX "postos_nome_unico" ON "postos" USING btree (lower("nome"));--> statement-breakpoint
CREATE INDEX "postos_empresa_idx" ON "postos" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "freelancers_nome_unico" ON "freelancers" USING btree (lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "freelancers_codigo_unico" ON "freelancers" USING btree (lower("codigo"));--> statement-breakpoint
CREATE UNIQUE INDEX "preenchimento_dias_celula_unica" ON "preenchimento_dias" USING btree ("linha_id","data","faixa");--> statement-breakpoint
CREATE INDEX "preenchimento_dias_data_idx" ON "preenchimento_dias" USING btree ("data");--> statement-breakpoint
CREATE INDEX "preenchimento_linhas_bloco_idx" ON "preenchimento_linhas" USING btree ("competencia_id","funcao_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "preenchimento_linhas_funcionario_unico" ON "preenchimento_linhas" USING btree ("competencia_id","funcao_id","funcionario_id") WHERE funcionario_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "preenchimento_linhas_freelancer_unico" ON "preenchimento_linhas" USING btree ("competencia_id","funcao_id","freelancer_id") WHERE freelancer_id is not null;--> statement-breakpoint
CREATE INDEX "preenchimento_linhas_funcionario_idx" ON "preenchimento_linhas" USING btree ("funcionario_id");--> statement-breakpoint
CREATE INDEX "preenchimento_linhas_freelancer_idx" ON "preenchimento_linhas" USING btree ("freelancer_id");