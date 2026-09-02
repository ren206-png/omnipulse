/**
 * Automation Engine — Ingestion Service
 *
 * Responsible for:
 *   1. Upsert AutomationContact (workspaceId + channel + channelUserId).
 *   2. Idempotent storage of InboundAutomationEvent
 *      (unique on workspaceId + channel + idempotencyKey).
 *   3. Return the stored event, the contact, and whether this was a duplicate.
 *
 * Pure DB operations — no queue interaction, no business logic.
 */

import type { PrismaClient, InboundAutomationEvent, AutomationContact } from '@prisma/client'
import type { NormalizedInboundEvent } from '../types/index.js'

export interface IngestionResult {
  event: InboundAutomationEvent
  contact: AutomationContact
  /** True if an event with this idempotency key already existed. */
  isDuplicate: boolean
}

export async function ingestEvent(
  prisma: PrismaClient,
  input: NormalizedInboundEvent,
): Promise<IngestionResult> {
  // ── 1. Upsert contact ─────────────────────────────────────────────────────
  const contact = await prisma.automationContact.upsert({
    where: {
      workspaceId_channel_channelUserId: {
        workspaceId:   input.workspaceId,
        channel:       input.channel,
        channelUserId: input.senderId,
      },
    },
    create: {
      workspaceId:   input.workspaceId,
      channel:       input.channel,
      channelUserId: input.senderId,
      lastSeenAt:    input.receivedAt,
    },
    update: {
      lastSeenAt: input.receivedAt,
    },
  })

  // ── 2. Idempotency check ──────────────────────────────────────────────────
  const existing = await prisma.inboundAutomationEvent.findUnique({
    where: {
      workspaceId_channel_idempotencyKey: {
        workspaceId:    input.workspaceId,
        channel:        input.channel,
        idempotencyKey: input.idempotencyKey,
      },
    },
  })

  if (existing) {
    return { event: existing, contact, isDuplicate: true }
  }

  // ── 3. Store event ────────────────────────────────────────────────────────
  const event = await prisma.inboundAutomationEvent.create({
    data: {
      workspaceId:       input.workspaceId,
      channel:           input.channel,
      providerEventId:   input.providerEventId,
      idempotencyKey:    input.idempotencyKey,
      derivedIdempotency: input.derivedIdempotency,
      senderId:          input.senderId,
      contactId:         contact.id,
      text:              input.text,
      normalizedText:    input.normalizedText,
      quickReplyValue:   input.quickReplyValue,
      payload:           input.rawPayload as import('@prisma/client').Prisma.InputJsonValue,
      receivedAt:        input.receivedAt,
      processingStatus:  'PENDING',
    },
  })

  return { event, contact, isDuplicate: false }
}
