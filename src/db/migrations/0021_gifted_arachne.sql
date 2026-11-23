CREATE TYPE "public"."funcao_turma" AS ENUM('escala', 'contraescala');--> statement-breakpoint
CREATE TABLE "funcao_ciclos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funcao_id" uuid NOT NULL,
	"turma" "funcao_turma" DEFAULT 'escala' NOT NULL,
	"vigencia_inicio" date,
	"dias_ciclo" smallint NOT NULL,
	"folgas" smallint[] DEFAULT '{}' NOT NULL,
	"entrada" time NOT NULL,
	"saida" time NOT NULL,
	"inicio_ciclo" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcao_ciclos_dias_valido" CHECK (dias_ciclo between 1 and 62),
	CONSTRAINT "funcao_ciclos_folgas_no_ciclo" CHECK (coalesce(array_length(folgas, 1), 0) < dias_ciclo),
	CONSTRAINT "funcao_ciclos_horario_valido" CHECK (entrada <> saida)
);
--> statement-breakpoint
ALTER TABLE "funcoes_posto" DROP CONSTRAINT "funcoes_posto_previsto_completo";--> statement-breakpoint
ALTER TABLE "funcoes_posto" DROP CONSTRAINT "funcoes_posto_dias_ciclo_valido";--> statement-breakpoint
ALTER TABLE "funcoes_posto" DROP CONSTRAINT "funcoes_posto_folgas_no_ciclo";--> statement-breakpoint
ALTER TABLE "funcoes_posto" DROP CONSTRAINT "funcoes_posto_horario_valido";--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD COLUMN "turma" "funcao_turma" DEFAULT 'escala' NOT NULL;--> statement-breakpoint
ALTER TABLE "funcao_ciclos" ADD CONSTRAINT "funcao_ciclos_funcao_id_funcoes_posto_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "public"."funcoes_posto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funcao_ciclos_vigencia_idx" ON "funcao_ciclos" USING btree ("funcao_id","turma","vigencia_inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "funcao_ciclos_vigencia_unica" ON "funcao_ciclos" USING btree ("funcao_id","turma","vigencia_inicio") WHERE vigencia_inicio is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "funcao_ciclos_inicial_unica" ON "funcao_ciclos" USING btree ("funcao_id","turma") WHERE vigencia_inicio is null;--> statement-breakpoint
-- O ciclo que hoje mora na funcao vira a vigencia inicial ("desde sempre") da
-- turma `escala`. A ancora vai junto, entao o previsto ja derivado nao muda em
-- nenhum dia. As colunas antigas saem na migration seguinte.
INSERT INTO "funcao_ciclos" ("funcao_id", "turma", "vigencia_inicio", "dias_ciclo", "folgas", "entrada", "saida", "inicio_ciclo")
SELECT "id", 'escala', NULL, "dias_ciclo", "folgas", "entrada", "saida", "inicio_ciclo"
FROM "funcoes_posto"
WHERE "dias_ciclo" IS NOT NULL AND "entrada" IS NOT NULL AND "saida" IS NOT NULL;
