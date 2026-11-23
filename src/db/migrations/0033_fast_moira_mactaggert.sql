ALTER TABLE "mensagens_ponto" ADD COLUMN "lote_id" uuid;--> statement-breakpoint
CREATE INDEX "mensagens_ponto_lote_idx" ON "mensagens_ponto" USING btree ("lote_id");