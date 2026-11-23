ALTER TABLE "preenchimento_linhas" ADD COLUMN "hora_entrada" time;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD COLUMN "hora_saida" time;--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_horario_completo" CHECK ((hora_entrada is null) = (hora_saida is null));--> statement-breakpoint
ALTER TABLE "preenchimento_linhas" ADD CONSTRAINT "preenchimento_linhas_horario_valido" CHECK (hora_entrada is null or hora_entrada <> hora_saida);