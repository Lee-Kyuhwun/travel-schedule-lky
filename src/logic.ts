// 순수 데이터 모델 + 로직. DOM 의존이 없어 `node --test`로 바로 실행 가능.

// LatLng: 위경도 값 객체 (Java record LatLng(double lat, double lng))
export type LatLng = { lat: number; lng: number }
// Bounds: 지도 화면의 사각 범위 DTO
export type Bounds = { north: number; south: number; east: number; west: number }
/** 지도가 현재 보여주는 영역. 주변 검색은 중심 + 반경을 사용. */
// View: 현재 지도 상태(중심 + 반경 + 범위) DTO
export type View = { center: LatLng; radius: number; bounds: Bounds }

// Cat: 문자열 유니온 타입 = Java enum (이 8개 값만 허용)
export type Cat = 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'shopping' | 'sight' | 'lodging' | 'airport'
/**
 * `types`는 Google Places(New) 장소 유형; `food` 카테고리는 평점순 정렬 + 일본에서는 타베로그 링크 제공.
 * `hidden` 카테고리는 지도에 칩이 없음: 숙소는 전용 탭에서, 공항은 이름 검색으로 추가.
 */
// CATS: 카테고리 설정 상수 목록 (List<CatConfig> 상수, "?"는 선택 필드 = nullable)
export const CATS: { id: Cat; label: string; find: string; types: string[]; food: boolean; hidden?: true }[] = [
  // 음식점 카테고리 정의 (객체 리터럴 = 생성자 없이 만든 DTO 인스턴스)
  { id: 'restaurant', label: '음식점', find: '맛집', types: ['restaurant'], food: true },
  // 카페 카테고리 정의
  { id: 'cafe', label: '카페', find: '카페', types: ['cafe', 'coffee_shop'], food: true },
  // 술집 카테고리 정의
  { id: 'bar', label: '술집', find: '술집', types: ['bar', 'pub'], food: true },
  // 빵집 카테고리 정의
  { id: 'bakery', label: '빵집', find: '빵집', types: ['bakery'], food: true },
  // 쇼핑 카테고리 정의 (food=false)
  { id: 'shopping', label: '쇼핑', find: '쇼핑', types: ['shopping_mall', 'department_store', 'market'], food: false },
  // 관광 카테고리 정의
  { id: 'sight', label: '관광', find: '관광지', types: ['tourist_attraction'], food: false },
  // 숙소 카테고리 정의 (hidden: 지도 칩 숨김)
  { id: 'lodging', label: '숙소', find: '숙소', types: ['lodging'], food: false, hidden: true },
  // 공항 카테고리 정의
  { id: 'airport', label: '공항', find: '공항', types: ['airport'], food: false, hidden: true },
]
// catOf: id로 카테고리 조회. 화살표 함수=람다, find=Stream.filter().findFirst(), 없으면 undefined(=null)
export const catOf = (id?: Cat) => CATS.find(c => c.id === id)

/**
 * 런타임 전용 장소 데이터. 저장/내보내기 금지: Google 콘텐츠(이름, 주소,
 * 평점, 좌표)는 여행을 열 때마다 place ID로 다시 조회.
 */
// PlaceInfo: 런타임에만 존재하는 장소 DTO (DB에 저장 안 함)
export type PlaceInfo = {
  // id/이름/주소/좌표 (필수 필드)
  id: string; name: string; address: string; lat: number; lng: number
  // cat/rating/ratingCount는 "?" 선택 필드 = null 가능
  cat?: Cat; rating?: number; ratingCount?: number
  // source는 문자열 리터럴 타입 (항상 "google"만 가능)
  source: 'google'; country?: string; area?: string
  /** 이 장소의 검증된 타베로그 페이지를 알 때만 설정. */
  // tabelogUrl: 검증된 타베로그 URL이 있을 때만 채움
  tabelogUrl?: string
}

