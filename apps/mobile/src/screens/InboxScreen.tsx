import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Alert } from 'react-native'
import { apiFetch } from '../api/client'

export default function InboxScreen() {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const load = async () => {
    try {
      const wsData = await apiFetch('/api/v1/workspaces')
      const ws = wsData.workspaces?.[0]
      if (!ws) return
      setWorkspaceId(ws.id)
      const inboxData = await apiFetch(`/api/v1/inbox?workspaceId=${ws.id}`)
      setMessages(inboxData.messages ?? [])
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/api/v1/inbox/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'READ' }) })
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'READ' } : m))
    } catch {}
  }

  const sendReply = async (id: string) => {
    if (!replyText.trim()) return
    setSending(true)
    try {
      await apiFetch(`/api/v1/inbox/${id}`, { method: 'PATCH', body: JSON.stringify({ reply: replyText.trim(), status: 'REPLIED' }) })
      setMessages(prev => prev.map(m => m.id === id ? { ...m, reply: replyText, status: 'REPLIED' } : m))
      setReplyingTo(null)
      setReplyText('')
      Alert.alert('Sent', 'Reply saved successfully')
    } catch { Alert.alert('Error', 'Failed to send reply') }
    finally { setSending(false) }
  }

  const statusColor: Record<string, string> = { UNREAD: '#6366f1', READ: '#9ca3af', REPLIED: '#10b981', DISMISSED: '#d1d5db' }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#6366f1" />}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Social Inbox</Text>
        <Text style={styles.unread}>{messages.filter(m => m.status === 'UNREAD').length} unread</Text>
      </View>
      {messages.length === 0 && <Text style={styles.empty}>No messages yet</Text>}
      {messages.map(msg => (
        <View key={msg.id} style={[styles.card, msg.status === 'UNREAD' && styles.cardUnread]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.dot, { backgroundColor: statusColor[msg.status] ?? '#9ca3af' }]} />
              <Text style={styles.author}>{msg.authorName}</Text>
              <View style={styles.platformBadge}><Text style={styles.platformText}>{msg.platform.substring(0, 2)}</Text></View>
            </View>
            <Text style={styles.type}>{msg.type}</Text>
          </View>
          <Text style={styles.content} numberOfLines={3}>{msg.content}</Text>
          <Text style={styles.date}>{new Date(msg.createdAt).toLocaleDateString()}</Text>
          {msg.status !== 'REPLIED' && (
            <View style={styles.actions}>
              {msg.status === 'UNREAD' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => markRead(msg.id)}>
                  <Text style={styles.actionText}>Mark Read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, styles.replyBtn]} onPress={() => { setReplyingTo(replyingTo === msg.id ? null : msg.id); setReplyText('') }}>
                <Text style={[styles.actionText, { color: '#6366f1' }]}>Reply</Text>
              </TouchableOpacity>
            </View>
          )}
          {replyingTo === msg.id && (
            <View style={styles.replyBox}>
              <TextInput style={styles.replyInput} value={replyText} onChangeText={setReplyText} placeholder="Write your reply…" multiline numberOfLines={3} />
              <TouchableOpacity style={styles.sendBtn} onPress={() => sendReply(msg.id)} disabled={sending}>
                <Text style={styles.sendText}>{sending ? 'Sending…' : 'Send Reply'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  unread: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 32 },
  card: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#e5e7eb' },
  cardUnread: { borderLeftColor: '#6366f1', backgroundColor: '#fafafe' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
  author: { fontSize: 14, fontWeight: '600', color: '#111827' },
  platformBadge: { backgroundColor: '#ede9fe', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  platformText: { fontSize: 10, fontWeight: '700', color: '#7c3aed' },
  type: { fontSize: 11, color: '#9ca3af' },
  content: { fontSize: 14, color: '#374151', lineHeight: 20 },
  date: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f3f4f6' },
  replyBtn: { backgroundColor: '#ede9fe' },
  actionText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  replyBox: { marginTop: 10 },
  replyInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827', minHeight: 72, textAlignVertical: 'top' },
  sendBtn: { backgroundColor: '#6366f1', borderRadius: 8, padding: 10, marginTop: 8, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
