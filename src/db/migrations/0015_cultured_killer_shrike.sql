CREATE TABLE "preenchimento_alteracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linha_id" uuid NOT NULL,
	"data" date NOT NULL,
	"faixa" "preenchimento_faixa" NOT NULL,
	"evento_id" uuid,
	"hora_entrada" time,
	"hora_saida" time,
	"pessoa_funcionario_id" uuid,
	"pessoa_freelancer_id" uuid,
	"funcao_destino_id" uuid,
	"observacao" text,
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preenchimento_dias" DROP CONSTRAINT "preenchimento_dias_nao_vazia";--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "exige_pessoa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "exige_destino" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD COLUMN "pessoa_funcionario_id" uuid;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD COLUMN "pessoa_freelancer_id" uuid;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD COLUMN "funcao_destino_id" uuid;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD CONSTRAINT "preenchimento_alteracoes_linha_id_preenchimento_linhas_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."preenchimento_linhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD CONSTRAINT "preenchimento_alteracoes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD CONSTRAINT "preenchimento_alteracoes_pessoa_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("pessoa_funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD CONSTRAINT "preenchimento_alteracoes_pessoa_freelancer_id_freelancers_id_fk" FOREIGN KEY ("pessoa_freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD CONSTRAINT "preenchimento_alteracoes_funcao_destino_id_funcoes_posto_id_fk" FOREIGN KEY ("funcao_destino_id") REFERENCES "public"."funcoes_posto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD CONSTRAINT "preenchimento_alteracoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preenchimento_alteracoes_celula_idx" ON "preenchimento_alteracoes" USING btree ("linha_id","data","faixa","criado_em");--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_pessoa_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("pessoa_funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_pessoa_freelancer_id_freelancers_id_fk" FOREIGN KEY ("pessoa_freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_funcao_destino_id_funcoes_posto_id_fk" FOREIGN KEY ("funcao_destino_id") REFERENCES "public"."funcoes_posto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_uma_pessoa" CHECK (pessoa_funcionario_id is null or pessoa_freelancer_id is null);--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_nao_vazia" CHECK (evento_id is not null or hora_entrada is not null or observacao is not null
        or pessoa_funcionario_id is not null or pessoa_freelancer_id is not null
        or funcao_destino_id is not null);