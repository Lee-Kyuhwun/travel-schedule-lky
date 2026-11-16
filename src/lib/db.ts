// 데이터 접근 계층 (Java 의 Repository). 화면 코드는 Supabase 를 직접 부르지 않고 이 모듈만 쓴다.
// 읽기: 정규화된 테이블 → 앱 상태(AppState) 로 조립.  쓰기: 바뀐 부분만 RPC(트랜잭션)로 저장.
import type { AppState, Collection, Item, PlaceRef, Trip } from '../logic.ts'
import type { Db } from './supabase/client.ts'

// ── 조회 결과 행 타입 (DB 컬럼명 그대로. JPA 의 Projection DTO 에 해당) ──
type PlaceJoin = { provider_place_id: string | null } | null
export type TripRow = {
  id: string; name: string; city: string; country: string | null; start_date: string; end_date: string
  itinerary_items: { id: string; day_index: number; position: number; kind: string; alias: string | null; visit_time: string | null; stay_minutes: number | null; memo: string | null; places: PlaceJoin }[]
  flights: { id: string; position: number; flight_no: string; from_code: string; dep_date: string; dep_time: string; to_code: string; arr_date: string; arr_time: string }[]
  stays: { id: string; position: number; alias: string | null; check_in: string; check_out: string; places: PlaceJoin }[]
  checklist_items: { id: string; position: number; text: string; done: boolean }[]
  expenses: { id: string; position: number; spent_on: string; title: string; amount: number; currency: string }[]
}
export type SavedRow = { alias: string | null; note: string | null; position: number; places: PlaceJoin; collection_places: { collection_id: string }[] }
export type CollectionRow = { id: string; name: string; position: number }

// PostgREST 중첩 조회: 한 번의 요청으로 여행과 자식 행을 함께 가져온다 (JPA 의 fetch join)
const TRIP_SELECT = `id, name, city, country, start_date, end_date,
  itinerary_items(id, day_index, position, kind, alias, visit_time, stay_minutes, memo, places(provider_place_id)),
  flights(id, position, flight_no, from_code, dep_date, dep_time, to_code, arr_date, arr_time),
  stays(id, position, alias, check_in, check_out, places(provider_place_id)),
  checklist_items(id, position, text, done),
  expenses(id, position, spent_on, title, amount, currency)`

// position 오름차순 정렬용 비교자 (Comparator.comparingInt)
const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position
// Postgres time 'HH:MM:SS' → 화면에서 쓰는 'HH:MM'
const hm = (t: string) => t.slice(0, 5)
// 양 끝 날짜를 포함한 일수
const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1

/** DB 행 → Trip (순수 함수라 DB 없이 단위 테스트할 수 있다). */
export function toTrip(r: TripRow): Trip {
  // 일차 수만큼 빈 배열을 만든 뒤 항목을 day_index 칸에 넣는다
  const list: Item[][] = Array.from({ length: days(r.start_date, r.end_date) }, () => [])
  for (const it of [...r.itinerary_items].sort((a, b) => a.day_index - b.day_index || a.position - b.position)) {
    const day = list[it.day_index]
    // 기간 밖 일차는 건너뛴다 (정상 경로에서는 생기지 않음)
    if (!day) continue
    if (it.kind === 'memo') { day.push({ id: it.id, kind: 'memo', text: it.memo ?? '' }); continue }
    const placeId = it.places?.provider_place_id
    // ponytail: 직접 등록(custom) 장소는 아직 화면이 없어 건너뛴다. 화면을 만들 때 PlaceInfo 로 매핑할 것.
    if (!placeId) continue
    day.push({
      id: it.id, kind: 'place', placeId,
      // null 인 선택 필드는 키 자체를 넣지 않는다 (앱 모델은 undefined 를 쓴다)
      ...(it.alias ? { alias: it.alias } : {}),
      ...(it.visit_time ? { time: hm(it.visit_time) } : {}),
      ...(it.stay_minutes ? { stay: it.stay_minutes } : {}),
      ...(it.memo ? { memo: it.memo } : {}),
    })
  }
  return {
    id: r.id, name: r.name, city: r.city, ...(r.country ? { country: r.country } : {}), start: r.start_date, end: r.end_date, days: list,
    flights: [...r.flights].sort(byPos).map(f => ({ id: f.id, no: f.flight_no, from: f.from_code, depDate: f.dep_date, depTime: hm(f.dep_time), to: f.to_code, arrDate: f.arr_date, arrTime: hm(f.arr_time) })),
    stays: [...r.stays].sort(byPos).flatMap(s => (s.places?.provider_place_id
      ? [{ id: s.id, placeId: s.places.provider_place_id, ...(s.alias ? { alias: s.alias } : {}), checkIn: s.check_in, checkOut: s.check_out }] : [])),
    checklist: [...r.checklist_items].sort(byPos).map(c => ({ id: c.id, text: c.text, done: c.done })),
    expenses: [...r.expenses].sort(byPos).map(e => ({ id: e.id, date: e.spent_on, title: e.title, amount: Number(e.amount), currency: e.currency })),
  }
}

