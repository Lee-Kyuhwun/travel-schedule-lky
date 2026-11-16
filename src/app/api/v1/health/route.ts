// Next.js 응답 헬퍼 import (ResponseEntity 비슷)
import { NextResponse } from 'next/server'
// getSupabase 싱글톤 접근자 import
import { getSupabase } from '../../../../lib/supabase'

/** GET /api/v1/health — Supabase 연결 확인용 (Spring Actuator /health 와 동일 용도). */
// GET 핸들러: Route Handler = @RestController의 @GetMapping 메서드, async = CompletableFuture 반환
export async function GET() {
  // try-catch로 DB 오류 처리
  try {
    // trips 테이블에 head 요청으로 건수 조회 (SELECT 없이 연결 확인), 구조분해로 error 추출
    const { error } = await getSupabase().from('trips').select('id', { head: true, count: 'exact' })
    // 에러가 있으면 예외로 던져 catch로 이동
    if (error) throw error
    // 성공: 200 + {data:{status:"ok"}} JSON 응답
    return NextResponse.json({ data: { status: 'ok' } })
  // catch: DB 연결 실패 시
  } catch (e) {
    // 실패: 503 + 에러 JSON (e as Error = 캐스팅)
    return NextResponse.json({ error: { code: 'db_unavailable', message: (e as Error).message } }, { status: 503 })
  }
}
