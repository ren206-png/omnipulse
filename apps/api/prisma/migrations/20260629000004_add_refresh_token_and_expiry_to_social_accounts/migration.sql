-- Add refresh token, expiry, and LinkedIn-specific fields to SocialAccount
ALTER TABLE "SocialAccount"
  ADD COLUMN IF NOT EXISTS "refreshToken"             TEXT,
  ADD COLUMN IF NOT EXISTS "tokenExpiresAt"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "linkedinPersonUrn"        TEXT,
  ADD COLUMN IF NOT EXISTS "linkedinOrganizationUrns" JSONB;