// ---- 저장 모델: place ID + 사용자가 입력한 것만, 그 외 없음 ----
// PlaceRef: 장소 ID + 사용자 별칭(선택)만 저장하는 참조 DTO
export type PlaceRef = { placeId: string; alias?: string; note?: string }
// Collection: 보관함 장소를 묶는 사용자 정의 폴더 (placeIds 는 보관함에 있는 장소만)
export type Collection = { id: string; name: string; placeIds: string[] }
// Item: 유니온 타입 = sealed interface (place 또는 memo 중 하나)
export type Item =
  // kind가 "place"인 변형 (판별자 kind로 구분, instanceof 대신 사용)
  | { id: string; kind: 'place'; placeId: string; alias?: string; time?: string; stay?: number; memo?: string } // stay = 예상 체류 시간(분)
  // kind가 "memo"인 변형
  | { id: string; kind: 'memo'; text: string }
// Flight: 항공편 DTO (날짜/시각은 문자열로 보관)
export type Flight = { id: string; no: string; from: string; depDate: string; depTime: string; to: string; arrDate: string; arrTime: string }
// Stay: 숙소 DTO
export type Stay = { id: string; placeId: string; alias?: string; checkIn: string; checkOut: string }
// Check: 준비물 체크리스트 항목 DTO
export type Check = { id: string; text: string; done: boolean }
// Expense: 가계부 항목 DTO
export type Expense = { id: string; date: string; title: string; amount: number; currency: string }
// Trip: 여행 DTO (Item[][] = List<List<Item>>, 일차별 일정)
export type Trip = {
  id: string; name: string; city: string; country?: string; start: string; end: string
  // days/flights/stays 등 하위 컬렉션 (T[] = List<T>)
  days: Item[][]; flights: Flight[]; stays: Stay[]; checklist: Check[]; expenses: Expense[]
}
// AppState: 앱 전체 저장 상태 (루트 DTO), version은 리터럴 2 고정
export type AppState = { version: 2; trips: Trip[]; vault: PlaceRef[]; collections: Collection[]; lastTripId?: string }

// DAY_COLORS: 일차별 색상 상수 배열 (static final List<String>)
export const DAY_COLORS = ['#8b5cf6', '#ed1572', '#1f9bc5', '#f59e0b', '#10b981', '#ef4444', '#6366f1']
// uid: 랜덤 8자리 id 생성 (36진수 문자열 변환 후 잘라냄, UUID 대용)
export const uid = (): string => crypto.randomUUID() // DB 기본키가 UUID 이므로 (Java 의 UUID.randomUUID())

