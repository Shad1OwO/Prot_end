ALTER TABLE "destinations" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "notability" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "license_url" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "attribution_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "destinations_source_external_unique" ON "destinations" USING btree ("source","external_id");