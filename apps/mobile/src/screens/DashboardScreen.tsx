import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { apiFetch } from '../api/client'

export default function DashboardScreen() {
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const data = await apiFetch('/api/v1/workspaces')
      const ws = data.workspaces ?? []
      setWorkspaces(ws)
      const active = ws[0]
      setActiveWorkspace(active)
      if (active) {
        const postsData = await apiFetch(`/api/v1/posts/history?workspaceId=${active.id}&limit=5`)
        setPosts(postsData.posts ?? [])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const statusColor: Record<string, string> = {
    PUBLISHED: '#10b981', SCHEDULED: '#6366f1', DRAFT: '#9ca3af', FAILED: '#ef4444', PENDING_REVIEW: '#f59e0b',
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#6366f1" />}>
      {activeWorkspace && (
        <View style={styles.header}>
          <Text style={styles.wsName}>{activeWorkspace.name}</Text>
          <View style={[styles.planBadge, { backgroundColor: activeWorkspace.plan === 'FREE' ? '#f3f4f6' : '#ede9fe' }]}>
            <Text style={[styles.planText, { color: activeWorkspace.plan === 'FREE' ? '#6b7280' : '#7c3aed' }]}>{activeWorkspace.plan}</Text>
          </View>
        </View>
      )}
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text style={styles.statNum}>{activeWorkspace?._count?.posts ?? 0}</Text><Text style={styles.statLabel}>Posts</Text></View>
        <View style={styles.statCard}><Text style={styles.statNum}>{activeWorkspace?._count?.socialAccounts ?? 0}</Text><Text style={styles.statLabel}>Accounts</Text></View>
        <View style={styles.statCard}><Text style={styles.statNum}>{workspaces.length}</Text><Text style={styles.statLabel}>Workspaces</Text></View>
      </View>
      <Text style={styles.sectionTitle}>Recent Posts</Text>
      {posts.length === 0 && <Text style={styles.empty}>No posts yet. Create your first post on the web app!</Text>}
      {posts.map(post => (
        <View key={post.id} style={styles.postCard}>
          <View style={styles.postHeader}>
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
              {post.platforms?.map((p: string) => (
                <View key={p} style={styles.platformBadge}><Text style={styles.platformText}>{p.substring(0, 2)}</Text></View>
              ))}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor[post.status] ?? '#9ca3af' }]}>
              <Text style={styles.statusText}>{post.status}</Text>
            </View>
          </View>
          <Text style={styles.postContent} numberOfLines={2}>{post.content}</Text>
          <Text style={styles.postDate}>{new Date(post.scheduledFor).toLocaleDateString()}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  wsName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  planBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  planText: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statNum: { fontSize: 28, fontWeight: '800', color: '#6366f1' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 32, lineHeight: 22 },
  postCard: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 4 },
  platformBadge: { backgroundColor: '#ede9fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  platformText: { fontSize: 10, fontWeight: '700', color: '#7c3aed' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  postContent: { fontSize: 14, color: '#374151', lineHeight: 20 },
  postDate: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
})
