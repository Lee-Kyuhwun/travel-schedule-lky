// RLS 보안 통합 테스트: 실제 Supabase(로컬 Docker 또는 지정한 프로젝트)에 사용자 A·B 를 만들어 서로의 데이터를 못 건드리는지 확인한다.
// 실행: npm run test:rls  (.env.local 의 URL / publishable 키 사용. 이메일 인증이 꺼진 환경이어야 가입 즉시 로그인된다.)
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
// 세션을 디스크에 남기지 않는 독립 클라이언트 (사용자마다 하나씩)
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const anon = client()
let a: SupabaseClient, b: SupabaseClient, aId = '', bId = ''
const tripId = crypto.randomUUID()
const itemIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
// 실행마다 다른 Place ID 를 써서 이전 실행의 데이터와 섞이지 않게 한다
const run = Date.now().toString(36)
const P1 = `test-place-${run}-1`, P2 = `test-place-${run}-2`

// A 의 3일 여행. days[0] 에 장소 2개, days[1] 에 메모 1개
const trip = (over: Record<string, unknown> = {}) => ({
  id: tripId, name: 'A의 여행', city: '오사카', country: '일본', start: '2026-12-11', end: '2026-12-13',
  days: [
    [{ id: itemIds[0], kind: 'place', placeId: P1, time: '12:30', stay: 60, memo: '현금만' }, { id: itemIds[1], kind: 'place', placeId: P2 }],
    [{ id: itemIds[2], kind: 'memo', text: '점심 예약' }],
    [],
  ],
  flights: [{ id: crypto.randomUUID(), no: 'KE723', from: 'ICN', depDate: '2026-12-11', depTime: '09:35', to: 'KIX', arrDate: '2026-12-11', arrTime: '11:20' }],
  stays: [], checklist: [{ id: crypto.randomUUID(), text: '여권', done: true }],
  expenses: [{ id: crypto.randomUUID(), date: '2026-12-11', title: '패스', amount: 5600, currency: 'JPY' }],
  ...over,
})

async function signUp(label: string) {
  const c = client()
  const { data, error } = await c.auth.signUp({ email: `rls-${label}-${run}@example.com`, password: 'test-password-1234' })
  assert.equal(error, null, error?.message)
  assert.ok(data.session, '가입 즉시 세션이 있어야 한다 (이메일 인증이 켜져 있으면 이 테스트를 돌릴 수 없다)')
  return { c, id: data.user!.id }
}

before(async () => {
  ;({ c: a, id: aId } = await signUp('a'))
  ;({ c: b, id: bId } = await signUp('b'))
})

test('가입하면 프로필이 자동으로 만들어지고 본인 것만 보인다', async () => {
  const mine = await a.from('profiles').select('id, display_name')
  assert.deepEqual(mine.data?.map(p => p.id), [aId])
  const others = await b.from('profiles').select('id').eq('id', aId)
  assert.deepEqual(others.data, [])
})

test('A 가 여행을 저장하면 일정·항공·준비물·가계부가 함께 저장된다', async () => {
  const r = await a.rpc('save_trip', { p: trip() })
  assert.equal(r.error, null, r.error?.message)
  const t = await a.from('trips').select('user_id, name, itinerary_items(id, day_index, position, visit_time, stay_minutes), flights(id), checklist_items(id), expenses(amount)').eq('id', tripId).single()
  assert.equal(t.data?.user_id, aId)
  assert.equal(t.data?.itinerary_items.length, 3)
  assert.equal(t.data?.flights.length, 1)
  assert.equal(t.data?.checklist_items.length, 1)
  assert.equal(Number(t.data?.expenses[0].amount), 5600)
  const first = t.data!.itinerary_items.find(i => i.id === itemIds[0])!
  assert.deepEqual([first.day_index, first.position, first.visit_time, first.stay_minutes], [0, 0, '12:30:00', 60])
})

