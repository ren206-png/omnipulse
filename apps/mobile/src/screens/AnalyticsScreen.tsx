import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { apiFetch } from '../api/client'

export default function AnalyticsScreen() {
  const [data, setData] = useState<any[]>([])
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = async () => {
    try {
      const wsData = await apiFetch('/api/v1/workspaces')
      const ws = wsData.workspaces?.[0]
      if (!ws) return
      setWorkspaceId(ws.id)
      const analytics = await apiFetch(`/api/v1/analytics?workspaceId=${ws.id}`)
      setData(analytics.data ?? [])
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const handleSync = async () => {
    if (!workspaceId) return
    setSyncing(true)
    try {
      await apiFetch(`/api/v1/analytics/sync?workspaceId=${workspaceId}`, { method: 'POST' })
      setTimeout(() => { load() }, 3000)
    } catch {}
    finally { setSyncing(false) }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#6366f1" />}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Analytics</Text>
        <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={syncing}>
          <Text style={styles.syncText}>{syncing ? 'Syncing…' : '↻ Sync'}</Text>
        </TouchableOpacity>
      </View>
      {data.length === 0 && <Text style={styles.empty}>No connected accounts yet.{'\n'}Connect accounts on the web app to see analytics here.</Text>}
      {data.map(account => {
        const latest = account.snapshots?.[account.snapshots.length - 1]
        return (
          <View key={account.socialAccountId} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.platform}>{account.platform}</Text>
              <Text style={styles.handle}>@{account.externalProfileId}</Text>
            </View>
            {latest ? (
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricNum}>{latest.followers?.toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>Followers</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricNum}>{latest.impressions?.toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>Impressions</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricNum}>{latest.engagementRate?.toFixed(1)}%</Text>
                  <Text style={styles.metricLabel}>Engagement</Text>
                </View>
              </View>
            ) : <Text style={styles.noData}>No data yet — tap Sync</Text>}
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  syncBtn: { backgroundColor: '#ede9fe', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  syncText: { fontSize: 13, fontWeight: '600', color: '#7c3aed' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 32, lineHeight: 22 },
  card: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 10, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  platform: { fontSize: 16, fontWeight: '700', color: '#6366f1' },
  handle: { fontSize: 13, color: '#6b7280' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { alignItems: 'center', flex: 1 },
  metricNum: { fontSize: 22, fontWeight: '800', color: '#111827' },
  metricLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  noData: { color: '#9ca3af', fontStyle: 'italic', textAlign: 'center' },
})
