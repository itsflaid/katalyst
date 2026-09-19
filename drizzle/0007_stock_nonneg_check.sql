UPDATE "product" SET "is_active" = true WHERE "stock" <= 0 AND "is_active" = false;--> statement-breakpoint
UPDATE "product" SET "stock" = 0 WHERE "stock" < 0;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_stock_nonneg" CHECK ("product"."stock" >= 0);
