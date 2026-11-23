CREATE TYPE "public"."insalubridade_grau" AS ENUM('minimo', 'medio', 'maximo');--> statement-breakpoint
ALTER TYPE "public"."area_portal" ADD VALUE 'apontamentos';--> statement-breakpoint
CREATE TABLE "apontamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"vt_dias" smallint DEFAULT 0 NOT NULL,
	"vr_dias" smallint DEFAULT 0 NOT NULL,
	"cesta_basica" boolean DEFAULT false NOT NULL,
	"he_50_minutos" integer DEFAULT 0 NOT NULL,
	"he_60_minutos" integer DEFAULT 0 NOT NULL,
	"he_100_minutos" integer DEFAULT 0 NOT NULL,
	"adicional_noturno_minutos" integer DEFAULT 0 NOT NULL,
	"intrajornada_minutos" integer DEFAULT 0 NOT NULL,
	"insalubridade" "insalubridade_grau",
	"periculosidade" boolean DEFAULT false NOT NULL,
	"assiduidade" boolean DEFAULT false NOT NULL,
	"gratificacao_percentual" numeric(5, 2) DEFAULT 0 NOT NULL,
	"faltas_escala" smallint DEFAULT 0 NOT NULL,
	"faltas_folga" smallint DEFAULT 0 NOT NULL,
	"dsr_descontados" smallint DEFAULT 0 NOT NULL,
	"observacao" text,
	"atualizado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apontamentos_dias_validos" CHECK (vt_dias between 0 and 31 and vr_dias between 0 and 31
        and faltas_escala between 0 and 31 and faltas_folga between 0 and 31
        and dsr_descontados between 0 and 31),
	CONSTRAINT "apontamentos_minutos_validos" CHECK (he_50_minutos between 0 and 44640 and he_60_minutos between 0 and 44640
        and he_100_minutos between 0 and 44640 and adicional_noturno_minutos between 0 and 44640
        and intrajornada_minutos between 0 and 44640),
	CONSTRAINT "apontamentos_gratificacao_valida" CHECK (gratificacao_percentual between 0 and 100),
	CONSTRAINT "apontamentos_nao_vazio" CHECK (vt_dias > 0 or vr_dias > 0 or cesta_basica
        or he_50_minutos > 0 or he_60_minutos > 0 or he_100_minutos > 0
        or adicional_noturno_minutos > 0 or intrajornada_minutos > 0
        or insalubridade is not null or periculosidade or assiduidade
        or gratificacao_percentual > 0
        or faltas_escala > 0 or faltas_folga > 0 or dsr_descontados > 0
        or length(btrim(coalesce(observacao, ''))) > 0)
);
--> statement-breakpoint
ALTER TABLE "apontamentos" ADD CONSTRAINT "apontamentos_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apontamentos" ADD CONSTRAINT "apontamentos_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apontamentos" ADD CONSTRAINT "apontamentos_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apontamentos_competencia_funcionario_unico" ON "apontamentos" USING btree ("competencia_id","funcionario_id");--> statement-breakpoint
CREATE INDEX "apontamentos_funcionario_idx" ON "apontamentos" USING btree ("funcionario_id");