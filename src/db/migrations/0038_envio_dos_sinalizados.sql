CREATE TABLE "envios_sinalizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sinalizacao_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"responsavel_id" uuid,
	"telefone" text NOT NULL,
	"conteudo" text NOT NULL,
	"status" "mensagem_status" NOT NULL,
	"mensagem_externa_id" text,
	"erro" text,
	"enviado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sinalizacoes_dia" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "envios_sinalizacao" ADD CONSTRAINT "envios_sinalizacao_sinalizacao_id_sinalizacoes_dia_id_fk" FOREIGN KEY ("sinalizacao_id") REFERENCES "public"."sinalizacoes_dia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_sinalizacao" ADD CONSTRAINT "envios_sinalizacao_responsavel_id_funcionarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_sinalizacao" ADD CONSTRAINT "envios_sinalizacao_enviado_por_usuarios_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "envios_sinalizacao_dia" ON "envios_sinalizacao" USING btree ("sinalizacao_id","criado_em");--> statement-breakpoint
ALTER TABLE "sinalizacoes_dia" ADD CONSTRAINT "sinalizacoes_dia_observacao_curta" CHECK (char_length(observacao) <= 200);