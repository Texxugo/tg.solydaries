ALTER TABLE "consultas_competencia" DROP CONSTRAINT "consultas_competencia_usuario_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "consultas_competencia" DROP COLUMN "usuario_id";--> statement-breakpoint
ALTER TABLE "consultas_competencia" DROP COLUMN "expira_em";