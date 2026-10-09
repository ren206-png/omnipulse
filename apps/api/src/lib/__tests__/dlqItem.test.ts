/**
 * Regression tests for the Failed Posts list. The page reads `items` with content/failedAt/
 * workspaceName; the route used to return raw rows under `entries`, so the page always looked empty.
 *
 * Run with: npx tsx --test src/lib/__tests__/dlqItem.test.ts
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { toDlqItem, type DlqRow } from '../dlqItem.js'

const row: DlqRow = {
  id: 'd1',
  postId: 'p1',
  platform: 'FACEBOOK',
  errorMessage: '(#200) permission error',
  attempts: 3,
  lastAttemptAt: new Date('2026-10-04T04:28:00Z'),
  createdAt: new Date('2026-10-04T04:20:00Z'),
  workspace: { id: 'w', name: 'Renco' },
}

test('maps a PostDlq row to the shape the page renders', () => {
  assert.deepEqual(toDlqItem(row, 'Hello world'), {
    id: 'd1',
    postId: 'p1',
    content: 'Hello world',
    platform: 'FACEBOOK',
    errorMessage: '(#200) permission error',
    attempts: 3,
    failedAt: row.lastAttemptAt,
    workspaceName: 'Renco',
  })
})

test('copes with a deleted post and a missing workspace', () => {
  const item = toDlqItem({ ...row, workspace: null }, undefined)
  assert.equal(item.content, '(post no longer exists)')
  assert.equal(item.workspaceName, '')
})
