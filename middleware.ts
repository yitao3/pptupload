import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Increase the request size limit for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const response = NextResponse.next()
    response.headers.set('max-http-buffer-size', '100mb')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
} 