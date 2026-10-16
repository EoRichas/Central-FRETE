BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND conname='users_deleted_access_disabled') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_deleted_access_disabled CHECK (
      deleted_at IS NULL OR (active=0 AND username IS NULL AND password_hash IS NULL AND password_salt IS NULL)
    );
  END IF;
END $$;
COMMENT ON COLUMN public.users.deleted_at IS 'Access removed; identity retained for sales, receipts, commissions, reports and audit history.';
COMMIT;
