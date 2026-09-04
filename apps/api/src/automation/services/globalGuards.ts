/**
 * Automation Engine — Global Guards
 *
 * Stateless guard functions that throw typed errors when an inbound event
 * must not be processed. Callers should catch these and either silently drop
 * (opted-out) or surface a 503/feature-disabled response (disabled workspace).
 *
 * No side-effects beyond DB reads.
 */

import type { PrismaClient } from '../../../generated/prisma/client.js'

// ── Typed errors ──────────────────────────────────────────────────────────────

export class AutomationDisabledError extends Error {
  readonly code = 'AUTOMATION_DISABLED' as const
  constructor(workspaceId: string) {
    super(`Automation is not enabled for workspace "${workspaceId}"`)
    this.name = 'AutomationDisabledError'
  }
}

export class ContactOptedOutError extends Error {
  readonly code = 'CONTACT_OPTED_OUT' as const
  constructor(contactId: string) {
    super(`Contact "${contactId}" has opted out of automation messages`)
    this.name = 'ContactOptedOutError'
  }
}

// ── Guard functions ───────────────────────────────────────────────────────────

/**
 * Throws AutomationDisabledError if the workspace does not have automation
 * enabled, or if the global AUTOMATION_ENGINE_ENABLED env var is falsy.
 */
export async function assertWorkspaceAutomationEnabled(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<void> {
  // Global feature flag — checked first (cheap, no DB)
  if (process.env.AUTOMATION_ENGINE_ENABLED !== 'true') {
    throw new AutomationDisabledError(workspaceId)
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { automationEnabled: true },
  })

  if (!workspace || !workspace.automationEnabled) {
    throw new AutomationDisabledError(workspaceId)
  }
}

/**
 * Throws ContactOptedOutError if the contact has opted out of automation.
 * Does nothing if contactId is undefined (pre-contact-upsert guards).
 */
export async function assertContactNotOptedOut(
  prisma: PrismaClient,
  contactId: string,
): Promise<void> {
  const contact = await prisma.automationContact.findUnique({
    where: { id: contactId },
    select: { automationOptedOut: true },
  })

  if (contact?.automationOptedOut) {
    throw new ContactOptedOutError(contactId)
  }
}
