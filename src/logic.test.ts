// node 내장 테스트 러너 가져오기 (JUnit 대용)
import test from 'node:test'
// assert: 단언 라이브러리 (JUnit Assertions 대용, strict = 엄격 비교)
import assert from 'node:assert/strict'
// 테스트 대상 함수/타입 import (Java의 static import, type = 타입 전용 import)
import {
  addDays, catOfTypes, dayCount, placeUrl, dirUrl, distance, fmtDist, legs, ratingLabel, resizeDays, saveToVault, sortResults,
  freshIds, suggestOrder, tabelogLink, validateState, viewOf, type AppState, type Item, type LatLng, type PlaceInfo,
} from './logic.ts'

// at: 장소 id → 좌표 테스트용 고정 데이터 (Map<String, LatLng>)
const at: Record<string, LatLng> = { a: { lat: 0, lng: 0 }, near: { lat: 0, lng: 1 }, timed: { lat: 0, lng: 5 }, far: { lat: 0, lng: 9 }, b: { lat: 0, lng: 1 }, c: { lat: 0, lng: 2 } }
// coord: Item에서 좌표를 찾는 함수 (메모/없는 id는 null, ?. / ?? = null-safe / orElse)
const coord = (it: Item) => (it.kind === 'place' ? at[it.placeId] ?? null : null)
// place: 테스트용 장소 Item 팩토리 (스프레드로 time이 있을 때만 필드 추가)
const place = (placeId: string, time?: string): Item => ({ id: 'i-' + placeId, kind: 'place', placeId, ...(time ? { time } : {}) })
// memo: 테스트용 메모 Item 팩토리
const memo = (id: string): Item => ({ id, kind: 'memo', text: 'm' })
// info: 기본값 + 일부 덮어쓰기로 PlaceInfo 생성 (Partial = 일부 필드만, 빌더 패턴 비슷)
const info = (o: Partial<PlaceInfo>): PlaceInfo => ({ id: 'x', name: 'x', address: '', lat: 0, lng: 0, source: 'google', ...o })

