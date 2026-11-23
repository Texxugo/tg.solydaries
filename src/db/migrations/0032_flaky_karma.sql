CREATE TYPE "public"."mensagem_destino" AS ENUM('colaborador', 'responsavel');--> statement-breakpoint
ALTER TYPE "public"."atendimento_desfecho" ADD VALUE 'encaminhado_ao_responsavel';--> statement-breakpoint
CREATE TABLE "posto_contatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posto_id" uuid NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "mensagens_ponto" ADD COLUMN "destino" "mensagem_destino" DEFAULT 'colaborador' NOT NULL;--> statement-breakpoint
ALTER TABLE "mensagens_ponto" ADD COLUMN "destinatario_id" uuid;--> statement-breakpoint
ALTER TABLE "postos" ADD COLUMN "responsavel_id" uuid;--> statement-breakpoint
ALTER TABLE "posto_contatos" ADD CONSTRAINT "posto_contatos_posto_id_postos_id_fk" FOREIGN KEY ("posto_id") REFERENCES "public"."postos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posto_contatos" ADD CONSTRAINT "posto_contatos_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posto_contatos" ADD CONSTRAINT "posto_contatos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "posto_contatos_um_grupo" ON "posto_contatos" USING btree ("funcionario_id");--> statement-breakpoint
CREATE INDEX "posto_contatos_posto_idx" ON "posto_contatos" USING btree ("posto_id");--> statement-breakpoint
ALTER TABLE "mensagens_ponto" ADD CONSTRAINT "mensagens_ponto_destinatario_id_funcionarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postos" ADD CONSTRAINT "postos_responsavel_id_funcionarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "postos_responsavel_idx" ON "postos" USING btree ("responsavel_id");