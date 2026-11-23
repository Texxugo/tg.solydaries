ALTER TABLE "extras" ADD COLUMN "preenchimento_dia_id" uuid;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD COLUMN "extra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "extras" ADD CONSTRAINT "extras_preenchimento_dia_id_preenchimento_dias_id_fk" FOREIGN KEY ("preenchimento_dia_id") REFERENCES "public"."preenchimento_dias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extras_preenchimento_dia_unico" ON "extras" USING btree ("preenchimento_dia_id") WHERE preenchimento_dia_id is not null;