// ---- 날짜 (ISO yyyy-mm-dd, UTC로 계산해 서머타임이 하루를 밀지 않음) ----
// D: ISO 날짜 문자열을 UTC 자정 Date로 변환 (LocalDate.parse 대용, 모듈 내부 전용=private)
const D = (iso: string) => new Date(iso + 'T00:00:00Z')
// isDate: 타입 가드 함수. 형식(정규식) + 유효 날짜 검사 후 true면 s를 string으로 간주
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(D(s).getTime())
// addDays: 날짜에 n일 더하기 (864e5 = 하루 밀리초, LocalDate.plusDays)
export const addDays = (iso: string, n: number) => new Date(D(iso).getTime() + n * 864e5).toISOString().slice(0, 10)
/** 양 끝 포함: 12.11 ~ 12.13은 3일. */
// dayCount: 시작~종료 일수 계산 (ChronoUnit.DAYS.between + 1)
export const dayCount = (start: string, end: string) => Math.round((D(end).getTime() - D(start).getTime()) / 864e5) + 1
// fmtDay: "월.일/요일" 포맷 (DateTimeFormatter 대용)
export const fmtDay = (iso: string) => {
  // UTC 기준 Date 객체 생성
  const d = D(iso)
  // 템플릿 리터럴(`${}`) = String.format, 문자열도 배열처럼 인덱스 접근 가능
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}/${'일월화수목금토'[d.getUTCDay()]}`
}
// fmtPeriod: 기간 문자열 포맷 ("-"를 "."로 치환, 같은 해면 종료일의 연도 생략)
export const fmtPeriod = (s: string, e: string) =>
  `${s.replaceAll('-', '.')} - ${(s.slice(0, 4) === e.slice(0, 4) ? e.slice(5) : e).replaceAll('-', '.')}`

// ---- distance ----
// distance: 하버사인 공식으로 두 좌표 간 거리(m) 계산 (일반 함수 선언)
export function distance(a: LatLng, b: LatLng) {
  // R=지구 반지름(m), r=도→라디안 변환 계수 (const = final)
  const R = 6371000, r = Math.PI / 180
  // 하버사인 중간값 h 계산 (** = Math.pow)
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  // 최종 거리 = 2R·asin(√h)
  return 2 * R * Math.asin(Math.sqrt(h))
}
// fmtDist: 거리를 "직선 750m"/"직선 2.4km"로 포맷
export function fmtDist(m: number) {
  // 10m 단위로 반올림
  const r = Math.round(m / 10) * 10
  // 1km 미만이면 m, 아니면 km(소수 1자리)로 표기
  return r < 1000 ? `직선 ${r}m` : `직선 ${(m / 1000).toFixed(1)}km`
}
/** 보이는 지도 안에 들어가는 검색 반경(짧은 변의 절반), Places API 제한 범위 내. */
// viewOf: 지도 범위로부터 검색 반경을 계산해 View 생성
export function viewOf(bounds: Bounds, center: LatLng): View {
  // 지도 세로 길이(m)
  const h = distance({ lat: bounds.south, lng: center.lng }, { lat: bounds.north, lng: center.lng })
  // 지도 가로 길이(m)
  const w = distance({ lat: center.lat, lng: bounds.west }, { lat: center.lat, lng: bounds.east })
  // 반경 = 짧은 변의 절반, 50m~50km로 clamp (Places API 제한)
  return { center, bounds, radius: Math.min(Math.max(Math.min(h, w) / 2, 50), 50000) }
}

/** 항목을 좌표로 변환(런타임 장소 캐시 사용); 메모/미조회 장소는 null. */
// Coord: Item → 좌표(없으면 null)로 바꾸는 함수 타입 = Function<Item, LatLng> (함수형 인터페이스)
export type Coord = (it: Item) => LatLng | null
// Leg: 이전 지점 → 현재 지점 구간 정보 DTO
export type Leg = { from: number; to: number; meters: number }
/** legs[i] = 직전 좌표 보유 장소(인덱스 `from`)에서 items[i]까지의 직선. 메모는 건너뜀. */
// legs: 각 항목마다 직전 좌표 항목까지의 구간 계산 (리턴 타입 Leg|null = Leg nullable)
export function legs(items: Item[], coord: Coord): (Leg | null)[] {
  // prev: 직전에 좌표가 있던 항목의 인덱스 (let = 재할당 가능한 변수)
  let prev = -1
  // items.map((it,i)=>...) = stream().map() (인덱스도 함께 받음)
  return items.map((it, i) => {
    // 현재 항목의 좌표 조회
    const c = coord(it)
    // 좌표 없으면(메모 등) 구간 없음 -> null
    if (!c) return null
    // 직전 지점이 있으면 구간 객체 생성 ("!"는 non-null 단언, 컴파일러에게 null 아님을 보증)
    const leg = prev >= 0 ? { from: prev, to: i, meters: distance(coord(items[prev])!, c) } : null
    // 현재 인덱스를 직전 지점으로 갱신
    prev = i
    // 구간(또는 null) 반환
    return leg
  })
}
// routeLength: 구간 거리 합계. reduce = Stream.reduce(0, 합산), l?.meters ?? 0 = null-safe + Optional.orElse(0)
export const routeLength = (items: Item[], coord: Coord) => legs(items, coord).reduce((s, l) => s + (l?.meters ?? 0), 0)

/**
 * 첫 장소에서 시작하는 최근접 이웃 방식 제안. 시간 지정 장소, 메모,
 * 미조회 장소는 제자리 유지. 바뀌는 게 없으면 null 반환.
 * ponytail: 탐욕적 최근접 이웃이라 최적은 아님; 하루 수십 곳이면 2-opt로 교체.
 */
// suggestOrder: 최근접 이웃 방식으로 방문 순서 제안, 변경 없으면 null
export function suggestOrder(items: Item[], coord: Coord): Item[] | null {
  // 좌표가 있는 첫 항목의 인덱스 (findIndex = indexOf 조건 버전, 없으면 -1)
  const first = items.findIndex(it => coord(it))
  // 좌표 있는 항목이 없으면 제안 불가
  if (first < 0) return null
  // free: 재배치 가능 여부 판정 람다 (첫 항목, 좌표없음, 시간 지정 장소는 제외; !! = boolean 변환)
  const free = (it: Item, i: number) => i !== first && !!coord(it) && !(it.kind === 'place' && it.time)
  // pool: 재배치 대상 항목들 (Stream.filter)
  const pool = items.filter(free)
  // cur: 현재 위치 (첫 항목 좌표에서 시작)
  let cur = coord(items[first])!
  // out: 슬롯을 순회하며 새 순서 구성
  const out = items.map((it, i) => {
    // 재배치 대상 슬롯이면
    if (free(it, i)) {
      // pool에서 현재 위치와 가장 가까운 항목의 인덱스(best)를 찾음
      let best = 0
      // 가장 가까운 항목을 pool에서 꺼내(splice=remove) 이 슬롯에 배치
      pool.forEach((p, k) => { if (distance(cur, coord(p)!) < distance(cur, coord(pool[best])!)) best = k })
      it = pool.splice(best, 1)[0]
    // 현재 위치 갱신 (좌표 없으면 유지, ?? = Optional.orElse)
    }
    // 배치된 항목 반환
    cur = coord(it) ?? cur
    return it
  // 하나라도 순서가 바뀌었으면(some=anyMatch) out 반환, 아니면 null
  })
  return out.some((it, i) => it.id !== items[i].id) ? out : null
}

/** Google Maps 길찾기 URL. 텍스트 + place ID를 함께 써서 같은 체인의 지점을 구분. */
// Stop: LatLng에 이름/placeId를 합친 타입 (교차 타입 = 상속/필드 합성)
export type Stop = LatLng & { name?: string; placeId?: string }
// dirUrl: 구글 지도 길찾기 URL 생성
export function dirUrl(a: Stop, b: Stop) {
  // part: 출발/도착 쿼리 문자열 조각 생성 헬퍼 (중첩 람다)
  const part = (key: 'origin' | 'destination', s: Stop) =>
    // 이름(없으면 좌표)을 URL 인코딩, placeId 있으면 추가 (URLEncoder.encode 대응)
    `&${key}=${encodeURIComponent(s.name ?? `${s.lat},${s.lng}`)}` + (s.placeId ? `&${key}_place_id=${encodeURIComponent(s.placeId)}` : '')
  // 기본 URL + 출발 + 도착 이어붙이기
  return 'https://www.google.com/maps/dir/?api=1' + part('origin', a) + part('destination', b)
}

// ---- 탐색 결과 ----
/** 음식 카테고리: 평점 내림차순, 평가 수 내림차순, 평점 없음은 맨 뒤. 나머지는 제공자 순서 유지. */
// sortResults: 음식 카테고리만 평점 내림차순 → 평가 수 내림차순 정렬
export function sortResults(list: PlaceInfo[], cat: Cat): PlaceInfo[] {
  // 음식 카테고리가 아니면 원본 그대로 반환
  if (!catOf(cat)?.food) return list
  // [...list] = 복사본 생성 후 sort (원본 불변, new ArrayList<>(list))
  return [...list].sort((a, b) =>
    // Comparator.comparing().thenComparing() 대용: 평점 없음은 -1로 취급해 뒤로, || 로 동률이면 다음 기준
    (b.rating ?? -1) - (a.rating ?? -1) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0))
}
/** 항상 출처(Google)를 표기. */
// ratingLabel: 평점 표시 문자열 ("평점 없음" 또는 "Google ★ 4.5 · 평가 N개")
export const ratingLabel = (p: PlaceInfo) =>
  // == null 은 null/undefined 모두 검사, 삼항연산자 사용, toLocaleString = 천단위 콤마
  p.rating == null ? '평점 없음' : `Google ★ ${p.rating.toFixed(1)} · 평가 ${(p.ratingCount ?? 0).toLocaleString('ko-KR')}개`
/** 일본 음식점 전용: 검증된 페이지가 있으면 그것, 없으면 이름 + 지역으로 타베로그 검색. */
// tabelogLink: 일본 음식점일 때만 타베로그 링크 반환 (String|null)
export function tabelogLink(p: PlaceInfo): string | null {
  // 일본이 아니거나 음식 카테고리가 아니면 null
  if (p.country !== 'JP' || !catOf(p.cat)?.food) return null
  // 검증된 URL이 있으면 사용, 없으면 이름+지역으로 검색 URL 생성
  return p.tabelogUrl ?? `https://tabelog.com/rstLst/?sk=${encodeURIComponent(p.name)}&sa=${encodeURIComponent(p.area ?? '')}`
}
/** 장소 하나의 Google Maps 페이지: 이름 + place ID. */
// placeUrl: 구글 지도 장소 페이지 URL 생성
export const placeUrl = (p: PlaceInfo) =>
  // 기본 URL (문자열 이어붙이기)
  'https://www.google.com/maps/search/?api=1&query=' +
  // 이름과 place ID를 URL 인코딩해 쿼리에 추가
  `${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.id)}`