/** 보관함·컬렉션 행 → 앱 상태 조각. */
export function toLibrary(saved: SavedRow[], cols: CollectionRow[]): { vault: PlaceRef[]; collections: Collection[] } {
  const rows = [...saved].sort(byPos).filter(s => s.places?.provider_place_id)
  const vault = rows.map(s => ({ placeId: s.places!.provider_place_id!, ...(s.alias ? { alias: s.alias } : {}), ...(s.note ? { note: s.note } : {}) }))
  const collections = [...cols].sort(byPos).map(c => ({
    id: c.id, name: c.name,
    // 이 컬렉션에 연결된 보관함 장소의 Place ID 목록
    placeIds: rows.filter(s => s.collection_places.some(cp => cp.collection_id === c.id)).map(s => s.places!.provider_place_id!),
  }))
  return { vault, collections }
}

/** 로그인한 사용자의 전체 데이터를 읽어 AppState 로 만든다. RLS 때문에 본인 행만 돌아온다. */
export async function loadState(db: Db): Promise<AppState> {
  // 네 개의 조회를 동시에 실행 (CompletableFuture.allOf)
  const [trips, saved, cols, profile] = await Promise.all([
    db.from('trips').select(TRIP_SELECT).order('created_at'),
    db.from('saved_places').select('alias, note, position, places(provider_place_id), collection_places(collection_id)'),
    db.from('collections').select('id, name, position'),
    db.from('profiles').select('last_trip_id').maybeSingle(),
  ])
  // 하나라도 실패하면 예외로 올린다 (호출자가 오류 화면을 보여준다)
  const failed = [trips, saved, cols, profile].find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  const list = (trips.data as unknown as TripRow[]).map(toTrip)
  const last = profile.data?.last_trip_id
  return {
    version: 2, trips: list, ...toLibrary(saved.data as unknown as SavedRow[], cols.data as CollectionRow[]),
    ...(last && list.some(t => t.id === last) ? { lastTripId: last } : {}),
  }
}

// 값 비교용 직렬화. ponytail: JSON 비교는 O(크기). 여행이 수백 개가 되면 변경 플래그(dirty set)로 바꿀 것.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * prev(마지막으로 DB 와 같았던 상태) → next 로 바뀐 부분만 저장한다.
 * 여행 한 건은 save_trip RPC 한 번 = 한 트랜잭션이라 일정 이동·순서 변경이 중간 상태로 남지 않는다.
 */
export async function pushDiff(db: Db, prev: AppState, next: AppState): Promise<void> {
  // 실패를 예외로 바꿔 주는 도우미
  const check = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }
  const before = new Map(prev.trips.map(t => [t.id, t]))

  // ① 새로 생겼거나 내용이 바뀐 여행 저장
  for (const t of next.trips) if (!same(before.get(t.id), t)) check(await db.rpc('save_trip', { p: t }))

  // ② 보관함 · 컬렉션
  if (!same(prev.vault, next.vault) || !same(prev.collections, next.collections)) {
    check(await db.rpc('save_library', { p_vault: next.vault, p_collections: next.collections }))
  }

  // ③ 사라진 여행 삭제 (자식 행은 FK 의 on delete cascade 로 함께 삭제)
  const alive = new Set(next.trips.map(t => t.id))
  const gone = prev.trips.filter(t => !alive.has(t.id)).map(t => t.id)
  if (gone.length) check(await db.from('trips').delete().in('id', gone))

  // ④ 마지막으로 연 여행 (없어진 여행을 가리키면 null)
  const last = (s: AppState) => (s.lastTripId && s.trips.some(t => t.id === s.lastTripId) ? s.lastTripId : null)
  if (last(prev) !== last(next) || gone.length) {
    const { data: { user } } = await db.auth.getUser()
    if (user) check(await db.from('profiles').update({ last_trip_id: last(next) }).eq('id', user.id))
  }
}
