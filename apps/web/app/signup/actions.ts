'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signupAction(
  email: string,
  password: string,
  confirmPassword: string,
): Promise<{ error?: string }> {
  if (!email || !email.includes('@')) return { error: 'A valid email address is required' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters' }
  if (password !== confirmPassword) return { error: 'Passwords do not match' }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const res = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return { error: body.error ?? 'Registration failed' }
  }

  const body = (await res.json().catch(() => null)) as { token: string } | null
  if (!body?.token) return { error: 'Registration failed — invalid server response' }
  const cookieStore = await cookies()
  cookieStore.set('token', body.token, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  redirect('/dashboard')
}
