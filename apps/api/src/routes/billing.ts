import { Router } from 'express'
import type { Request, Response } from 'express'
import Stripe from 'stripe'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'
import { PLAN_LIMITS, PLAN_NAMES, PLAN_PRICES } from '../lib/plans.js'
import type { Plan } from '../lib/plans.js'

const router = Router()

function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(env.STRIPE_SECRET_KEY)
}

// GET /api/v1/billing/status?workspaceId=
router.get('/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const plan = workspace.plan as Plan
    res.json({
      plan,
      planName: PLAN_NAMES[plan],
      price: PLAN_PRICES[plan],
      limits: PLAN_LIMITS[plan],
      subscriptionStatus: workspace.subscriptionStatus ?? null,
      stripeCustomerId: workspace.stripeCustomerId ?? null,
    })
  } catch (err) {
    logger.error({ err }, 'Billing status error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get billing status')
  }
})

// POST /api/v1/billing/checkout — create Stripe Checkout session
router.post('/checkout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!env.STRIPE_SECRET_KEY) {
    sendError(res, 503, 'STRIPE_UNAVAILABLE', 'Billing is not configured on this server')
    return
  }

  const { workspaceId, plan } = req.body as { workspaceId?: string; plan?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!plan || !['PRO', 'AGENCY'].includes(plan)) {
    sendError(res, 400, 'INVALID_PLAN', 'plan must be PRO or AGENCY'); return
  }

  const priceId = plan === 'PRO' ? env.STRIPE_PRO_PRICE_ID : env.STRIPE_AGENCY_PRICE_ID
  if (!priceId) {
    sendError(res, 503, 'STRIPE_UNAVAILABLE', `Price ID for ${plan} plan is not configured`)
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Only the workspace owner can manage billing'); return
    }

    const stripe = getStripe()
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })

    // Create or reuse Stripe customer
    let customerId = workspace.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email,
        metadata: { workspaceId, userId: req.user!.id },
      })
      customerId = customer.id
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { stripeCustomerId: customerId },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/dashboard/billing?success=1&workspaceId=${workspaceId}`,
      cancel_url: `${env.APP_URL}/dashboard/billing?cancelled=1&workspaceId=${workspaceId}`,
      metadata: { workspaceId, plan },
      subscription_data: { metadata: { workspaceId, plan } },
    })

    logger.info({ workspaceId, plan, sessionId: session.id }, 'Checkout session created')
    res.json({ url: session.url })
  } catch (err) {
    logger.error({ err }, 'Checkout error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create checkout session')
  }
})

// POST /api/v1/billing/portal — customer portal for managing subscription
router.post('/portal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!env.STRIPE_SECRET_KEY) {
    sendError(res, 503, 'STRIPE_UNAVAILABLE', 'Billing is not configured'); return
  }

  const { workspaceId } = req.body as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }
    if (!workspace.stripeCustomerId) {
      sendError(res, 400, 'NO_SUBSCRIPTION', 'No active subscription found'); return
    }

    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: `${env.APP_URL}/dashboard/billing?workspaceId=${workspaceId}`,
    })

    res.json({ url: session.url })
  } catch (err) {
    logger.error({ err }, 'Portal error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create portal session')
  }
})

// POST /api/v1/billing/webhook — Stripe webhook handler (raw body required)
router.post(
  '/webhook',
  // Raw body middleware applied inline — must come BEFORE express.json() parses the body
  (req, _res, next) => {
    // Body already buffered as Buffer by express.raw() mounted below in index.ts
    next()
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      res.status(503).json({ error: 'Stripe not configured' })
      return
    }

    const sig = req.headers['stripe-signature'] as string
    let event: Stripe.Event

    try {
      const stripe = getStripe()
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, env.STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      logger.warn({ err }, 'Webhook signature verification failed')
      res.status(400).json({ error: 'Invalid signature' })
      return
    }

    try {
      await handleWebhookEvent(event)
      res.json({ received: true })
    } catch (err) {
      logger.error({ err, eventType: event.type }, 'Webhook handler error')
      res.status(500).json({ error: 'Webhook handler failed' })
    }
  },
)

async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break

      const workspaceId = session.metadata?.workspaceId
      const plan = session.metadata?.plan as Plan | undefined
      if (!workspaceId || !plan) break

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          subscriptionStatus: 'active',
        },
      })
      logger.info({ workspaceId, plan }, 'Subscription activated')
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const workspaceId = sub.metadata?.workspaceId
      if (!workspaceId) break

      const plan = (sub.metadata?.plan as Plan) ?? 'FREE'
      const status = sub.status

      await prisma.workspace.update({
        where: { stripeSubscriptionId: sub.id },
        data: {
          plan: status === 'active' || status === 'trialing' ? plan : 'FREE',
          subscriptionStatus: status,
        },
      })
      logger.info({ workspaceId, plan, status }, 'Subscription updated')
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await prisma.workspace.update({
        where: { stripeSubscriptionId: sub.id },
        data: { plan: 'FREE', subscriptionStatus: 'cancelled', stripeSubscriptionId: null },
      })
      logger.info({ subId: sub.id }, 'Subscription cancelled — downgraded to FREE')
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // Stripe v18+: subscription reference lives under invoice.parent
      const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string } } }).parent
      const subId = parent?.subscription_details?.subscription
      if (!subId) break
      await prisma.workspace.update({
        where: { stripeSubscriptionId: subId },
        data: { subscriptionStatus: 'past_due' },
      })
      logger.warn({ subId }, 'Payment failed — subscription past_due')
      break
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled webhook event')
  }
}

export default router
