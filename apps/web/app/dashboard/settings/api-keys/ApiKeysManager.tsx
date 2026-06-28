'use client'

import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt?: string
  revokedAt?: string
}

interface Props {
  token: string
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function ApiKeysManager({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/api-keys?workspaceId=${activeWorkspace.id}`, {
        headers: { Cookie: `token=${token}` },
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json()
      setKeys(data.keys)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  async function createKey() {
    if (!activeWorkspace || !newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`${API}/api/v1/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
        credentials: 'include',
        body: JSON.stringify({ workspaceId: activeWorkspace.id, name: newName.trim() }),
      })
      if (!res.ok) return
      const data = await res.json()
      setCreatedKey(data.key)
      fetchKeys()
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(id: string) {
    await fetch(`${API}/api/v1/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Cookie: `token=${token}` },
      credentials: 'include',
    })
    setRevokeId(null)
    fetchKeys()
  }

  function closeModal() {
    setShowModal(false)
    setNewName('')
    setCreatedKey(null)
    setCopied(false)
  }

  async function copyKey() {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage programmatic access to your workspace.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create New Key
        </button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prefix</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Used</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-muted rounded animate-pulse w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No API keys yet
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{key.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{key.keyPrefix}…</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(key.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      key.revokedAt ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'
                    }`}>
                      {key.revokedAt ? 'Revoked' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!key.revokedAt && (
                      revokeId === key.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-muted-foreground">Confirm?</span>
                          <button onClick={() => revokeKey(key.id)} className="text-xs text-destructive hover:underline">Yes</button>
                          <button onClick={() => setRevokeId(null)} className="text-xs hover:underline">No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRevokeId(key.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Revoke
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Key Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl space-y-4">
            {!createdKey ? (
              <>
                <h2 className="text-lg font-semibold">Create New API Key</h2>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Key Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Production, CI/CD"
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    onKeyDown={(e) => e.key === 'Enter' && createKey()}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border hover:bg-accent/50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={createKey}
                    disabled={creating || !newName.trim()}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">API Key Created</h2>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  Save this key — it won't be shown again
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                  <code className="flex-1 font-mono text-xs break-all">{createdKey}</code>
                  <button
                    onClick={copyKey}
                    className="shrink-0 px-3 py-1.5 text-xs rounded-md border bg-background hover:bg-accent/50 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={closeModal} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
