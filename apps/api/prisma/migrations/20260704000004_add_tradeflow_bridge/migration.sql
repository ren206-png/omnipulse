CREATE TABLE "TradeFlowTenantMapping" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "tradeFlowAccountId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "linkedBy" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "TradeFlowTenantMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TradeFlowTenantMapping_workspaceId_key" ON "TradeFlowTenantMapping"("workspaceId");
CREATE UNIQUE INDEX "TradeFlowTenantMapping_tradeFlowAccountId_key" ON "TradeFlowTenantMapping"("tradeFlowAccountId");
CREATE INDEX "TradeFlowTenantMapping_tradeFlowAccountId_idx" ON "TradeFlowTenantMapping"("tradeFlowAccountId");
ALTER TABLE "TradeFlowTenantMapping" ADD CONSTRAINT "TradeFlowTenantMapping_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IngestedJobEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "tradeFlowAccountId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "jobType" TEXT,
  "city" TEXT,
  "rawPayload" JSONB NOT NULL,
  "nonce" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IngestedJobEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IngestedJobEvent_nonce_key" ON "IngestedJobEvent"("nonce");
CREATE INDEX "IngestedJobEvent_workspaceId_idx" ON "IngestedJobEvent"("workspaceId");
CREATE INDEX "IngestedJobEvent_jobId_idx" ON "IngestedJobEvent"("jobId");
CREATE INDEX "IngestedJobEvent_nonce_idx" ON "IngestedJobEvent"("nonce");
ALTER TABLE "IngestedJobEvent" ADD CONSTRAINT "IngestedJobEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
