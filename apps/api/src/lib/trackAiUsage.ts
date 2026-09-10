/**
 * AI Metered Billing Setup
 *
 * To enable usage-based billing for AI overages:
 *
 * 1. In Stripe Dashboard → Billing → Meters → Create meter
 *    - Event name: ai_generation  (must match STRIPE_AI_METER_EVENT_NAME)
 *    - Value settings: sum of "value" field
 * 2. Attach the meter to a price on your plan products
 * 3. Set env var in Railway:
 *    railway variables set STRIPE_AI_METER_EVENT_NAME=ai_generation
 * 4. Each AI generation is automatically reported to Stripe via the Billing Meter Events API
 * 5. Stripe bills customers for usage at end of billing period
 */

import { prisma } from './prisma.js'
import { env } from '../config/env.js'
import { logger } from './logger.js'
import Stripe from 'stripe'

function getStripe() {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(env.STRIPE_SECRET_KEY)
}

export async function trackAiGeneration(workspaceId: string): Promise<void> {
  try {
    // Increment monthly counter in DB
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { aiGenerationsMonth: { increment: 1 } },
      select: { stripeCustomerId: true, aiGenerationsMonth: true },
    })

    // Report to Stripe Billing Meter Events if configured
    const meterEventName = env.STRIPE_AI_METER_EVENT_NAME
    if (meterEventName && workspace.stripeCustomerId && env.STRIPE_SECRET_KEY) {
      const stripe = getStripe()
      await stripe.v2.billing.meterEvents.create({
        event_name: meterEventName,
        payload: {
          stripe_customer_id: workspace.stripeCustomerId,
          value: '1',
        },
      })
    }
  } catch (err) {
    // Never fail AI calls due to billing errors — log and continue
    logger.error({ workspaceId, err }, 'Failed to track AI usage')
  }
}
