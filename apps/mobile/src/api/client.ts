import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('token')
}

export async function setToken(token: string): Promise<void> {
  return SecureStore.setItemAsync('token', token)
}

export async function removeToken(): Promise<void> {
  return SecureStore.deleteItemAsync('token')
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}
