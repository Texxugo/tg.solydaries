CREATE TYPE "public"."apontamento_rubrica" AS ENUM('vt_dias', 'vr_dias', 'cesta_basica', 'he_50', 'he_60', 'he_100', 'adicional_noturno', 'intrajornada', 'insalubridade', 'periculosidade', 'assiduidade', 'gratificacao', 'faltas_escala', 'faltas_folga', 'dsr');--> statement-breakpoint
CREATE TYPE "public"."regra_acao" AS ENUM('somar', 'definir');--> statement-breakpoint
CREATE TYPE "public"."regra_gatilho" AS ENUM('dia_trabalhado', 'dia_de_falta', 'dia_com_intrajornada', 'fixo');--> statement-breakpoint
CREATE TABLE "regra_apontamento_excecoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regra_id" uuid NOT NULL,
	"empresa_id" uuid,
	"posto_id" uuid,
	"funcao_id" uuid,
	"funcionario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regra_apontamento_excecoes_um_alvo" CHECK ((case when empresa_id is null then 0 else 1 end)
        + (case when posto_id is null then 0 else 1 end)
        + (case when funcao_id is null then 0 else 1 end)
        + (case when funcionario_id is null then 0 else 1 end) = 1)
);
--> statement-breakpoint
CREATE TABLE "regras_apontamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"empresa_id" uuid,
	"cargo" text,
	"funcionario_id" uuid,
	"posto_id" uuid,
	"funcao_id" uuid,
	"turma" "funcao_turma",
	"evento_id" uuid,
	"ciclo_dias" smallint,
	"ciclo_folgas" smallint,
	"jornada_minutos" integer,
	"gatilho" "regra_gatilho" NOT NULL,
	"rubrica" "apontamento_rubrica" NOT NULL,
	"acao" "regra_acao" DEFAULT 'somar' NOT NULL,
	"quantidade" integer,
	"percentual" numeric(5, 2),
	"grau" "insalubridade_grau",
	"atualizado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_apontamento_um_valor" CHECK ((case when quantidade is null then 0 else 1 end)
        + (case when percentual is null then 0 else 1 end)
        + (case when grau is null then 0 else 1 end) = 1),
	CONSTRAINT "regras_apontamento_valores_validos" CHECK ((quantidade is null or quantidade between 0 and 44640)
        and (percentual is null or percentual between 0 and 100)),
	CONSTRAINT "regras_apontamento_ciclo_completo" CHECK ((ciclo_dias is null) = (ciclo_folgas is null)),
	CONSTRAINT "regras_apontamento_cargo_preenchido" CHECK (cargo is null or length(btrim(cargo)) > 0)
);
--> statement-breakpoint
ALTER TABLE "regra_apontamento_excecoes" ADD CONSTRAINT "regra_apontamento_excecoes_regra_id_regras_apontamento_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_apontamento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_apontamento_excecoes" ADD CONSTRAINT "regra_apontamento_excecoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_apontamento_excecoes" ADD CONSTRAINT "regra_apontamento_excecoes_posto_id_postos_id_fk" FOREIGN KEY ("posto_id") REFERENCES "public"."postos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_apontamento_excecoes" ADD CONSTRAINT "regra_apontamento_excecoes_funcao_id_funcoes_posto_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "public"."funcoes_posto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_apontamento_excecoes" ADD CONSTRAINT "regra_apontamento_excecoes_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apontamento" ADD CONSTRAINT "regras_apontamento_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apontamento" ADD CONSTRAINT "regras_apontamento_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apontamento" ADD CONSTRAINT "regras_apontamento_posto_id_postos_id_fk" FOREIGN KEY ("posto_id") REFERENCES "public"."postos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apontamento" ADD CONSTRAINT "regras_apontamento_funcao_id_funcoes_posto_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "public"."funcoes_posto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apontamento" ADD CONSTRAINT "regras_apontamento_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_apontamento" ADD CONSTRAINT "regras_apontamento_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regra_apontamento_excecoes_regra_idx" ON "regra_apontamento_excecoes" USING btree ("regra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regras_apontamento_nome_unico" ON "regras_apontamento" USING btree (lower("nome"));--> statement-breakpoint
CREATE INDEX "regras_apontamento_ordem_idx" ON "regras_apontamento" USING btree ("ordem");