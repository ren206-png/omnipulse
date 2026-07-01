CREATE TABLE IF NOT EXISTS "ListeningKeyword" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListeningKeyword_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ListeningKeyword" ADD CONSTRAINT "ListeningKeyword_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "ListeningKeyword_workspaceId_keyword_key" ON "ListeningKeyword"("workspaceId", "keyword");
