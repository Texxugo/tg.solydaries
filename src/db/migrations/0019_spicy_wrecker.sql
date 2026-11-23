ALTER TABLE "funcoes_posto" ADD COLUMN "dias_ciclo" smallint;--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD COLUMN "folgas" smallint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD COLUMN "entrada" time;--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD COLUMN "saida" time;--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD CONSTRAINT "funcoes_posto_previsto_completo" CHECK ((dias_ciclo is null) = (entrada is null) and (entrada is null) = (saida is null));--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD CONSTRAINT "funcoes_posto_dias_ciclo_valido" CHECK (dias_ciclo is null or dias_ciclo between 1 and 62);--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD CONSTRAINT "funcoes_posto_folgas_no_ciclo" CHECK (case when dias_ciclo is null then coalesce(array_length(folgas, 1), 0) = 0
        else coalesce(array_length(folgas, 1), 0) < dias_ciclo end);--> statement-breakpoint
ALTER TABLE "funcoes_posto" ADD CONSTRAINT "funcoes_posto_horario_valido" CHECK (entrada is null or entrada <> saida);