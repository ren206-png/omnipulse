/**
 * Moving a scheduled post to a new time has to move its queued publish job too. The job is a BullMQ
 * *delayed* job whose delay was fixed when the post was scheduled, and the publish worker doesn't
 * re-check scheduledFor — so editing only the database row made the post publish at its OLD time.
 *
 * Jobs carry no deterministic id (older ones were added without one), so the pending job(s) for a
 * post are found by scanning the pending jobs for its postId. Takes a minimal queue interface so the
 * swap logic can be tested without Redis.
 */
export interface PendingJob {
  data?: { postId?: string }
  remove(): Promise<void>
}

export interface ReschedulableQueue {
  getJobs(types: string[], start?: number, end?: number): Promise<PendingJob[]>
  add(name: string, data: { postId: string; workspaceId: string }, opts: Record<string, unknown>): Promise<{ id?: string }>
}

export interface RescheduleResult {
  /** How many stale pending jobs were removed. */
  removed: number
  /** The new job's id (undefined when a publish is already running for this post and nothing was added). */
  jobId: string | undefined
}

export async function reschedulePublishJob(
  queue: ReschedulableQueue,
  postId: string,
  workspaceId: string,
  scheduledFor: Date,
  now: Date = new Date(),
): Promise<RescheduleResult> {
  // A publish already in flight for this post must not be doubled up.
  const active = (await queue.getJobs(['active'])).filter((j) => j.data?.postId === postId)
  if (active.length > 0) return { removed: 0, jobId: undefined }

  const pending = (await queue.getJobs(['delayed', 'waiting', 'prioritized'])).filter((j) => j.data?.postId === postId)
  for (const job of pending) await job.remove()

  const delay = Math.max(0, scheduledFor.getTime() - now.getTime())
  const job = await queue.add(
    'publish-post',
    { postId, workspaceId },
    { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  )
  return { removed: pending.length, jobId: job.id }
}
