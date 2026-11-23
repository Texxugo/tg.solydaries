-- A faixa sai da grade: so o realizado ocupa linha.
--
-- O previsto passou a ser derivado das vigencias da funcao a cada leitura, e as
-- linhas de `faixa = 'previsto'` gravadas pelas versoes anteriores nunca mais
-- foram lidas. Elas saem aqui, antes do indice unico: sem a faixa, uma celula
-- de previsto e uma de realizado do mesmo dia passariam a ser a mesma linha, e
-- `preenchimento_dias_celula_unica` recusaria as duas.
DELETE FROM "preenchimento_alteracoes" WHERE "faixa" = 'previsto';--> statement-breakpoint
DELETE FROM "preenchimento_dias" WHERE "faixa" = 'previsto';--> statement-breakpoint
DROP INDEX "preenchimento_alteracoes_celula_idx";--> statement-breakpoint
DROP INDEX "preenchimento_dias_celula_unica";--> statement-breakpoint
CREATE INDEX "preenchimento_alteracoes_celula_idx" ON "preenchimento_alteracoes" USING btree ("linha_id","data","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "preenchimento_dias_celula_unica" ON "preenchimento_dias" USING btree ("linha_id","data");--> statement-breakpoint
ALTER TABLE "preenchimento_alteracoes" DROP COLUMN "faixa";--> statement-breakpoint
ALTER TABLE "preenchimento_dias" DROP COLUMN "faixa";--> statement-breakpoint
DROP TYPE "public"."preenchimento_faixa";
