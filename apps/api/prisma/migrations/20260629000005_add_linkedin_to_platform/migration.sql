-- Add LINKEDIN to Platform enum
-- PostgreSQL requires ALTER TYPE ... ADD VALUE (cannot be inside a transaction)
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'LINKEDIN';
