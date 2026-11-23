-- As duas colunas ja foram convertidas em `dias_ciclo` + `escala_folgas` pela
-- migration anterior; aqui elas so saem de cena.
ALTER TABLE "escalas" DROP COLUMN "dias_trabalhados";--> statement-breakpoint
ALTER TABLE "escalas" DROP COLUMN "dias_folga";