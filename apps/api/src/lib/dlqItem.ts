export interface DlqRow {
  id: string
  postId: string
  platform: string
  errorMessage: string
  attempts: number
  lastAttemptAt: Date | string
  createdAt: Date | string
  workspace?: { id: string; name: string } | null
}

/**
 * The shape the Failed Posts page (apps/web/.../admin/dlq/DlqClient.tsx) renders. The page used to
 * read `data.items` while this route returned `{ entries }` with raw PostDlq rows, so it always
 * showed "No failed posts" however many rows existed.
 */
export function toDlqItem(row: DlqRow, content: string | undefined) {
  return {
    id: row.id,
    postId: row.postId,
    content: content ?? '(post no longer exists)',
    platform: row.platform,
    errorMessage: row.errorMessage,
    attempts: row.attempts,
    failedAt: row.lastAttemptAt ?? row.createdAt,
    workspaceName: row.workspace?.name ?? '',
  }
}
