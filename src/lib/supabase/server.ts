// 서버(Route Handler / Server Component)용 Supabase 클라이언트. 요청마다 새로 만든다 (요청 스코프 빈).
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '../database.types'
import { supabaseEnv } from './env'

/** 요청 쿠키의 세션으로 동작하는 클라이언트. 사용자의 권한(RLS)이 그대로 적용된다. */
export async function createClient() {
  // Next.js 16: cookies() 는 Promise 를 돌려준다
  const store = await cookies()
  const { url, key } = supabaseEnv()
  return createServerClient<Database>(url, key, {
    cookies: {
      // 요청에 실려 온 세션 쿠키 읽기
      getAll: () => store.getAll(),
      // 토큰이 갱신되면 응답 쿠키에 다시 쓴다
      setAll: list => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 처리하므로 무시해도 안전하다.
        }
      },
    },
  })
}