/** Google 장소 유형을 우리 카테고리로 매핑. */
// catOfTypes: 구글 장소 타입 배열을 우리 카테고리로 매핑 (없으면 undefined)
export function catOfTypes(types: string[]): Cat | undefined {
  // has: 타입 중 정규식에 맞는 것이 있는지 검사 (some = anyMatch, RegExp = Pattern)
  const has = (re: RegExp) => types.some(t => re.test(t))
  // 공항
  if (has(/airport/)) return 'airport'
  // 빵집
  if (has(/bakery/)) return 'bakery'
  // 카페
  if (has(/^(cafe|coffee_shop|tea_house)$/)) return 'cafe'
  // 술집
  if (has(/izakaya|^(bar|pub|wine_bar)$/)) return 'bar'
  // 음식점
  if (has(/restaurant|^food/)) return 'restaurant'
  // 숙소
  if (has(/lodging|hotel|hostel|ryokan|guest_house/)) return 'lodging'
  // 관광지
  if (has(/tourist_attraction|museum|park|shrine|temple|castle|landmark/)) return 'sight'
  // 쇼핑 (어디에도 안 맞으면 값 없이 종료 = undefined)
  if (has(/store|shopping|market/)) return 'shopping'
}
/** 보관함은 장소당 하나만 보관; 다시 저장하면 별칭만 갱신. */
// saveToVault: 보관함에 중복 없이 저장 (vault는 변경 대상 List, 참조로 전달)
export function saveToVault(vault: PlaceRef[], ref: PlaceRef) {
  // 같은 placeId 가진 항목 탐색
  const hit = vault.find(v => v.placeId === ref.placeId)
  // 없으면 추가 (push = add)
  if (!hit) vault.push(ref)
  // 있고 별칭이 주어졌으면 별칭만 갱신
  else if (ref.alias) hit.alias = ref.alias
}

