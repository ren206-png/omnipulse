import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that unauthenticated users can access (and authenticated users are redirected away from)
const AUTH_ROUTES = ['/login', '/signup', '/reset-password']
// Routes that are always public regardless of auth state
const ALWAYS_PUBLIC_ROUTES = ['/invite', '/reports']
// The landing page — always public, authenticated users stay here too
const LANDING_PAGE = '/'

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get('token')?.value

  const isAlwaysPublic = ALWAYS_PUBLIC_ROUTES.some((p) => pathname.startsWith(p))
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p))
  const isLandingPage = pathname === LANDING_PAGE

  // Landing page: always accessible; authenticated users stay on it
  if (isLandingPage || isAlwaysPublic) {
    return NextResponse.next()
  }

  // Redirect unauthenticated users away from protected routes to login
  if (!isAuthRoute && !token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth routes (login/signup) to dashboard
  if (isAuthRoute && token) {
    const dashboardUrl = req.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    dashboardUrl.search = ''
    return NextResponse.redirect(dashboardUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.webp$).*)',
  ],
}
