ALTER TABLE "preenchimento_linhas" ADD COLUMN "escala_id" uuid;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD COLUMN "inicio_ciclo" date;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_escala_com_inicio" CHECK ((escala_id is null) = (inicio_ciclo is null));