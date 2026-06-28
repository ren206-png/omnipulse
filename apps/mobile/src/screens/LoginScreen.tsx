import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Error', 'Please enter email and password'); return }
    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)
    } catch (err: any) {
      Alert.alert('Login Failed', err.message ?? 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <Text style={styles.logo}>OmniPulse</Text>
        <Text style={styles.subtitle}>Social Media Management</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input} value={email} onChangeText={setEmail}
            placeholder="you@example.com" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input} value={password} onChangeText={setPassword}
            placeholder="••••••••" secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Demo: demo@getomnipulse.com / Demo1234!</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#6366f1' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 36, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#c7d2fe', textAlign: 'center', marginBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 15, color: '#111827' },
  button: { backgroundColor: '#6366f1', borderRadius: 8, padding: 14, marginTop: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { color: '#c7d2fe', textAlign: 'center', marginTop: 16, fontSize: 12 },
})
