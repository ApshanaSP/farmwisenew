-- Sessions could not be ended: a 7-day token stayed valid after signing out, a password change or a reset.
-- Each account now carries a token version that every token must match (src/lib/auth.ts); signing out and changing
-- or resetting the password raise it. Additive: existing tokens (version 0) keep working until the next sign-out.
ALTER TABLE users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0;
