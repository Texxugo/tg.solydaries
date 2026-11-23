CREATE TABLE "efetivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" date NOT NULL,
	"posto_id" uuid NOT NULL,
	"funcionario_id" uuid,
	"freelancer_id" uuid,
	"local_id" uuid NOT NULL,
	"hora_entrada" time NOT NULL,
	"hora_saida" time NOT NULL,
	"tipo_id" uuid,
	"contraparte_funcionario_id" uuid,
	"contraparte_freelancer_id" uuid,
	"posto_origem_id" uuid,
	"observacao" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efetivos_uma_pessoa" CHECK (("efetivos"."funcionario_id" is null) <> ("efetivos"."freelancer_id" is null)),
	CONSTRAINT "efetivos_uma_contraparte" CHECK ("efetivos"."contraparte_funcionario_id" is null or "efetivos"."contraparte_freelancer_id" is null),
	CONSTRAINT "efetivos_detalhe_da_excecao" CHECK ("efetivos"."tipo_id" is not null or ("efetivos"."contraparte_funcionario_id" is null and "efetivos"."contraparte_freelancer_id" is null and "efetivos"."posto_origem_id" is null)),
	CONSTRAINT "efetivos_horario" CHECK ("efetivos"."hora_entrada" <> "efetivos"."hora_saida")
);
--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_posto_id_postos_id_fk" FOREIGN KEY ("posto_id") REFERENCES "public"."postos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_local_id_locais_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_tipo_id_efetivo_tipos_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."efetivo_tipos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_contraparte_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("contraparte_funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_contraparte_freelancer_id_freelancers_id_fk" FOREIGN KEY ("contraparte_freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_posto_origem_id_postos_id_fk" FOREIGN KEY ("posto_origem_id") REFERENCES "public"."postos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efetivos" ADD CONSTRAINT "efetivos_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "efetivos_data_posto" ON "efetivos" USING btree ("data","posto_id");--> statement-breakpoint
CREATE INDEX "efetivos_posto_local" ON "efetivos" USING btree ("posto_id","local_id");--> statement-breakpoint
CREATE UNIQUE INDEX "efetivos_funcionario_unico" ON "efetivos" USING btree ("data","posto_id","funcionario_id","hora_entrada") WHERE "efetivos"."funcionario_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "efetivos_freelancer_unico" ON "efetivos" USING btree ("data","posto_id","freelancer_id","hora_entrada") WHERE "efetivos"."freelancer_id" is not null;