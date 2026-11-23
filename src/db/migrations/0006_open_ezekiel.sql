-- Os dias trabalhados deixam de ser dias da semana e passam a ser um ciclo
-- (5x2, 6x1, 1x1 para o 12x36). A tabela `escala_dias` e o enum `dia_semana`
-- somem: em que dia o ciclo comeca a valer e do funcionario, nao da escala.
ALTER TABLE "escala_dias" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "escala_dias" CASCADE;--> statement-breakpoint
ALTER TABLE "escalas" ADD COLUMN "dias_trabalhados" smallint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "escalas" ADD COLUMN "dias_folga" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_ciclo_valido" CHECK (dias_trabalhados >= 1 and dias_trabalhados <= 30 and dias_folga >= 0 and dias_folga <= 30);--> statement-breakpoint
DROP TYPE "public"."dia_semana";