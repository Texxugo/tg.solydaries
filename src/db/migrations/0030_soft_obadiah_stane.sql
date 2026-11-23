ALTER TABLE "preenchimento_dias" DROP CONSTRAINT "preenchimento_dias_nao_vazia";--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" ADD COLUMN "intrajornada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD COLUMN "intrajornada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preenchimento_dias" ADD CONSTRAINT "preenchimento_dias_nao_vazia" CHECK (evento_id is not null or hora_entrada is not null or observacao is not null
        or pessoa_funcionario_id is not null or pessoa_freelancer_id is not null
        or funcao_destino_id is not null or intrajornada);