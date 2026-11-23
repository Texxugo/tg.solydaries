ALTER TYPE "public"."evento_natureza" ADD VALUE 'troca';--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "exige_dia_trabalhado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD COLUMN "data_trabalhada" date;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD COLUMN "data_trabalhada" date;--> statement-breakpoint
CREATE UNIQUE INDEX "preenchimento_dias_trabalhado_unico" ON "preenchimento_dias" USING btree ("linha_id","data_trabalhada") WHERE data_trabalhada is not null;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_trabalhado_outro_dia" CHECK (data_trabalhada is null or data_trabalhada <> data);