import React, { createContext, useContext, useState, useEffect } from 'react'
import { getToken, setToken, removeToken, apiFetch } from '../api/client'

interface AuthContextType {
  token: string | null
  user: any | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as any)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getToken().then(t => {
      setTokenState(t)
      setLoading(false)
    })
  }, [])

  const login = async (email: string, password: string) => {
    const data = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    await setToken(data.token)
    setTokenState(data.token)
    setUser(data.user)
  }

  const logout = async () => {
    await removeToken()
    setTokenState(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
