// middleware.ts
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const path = request.nextUrl.pathname

  // 1. 비로그인 유저 차단
  if (
    !user && 
    !path.startsWith('/login') && 
    !path.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. 역할 기반 리다이렉트
  if (user) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
            cookiesToSet.forEach(({ name, value, options }) => 
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_level')
      .eq('id', user.id)
      .single()

    // 📍 [수정됨] 대소문자 무시하고 소문자로 변환하여 비교 (DRIVER -> driver)
    const userLevel = profile?.user_level?.toLowerCase() || 'admin'

    // 🚚 CASE A: 드라이버인 경우
    if (userLevel === 'driver') {
      if (!path.startsWith('/driver')) {
        const url = request.nextUrl.clone()
        url.pathname = '/driver/delivery'
        return NextResponse.redirect(url)
      }
    }

    // 👔 CASE B: 관리자(admin)인 경우
    else { 
      if (path.startsWith('/driver')) {
        const url = request.nextUrl.clone()
        url.pathname = '/' 
        return NextResponse.redirect(url)
      }
      if (path.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}