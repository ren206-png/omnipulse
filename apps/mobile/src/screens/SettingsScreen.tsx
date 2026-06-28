import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function SettingsScreen() {
  const { logout, user } = useAuth()

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.email?.[0] ?? 'U').toUpperCase()}</Text>
        </View>
        <Text style={styles.email}>{user?.email ?? 'Loading...'}</Text>
        <Text style={styles.role}>{user?.role ?? 'MEMBER'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value} numberOfLines={1}>{user?.email ?? '—'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Role</Text><Text style={styles.value}>{user?.role ?? '—'}</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.row}><Text style={styles.label}>Version</Text><Text style={styles.value}>1.0.0</Text></View>
        <View style={styles.row}><Text style={styles.label}>API Server</Text><Text style={styles.value}>{process.env.EXPO_PUBLIC_API_URL ?? 'localhost:4000'}</Text></View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  profileCard: { backgroundColor: '#6366f1', padding: 32, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  email: { fontSize: 16, color: '#fff', fontWeight: '600' },
  role: { fontSize: 12, color: '#c7d2fe', marginTop: 4 },
  section: { backgroundColor: '#fff', marginTop: 16, marginHorizontal: 12, borderRadius: 12, overflow: 'hidden' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, padding: 12, paddingBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  label: { fontSize: 15, color: '#111827' },
  value: { fontSize: 15, color: '#6b7280', maxWidth: '60%', textAlign: 'right' },
  signOutBtn: { margin: 20, backgroundColor: '#fee2e2', borderRadius: 12, padding: 16, alignItems: 'center' },
  signOutText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
})
