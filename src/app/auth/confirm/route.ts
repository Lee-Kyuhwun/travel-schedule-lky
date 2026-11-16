// 이메일 인증 링크 / OAuth 콜백이 도착하는 곳 (Spring Security 의 로그인 콜백 엔드포인트).
import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '../../../lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const supabase = await createClient()
  // ① 이메일 인증 링크: token_hash + type
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  // ② OAuth / PKCE: code
  const code = searchParams.get('code')

  let ok = false
  if (token_hash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash })).error
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error

  // 리다이렉트 대상은 고정 경로만 쓴다 (오픈 리다이렉트 방지)
  return NextResponse.redirect(origin + (ok ? '/' : '/login?error=confirm'))
}
