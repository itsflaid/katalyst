CREATE TABLE "copilot_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"title" text DEFAULT 'Percakapan baru' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_name" text,
	"tool_result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copilot_conversation" ADD CONSTRAINT "copilot_conversation_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_message" ADD CONSTRAINT "copilot_message_conversation_id_copilot_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."copilot_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copilot_conversation_business_updated_idx" ON "copilot_conversation" USING btree ("business_id","updated_at");--> statement-breakpoint
CREATE INDEX "copilot_message_conversation_created_idx" ON "copilot_message" USING btree ("conversation_id","created_at");