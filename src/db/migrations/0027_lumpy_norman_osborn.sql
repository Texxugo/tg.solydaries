CREATE TYPE "public"."atendimento_desfecho" AS ENUM('confirmado', 'cancelado', 'expirado', 'sem_pendencia');--> statement-breakpoint
CREATE TYPE "public"."atendimento_etapa" AS ENUM('data', 'tipo', 'motivo', 'horarios', 'descricao', 'confirmacao');--> statement-breakpoint
CREATE TYPE "public"."mensagem_whatsapp_direcao" AS ENUM('recebida', 'enviada');--> statement-breakpoint
CREATE TYPE "public"."mensagem_whatsapp_status" AS ENUM('recebida', 'enviada', 'falhou');--> statement-breakpoint
CREATE TABLE "atendimentos_ponto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telefone" text NOT NULL,
	"funcionario_id" uuid,
	"competencia_id" uuid,
	"etapa" "atendimento_etapa" DEFAULT 'data' NOT NULL,
	"desfecho" "atendimento_desfecho",
	"data" date,
	"tipo" "divergencia_tipo",
	"descricao_ocorrencia" text,
	"motivo" text,
	"horarios" text[],
	"descricao" text,
	"opcoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tratativa_id" uuid,
	"tentativas_invalidas" smallint DEFAULT 0 NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_interacao_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	CONSTRAINT "atendimentos_ponto_desfecho_com_fim" CHECK ((desfecho is null) = (encerrado_em is null))
);
--> statement-breakpoint
CREATE TABLE "comprovantes_tratativa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"tratativa_id" uuid NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"data" date NOT NULL,
	"tipo" "divergencia_tipo" NOT NULL,
	"sequencia_final" bigint NOT NULL,
	"conteudo" text NOT NULL,
	"hash" text NOT NULL,
	"pdf" "bytea" NOT NULL,
	"pdf_hash" text NOT NULL,
	"gerado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "comprovantes_tratativa_hash_valido" CHECK (hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "mensagens_whatsapp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequencia" bigserial NOT NULL,
	"atendimento_id" uuid,
	"telefone" text NOT NULL,
	"direcao" "mensagem_whatsapp_direcao" NOT NULL,
	"status" "mensagem_whatsapp_status" NOT NULL,
	"mensagem_externa_id" text,
	"conteudo" text NOT NULL,
	"opcao_id" text,
	"opcoes" jsonb,
	"erro" text,
	"momento" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimentos_ponto" ADD CONSTRAINT "atendimentos_ponto_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos_ponto" ADD CONSTRAINT "atendimentos_ponto_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos_ponto" ADD CONSTRAINT "atendimentos_ponto_tratativa_id_tratativas_ponto_id_fk" FOREIGN KEY ("tratativa_id") REFERENCES "public"."tratativas_ponto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprovantes_tratativa" ADD CONSTRAINT "comprovantes_tratativa_atendimento_id_atendimentos_ponto_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos_ponto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprovantes_tratativa" ADD CONSTRAINT "comprovantes_tratativa_tratativa_id_tratativas_ponto_id_fk" FOREIGN KEY ("tratativa_id") REFERENCES "public"."tratativas_ponto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprovantes_tratativa" ADD CONSTRAINT "comprovantes_tratativa_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_atendimento_id_atendimentos_ponto_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos_ponto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_ponto_um_aberto" ON "atendimentos_ponto" USING btree ("telefone") WHERE encerrado_em is null;--> statement-breakpoint
CREATE INDEX "atendimentos_ponto_funcionario_idx" ON "atendimentos_ponto" USING btree ("funcionario_id","iniciado_em");--> statement-breakpoint
CREATE INDEX "atendimentos_ponto_ocorrencia_idx" ON "atendimentos_ponto" USING btree ("funcionario_id","data","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "comprovantes_tratativa_atendimento" ON "comprovantes_tratativa" USING btree ("atendimento_id");--> statement-breakpoint
CREATE INDEX "comprovantes_tratativa_funcionario_idx" ON "comprovantes_tratativa" USING btree ("funcionario_id","gerado_em");--> statement-breakpoint
CREATE INDEX "comprovantes_tratativa_tratativa_idx" ON "comprovantes_tratativa" USING btree ("tratativa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_whatsapp_recebida_unica" ON "mensagens_whatsapp" USING btree ("mensagem_externa_id") WHERE direcao = 'recebida' and mensagem_externa_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_whatsapp_sequencia" ON "mensagens_whatsapp" USING btree ("sequencia");--> statement-breakpoint
CREATE INDEX "mensagens_whatsapp_atendimento_idx" ON "mensagens_whatsapp" USING btree ("atendimento_id","sequencia");--> statement-breakpoint
CREATE INDEX "mensagens_whatsapp_telefone_idx" ON "mensagens_whatsapp" USING btree ("telefone","momento");