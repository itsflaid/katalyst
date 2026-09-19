CREATE TABLE "staff_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"invited_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "staff_invitation" ADD CONSTRAINT "staff_invitation_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitation" ADD CONSTRAINT "staff_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_invitation_business_created_idx" ON "staff_invitation" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_invitation_token_hash_idx" ON "staff_invitation" USING btree ("token_hash");