CREATE TABLE "escala_folgas" (
	"escala_id" uuid NOT NULL,
	"dia_ciclo" smallint NOT NULL,
	CONSTRAINT "escala_folgas_escala_id_dia_ciclo_pk" PRIMARY KEY("escala_id","dia_ciclo"),
	CONSTRAINT "escala_folgas_dia_valido" CHECK (dia_ciclo >= 1 and dia_ciclo <= 60)
);
--> statement-breakpoint
ALTER TABLE "escala_excecoes" DROP CONSTRAINT "escala_excecoes_dia_valido";--> statement-breakpoint
ALTER TABLE "escalas" DROP CONSTRAINT "escalas_ciclo_valido";--> statement-breakpoint
ALTER TABLE "escalas" ADD COLUMN "dias_ciclo" smallint DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "escala_folgas" ADD CONSTRAINT "escala_folgas_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escala_excecoes" ADD CONSTRAINT "escala_excecoes_dia_valido" CHECK (dia_ciclo >= 1 and dia_ciclo <= 60);--> statement-breakpoint
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_ciclo_valido" CHECK (dias_ciclo >= 1 and dias_ciclo <= 60);--> statement-breakpoint
-- Converte o que ja estava gravado: o ciclo passa a ser o total de dias, e a
-- folga que era "os ultimos M dias" vira uma linha por posicao. Toda escala
-- existente e regular, entao a conversao e exata — 5x2 vira ciclo de 7 com
-- folga no 6 e no 7.
UPDATE "escalas" SET "dias_ciclo" = "dias_trabalhados" + "dias_folga";--> statement-breakpoint
INSERT INTO "escala_folgas" ("escala_id", "dia_ciclo")
SELECT "escalas"."id", dia
FROM "escalas", generate_series("dias_trabalhados" + 1, "dias_trabalhados" + "dias_folga") AS dia
WHERE "dias_folga" > 0;
