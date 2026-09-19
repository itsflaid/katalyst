ALTER TABLE "product" ADD COLUMN "min_stock" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_min_stock_nonneg" CHECK ("product"."min_stock" >= 0);