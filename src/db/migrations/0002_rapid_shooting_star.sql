CREATE TYPE "public"."area_portal" AS ENUM('avisos', 'acessos');--> statement-breakpoint
CREATE TABLE "acessos" (
	"usuario_id" uuid NOT NULL,
	"area" "area_portal" NOT NULL,
	"concedido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acessos_usuario_id_area_pk" PRIMARY KEY("usuario_id","area")
);
--> statement-breakpoint
ALTER TABLE "acessos" ADD CONSTRAINT "acessos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;