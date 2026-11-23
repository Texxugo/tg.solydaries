-- A area "avisos" saiu do portal junto com o modulo. As concessoes dela
-- precisam sair antes da recriacao do enum: o cast abaixo nao tem para onde
-- converter um valor que o novo tipo nao conhece.
DELETE FROM "acessos" WHERE "area" = 'avisos';--> statement-breakpoint
DROP TABLE "avisos" CASCADE;--> statement-breakpoint
ALTER TABLE "acessos" ALTER COLUMN "area" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."area_portal";--> statement-breakpoint
CREATE TYPE "public"."area_portal" AS ENUM('competencias', 'acessos');--> statement-breakpoint
ALTER TABLE "acessos" ALTER COLUMN "area" SET DATA TYPE "public"."area_portal" USING "area"::"public"."area_portal";