test('비로그인 사용자는 아무것도 읽거나 쓸 수 없다', async () => {
  for (const table of ['trips', 'itinerary_items', 'saved_places', 'collections', 'profiles', 'places'] as const) {
    const r = await anon.from(table).select('*').limit(1)
    assert.ok(r.error || r.data?.length === 0, `${table} 이 비로그인에게 노출됨`)
  }
  assert.ok((await anon.rpc('save_trip', { p: trip({ id: crypto.randomUUID() }) })).error)
  assert.ok((await anon.rpc('save_library', { p_vault: [], p_collections: [] })).error)
})

test('B 는 A 의 여행과 일정을 조회할 수 없다', async () => {
  assert.deepEqual((await b.from('trips').select('id').eq('id', tripId)).data, [])
  assert.deepEqual((await b.from('itinerary_items').select('id').eq('trip_id', tripId)).data, [])
  assert.deepEqual((await b.from('flights').select('id').eq('trip_id', tripId)).data, [])
  assert.deepEqual((await b.from('expenses').select('id').eq('trip_id', tripId)).data, [])
})

test('B 는 A 의 여행을 수정·삭제·덮어쓸 수 없다', async () => {
  const upd = await b.from('trips').update({ name: '탈취' }).eq('id', tripId).select('id')
  assert.deepEqual(upd.data ?? [], [])
  const del = await b.from('trips').delete().eq('id', tripId).select('id')
  assert.deepEqual(del.data ?? [], [])
  // 같은 id 로 save_trip 을 불러 덮어쓰기 시도 (IDOR)
  assert.ok((await b.rpc('save_trip', { p: trip({ name: '탈취' }) })).error)
  const delItem = await b.from('itinerary_items').delete().eq('id', itemIds[0]).select('id')
  assert.deepEqual(delItem.data ?? [], [])
  // A 의 데이터는 그대로
  const t = await a.from('trips').select('name, itinerary_items(id)').eq('id', tripId).single()
  assert.equal(t.data?.name, 'A의 여행')
  assert.equal(t.data?.itinerary_items.length, 3)
})

test('user_id 를 바꿔치기해 남의 이름으로 저장할 수 없다', async () => {
  // B 가 A 소유로 여행을 만들려는 시도
  const forged = await b.from('trips').insert({ user_id: aId, name: '위조', start_date: '2026-12-11', end_date: '2026-12-11' })
  assert.ok(forged.error)
  // B 가 A 의 여행에 일정을 끼워 넣으려는 시도
  const inject = await b.from('itinerary_items').insert({ trip_id: tripId, day_index: 0, position: 9, kind: 'memo', memo: '주입' })
  assert.ok(inject.error)
  // A 가 자기 여행의 소유자를 B 로 넘기려는 시도 (with check 위반)
  const give = await a.from('trips').update({ user_id: bId }).eq('id', tripId)
  assert.ok(give.error)
  // B 가 A 의 프로필을 고치려는 시도
  const prof = await b.from('profiles').update({ display_name: 'hacked' }).eq('id', aId).select('id')
  assert.deepEqual(prof.data ?? [], [])
})

test('순서 변경·날짜 이동은 한 트랜잭션으로 반영된다', async () => {
  // 둘째 장소를 2일차 맨 앞으로 옮기고, 첫 장소의 시간·메모를 수정
  const moved = trip({ days: [
    [{ id: itemIds[0], kind: 'place', placeId: P1, time: '18:00', memo: '수정한 메모' }],
    [{ id: itemIds[1], kind: 'place', placeId: P2 }, { id: itemIds[2], kind: 'memo', text: '점심 예약' }],
    [],
  ] })
  assert.equal((await a.rpc('save_trip', { p: moved })).error, null)
  const items = (await a.from('itinerary_items').select('id, day_index, position, visit_time, memo').eq('trip_id', tripId).order('day_index').order('position')).data!
  assert.deepEqual(items.map(i => [i.id, i.day_index, i.position]), [[itemIds[0], 0, 0], [itemIds[1], 1, 0], [itemIds[2], 1, 1]])
  assert.deepEqual([items[0].visit_time, items[0].memo], ['18:00:00', '수정한 메모'])
})

