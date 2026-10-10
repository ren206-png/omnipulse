/**
 * Regression tests for moving a scheduled post to a new time (PATCH /api/v1/posts/:id).
 * The queued publish job has to move with it — see lib/reschedulePublish.ts.
 *
 * Run with: npx tsx --test src/lib/__tests__/reschedulePublish.test.ts
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { reschedulePublishJob, type PendingJob, type ReschedulableQueue } from '../reschedulePublish.js'

function makeQueue(jobs: Record<string, Array<{ postId: string }>>) {
  const removed: string[] = []
  const added: Array<{ data: { postId: string; workspaceId: string }; opts: Record<string, unknown> }> = []
  const queue: ReschedulableQueue = {
    async getJobs(types) {
      return types.flatMap((t) =>
        (jobs[t] ?? []).map((d): PendingJob => ({ data: d, remove: async () => { removed.push(`${t}:${d.postId}`) } })),
      )
    },
    async add(_name, data, opts) {
      added.push({ data, opts })
      return { id: 'new-1' }
    },
  }
  return { queue, removed, added }
}

const NOW = new Date('2026-10-10T12:00:00Z')

test('replaces only this post\'s stale delayed job and sets the new delay', async () => {
  const { queue, removed, added } = makeQueue({ delayed: [{ postId: 'p1' }, { postId: 'other' }] })
  const result = await reschedulePublishJob(queue, 'p1', 'w1', new Date('2026-10-10T15:00:00Z'), NOW)

  assert.deepEqual(removed, ['delayed:p1'])
  assert.equal(added.length, 1)
  assert.equal(added[0]!.opts.delay, 3 * 3600_000)
  assert.equal(added[0]!.opts.attempts, 3)
  assert.deepEqual(added[0]!.data, { postId: 'p1', workspaceId: 'w1' })
  assert.deepEqual(result, { removed: 1, jobId: 'new-1' })
})

test('never uses a negative delay when the new time is not in the future', async () => {
  const { queue, added } = makeQueue({ delayed: [{ postId: 'p1' }] })
  await reschedulePublishJob(queue, 'p1', 'w1', new Date('2026-10-10T11:00:00Z'), NOW)
  assert.equal(added[0]!.opts.delay, 0)
})

test('still schedules a job when none existed (e.g. the old one was lost)', async () => {
  const { queue, removed, added } = makeQueue({})
  const result = await reschedulePublishJob(queue, 'p1', 'w1', new Date('2026-10-10T13:00:00Z'), NOW)
  assert.equal(removed.length, 0)
  assert.equal(added.length, 1)
  assert.equal(result.removed, 0)
})

test('clears waiting and prioritized duplicates too', async () => {
  const { queue, removed } = makeQueue({ waiting: [{ postId: 'p1' }], prioritized: [{ postId: 'p1' }] })
  await reschedulePublishJob(queue, 'p1', 'w1', new Date('2026-10-10T13:00:00Z'), NOW)
  assert.equal(removed.length, 2)
})

test('does nothing while a publish for the post is already running (no double publish)', async () => {
  const { queue, removed, added } = makeQueue({ active: [{ postId: 'p1' }], delayed: [{ postId: 'p1' }] })
  const result = await reschedulePublishJob(queue, 'p1', 'w1', new Date('2026-10-10T13:00:00Z'), NOW)
  assert.equal(removed.length, 0)
  assert.equal(added.length, 0)
  assert.equal(result.jobId, undefined)
})
