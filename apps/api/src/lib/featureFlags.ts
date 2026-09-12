// Re-export feature flags from the canonical env config to avoid reading process.env twice
import { env } from '../config/env.js'

export const FF_PUBLISH_RELIABILITY = env.FF_PUBLISH_RELIABILITY
export const FF_TRADEFLOW_BRIDGE = env.FF_TRADEFLOW_BRIDGE
export const FF_PHOTO_TO_POST = env.FF_PHOTO_TO_POST
export const FF_OUTCOME_ANALYTICS = env.FF_OUTCOME_ANALYTICS
export const FF_AGENCY_APPROVALS = env.FF_AGENCY_APPROVALS
export const FF_EVERGREEN_QUEUE = env.FF_EVERGREEN_QUEUE
