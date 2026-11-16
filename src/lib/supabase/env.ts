// Supabase 접속 설정을 한 곳에서 읽고 검증한다 (Spring 의 @ConfigurationProperties + @Validated 역할).
// NEXT_PUBLIC_* 는 빌드 시점에 번들로 인라인되므로 process.env.NEXT_PUBLIC_X 를 리터럴 그대로 써야 한다.
export function supabaseEnv(): { url: string; key: string } {
  // 프로젝트 URL (예: https://xxxx.supabase.co, 로컬은 http://127.0.0.1:54321)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // publishable(공개) 키: 브라우저에 노출돼도 되는 키. 실제 권한은 DB 의 RLS 정책이 결정한다.
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  // 누락 시 즉시 실패 (fail-fast). 호출 시점에 검사하므로 빌드 자체는 막지 않는다.
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 설정되지 않았어요 (.env.local 확인)')
  return { url, key }
}