// test(이름, 람다) = JUnit @Test 메서드
test('일차는 양 끝 날짜를 포함한다', () => {
  // assert.equal = assertEquals (일차 수는 양 끝 포함 3)
  assert.equal(dayCount('2026-12-11', '2026-12-13'), 3)
  // 같은 날이면 1일
  assert.equal(dayCount('2026-12-31', '2026-12-31'), 1)
  // 연말 + 1일 = 다음 해 1월 1일
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

// @Test: 거리 표기
test('거리 표기', () => {
  // 748m는 10m 단위 반올림되어 750m
  assert.equal(fmtDist(748), '직선 750m')
  // 2440m는 km 표기
  assert.equal(fmtDist(2440), '직선 2.4km')
  // 996m는 반올림되어 1.0km
  assert.equal(fmtDist(996), '직선 1.0km')
  // 두 좌표 사이 실제 거리 계산
  const d = distance({ lat: 34.6873, lng: 135.5262 }, { lat: 34.6687, lng: 135.5013 }) // 오사카성 → 도톤보리
  // assert.ok = assertTrue (약 3km 범위인지)
  assert.ok(d > 2800 && d < 3200, String(d))
})

// @Test: 구간 계산은 메모와 미해결 장소를 건너뜀
test('구간 거리는 메모와 정보를 못 불러온 장소를 건너뛴다', () => {
  // legs 결과 (좌표 없는 항목 사이에 낀 경우)
  const l = legs([place('a'), memo('m'), place('unresolved'), place('b')], coord)
  // deepEqual = assertEquals(리스트 비교): Boolean 변환 결과 확인
  assert.deepEqual(l.map(Boolean), [false, false, false, true])
  // 마지막 구간의 시작 인덱스가 0인지 확인 (l[3]! = non-null 단언)
  assert.equal(l[3]!.from, 0)
})

// @Test: 거리순 제안
test('거리순 제안: 첫 장소 기준, 시간 지정·메모는 제자리', () => {
  // 테스트 입력 목록 (시간 지정/메모 포함)
  const items = [place('a'), place('far'), memo('m'), place('timed', '12:00'), place('near')]
  // 기대 순서와 결과 id 목록 비교 (!. = null 아님 단언)
  assert.deepEqual(suggestOrder(items, coord)!.map(i => i.id), ['i-a', 'i-near', 'm', 'i-timed', 'i-far'])
  // 변경이 없으면 null
  assert.equal(suggestOrder([place('a'), place('b'), place('c')], coord), null)
  // 좌표 가진 항목이 없으면 null
  assert.equal(suggestOrder([memo('m')], coord), null)
})

// @Test: 길찾기 URL
test('길찾기 URL: 이름 + place ID, 이름이 없으면 좌표', () => {
  // 아래 기대 URL과 실제 결과 비교
  assert.equal(
    // 입력: 이름+placeId 있는 출발지, 좌표만 있는 도착지
    dirUrl({ lat: 1, lng: 2, name: '난바 라멘', placeId: 'ChIJabc' }, { lat: 3, lng: 4 }),
    // 기대 URL (한글은 퍼센트 인코딩)
    'https://www.google.com/maps/dir/?api=1&origin=%EB%82%9C%EB%B0%94%20%EB%9D%BC%EB%A9%98&origin_place_id=ChIJabc&destination=3%2C4')
})

// @Test: 음식 카테고리 정렬
test('음식 카테고리는 평점 → 평가 수 순, 평점 없음은 뒤로', () => {
  // 정렬 대상 샘플 목록 (평점 없음, 평점 동률/평가수 다름 포함)
  const list = [info({ id: 'none' }), info({ id: 'b', rating: 4.5, ratingCount: 10 }), info({ id: 'a', rating: 4.5, ratingCount: 900 }), info({ id: 'c', rating: 4.1, ratingCount: 5000 })]
  // cafe는 평점 → 평가수 순, 평점 없음 맨 뒤
  assert.deepEqual(sortResults(list, 'cafe').map(p => p.id), ['a', 'b', 'c', 'none'])
  // sight는 정렬 안 함 (입력 순서 유지)
  assert.deepEqual(sortResults(list, 'sight').map(p => p.id), ['none', 'b', 'a', 'c'])
  // 평점 라벨 포맷 (천단위 콤마)
  assert.equal(ratingLabel(info({ rating: 4.5, ratingCount: 1240 })), 'Google ★ 4.5 · 평가 1,240개')
  // 평점 없으면 "평점 없음"
  assert.equal(ratingLabel(info({})), '평점 없음')
})

// @Test: 타베로그 링크 규칙
test('타베로그 링크는 일본의 음식 카테고리에만, 확인된 URL 우선', () => {
  // 한국이면 null
  assert.equal(tabelogLink(info({ cat: 'cafe', country: 'KR' })), null)
  // 일본이어도 음식 카테고리 아니면 null
  assert.equal(tabelogLink(info({ cat: 'sight', country: 'JP' })), null)
  // 일본 음식점은 이름+지역으로 검색 URL
  assert.equal(tabelogLink(info({ cat: 'bar', country: 'JP', name: 'A B', area: '大阪' })), 'https://tabelog.com/rstLst/?sk=A%20B&sa=%E5%A4%A7%E9%98%AA')
  // 확인된 URL이 있으면 그걸 우선 사용
  assert.equal(tabelogLink(info({ cat: 'bakery', country: 'JP', tabelogUrl: 'https://tabelog.com/x/' })), 'https://tabelog.com/x/')
})

// @Test: 구글 지도 링크
test('Google 지도 링크: 이름 + place ID', () => {
  // 이름 + place ID가 인코딩된 URL인지 확인
  assert.equal(placeUrl(info({ id: 'ChIJabc', name: 'A B' })), 'https://www.google.com/maps/search/?api=1&query=A%20B&query_place_id=ChIJabc')
})

// @Test: 구글 타입 → 카테고리 매핑, 지도 범위 반경
test('Google 유형 매핑과 지도 범위 반경', () => {
  // 라멘집 → 음식점
  assert.equal(catOfTypes(['ramen_restaurant', 'food']), 'restaurant')
  // 이자카야 → 술집
  assert.equal(catOfTypes(['izakaya_restaurant', 'restaurant']), 'bar')
  // 커피숍 → 카페
  assert.equal(catOfTypes(['coffee_shop']), 'cafe')
  // 호텔 → 숙소
  assert.equal(catOfTypes(['hotel', 'lodging']), 'lodging')
  // 국제공항 → 공항
  assert.equal(catOfTypes(['international_airport', 'airport']), 'airport')
  // 지도 범위로 View 생성
  const v = viewOf({ north: 0.01, south: -0.01, east: 0.05, west: -0.05 }, { lat: 0, lng: 0 })
  // 반경은 짧은 변의 절반 (오차 5m 이내)
  assert.ok(Math.abs(v.radius - 1112) < 5, String(v.radius)) // 짧은 변(남북)의 절반
  // 범위가 매우 크면 반경 상한 50000으로 제한
  assert.equal(viewOf({ north: 60, south: -60, east: 170, west: -170 }, { lat: 0, lng: 0 }).radius, 50000)
})

// @Test: 보관함 중복 방지
test('보관함은 같은 장소를 하나로 유지', () => {
  // 초기 보관함 (List)
  const vault = [{ placeId: 'p1' }]
  // 같은 장소 재저장 시 별칭만 갱신
  saveToVault(vault, { placeId: 'p1', alias: '단골' })
  // 새 장소는 추가
  saveToVault(vault, { placeId: 'p2' })
  // 결과 목록 검증
  assert.deepEqual(vault, [{ placeId: 'p1', alias: '단골' }, { placeId: 'p2' }])
})

// @Test: 기간 축소 시 넘친 일정 이동
test('기간 축소 시 넘치는 일정은 선택한 날로 이동', () => {
  // 3일치 일정 준비
  const days = [[place('a')], [place('b')], [place('c'), memo('m')]]
  // 2일로 줄이면 3일차 항목이 1일차로 이동
  assert.deepEqual(resizeDays(days, 2, 0).map(d => d.map(i => i.id)), [['i-a', 'i-c', 'm'], ['i-b']])
  // 5일로 늘리면 길이 5
  assert.equal(resizeDays(days, 5).length, 5)
})

// @Test: 저장/백업에는 ID와 사용자 입력만 남음
test('저장·백업에는 place ID와 사용자 입력만 남는다', () => {
  // 정상 AppState 샘플 (객체 리터럴 = DTO 인스턴스)
  const s: AppState = { version: 2, vault: [], collections: [], trips: [{
    // 여행 기본 정보
    id: 't1', name: '테스트', city: '오사카', start: '2026-12-11', end: '2026-12-12',
    // 일정/항공/숙소 등
    days: [[{ id: 'a', kind: 'place', placeId: 'p1', time: '10:00', memo: 'm' }], []], flights: [], stays: [], checklist: [], expenses: [],
  // 샘플 종료
  }] }
  // JSON 직렬화 → 파싱 → 검증 후에도 원본과 동일해야 함 (ObjectMapper 왕복)
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), s)
  // 깊은 복사본에 불필요한 구글 필드를 주입
  const dirty = JSON.parse(JSON.stringify(s))
  // name/rating/좌표 같은 구글 데이터를 일부러 추가
  Object.assign(dirty.trips[0].days[0][0], { name: 'Google 이름', rating: 4.9, lat: 1, lng: 2 })
  // 보관함에 불필요 필드와 중복 항목 주입
  dirty.vault = [{ placeId: 'p', formattedAddress: 'x' }, { placeId: 'p' }]
  // 검증 실행
  const clean = validateState(dirty)
  // 구글 필드는 제거되고 허용 필드만 남는지 확인
  assert.deepEqual(Object.keys(clean.trips[0].days[0][0]).sort(), ['id', 'kind', 'memo', 'placeId', 'time'])
  // 보관함 중복이 제거되고 불필요 필드가 없는지 확인
  assert.deepEqual(clean.vault, [{ placeId: 'p' }])
  // trips 형식이 틀리면 예외 (assertThrows)
  assert.throws(() => validateState({ version: 2, trips: 'x' }))
  // 버전이 틀리면 예외
  assert.throws(() => validateState({ version: 1, trips: [] }))
  // 정상 데이터 복제
  const bad = JSON.parse(JSON.stringify(s))
  // 일차 하나를 제거해 기간과 불일치 상태로 만듦
  bad.trips[0].days.pop() // 기간과 일차 수 불일치
  // 일차 수 불일치 → 예외
  assert.throws(() => validateState(bad))
})

