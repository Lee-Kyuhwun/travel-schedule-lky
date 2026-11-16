// Next.js 16 의 proxy (예전 middleware.ts). 모든 요청 앞에서 실행된다 (Spring 의 OncePerRequestFilter).
// 역할: ① 만료된 세션 토큰 갱신 ② 비로그인 사용자를 /login 으로 보냄.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from './lib/supabase/env'

// 로그인 없이 열 수 있는 경로
const PUBLIC = ['/login', '/auth', '/api/v1/health']

export async function proxy(request: NextRequest) {
  // 기본 응답: 요청을 그대로 다음 단계로 전달
  let response = NextResponse.next({ request })
  const { url, key } = supabaseEnv()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // 갱신된 토큰을 요청·응답 양쪽 쿠키에 반영
      setAll: list => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getUser(): 인증 서버에 토큰을 검증받는다. 쿠키 값만 믿는 getSession() 을 서버 판단에 쓰면 안 된다.
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC.some(p => path === p || path.startsWith(p + '/'))
  // 비로그인 + 보호 경로 → 로그인 화면으로
  if (!user && !isPublic) {
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    to.search = ''
    return NextResponse.redirect(to)
  }
  // 이미 로그인했는데 로그인 화면 → 홈으로
  if (user && path === '/login') {
    const to = request.nextUrl.clone()
    to.pathname = '/'
    to.search = ''
    return NextResponse.redirect(to)
  }
  return response
}

// 정적 파일은 건너뛴다 (필터 매핑의 exclude 패턴)
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'] }
