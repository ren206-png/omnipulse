export type Plan = 'FREE' | 'STARTER' | 'PRO' | 'AGENCY'

export interface PlanLimits {
  workspaces: number        // max workspaces owned
  teamMembers: number       // max members per workspace (excluding owner)
  scheduledPosts: number    // max scheduled posts per workspace
  aiGenerations: number     // max AI generations per hour (0 = disabled)
  socialAccounts: number    // max connected social accounts per workspace
  approvalWorkflow: boolean
  whiteLabel: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    workspaces:      1,
    teamMembers:     0,    // solo only
    scheduledPosts:  3,
    aiGenerations:   0,    // no AI on free
    socialAccounts:  1,
    approvalWorkflow: false,
    whiteLabel:      false,
  },
  STARTER: {
    workspaces:      1,
    teamMembers:     1,
    scheduledPosts:  30,
    aiGenerations:   10,
    socialAccounts:  3,
    approvalWorkflow: false,
    whiteLabel:      false,
  },
  PRO: {
    workspaces:      5,
    teamMembers:     5,
    scheduledPosts:  200,
    aiGenerations:   30,
    socialAccounts:  10,
    approvalWorkflow: true,
    whiteLabel:      false,
  },
  AGENCY: {
    workspaces:      Infinity,
    teamMembers:     Infinity,
    scheduledPosts:  Infinity,
    aiGenerations:   100,
    socialAccounts:  Infinity,
    approvalWorkflow: true,
    whiteLabel:      true,
  },
}

export const PLAN_NAMES: Record<Plan, string> = {
  FREE:    'Free',
  STARTER: 'Starter',
  PRO:     'Pro',
  AGENCY:  'Agency',
}

export const PLAN_PRICES: Record<Plan, { monthly: number; yearlyMonthly: number; label: string }> = {
  FREE:    { monthly: 0,    yearlyMonthly: 0,    label: 'Free forever' },
  STARTER: { monthly: 9.99, yearlyMonthly: 7.99, label: '$9.99 / month' },
  PRO:     { monthly: 29,   yearlyMonthly: 23,   label: '$29 / month' },
  AGENCY:  { monthly: 99,   yearlyMonthly: 79,   label: '$99 / month' },
}
