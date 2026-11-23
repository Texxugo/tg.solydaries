ALTER TABLE "preenchimento_linhas" DROP CONSTRAINT "preenchimento_linhas_escala_com_inicio";--> statement-breakpoint
ALTER TABLE "funcoes_posto" DROP CONSTRAINT "funcoes_posto_escala_id_escalas_id_fk";
--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" DROP CONSTRAINT "preenchimento_linhas_escala_id_escalas_id_fk";
--> statement-breakpoint
ALTER TABLE "funcoes_posto" DROP COLUMN "escala_id";--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" DROP COLUMN "escala_id";