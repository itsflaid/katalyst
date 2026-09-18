ALTER TABLE "transaction" DROP CONSTRAINT "transaction_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;