/** 일차 목록을 늘리거나 줄임; 삭제되는 일차의 항목은 `moveTo`일차 뒤에 추가. */
// resizeDays: 일차 수를 n으로 늘리거나 줄임 (moveTo = 기본값 있는 파라미터, 오버로딩 대용)
export function resizeDays(days: Item[][], n: number, moveTo = n - 1): Item[][] {
  // n개 일차 배열 생성 (기존 것 유지, 없으면 빈 배열; ?? = orElse)
  const out = Array.from({ length: n }, (_, i) => days[i] ?? [])
  // 잘려나간 일차의 항목들을 하나로 펼침 (flat = flatMap)
  const overflow = days.slice(n).flat()
  // 이동 대상 일차 인덱스를 0~n-1 범위로 보정
  const to = Math.min(Math.max(moveTo, 0), n - 1)
  // 넘친 항목이 있으면 대상 일차 뒤에 붙임 ([...a, ...b] = addAll)
  if (overflow.length) out[to] = [...out[to], ...overflow]
  // 새 일차 목록 반환
  return out
}

// ---- 가져오기/복원 검증: 한글 사유로 예외를 던지며 부분 데이터는 반환하지 않음 ----
// 모든 객체를 필드 단위로 재구성하므로 파일에 섞인 Google 필드는 저장되지 않고 버려짐.
// validateState: 외부 JSON(unknown = Object)을 검증해 AppState로 변환, 실패 시 예외
export function validateState(x: unknown): AppState {
  // fail: 메시지로 예외를 던지는 헬퍼 (never = 절대 정상 리턴 안 함)
  const fail = (m: string): never => { throw new Error(m) }
  // obj: 객체(Map)인지 검증, 아니면 fail
  const obj = (v: unknown, m: string) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(m))
  // str: 문자열인지 검증
  const str = (v: unknown, m: string) => (typeof v === 'string' ? v : fail(m))
  // arr: 배열인지 검증
  const arr = (v: unknown, m: string) => (Array.isArray(v) ? (v as unknown[]) : fail(m))
  // date: 유효한 ISO 날짜인지 검증
  const date = (v: unknown, m: string) => (isDate(v) ? v : fail(m))
  // opt: 값이 있는 문자열 필드만 골라 객체로 만듦 (...keys = 가변인자 varargs)
  const opt = (o: Record<string, unknown>, ...keys: string[]) =>
    // filter 후 map으로 [키,값] 쌍을 만들어 Object.fromEntries = Collectors.toMap
    Object.fromEntries(keys.filter(k => typeof o[k] === 'string' && o[k]).map(k => [k, o[k] as string]))
  // ref: 보관함 항목 검증/변환
  const ref = (v: unknown): PlaceRef => {
    // 객체 형식 검증
    const o = obj(v, '보관함 항목 형식이 올바르지 않습니다')
    // placeId 필수, alias는 있을 때만 포함 (...opt = 맵 병합 putAll)
    return { placeId: str(o.placeId, '장소 ID 누락'), ...opt(o, 'alias', 'note') }
  }
  // item: 일정 항목 검증/변환 (kind에 따라 분기)
  const item = (v: unknown): Item => {
    // 객체 형식 검증
    const o = obj(v, '일정 항목 형식이 올바르지 않습니다')
    // id 필수 문자열
    const id = str(o.id, '일정 항목 id 누락')
    // memo 종류면 메모 항목 반환
    if (o.kind === 'memo') return { id, kind: 'memo', text: str(o.text, '메모 내용 누락') }
    // place도 아니면 예외
    if (o.kind !== 'place') fail('알 수 없는 일정 항목 종류')
    // place 항목 반환 (alias/time/memo 선택 필드만 복사)
    return { id, kind: 'place', placeId: str(o.placeId, '장소 ID 누락'), ...opt(o, 'alias', 'time', 'memo'), ...(typeof o.stay === 'number' && o.stay >= 1 && o.stay <= 1440 ? { stay: Math.round(o.stay) } : {}) }
  }
  // trip: 여행 한 건 검증/변환
  const trip = (v: unknown): Trip => {
    // 객체 형식 검증
    const o = obj(v, '여행 형식이 올바르지 않습니다')
    // 시작일/종료일 검증 (한 줄 다중 선언)
    const start = date(o.start, '여행 시작일 오류'), end = date(o.end, '여행 종료일 오류')
    // 일차 목록을 2중 map으로 검증 (List<List<Item>>)
    const days = arr(o.days, '일차 목록 누락').map(d => arr(d, '일차 형식 오류').map(item))
    // 종료<시작 이거나 일차 수가 기간과 다르면 예외 (ISO 문자열은 사전순 비교 = 날짜순)
    if (end < start || days.length !== dayCount(start, end)) fail('여행 기간과 일차 수가 맞지 않습니다')
    // 검증된 값으로 Trip 객체를 새로 구성 (알 수 없는 필드는 버려짐)
    return {
      // id/이름/도시/기간/일차 설정 (o.city ?? "" = 기본값)
      id: str(o.id, '여행 id 누락'), name: str(o.name, '여행 이름 누락'), city: str(o.city ?? '', '여행 도시 오류'), ...opt(o, 'country'), start, end, days,
      // 항공편 목록 검증 후 변환
      flights: arr(o.flights ?? [], '항공편 목록 오류').map(f => {
        // 항공편 객체 검증
        const p = obj(f, '항공편 형식 오류')
        // 항공편 필드 하나씩 검증해 Flight 생성
        return { id: str(p.id, '항공편 id 누락'), no: str(p.no, '편명 누락'), from: str(p.from, '출발 공항 누락'), depDate: date(p.depDate, '출발일 오류'), depTime: str(p.depTime, '출발 시각 오류'), to: str(p.to, '도착 공항 누락'), arrDate: date(p.arrDate, '도착일 오류'), arrTime: str(p.arrTime, '도착 시각 오류') }
      }),
      // 숙소 목록 검증 후 변환
      stays: arr(o.stays ?? [], '숙소 목록 오류').map(s => {
        // 숙소 객체 검증
        const p = obj(s, '숙소 형식 오류')
        // 숙소 필드 검증해 Stay 생성
        return { id: str(p.id, '숙소 id 누락'), placeId: str(p.placeId, '숙소 장소 ID 누락'), ...opt(p, 'alias'), checkIn: date(p.checkIn, '체크인 날짜 오류'), checkOut: date(p.checkOut, '체크아웃 날짜 오류') }
      }),
      // 준비물 목록 검증 후 변환
      checklist: arr(o.checklist ?? [], '준비물 목록 오류').map(c => {
        // 준비물 객체 검증
        const p = obj(c, '준비물 형식 오류')
        // done은 !! 로 boolean 변환
        return { id: str(p.id, '준비물 id 누락'), text: str(p.text, '준비물 내용 누락'), done: !!p.done }
      }),
      // 가계부 목록 검증 후 변환
      expenses: arr(o.expenses ?? [], '가계부 목록 오류').map(e => {
        // 가계부 객체 검증
        const p = obj(e, '가계부 형식 오류')
        // 금액이 유한한 숫자가 아니면 예외
        if (typeof p.amount !== 'number' || !Number.isFinite(p.amount)) fail('가계부 금액 오류')
        // 가계부 필드 검증해 Expense 생성
        return { id: str(p.id, '가계부 id 누락'), date: date(p.date, '가계부 날짜 오류'), title: str(p.title, '가계부 내용 누락'), amount: p.amount as number, currency: str(p.currency, '통화 누락') }
      }),
    }
  }
  // 최상위 객체 검증
  const o = obj(x, 'JSON 최상위가 객체가 아닙니다')
  // 백업 버전이 2가 아니면 예외
  if (o.version !== 2) fail('지원하지 않는 백업 버전입니다')
  // 보관함 결과 리스트 (중복 제거용)
  const vault: PlaceRef[] = []
  // 보관함 항목을 변환해 중복 없이 vault에 저장 (forEach = 반복문)
  arr(o.vault ?? [], '보관함 형식 오류').map(ref).forEach(r => saveToVault(vault, r))
  // 검증이 끝난 AppState 반환 (trips 변환 포함, lastTripId는 있을 때만)
  // 컬렉션: 보관함에 없는 장소 ID 는 버린다 (DB 의 FK 와 같은 규칙)
  const saved = new Set(vault.map(v => v.placeId))
  const collections: Collection[] = arr(o.collections ?? [], '컬렉션 형식 오류').map(c => {
    const p = obj(c, '컬렉션 형식 오류')
    const ids = arr(p.placeIds ?? [], '컬렉션 장소 형식 오류').filter((x): x is string => typeof x === 'string' && saved.has(x))
    return { id: str(p.id, '컬렉션 id 누락'), name: str(p.name, '컬렉션 이름 누락'), placeIds: [...new Set(ids)] }
  })
  return { version: 2, trips: arr(o.trips, 'trips 배열이 없습니다').map(trip), vault, collections, ...opt(o, 'lastTripId') }
}

/** 가져오기·이관용: 모든 id 를 새 UUID 로 바꾼다 (예전 짧은 id, 다른 계정의 행과의 충돌 방지). */
export function freshIds(s: AppState): AppState {
  // 원본을 건드리지 않도록 깊은 복사 (Java 의 방어적 복사)
  const d = structuredClone(s)
  // 옛 여행 id → 새 id 매핑 (lastTripId 를 따라 바꾸기 위해)
  const map = new Map<string, string>()
  for (const t of d.trips) {
    const id = uid()
    map.set(t.id, id)
    t.id = id
    // 여행에 딸린 모든 하위 항목에도 새 id 부여
    for (const x of [...t.days.flat(), ...t.flights, ...t.stays, ...t.checklist, ...t.expenses]) x.id = uid()
  }
  for (const c of d.collections) c.id = uid()
  const last = d.lastTripId && map.get(d.lastTripId)
  if (last) d.lastTripId = last
  else delete d.lastTripId
  return d
}
