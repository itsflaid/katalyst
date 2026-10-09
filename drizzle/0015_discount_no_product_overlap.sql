CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "discount" ADD CONSTRAINT "discount_no_product_overlap" EXCLUDE USING gist ("product_id" WITH =, tsrange("starts_at", coalesce("ends_at", 'infinity'::timestamp), '[)') WITH &&) WHERE ("scope" = 'PRODUCT' AND "is_active");
