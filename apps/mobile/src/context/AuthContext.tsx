import React, { createContext, useContext, useState, useEffect } from 'react'
import { getToken, setToken, removeToken, apiFetch } from '../api/client'

interface AuthUser {
  id: string
  email: string
  role: string
}

interface AuthContextType {
  token: string | null
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getToken()
      .then(t => { setTokenState(t) })
      .catch(err => { console.error('[AuthContext] Failed to load token:', err) })
      .finally(() => { setLoading(false) })
  }, [])

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: AuthUser }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    await setToken(data.token)
    setTokenState(data.token)
    setUser(data.user)
  }

  const logout = async () => {
    try {
      await removeToken()
    } catch (err) {
      console.error('[AuthContext] Failed to remove token from secure store:', err)
    } finally {
      setTokenState(null)
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
