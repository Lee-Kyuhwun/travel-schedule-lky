// 브라우저용 Supabase 클라이언트. 세션은 쿠키에 저장되어 서버(proxy.ts)와 공유된다.
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'
import { supabaseEnv } from './env'

// DB 스키마 타입이 입혀진 클라이언트 타입 (Java 의 타입 세이프 Repository 에 해당)
export type Db = SupabaseClient<Database>

// 모듈 단위 싱글톤 (Spring 싱글톤 빈). 처음 쓸 때 한 번만 만든다.
let client: Db | null = null

/** 브라우저 전용 클라이언트를 돌려준다. 접근 제어는 DB 의 RLS 가 담당한다. */
export function getSupabase(): Db {
  // ??= : null 일 때만 생성해 대입 (lazy 초기화)
  return (client ??= createBrowserClient<Database>(supabaseEnv().url, supabaseEnv().key))
}
