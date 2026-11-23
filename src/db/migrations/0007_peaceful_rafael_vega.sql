CREATE TABLE "escala_excecoes" (
	"escala_id" uuid NOT NULL,
	"dia_ciclo" smallint NOT NULL,
	"entrada" time NOT NULL,
	"saida" time NOT NULL,
	"intrajornada_minutos" integer DEFAULT 0 NOT NULL,
	"marcacoes_esperadas" smallint DEFAULT 2 NOT NULL,
	"horas_extras_minutos" integer DEFAULT 0 NOT NULL,
	"virada_turno" boolean GENERATED ALWAYS AS ((saida < entrada)) STORED NOT NULL,
	CONSTRAINT "escala_excecoes_escala_id_dia_ciclo_pk" PRIMARY KEY("escala_id","dia_ciclo"),
	CONSTRAINT "escala_excecoes_dia_valido" CHECK (dia_ciclo >= 1 and dia_ciclo <= 30),
	CONSTRAINT "escala_excecoes_horario_valido" CHECK (saida <> entrada),
	CONSTRAINT "escala_excecoes_intrajornada_valida" CHECK (intrajornada_minutos >= 0 and intrajornada_minutos < 1440),
	CONSTRAINT "escala_excecoes_marcacoes_validas" CHECK (marcacoes_esperadas >= 2 and marcacoes_esperadas <= 8 and marcacoes_esperadas % 2 = 0),
	CONSTRAINT "escala_excecoes_horas_extras_validas" CHECK (horas_extras_minutos >= 0 and horas_extras_minutos <= 720)
);
--> statement-breakpoint
ALTER TABLE "escala_excecoes" ADD CONSTRAINT "escala_excecoes_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE cascade ON UPDATE no action;