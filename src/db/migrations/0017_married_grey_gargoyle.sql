ALTER TYPE "public"."area_portal" ADD VALUE 'extras';--> statement-breakpoint
CREATE TABLE "extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"data" date NOT NULL,
	"funcionario_id" uuid,
	"freelancer_id" uuid,
	"posto_id" uuid NOT NULL,
	"local" text NOT NULL,
	"hora_entrada" time NOT NULL,
	"hora_saida" time NOT NULL,
	"observacao" text,
	"registrado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extras_uma_pessoa" CHECK ((funcionario_id is null) <> (freelancer_id is null)),
	CONSTRAINT "extras_horario_valido" CHECK (hora_entrada <> hora_saida),
	CONSTRAINT "extras_local_preenchido" CHECK (length(btrim(local)) > 0)
);
--> statement-breakpoint
ALTER TABLE "extras" ADD CONSTRAINT "extras_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extras" ADD CONSTRAINT "extras_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extras" ADD CONSTRAINT "extras_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extras" ADD CONSTRAINT "extras_posto_id_postos_id_fk" FOREIGN KEY ("posto_id") REFERENCES "public"."postos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extras" ADD CONSTRAINT "extras_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extras_competencia_idx" ON "extras" USING btree ("competencia_id","data");--> statement-breakpoint
CREATE INDEX "extras_funcionario_idx" ON "extras" USING btree ("funcionario_id");--> statement-breakpoint
CREATE INDEX "extras_freelancer_idx" ON "extras" USING btree ("freelancer_id");--> statement-breakpoint
CREATE INDEX "extras_posto_idx" ON "extras" USING btree ("posto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extras_funcionario_unico" ON "extras" USING btree ("funcionario_id","data","posto_id","hora_entrada") WHERE funcionario_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "extras_freelancer_unico" ON "extras" USING btree ("freelancer_id","data","posto_id","hora_entrada") WHERE freelancer_id is not null;