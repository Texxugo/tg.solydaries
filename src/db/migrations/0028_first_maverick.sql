-- A consulta passa a pertencer a sessao de login, e nao ao usuario. As linhas
-- atuais nao tem sessao a que se prender: sao estado temporario, e apaga-las
-- so devolve quem estava consultando a competencia aberta.
DELETE FROM "consultas_competencia";--> statement-breakpoint
ALTER TABLE "consultas_competencia" DROP CONSTRAINT "consultas_competencia_pkey";--> statement-breakpoint
ALTER TABLE "consultas_competencia" ADD COLUMN "sessao_id" uuid PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "consultas_competencia" ADD CONSTRAINT "consultas_competencia_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;
