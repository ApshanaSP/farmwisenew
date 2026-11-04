-- Confirming an action by a code sent by email (src/lib/security/factors.ts) gets its own code purpose. Additive.
ALTER TABLE password_resets
  MODIFY COLUMN purpose
    ENUM('password_reset','mobile_verify','complaint_mobile_verify','email_verify','action_confirm')
    NOT NULL;
