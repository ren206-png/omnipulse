-- Add two-factor authentication fields to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "twoFactorSecret"      TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[]  NOT NULL DEFAULT '{}';