// freshIds: 가져온 데이터의 id 를 모두 새 UUID 로 교체하는지 검증 (JUnit @Test)
test('가져오기 시 모든 id 를 새 UUID 로 바꾸고 lastTripId 를 따라 바꾼다', () => {
  const s: AppState = { version: 2, vault: [{ placeId: 'p1' }], collections: [{ id: 'c1', name: '맛집', placeIds: ['p1'] }], lastTripId: 't1', trips: [{
    id: 't1', name: 'a', city: '', start: '2026-12-11', end: '2026-12-11',
    days: [[{ id: 'a', kind: 'place', placeId: 'p1' }]], flights: [], stays: [], checklist: [{ id: 'k', text: '여권', done: false }], expenses: [],
  }] }
  const f = freshIds(s)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/
  assert.match(f.trips[0].id, uuid)
  assert.match(f.trips[0].days[0][0].id, uuid)
  assert.match(f.trips[0].checklist[0].id, uuid)
  assert.match(f.collections[0].id, uuid)
  assert.equal(f.lastTripId, f.trips[0].id)
  assert.equal(s.trips[0].id, 't1') // 원본은 그대로
  assert.deepEqual(f.collections[0].placeIds, ['p1']) // 장소 ID 는 바뀌지 않는다
})

// validateState: 새 필드(체류 시간·국가·메모·컬렉션)를 보존하고 잘못된 값은 버리는지 검증
test('체류 시간·국가·보관함 메모·컬렉션은 검증 후 유지된다', () => {
  const v = validateState({ version: 2, vault: [{ placeId: 'p1', note: '예약 필수' }],
    collections: [{ id: 'c1', name: '맛집', placeIds: ['p1', 'p1', 'ghost'] }],
    trips: [{ id: 't', name: 'a', city: 'b', country: '일본', start: '2026-12-11', end: '2026-12-11',
      days: [[{ id: 'a', kind: 'place', placeId: 'p1', stay: 90 }, { id: 'b', kind: 'place', placeId: 'p1', stay: -5 }]] }] })
  assert.equal(v.trips[0].country, '일본')
  assert.deepEqual(v.trips[0].days[0].map(i => (i.kind === 'place' ? i.stay : null)), [90, undefined])
  assert.equal(v.vault[0].note, '예약 필수')
  assert.deepEqual(v.collections, [{ id: 'c1', name: '맛집', placeIds: ['p1'] }]) // 중복·보관함에 없는 ID 제거
})