test('잘못된 저장 요청은 통째로 실패하고 기존 데이터가 남는다', async () => {
  // 기간(3일)과 일차 수(1)가 맞지 않음 → 함수가 예외 → 전체 롤백
  const bad = await a.rpc('save_trip', { p: trip({ days: [[]] }) })
  assert.ok(bad.error)
  // 중간에 실패하는 경우: 통화 코드가 CHECK 위반 → 앞서 지운 일정도 되돌려져야 한다
  const half = await a.rpc('save_trip', { p: trip({ expenses: [{ id: crypto.randomUUID(), date: '2026-12-11', title: 'x', amount: 1, currency: 'won' }] }) })
  assert.ok(half.error)
  const count = (await a.from('itinerary_items').select('id', { count: 'exact', head: true }).eq('trip_id', tripId)).count
  assert.equal(count, 3)
})

test('여행 기간은 DB 제약으로도 보호된다', async () => {
  const r = await a.from('trips').insert({ name: '역전', start_date: '2026-12-13', end_date: '2026-12-11' })
  assert.ok(r.error)
})

test('보관함·컬렉션: 중복 없이 저장되고 다른 사용자에게 보이지 않는다', async () => {
  const colId = crypto.randomUUID()
  // 같은 장소를 두 번 넣어도 한 행만 남아야 한다
  const save = await a.rpc('save_library', {
    p_vault: [{ placeId: P1, alias: '단골', note: '예약 필수' }, { placeId: P1 }, { placeId: P2 }],
    p_collections: [{ id: colId, name: '오사카 맛집', placeIds: [P1] }],
  })
  assert.equal(save.error, null, save.error?.message)
  const mine = (await a.from('saved_places').select('alias, note, places(provider_place_id), collection_places(collection_id)').order('position')).data!
  assert.equal(mine.length, 2)
  assert.deepEqual([mine[0].alias, mine[0].note, mine[0].collection_places.length], ['단골', '예약 필수', 1])
  // B 에게는 보이지 않는다
  assert.deepEqual((await b.from('saved_places').select('id')).data, [])
  assert.deepEqual((await b.from('collections').select('id')).data, [])
  // B 가 자기 컬렉션에 A 의 저장 장소를 연결하려는 시도
  const aSaved = (await a.from('saved_places').select('id').limit(1).single()).data!.id
  const bCol = crypto.randomUUID()
  assert.equal((await b.rpc('save_library', { p_vault: [], p_collections: [{ id: bCol, name: 'B 컬렉션', placeIds: [] }] })).error, null)
  assert.ok((await b.from('collection_places').insert({ collection_id: bCol, saved_place_id: aSaved })).error)
  // 보관함에서 빼면 DB 에서도 사라지고 컬렉션 연결도 함께 지워진다
  assert.equal((await a.rpc('save_library', { p_vault: [{ placeId: P2 }], p_collections: [{ id: colId, name: '오사카 맛집', placeIds: [] }] })).error, null)
  const after = (await a.from('saved_places').select('places(provider_place_id)')).data!
  assert.deepEqual(after.map(s => (s.places as unknown as { provider_place_id: string }).provider_place_id), [P2])
  assert.equal((await a.from('collection_places').select('collection_id', { count: 'exact', head: true })).count, 0)
})

test('공용 장소 식별자 행은 아무도 수정·삭제할 수 없다', async () => {
  const upd = await b.from('places').update({ provider_place_id: 'hijack' }).eq('provider_place_id', P2).select('id')
  assert.deepEqual(upd.data ?? [], [])
  const del = await b.from('places').delete().eq('provider_place_id', P2).select('id')
  assert.deepEqual(del.data ?? [], [])
  assert.equal((await a.from('places').select('id').eq('provider_place_id', P2)).data?.length, 1)
})

test('여행을 지우면 딸린 행도 함께 지워진다', async () => {
  assert.equal((await a.from('trips').delete().eq('id', tripId)).error, null)
  for (const table of ['itinerary_items', 'flights', 'checklist_items', 'expenses'] as const) {
    assert.equal((await a.from(table).select('id', { count: 'exact', head: true }).eq('trip_id', tripId)).count, 0, table)
  }
})
