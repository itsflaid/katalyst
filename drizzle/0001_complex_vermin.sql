CREATE INDEX "product_business_id_idx" ON "product" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "transaction_business_created_idx" ON "transaction" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "transaction_item_transaction_id_idx" ON "transaction_item" USING btree ("transaction_id");