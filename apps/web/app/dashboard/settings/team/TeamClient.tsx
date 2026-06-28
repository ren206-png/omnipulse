'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER'

interface Member {
  id: string
  email: string
  role: WorkspaceRole
  joinedAt: string | null
  memberId: string | null
}

interface Invitation {
  id: string
  email: string
  role: WorkspaceRole
  createdAt: string
  expiresAt: string
}

interface Props {
  workspaceId: string
  token: string
  currentUserId: string
}

const ROLE_BADGE: Record<WorkspaceRole, string> = {
  OWNER:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  ADMIN:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  MEMBER: 'bg-muted text-muted-foreground',
}

export function TeamClient({ workspaceId, token, currentUserId }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}` }

  const myRole = members.find((m) => m.id === currentUserId)?.role ?? 'MEMBER'
  const canManage = myRole === 'OWNER' || myRole === 'ADMIN'

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/team/${workspaceId}/members`, { headers }),
        fetch(`${apiUrl}/api/v1/team/${workspaceId}/invitations`, { headers }),
      ])
      if (!mRes.ok) throw new Error(`Failed to load members (${mRes.status})`)
      const mData = (await mRes.json()) as { members: Member[] }
      setMembers(mData.members)

      if (iRes.ok) {
        const iData = (await iRes.json()) as { invitations: Invitation[] }
        setInvitations(iData.invitations)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, token])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleInvite() {
    setInviteError(null)
    setInviteSuccess(null)
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setInviteError('Enter a valid email address')
      return
    }
    setInviting(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/team/${workspaceId}/invitations`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      })
      const body = (await res.json()) as { error?: string; inviteUrl?: string }
      if (!res.ok) { setInviteError(body.error ?? 'Failed to send invitation'); return }

      setInviteEmail('')
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}`)
      if (body.inviteUrl) {
        console.info('[Dev] Invite URL:', body.inviteUrl)
      }
      fetchAll()
    } catch {
      setInviteError('Network error — please try again')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemovingId(userId)
    try {
      await fetch(`${apiUrl}/api/v1/team/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
        headers,
      })
      fetchAll()
    } finally {
      setRemovingId(null)
      setConfirmRemoveId(null)
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    setUpdatingRoleId(userId)
    try {
      await fetch(`${apiUrl}/api/v1/team/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      fetchAll()
    } finally {
      setUpdatingRoleId(null)
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setRevokingId(inviteId)
    try {
      await fetch(`${apiUrl}/api/v1/team/${workspaceId}/invitations/${inviteId}`, {
        method: 'DELETE',
        headers,
      })
      fetchAll()
    } finally {
      setRevokingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
        <span>{error}</span>
        <Button variant="ghost" size="sm" onClick={fetchAll}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Members list */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Members ({members.length})</h3>
        <div className="divide-y rounded-lg border overflow-hidden">
          {members.map((member) => {
            const isSelf = member.id === currentUserId
            const isOwner = member.role === 'OWNER'

            return (
              <div key={member.id} className="flex items-center gap-3 px-4 py-3 bg-background">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                  {member.email[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.email}
                    {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </p>
                  {member.joinedAt && (
                    <p className="text-xs text-muted-foreground">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Role — owner can change non-owner roles */}
                <div className="shrink-0">
                  {canManage && !isOwner && !isSelf && myRole === 'OWNER' ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member.id, v)}
                      disabled={updatingRoleId === member.id}
                    >
                      <SelectTrigger className="h-7 text-xs w-24 border-0 bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN" className="text-xs">Admin</SelectItem>
                        <SelectItem value="MEMBER" className="text-xs">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_BADGE[member.role])}>
                      {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                    </span>
                  )}
                </div>

                {/* Remove */}
                {!isOwner && (canManage || isSelf) && (
                  <div className="shrink-0">
                    {confirmRemoveId === member.id ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                          onClick={() => handleRemove(member.id)}
                          disabled={removingId === member.id}
                        >
                          {removingId === member.id ? 'Removing…' : 'Confirm'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmRemoveId(member.id)}
                      >
                        {isSelf ? 'Leave' : 'Remove'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending invitations */}
      {canManage && invitations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Pending Invitations ({invitations.length})</h3>
          <div className="divide-y rounded-lg border overflow-hidden">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3 bg-background">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0 opacity-50">
                  {inv.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', ROLE_BADGE[inv.role])}>
                  {inv.role.charAt(0) + inv.role.slice(1).toLowerCase()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleRevokeInvite(inv.id)}
                  disabled={revokingId === inv.id}
                >
                  {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form */}
      {canManage && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Invite a Team Member</h3>
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Email address</Label>
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); setInviteSuccess(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'ADMIN' | 'MEMBER')}>
                  <SelectTrigger className="w-32 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5">
              <p><span className="font-medium text-foreground">Member</span> — can view and create posts</p>
              <p><span className="font-medium text-foreground">Admin</span> — can also manage members and settings</p>
            </div>

            {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
            {inviteSuccess && <p className="text-xs text-green-600 dark:text-green-400">{inviteSuccess}</p>}

            <Button onClick={handleInvite} disabled={inviting} size="sm">
              {inviting ? 'Sending…' : 'Send Invitation'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
