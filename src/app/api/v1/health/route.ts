import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase/server'

/** GET /api/v1/health — Supabase(DB) 연결 확인용 (Spring Actuator /health 와 같은 용도). 데이터는 노출하지 않는다. */
export async function GET() {
  try {
    const supabase = await createClient()
    // ping(): 'ok' 만 돌려주는 SQL 함수. PostgREST → Postgres 까지 왕복하는지 확인한다.
    const { error } = await supabase.rpc('ping')
    if (error) throw error
    return NextResponse.json({ data: { status: 'ok' } })
  } catch (e) {
    // 내부 오류 상세는 숨기고 코드만 내려준다
    console.error('[health]', e)
    return NextResponse.json({ error: { code: 'db_unavailable', message: 'Database is not reachable' } }, { status: 503 })
  }
}
