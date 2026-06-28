export type Plan = 'FREE' | 'PRO' | 'AGENCY'

export interface PlanLimits {
  workspaces: number        // max workspaces owned
  teamMembers: number       // max members per workspace (excluding owner)
  scheduledPosts: number    // max scheduled posts per workspace
  aiGenerations: number     // max AI generations per hour (0 = disabled)
  socialAccounts: number    // max connected social accounts per workspace
  approvalWorkflow: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    workspaces:      1,
    teamMembers:     0,    // solo only
    scheduledPosts:  10,
    aiGenerations:   0,    // no AI on free
    socialAccounts:  2,
    approvalWorkflow: false,
  },
  PRO: {
    workspaces:      3,
    teamMembers:     5,
    scheduledPosts:  500,
    aiGenerations:   30,
    socialAccounts:  10,
    approvalWorkflow: true,
  },
  AGENCY: {
    workspaces:      Infinity,
    teamMembers:     Infinity,
    scheduledPosts:  Infinity,
    aiGenerations:   100,
    socialAccounts:  Infinity,
    approvalWorkflow: true,
  },
}

export const PLAN_NAMES: Record<Plan, string> = {
  FREE:   'Free',
  PRO:    'Pro',
  AGENCY: 'Agency',
}

export const PLAN_PRICES: Record<Plan, { monthly: number; label: string }> = {
  FREE:   { monthly: 0,   label: 'Free forever' },
  PRO:    { monthly: 29,  label: '$29 / month' },
  AGENCY: { monthly: 99,  label: '$99 / month' },
}
