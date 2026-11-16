// Supabase SDK에서 클라이언트 생성 함수/타입 import
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// client: 모듈 단위 싱글톤 저장 변수 (처음엔 null)
let client: SupabaseClient | null = null

/** 싱글톤 클라이언트 (Java 의 DataSource / 커넥션 풀 빈에 해당). 접근 제어는 DB 의 RLS 정책이 담당. */
// getSupabase: 클라이언트를 처음 호출 시 생성해 재사용하는 팩토리 (export = public)
export function getSupabase(): SupabaseClient {
  // NEXT_PUBLIC_* 는 빌드 시점에 번들로 인라인되므로 process.env.NEXT_PUBLIC_X 를 리터럴로 접근해야 한다.
  // 공개 Supabase URL 환경변수 읽기 (System.getenv 비슷)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // 공개 anon 키 환경변수 읽기
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // 필수 env 검증 (Spring @ConfigurationProperties + @Validated 역할). 첫 사용 시점에 검사해 빌드는 막지 않는다.
  // 환경변수가 없으면 예외 발생 (throw new)
  if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 없어요')
  // ??= : client가 null일 때만 생성 후 저장 (lazy 싱글톤), 그 값을 반환
  return (client ??= createClient(url, anon))
}
