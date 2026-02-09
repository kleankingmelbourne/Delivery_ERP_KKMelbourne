import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // 1. 응답 객체 생성 (요청 정보를 포함하여 초기화)
  let supabaseResponse = NextResponse.next({
    request,
  })

  // 2. Supabase 서버 클라이언트 생성
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 요청(request)의 쿠키를 업데이트하여 미들웨어 이후 로직에서도 반영되게 함
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          
          // 응답(response)의 쿠키를 업데이트하여 브라우저에 저장되게 함
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. 현재 접속한 사용자의 정보를 확인 (세션이 만료되었다면 여기서 자동 갱신됨)
  // auth.getSession() 대신 auth.getUser()를 쓰는 것이 보안상 안전합니다.
  // 세션을 갱신하고 유저 정보를 가져옵니다.
  const { data: { user } } = await supabase.auth.getUser()

  // Response와 User 정보를 함께 반환합니다.
  return { supabaseResponse, user }
}