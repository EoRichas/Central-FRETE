BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS security_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.auth_sessions (
 token_hash text PRIMARY KEY,
 user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 security_version integer NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON public.auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON public.auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS public.auth_login_limits (
 key_hash text PRIMARY KEY,
 attempts integer NOT NULL CHECK(attempts > 0),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_login_limits_expiry_idx ON public.auth_login_limits(expires_at);
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_sessions, public.auth_login_limits FROM anon, authenticated;
-- A credential/status/role change invalidates every session atomically, including
-- logins that started password verification before the change committed.
CREATE OR REPLACE FUNCTION public.invalidate_user_sessions() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF (NEW.password_hash, NEW.password_salt, NEW.username, NEW.active, NEW.role)
    IS DISTINCT FROM (OLD.password_hash, OLD.password_salt, OLD.username, OLD.active, OLD.role) THEN
  NEW.security_version := OLD.security_version + 1;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_user_sessions() FROM PUBLIC;
DROP TRIGGER IF EXISTS users_security_version ON public.users;
CREATE TRIGGER users_security_version BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.invalidate_user_sessions();
COMMIT;
