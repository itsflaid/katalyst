CREATE TABLE "zakat_setting" (
	"business_id" text PRIMARY KEY NOT NULL,
	"gold_price_per_gram" integer,
	"gold_price_updated_at" timestamp,
	"nisab_grams" integer DEFAULT 85 NOT NULL,
	"haul_start_date" text,
	"stock_valuation" text DEFAULT 'SELLING' NOT NULL,
	"cash" bigint,
	"receivable" bigint,
	"debt" bigint,
	"balance_updated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "zakat_setting_valuation" CHECK ("zakat_setting"."stock_valuation" in ('COST','SELLING')),
	CONSTRAINT "zakat_setting_nonneg" CHECK (coalesce("zakat_setting"."gold_price_per_gram",0) >= 0 and coalesce("zakat_setting"."cash",0) >= 0 and coalesce("zakat_setting"."receivable",0) >= 0 and coalesce("zakat_setting"."debt",0) >= 0),
	CONSTRAINT "zakat_setting_nisab_positive" CHECK ("zakat_setting"."nisab_grams" > 0)
);
--> statement-breakpoint
ALTER TABLE "zakat_setting" ADD CONSTRAINT "zakat_setting_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE no action ON UPDATE no action;