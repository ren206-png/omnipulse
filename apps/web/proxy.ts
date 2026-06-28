import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/reset-password']
// These are public but authenticated users should NOT be redirected away
const ALWAYS_PUBLIC_PATHS = ['/invite', '/reports']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get('token')?.value

  const isAlwaysPublic = ALWAYS_PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || isAlwaysPublic

  // Redirect unauthenticated users away from protected routes
  if (!isPublic && !token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login/signup (but not from always-public paths like /invite)
  if (isPublic && !isAlwaysPublic && token) {
    const dashboardUrl = req.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    dashboardUrl.search = ''
    return NextResponse.redirect(dashboardUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logout).*)'],
}
