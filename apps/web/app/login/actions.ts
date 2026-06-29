'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

async function callLogin(
  email: string,
  password: string,
): Promise<{ error?: string; token?: string; requiresTwoFactor?: boolean; twoFactorToken?: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { error: body.error ?? 'Login failed' }
    }
    const body = (await res.json().catch(() => null)) as {
      token?: string
      requiresTwoFactor?: boolean
      twoFactorToken?: string
    } | null
    if (!body) return { error: 'Login failed — invalid server response' }
    if (body.requiresTwoFactor) return { requiresTwoFactor: true, twoFactorToken: body.twoFactorToken }
    if (!body.token) return { error: 'Login failed — invalid server response' }
    return { token: body.token }
  } catch {
    return { error: 'Network error — please try again' }
  }
}

export async function loginAction(
  email: string,
  password: string,
): Promise<{ error?: string; requiresTwoFactor?: boolean; twoFactorToken?: string }> {
  const isDevBypass =
    process.env.NEXT_PUBLIC_DEV_MODE === 'true' &&
    email === 'demo@getomnipulse.com' &&
    password === 'Demo1234!'

  const result = await callLogin(
    isDevBypass ? 'demo@getomnipulse.com' : email,
    isDevBypass ? 'Demo1234!' : password,
  )

  if (result.error) return { error: result.error }
  if (result.requiresTwoFactor) {
    return { requiresTwoFactor: true, twoFactorToken: result.twoFactorToken }
  }

  const cookieStore = await cookies()
  cookieStore.set('token', result.token!, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  redirect('/dashboard')
}

export async function verifyTwoFactorAction(
  twoFactorToken: string,
  code: string,
): Promise<{ error?: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/2fa/verify-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twoFactorToken, code }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { error: body.error ?? 'Invalid code' }
    }
    const body = (await res.json().catch(() => null)) as { token?: string } | null
    if (!body?.token) return { error: 'Verification failed' }

    const cookieStore = await cookies()
    cookieStore.set('token', body.token, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  } catch {
    return { error: 'Network error — please try again' }
  }
  redirect('/dashboard')
}
