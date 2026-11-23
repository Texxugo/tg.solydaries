CREATE TYPE "public"."divergencia_tipo" AS ENUM('sem_marcacao', 'marcacao_em_afastamento', 'marcacao_impar', 'marcacoes_a_menos', 'marcacoes_a_mais', 'trabalho_em_folga', 'turno_em_aberto', 'intrajornada_curta', 'hora_extra', 'debito_de_horas');--> statement-breakpoint
CREATE TYPE "public"."mensagem_status" AS ENUM('enviada', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."tratativa_status" AS ENUM('aberta', 'em_tratativa', 'justificada', 'resolvida', 'descartada');--> statement-breakpoint
CREATE TABLE "mensagens_ponto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tratativa_id" uuid NOT NULL,
	"telefone" text NOT NULL,
	"conteudo" text NOT NULL,
	"status" "mensagem_status" NOT NULL,
	"mensagem_externa_id" text,
	"erro" text,
	"enviado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tratativas_ponto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"data" date NOT NULL,
	"tipo" "divergencia_tipo" NOT NULL,
	"status" "tratativa_status" DEFAULT 'aberta' NOT NULL,
	"observacao" text,
	"responsavel_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funcionarios" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "mensagens_ponto" ADD CONSTRAINT "mensagens_ponto_tratativa_id_tratativas_ponto_id_fk" FOREIGN KEY ("tratativa_id") REFERENCES "public"."tratativas_ponto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_ponto" ADD CONSTRAINT "mensagens_ponto_enviado_por_usuarios_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratativas_ponto" ADD CONSTRAINT "tratativas_ponto_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratativas_ponto" ADD CONSTRAINT "tratativas_ponto_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratativas_ponto" ADD CONSTRAINT "tratativas_ponto_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_ponto_tratativa_idx" ON "mensagens_ponto" USING btree ("tratativa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "tratativas_ponto_ocorrencia" ON "tratativas_ponto" USING btree ("funcionario_id","data","tipo");--> statement-breakpoint
CREATE INDEX "tratativas_ponto_competencia_idx" ON "tratativas_ponto" USING btree ("competencia_id","status");--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_telefone_valido" CHECK (telefone is null or telefone ~ '^[0-9]{10,15}$');