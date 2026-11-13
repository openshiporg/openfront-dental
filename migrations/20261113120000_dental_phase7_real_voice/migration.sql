-- The voice receptionist answers a real phone line; the scripted scenario field is gone.
ALTER TABLE "CallRecord" DROP COLUMN "scenario";

-- The seeded clearinghouse row answered with canned responses; nothing is connected until staff add a real key.
UPDATE "AdapterInstallation" SET "displayName" = 'Stedi clearinghouse (not connected)', status = 'suspended', config = '{}'::jsonb WHERE area = 'clearinghouse' AND "adapterKey" = 'stedi' AND "secretId" IS NULL AND config ->> 'transport' = 'recorded';
