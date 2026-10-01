CREATE TYPE "public"."discount_scope" AS ENUM('PRODUCT', 'GLOBAL');--> statement-breakpoint
CREATE TABLE "discount" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"scope" "discount_scope" NOT NULL,
	"percent" integer NOT NULL,
	"product_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp,
	"quota" integer,
	"quota_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_percent_range" CHECK ("discount"."percent" between 1 and 100),
	CONSTRAINT "discount_scope_product" CHECK (("discount"."scope" = 'PRODUCT') = ("discount"."product_id" is not null)),
	CONSTRAINT "discount_window_valid" CHECK ("discount"."ends_at" is null or "discount"."ends_at" > "discount"."starts_at"),
	CONSTRAINT "discount_quota_valid" CHECK ("discount"."quota" is null or "discount"."quota" > 0),
	CONSTRAINT "discount_quota_used_nonneg" CHECK ("discount"."quota_used" >= 0),
	CONSTRAINT "discount_quota_not_exceeded" CHECK ("discount"."quota" is null or "discount"."quota_used" <= "discount"."quota"),
	CONSTRAINT "discount_global_time_only" CHECK ("discount"."scope" = 'PRODUCT' or ("discount"."ends_at" is not null and "discount"."quota" is null))
);
--> statement-breakpoint
ALTER TABLE "transaction_item" ADD COLUMN "discount_id" text;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD COLUMN "discount_name" text;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD COLUMN "discounted_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD COLUMN "discount_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discount" ADD CONSTRAINT "discount_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount" ADD CONSTRAINT "discount_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_business_scope_idx" ON "discount" USING btree ("business_id","scope","is_active");--> statement-breakpoint
CREATE INDEX "discount_product_idx" ON "discount" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_discount_id_discount_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discount"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_discount_valid" CHECK ("transaction_item"."discounted_qty" between 0 and "transaction_item"."quantity" and "transaction_item"."discount_amount" >= 0 and "transaction_item"."discount_amount" <= "transaction_item"."quantity"::bigint * "transaction_item"."price_at_sale");