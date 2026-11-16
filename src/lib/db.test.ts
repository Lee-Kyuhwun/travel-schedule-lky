// DB 행 → 앱 상태 변환(toTrip / toLibrary) 단위 테스트. DB 없이 순수 함수만 검증한다 (JUnit 의 매퍼 테스트).
import test from 'node:test'
import assert from 'node:assert/strict'
import { toLibrary, toTrip, type TripRow } from './db.ts'

// 테스트용 여행 행: 일정 순서를 일부러 뒤섞어 정렬을 검증한다
const row: TripRow = {
  id: 't1', name: '간사이', city: '오사카', country: '일본', start_date: '2026-12-11', end_date: '2026-12-13',
  itinerary_items: [
    { id: 'i3', day_index: 1, position: 0, kind: 'memo', alias: null, visit_time: null, stay_minutes: null, memo: '점심 예약', places: null },
    { id: 'i2', day_index: 0, position: 1, kind: 'place', alias: null, visit_time: null, stay_minutes: null, memo: null, places: { provider_place_id: 'G2' } },
    { id: 'i1', day_index: 0, position: 0, kind: 'place', alias: '라멘집', visit_time: '12:30:00', stay_minutes: 60, memo: '현금만', places: { provider_place_id: 'G1' } },
    { id: 'i9', day_index: 7, position: 0, kind: 'place', alias: null, visit_time: null, stay_minutes: null, memo: null, places: { provider_place_id: 'G9' } },
  ],
  flights: [{ id: 'f1', position: 0, flight_no: 'KE723', from_code: 'ICN', dep_date: '2026-12-11', dep_time: '09:35:00', to_code: 'KIX', arr_date: '2026-12-11', arr_time: '11:20:00' }],
  stays: [{ id: 's1', position: 0, alias: null, check_in: '2026-12-11', check_out: '2026-12-13', places: { provider_place_id: 'H1' } }],
  checklist_items: [{ id: 'c2', position: 1, text: '환전', done: false }, { id: 'c1', position: 0, text: '여권', done: true }],
  expenses: [{ id: 'e1', position: 0, spent_on: '2026-12-11', title: '패스', amount: 5600, currency: 'JPY' }],
}

test('행을 일차·순서대로 조립하고 시각은 HH:MM 으로 바꾼다', () => {
  const t = toTrip(row)
  assert.equal(t.days.length, 3) // 12-11 ~ 12-13
  assert.deepEqual(t.days[0], [
    { id: 'i1', kind: 'place', placeId: 'G1', alias: '라멘집', time: '12:30', stay: 60, memo: '현금만' },
    { id: 'i2', kind: 'place', placeId: 'G2' }, // null 필드는 키가 없어야 한다
  ])
  assert.deepEqual(t.days[1], [{ id: 'i3', kind: 'memo', text: '점심 예약' }])
  assert.deepEqual(t.days[2], []) // 기간 밖(day_index 7) 항목은 버린다
  assert.equal(t.country, '일본')
  assert.equal(t.flights[0].depTime, '09:35')
  assert.deepEqual(t.checklist.map(c => c.text), ['여권', '환전'])
  assert.deepEqual(t.stays[0], { id: 's1', placeId: 'H1', checkIn: '2026-12-11', checkOut: '2026-12-13' })
})

test('보관함은 순서대로, 컬렉션은 연결된 장소의 Place ID 로 만든다', () => {
  const lib = toLibrary([
    { alias: null, note: '예약 필수', position: 1, places: { provider_place_id: 'G2' }, collection_places: [{ collection_id: 'c1' }] },
    { alias: '단골', note: null, position: 0, places: { provider_place_id: 'G1' }, collection_places: [] },
  ], [{ id: 'c1', name: '맛집', position: 0 }])
  assert.deepEqual(lib.vault, [{ placeId: 'G1', alias: '단골' }, { placeId: 'G2', note: '예약 필수' }])
  assert.deepEqual(lib.collections, [{ id: 'c1', name: '맛집', placeIds: ['G2'] }])
})
