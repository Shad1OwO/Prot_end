-- Replace the generated "Car available" / "เดินทางด้วยcar" labels with proper English and Thai.
-- Keep in step with transportLabel() in packages/contracts/src/catalog.ts.
UPDATE "transport_availability" SET "label_en" = 'By car', "label_th" = 'เดินทางโดยรถยนต์' WHERE "mode" = 'car';--> statement-breakpoint
UPDATE "transport_availability" SET "label_en" = 'By train', "label_th" = 'เดินทางโดยรถไฟ' WHERE "mode" = 'rail';--> statement-breakpoint
UPDATE "transport_availability" SET "label_en" = 'By public transport', "label_th" = 'เดินทางโดยขนส่งสาธารณะ' WHERE "mode" = 'transit';--> statement-breakpoint
UPDATE "transport_availability" SET "label_en" = 'Flights to a nearby airport', "label_th" = 'มีเที่ยวบินไปยังสนามบินใกล้เคียง' WHERE "mode" = 'airplane';
