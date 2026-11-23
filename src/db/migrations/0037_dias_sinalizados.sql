ALTER TYPE "public"."area_portal" ADD VALUE 'sinalizacoes';--> statement-breakpoint
CREATE TABLE "sinalizacoes_dia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linha_id" uuid NOT NULL,
	"data" date NOT NULL,
	"sinalizado_por" uuid,
	"sinalizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_por" uuid,
	"resolvido_em" timestamp with time zone,
	CONSTRAINT "sinalizacoes_dia_resolucao_completa" CHECK (resolvido_por is null or resolvido_em is not null)
);
--> statement-breakpoint
ALTER TABLE "sinalizacoes_dia" ADD CONSTRAINT "sinalizacoes_dia_linha_id_preenchimento_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."preenchimento_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sinalizacoes_dia" ADD CONSTRAINT "sinalizacoes_dia_sinalizado_por_usuarios_id_fk" FOREIGN KEY ("sinalizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sinalizacoes_dia" ADD CONSTRAINT "sinalizacoes_dia_resolvido_por_usuarios_id_fk" FOREIGN KEY ("resolvido_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sinalizacoes_dia_unica" ON "sinalizacoes_dia" USING btree ("linha_id","data");--> statement-breakpoint
CREATE INDEX "sinalizacoes_dia_pendentes" ON "sinalizacoes_dia" USING btree ("resolvido_em");