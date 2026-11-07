-- Schedule colours: no violet, indigo or purple hues (240-300). Re-colours rows seeded in Phase 1.
UPDATE "AppointmentType" SET "colour" = '#eab308' WHERE "colour" = '#6366f1';
UPDATE "AppointmentType" SET "colour" = '#a16207' WHERE "colour" = '#8b5cf6';
UPDATE "AppointmentType" SET "colour" = '#0369a1' WHERE "colour" = '#a855f7';
UPDATE "ProviderProfile" SET "colour" = '#be123c' WHERE "colour" = '#7c3aed';
