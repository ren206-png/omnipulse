import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { apiFetch } from '../api/client'

export default function CalendarScreen() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const wsData = await apiFetch('/api/v1/workspaces')
      const ws = wsData.workspaces?.[0]
      if (!ws) return
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
      const data = await apiFetch(`/api/v1/posts?workspaceId=${ws.id}&start=${start}&end=${end}`)
      setPosts(data.posts ?? [])
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const statusColor: Record<string, string> = {
    PUBLISHED: '#10b981', SCHEDULED: '#6366f1', DRAFT: '#9ca3af', FAILED: '#ef4444',
  }

  const grouped = posts.reduce((acc: Record<string, any[]>, post) => {
    const day = new Date(post.scheduledFor).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (!acc[day]) acc[day] = []
    acc[day].push(post)
    return acc
  }, {})

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#6366f1" />}>
      <Text style={styles.title}>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
      {Object.keys(grouped).length === 0 && <Text style={styles.empty}>No posts this month</Text>}
      {Object.entries(grouped).map(([day, dayPosts]) => (
        <View key={day}>
          <Text style={styles.dayHeader}>{day}</Text>
          {(dayPosts as any[]).map((post: any) => (
            <View key={post.id} style={styles.postCard}>
              <View style={styles.postRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor[post.status] ?? '#9ca3af' }]} />
                <Text style={styles.postContent} numberOfLines={2}>{post.content}</Text>
              </View>
              <View style={styles.platforms}>
                {post.platforms?.map((p: string) => (
                  <Text key={p} style={styles.platformTag}>{p.substring(0, 2)}</Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', padding: 16 },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 32 },
  dayHeader: { backgroundColor: '#ede9fe', paddingHorizontal: 16, paddingVertical: 6, fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  postCard: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 10, padding: 12 },
  postRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  postContent: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  platforms: { flexDirection: 'row', gap: 4, marginTop: 8 },
  platformTag: { fontSize: 10, fontWeight: '700', color: '#7c3aed', backgroundColor: '#ede9fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
})
