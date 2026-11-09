-- Phase 3, review round 3.
--  1. Member-ID hashes become keyed (HMAC under the server key). Old bare SHA-256 values are blanked here;
--     scripts/rehash-member-ids.ts refills them from the sealed member IDs on start.
--  2. Every money column (BIGINT *Minor) has an upper bound of $10,000,000.00 (1,000,000,000 minor units).
--  3. Checklist task titles: the COB wording.

UPDATE "Subscriber" SET "memberIdHash" = '' WHERE "memberIdHash" <> '' AND "memberIdHash" NOT LIKE 'h1:%';
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_member_hash_keyed" CHECK ("memberIdHash" = '' OR "memberIdHash" ~ '^h1:[0-9a-f]{64}$');

UPDATE "WorkTask" SET "title" = 'Ask the payer: COB method' WHERE "title" = 'Ask which coordination-of-benefits method applies';

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND data_type = 'bigint' AND column_name LIKE '%Minor'
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IS NULL OR abs(%I) <= 1000000000)', c.table_name, c.table_name || '_' || c.column_name || '_bound', c.column_name, c.column_name);
  END LOOP;
END $$;
