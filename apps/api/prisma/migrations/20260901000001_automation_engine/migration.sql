-- Automation Engine: additive migration
-- No existing table, column, or index is dropped or renamed.
-- Safe to apply to existing schema at any time.

-- Enums
CREATE TYPE "AutomationChannel" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'STUB');
CREATE TYPE "AutomationFlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');
CREATE TYPE "AutomationFlowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "AutomationTriggerType" AS ENUM ('KEYWORD', 'FIRST_CONTACT', 'ANY_MESSAGE', 'WEBHOOK_EVENT');
CREATE TYPE "AutomationNodeType" AS ENUM ('MESSAGE', 'CONDITION', 'ACTION', 'WAIT', 'END');
CREATE TYPE "AutomationReentryPolicy" AS ENUM ('IGNORE', 'RESTART', 'ALLOW_PARALLEL');
CREATE TYPE "ContactFlowInstanceStatus" AS ENUM ('RUNNING', 'WAITING_FOR_INPUT', 'WAITING_UNTIL', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AutomationEventProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "AutomationOutboxStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'WINDOW_CLOSED', 'DEAD');

-- Additive columns on Workspace
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "automationEnabled"        BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "automationOptOutKeywords" TEXT[]   NOT NULL DEFAULT '{}';

-- automation_contacts
CREATE TABLE "automation_contacts" (
  "id"                   TEXT        NOT NULL,
  "workspaceId"          TEXT        NOT NULL,
  "channel"              "AutomationChannel" NOT NULL,
  "channelUserId"        TEXT        NOT NULL,
  "displayName"          TEXT,
  "automationOptedOut"   BOOLEAN     NOT NULL DEFAULT false,
  "automationOptedOutAt" TIMESTAMP(3),
  "automationFields"     JSONB,
  "firstSeenAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_contacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "automation_contacts_workspaceId_channel_channelUserId_key"
  ON "automation_contacts"("workspaceId", "channel", "channelUserId");
CREATE INDEX "automation_contacts_workspaceId_channel_idx"
  ON "automation_contacts"("workspaceId", "channel");
CREATE INDEX "automation_contacts_workspaceId_automationOptedOut_idx"
  ON "automation_contacts"("workspaceId", "automationOptedOut");
ALTER TABLE "automation_contacts"
  ADD CONSTRAINT "automation_contacts_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- automation_conversations
CREATE TABLE "automation_conversations" (
  "id"                      TEXT        NOT NULL,
  "workspaceId"             TEXT        NOT NULL,
  "contactId"               TEXT        NOT NULL,
  "channel"                 "AutomationChannel" NOT NULL,
  "providerConversationId"  TEXT,
  "startedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automation_conversations_workspaceId_idx"
  ON "automation_conversations"("workspaceId");
CREATE INDEX "automation_conversations_contactId_idx"
  ON "automation_conversations"("contactId");
CREATE INDEX "automation_conversations_workspaceId_channel_providerConversationId_idx"
  ON "automation_conversations"("workspaceId", "channel", "providerConversationId");
ALTER TABLE "automation_conversations"
  ADD CONSTRAINT "automation_conversations_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "automation_conversations"
  ADD CONSTRAINT "automation_conversations_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "automation_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- automation_flows
CREATE TABLE "automation_flows" (
  "id"                             TEXT        NOT NULL,
  "workspaceId"                    TEXT        NOT NULL,
  "name"                           TEXT        NOT NULL,
  "description"                    TEXT,
  "status"                         "AutomationFlowStatus" NOT NULL DEFAULT 'DRAFT',
  "priority"                       INTEGER     NOT NULL DEFAULT 0,
  "reentryPolicy"                  "AutomationReentryPolicy" NOT NULL DEFAULT 'IGNORE',
  "maxParallelInstancesPerContact" INTEGER     NOT NULL DEFAULT 3,
  "createdAt"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                      TIMESTAMP(3) NOT NULL,
  "createdBy"                      TEXT,
  CONSTRAINT "automation_flows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "automation_flows_workspaceId_name_key"
  ON "automation_flows"("workspaceId", "name");
CREATE INDEX "automation_flows_workspaceId_status_idx"
  ON "automation_flows"("workspaceId", "status");
ALTER TABLE "automation_flows"
  ADD CONSTRAINT "automation_flows_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- automation_flow_versions
CREATE TABLE "automation_flow_versions" (
  "id"            TEXT        NOT NULL,
  "flowId"        TEXT        NOT NULL,
  "version"       INTEGER     NOT NULL,
  "status"        "AutomationFlowVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "triggerType"   "AutomationTriggerType" NOT NULL,
  "triggerConfig" JSONB       NOT NULL,
  "entryNodeKey"  TEXT        NOT NULL,
  "graphHash"     TEXT        NOT NULL,
  "publishedAt"   TIMESTAMP(3),
  "publishedBy"   TEXT,
  "revision"      INTEGER     NOT NULL DEFAULT 0,
  CONSTRAINT "automation_flow_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "automation_flow_versions_flowId_version_key"
  ON "automation_flow_versions"("flowId", "version");
CREATE INDEX "automation_flow_versions_flowId_status_idx"
  ON "automation_flow_versions"("flowId", "status");
ALTER TABLE "automation_flow_versions"
  ADD CONSTRAINT "automation_flow_versions_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "automation_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- flow_nodes
CREATE TABLE "flow_nodes" (
  "id"            TEXT        NOT NULL,
  "flowVersionId" TEXT        NOT NULL,
  "nodeKey"       TEXT        NOT NULL,
  "nodeType"      "AutomationNodeType" NOT NULL,
  "config"        JSONB       NOT NULL,
  "uiMeta"        JSONB,
  CONSTRAINT "flow_nodes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flow_nodes_flowVersionId_nodeKey_key"
  ON "flow_nodes"("flowVersionId", "nodeKey");
CREATE INDEX "flow_nodes_flowVersionId_idx"
  ON "flow_nodes"("flowVersionId");
ALTER TABLE "flow_nodes"
  ADD CONSTRAINT "flow_nodes_flowVersionId_fkey"
  FOREIGN KEY ("flowVersionId") REFERENCES "automation_flow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- flow_edges
CREATE TABLE "flow_edges" (
  "id"            TEXT        NOT NULL,
  "flowVersionId" TEXT        NOT NULL,
  "sourceNodeId"  TEXT        NOT NULL,
  "targetNodeId"  TEXT        NOT NULL,
  "label"         TEXT        NOT NULL,
  "priority"      INTEGER,
  CONSTRAINT "flow_edges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flow_edges_sourceNodeId_label_key"
  ON "flow_edges"("sourceNodeId", "label");
CREATE INDEX "flow_edges_flowVersionId_idx"
  ON "flow_edges"("flowVersionId");
ALTER TABLE "flow_edges"
  ADD CONSTRAINT "flow_edges_flowVersionId_fkey"
  FOREIGN KEY ("flowVersionId") REFERENCES "automation_flow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flow_edges"
  ADD CONSTRAINT "flow_edges_sourceNodeId_fkey"
  FOREIGN KEY ("sourceNodeId") REFERENCES "flow_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flow_edges"
  ADD CONSTRAINT "flow_edges_targetNodeId_fkey"
  FOREIGN KEY ("targetNodeId") REFERENCES "flow_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- contact_flow_instances
CREATE TABLE "contact_flow_instances" (
  "id"             TEXT        NOT NULL,
  "workspaceId"    TEXT        NOT NULL,
  "contactId"      TEXT        NOT NULL,
  "conversationId" TEXT,
  "flowId"         TEXT        NOT NULL,
  "flowVersionId"  TEXT        NOT NULL,
  "currentNodeId"  TEXT,
  "status"         "ContactFlowInstanceStatus" NOT NULL DEFAULT 'RUNNING',
  "context"        JSONB       NOT NULL DEFAULT '{}',
  "wakeAt"         TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3),
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  "lastEventAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failureReason"  TEXT,
  "revision"       INTEGER     NOT NULL DEFAULT 0,
  CONSTRAINT "contact_flow_instances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contact_flow_instances_workspaceId_contactId_status_idx"
  ON "contact_flow_instances"("workspaceId", "contactId", "status");
CREATE INDEX "contact_flow_instances_status_wakeAt_idx"
  ON "contact_flow_instances"("status", "wakeAt");
CREATE INDEX "contact_flow_instances_status_expiresAt_idx"
  ON "contact_flow_instances"("status", "expiresAt");
CREATE INDEX "contact_flow_instances_workspaceId_flowVersionId_idx"
  ON "contact_flow_instances"("workspaceId", "flowVersionId");
ALTER TABLE "contact_flow_instances"
  ADD CONSTRAINT "contact_flow_instances_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_flow_instances"
  ADD CONSTRAINT "contact_flow_instances_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "automation_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_flow_instances"
  ADD CONSTRAINT "contact_flow_instances_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "automation_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_flow_instances"
  ADD CONSTRAINT "contact_flow_instances_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "automation_flows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_flow_instances"
  ADD CONSTRAINT "contact_flow_instances_flowVersionId_fkey"
  FOREIGN KEY ("flowVersionId") REFERENCES "automation_flow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- inbound_automation_events
CREATE TABLE "inbound_automation_events" (
  "id"                 TEXT        NOT NULL,
  "workspaceId"        TEXT        NOT NULL,
  "channel"            "AutomationChannel" NOT NULL,
  "providerEventId"    TEXT,
  "idempotencyKey"     TEXT        NOT NULL,
  "derivedIdempotency" BOOLEAN     NOT NULL DEFAULT false,
  "senderId"           TEXT        NOT NULL,
  "contactId"          TEXT,
  "conversationId"     TEXT,
  "text"               TEXT,
  "normalizedText"     TEXT,
  "quickReplyValue"    TEXT,
  "payload"            JSONB       NOT NULL,
  "receivedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStatus"   "AutomationEventProcessingStatus" NOT NULL DEFAULT 'PENDING',
  "processingError"    TEXT,
  CONSTRAINT "inbound_automation_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inbound_automation_events_workspaceId_channel_idempotencyKey_key"
  ON "inbound_automation_events"("workspaceId", "channel", "idempotencyKey");
CREATE INDEX "inbound_automation_events_workspaceId_processingStatus_idx"
  ON "inbound_automation_events"("workspaceId", "processingStatus");
ALTER TABLE "inbound_automation_events"
  ADD CONSTRAINT "inbound_automation_events_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_automation_events"
  ADD CONSTRAINT "inbound_automation_events_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "automation_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_automation_events"
  ADD CONSTRAINT "inbound_automation_events_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "automation_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- node_executions
CREATE TABLE "node_executions" (
  "id"             TEXT        NOT NULL,
  "instanceId"     TEXT        NOT NULL,
  "nodeId"         TEXT        NOT NULL,
  "inboundEventId" TEXT,
  "attempt"        INTEGER     NOT NULL DEFAULT 1,
  "status"         TEXT        NOT NULL,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"     TIMESTAMP(3),
  "idempotencyKey" TEXT        NOT NULL,
  "result"         JSONB,
  "error"          JSONB,
  CONSTRAINT "node_executions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "node_executions_idempotencyKey_key"
  ON "node_executions"("idempotencyKey");
CREATE INDEX "node_executions_instanceId_idx"
  ON "node_executions"("instanceId");
ALTER TABLE "node_executions"
  ADD CONSTRAINT "node_executions_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "contact_flow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_executions"
  ADD CONSTRAINT "node_executions_nodeId_fkey"
  FOREIGN KEY ("nodeId") REFERENCES "flow_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "node_executions"
  ADD CONSTRAINT "node_executions_inboundEventId_fkey"
  FOREIGN KEY ("inboundEventId") REFERENCES "inbound_automation_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- automation_outbox
CREATE TABLE "automation_outbox" (
  "id"             TEXT        NOT NULL,
  "workspaceId"    TEXT        NOT NULL,
  "instanceId"     TEXT,
  "type"           TEXT        NOT NULL,
  "payload"        JSONB       NOT NULL,
  "idempotencyKey" TEXT        NOT NULL,
  "status"         "AutomationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"       INTEGER     NOT NULL DEFAULT 0,
  "nextAttemptAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedBy"      TEXT,
  "claimedAt"      TIMESTAMP(3),
  "lastError"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "automation_outbox_idempotencyKey_key"
  ON "automation_outbox"("idempotencyKey");
CREATE INDEX "automation_outbox_status_nextAttemptAt_idx"
  ON "automation_outbox"("status", "nextAttemptAt");
CREATE INDEX "automation_outbox_workspaceId_idx"
  ON "automation_outbox"("workspaceId");
ALTER TABLE "automation_outbox"
  ADD CONSTRAINT "automation_outbox_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
