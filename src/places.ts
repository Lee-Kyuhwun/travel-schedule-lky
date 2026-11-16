// 장소 제공자(Google Places 라이브러리) + 런타임 전용 장소 캐시.
// 여기 데이터는 localStorage에 저장하지 않음: 저장된 여행은 place ID만 갖고 열 때 다시 조회.
// React 훅 import (useMemo = 계산 캐싱, useSyncExternalStore = 외부 저장소 구독)
import { useMemo, useSyncExternalStore } from 'react'
// logic.ts의 함수/타입 import (type = 타입 전용)
import { catOf, catOfTypes, type Cat, type PlaceInfo, type View } from './logic'

// GOOGLE_KEY: 환경변수의 구글 지도 API 키 (|| undefined = 빈 문자열이면 null 처리), export = public static final
export const GOOGLE_KEY: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined
/** Advanced Markers에 필요. DEMO_MAP_ID는 Google이 문서화한 테스트용 ID. */
// GOOGLE_MAP_ID: 지도 ID (없으면 데모 ID 기본값, application.yml 기본값 같은 역할)
export const GOOGLE_MAP_ID: string = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

// ---- Google Maps JS API 로더 (script 태그 하나, 추가 의존성 없음) ----
// loading: 스크립트 로딩 Promise 캐시 (Promise = CompletableFuture, 싱글톤처럼 한 번만 생성)
let loading: Promise<void> | null = null
// loadGoogle: 구글 지도 스크립트를 한 번만 로딩하는 비동기 함수
export function loadGoogle(): Promise<void> {
  // ??= : 값이 없을 때만 대입 (computeIfAbsent), resolve/reject = future.complete/completeExceptionally
  loading ??= new Promise<void>((resolve, reject) => {
    // window 객체를 키-값 맵처럼 다루기 위한 타입 변환 (캐스팅)
    const w = window as unknown as Record<string, unknown>
    // 이미 페이지에 있음(예: 모듈 핫리로드): 스크립트를 두 번 로드하면 API가 깨짐.
    // 이미 로드돼 있으면 즉시 완료 (중복 로딩 방지, ?. = null-safe 호출)
    if ((w.google as typeof google | undefined)?.maps?.importLibrary) { resolve(); return }
    // 스크립트 로드 완료 시 호출될 전역 콜백 등록 (람다)
    w.__pinlogGm = () => resolve()
    // 인증 실패 시 호출될 전역 콜백 등록 (예외로 reject)
    w.gm_authFailure = () => reject(new Error('Google Maps 키 인증에 실패했어요. 키와 허용 도메인·API 제한을 확인해주세요.'))
    // <script> 태그 요소 생성 (DOM API)
    const s = document.createElement('script')
    // 스크립트 URL 설정 (템플릿 리터럴 = String.format, 키는 URL 인코딩)
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY ?? '')}&v=weekly&loading=async&language=ko&libraries=places,marker&callback=__pinlogGm`
    // 비동기 로딩 설정
    s.async = true
    // 로딩 실패 시 reject (에러 콜백 람다)
    s.onerror = () => reject(new Error('Google Maps 스크립트를 불러오지 못했어요. 네트워크를 확인해주세요.'))
    // 페이지 <head>에 스크립트 추가 → 실제 로딩 시작
    document.head.append(s)
  })
  // Promise(CompletableFuture) 반환
  return loading
}

// FIELDS: 구글 Places API에 요청할 필드 목록 (List<String> 상수)
const FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'primaryType', 'types', 'addressComponents']
// toInfo: 구글 Place → PlaceInfo 변환 (좌표 없으면 null, Mapper/변환기 역할)
function toInfo(p: google.maps.places.Place): PlaceInfo | null {
  // 좌표가 없으면 변환 불가 → null
  if (!p.location) return null
  // comp: 주소 구성요소 중 특정 타입 찾기 (find = Stream.findFirst)
  const comp = (type: string) => p.addressComponents?.find(c => c.types.includes(type))
  // 변환 결과 객체 반환 시작
  return {
    // id/이름/주소 (?? = Optional.orElse 기본값)
    id: p.id, name: p.displayName ?? '(이름 없음)', address: p.formattedAddress ?? '',
    // 위도/경도 추출
    lat: p.location.lat(), lng: p.location.lng(),
    // 타입 목록으로 카테고리 판정 ([a, ...b] = 리스트 합치기)
    cat: catOfTypes([p.primaryType ?? '', ...(p.types ?? [])]),
    // 평점/평가수 (null은 undefined로 통일)
    rating: p.rating ?? undefined, ratingCount: p.userRatingCount ?? undefined,
    // 출처 고정 + 국가 코드 (?. = null-safe)
    source: 'google', country: comp('country')?.shortText ?? undefined,
    // 지역명: 시/군 없으면 광역 단위 사용
    area: (comp('locality') ?? comp('administrative_area_level_1'))?.longText ?? undefined,
  }
}
// lib: 구글 places 라이브러리를 로딩 후 가져오는 async 함수 (await = future.get(), 블로킹 없이 대기)
const lib = async () => { await loadGoogle(); return (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary }
// infos: Place 목록 → PlaceInfo 목록 (map + 타입가드 filter로 null 제거 = Stream.filter(Objects::nonNull))
const infos = (places: google.maps.places.Place[]) => places.map(toInfo).filter((p): p is PlaceInfo => !!p)

/** 이름/주소/키워드 검색. 보이는 지도에 가중치만 주고 제한하지 않아 오사카에서도 "교토 니시키시장" 검색 가능. */
// searchText: 키워드 검색 (async = CompletableFuture 반환, 지도 범위에 가중치)
export async function searchText(q: string, view: View): Promise<PlaceInfo[]> {
  // places 라이브러리에서 Place 클래스 꺼냄 (구조분해 = 필드 추출)
  const { Place } = await lib()
  // 텍스트 검색 호출 (옵션 객체 = 요청 DTO), 결과의 places 추출
  const { places } = await Place.searchByText({ textQuery: q, fields: FIELDS, locationBias: view.bounds, language: 'ko', maxResultCount: 20 })
  // 결과를 PlaceInfo 목록으로 변환해 반환
  return infos(places)
}
/** 호출자가 보이는 지도에서 계산한 원 안에서 카테고리 검색. */
// searchNearby: 카테고리별 주변 검색 (반경 안)
export async function searchNearby(cat: Cat, view: View): Promise<PlaceInfo[]> {
  // Place와 정렬 상수 enum 꺼냄
  const { Place, SearchNearbyRankPreference } = await lib()
  // 주변 검색 호출 (요청 DTO를 인라인 객체로 전달)
  const { places } = await Place.searchNearby({
    // 요청 필드와 검색 중심/반경 설정
    fields: FIELDS, locationRestriction: { center: view.center, radius: view.radius },
    // 카테고리 타입, 최대 20건, 인기순 정렬, 한국어
    includedTypes: catOf(cat)!.types, maxResultCount: 20, rankPreference: SearchNearbyRankPreference.POPULARITY, language: 'ko',
  })
  // `includedTypes`는 식당/카페가 단지 안에 들어있는 호텔, 백화점, 영화관도 매칭함.
  // 음식 칩에서는 주 유형이 해당 카테고리인 장소만 남김.
  // fits: 음식 카테고리면 주 타입이 일치하는 장소만 통과시키는 필터 람다
  const fits = (p: google.maps.places.Place) => !catOf(cat)!.food || !p.primaryType || catOfTypes([p.primaryType]) === cat
  // 필터 적용 후 변환하고 각 항목에 cat을 덮어씀 ({...p, cat} = 객체 복사 후 필드 교체)
  return infos(places.filter(fits)).map(p => ({ ...p, cat }))
}
// details: place ID로 상세정보를 가져오는 비동기 함수 (내부 전용 = private)
async function details(id: string): Promise<PlaceInfo> {
  // API 키 없으면 예외 (throw = throw new Exception)
  if (!GOOGLE_KEY) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY가 설정되지 않았어요')
  // Place 클래스 꺼냄
  const { Place } = await lib()
  // ID로 Place 객체 생성 (new 는 Java와 동일)
  const place = new Place({ id, requestedLanguage: 'ko' })
  // 필요한 필드 서버에서 가져옴 (await로 완료 대기)
  await place.fetchFields({ fields: FIELDS })
  // PlaceInfo로 변환
  const info = toInfo(place)
  // 좌표가 없으면 예외
  if (!info) throw new Error('장소 위치 정보가 없어요')
  // 결과 반환
  return info
}

// ---- 런타임 캐시 ----
// Entry: PlaceInfo 또는 "loading"/"error" 문자열 (유니온 타입 = 상태 enum 비슷)
export type Entry = PlaceInfo | 'loading' | 'error'
// cache: 장소 ID → 항목 캐시 (Map = HashMap)
const cache = new Map<string, Entry>()
// subs: 변경 구독자 목록 (Set = HashSet, 옵저버 리스트)
const subs = new Set<() => void>()
// version: 캐시 변경 횟수 (React가 변경 감지에 사용)
let version = 0
// bump: 버전 증가 후 모든 구독자에게 알림 (옵저버 패턴 notify)
const bump = () => { version++; subs.forEach(f => f()) }

/** 검색 결과를 캐시에 채워 일정에 추가할 때 두 번째 요청이 필요 없음. */
// remember: 검색 결과를 캐시에 넣고 구독자 알림
export function remember(list: PlaceInfo[]) { list.forEach(p => cache.set(p.id, p)); bump() }
/** 아직 못 본 모든 ID의 상세정보를 조회 (여행을 열 때 호출). */
// ensure: 아직 없는 ID만 상세정보를 가져옴 (캐시 미스 처리)
export function ensure(ids: string[]) {
  // 중복 제거(new Set) 후 캐시에 없는 ID만 추출 (Stream distinct + filter)
  const missing = [...new Set(ids)].filter(id => !cache.has(id))
  // 가져올 게 없으면 종료
  if (!missing.length) return
  // 각 ID마다 반복 (for-each)
  for (const id of missing) {
    // 우선 "loading" 상태로 표시
    cache.set(id, 'loading')
    // 비동기 조회: 성공 시 캐시 저장, 실패 시 "error", 끝나면 알림 (thenAccept/exceptionally/whenComplete)
    details(id).then(p => cache.set(id, p), () => cache.set(id, 'error')).finally(bump)
  }
  // loading 상태 변경을 알림
  bump()
}
// retry: 캐시를 지우고 다시 조회
export function retry(id: string) { cache.delete(id); ensure([id]) }
/** 컴포넌트를 캐시에 구독시키고 조회 함수를 반환. */
// usePlaces: React 훅(use 로 시작하는 함수) - 캐시 변경 시 컴포넌트를 다시 그리게 하는 구독
export function usePlaces(): (id: string) => Entry | undefined {
  // 외부 저장소(캐시)를 구독, 구독 해제 함수를 반환 (addListener/removeListener)
  const v = useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => version)
  // 캐시가 바뀌기 전까지 동일 참조를 유지해, 메모이제이션된 핀/지도 레이어가 매 렌더마다 다시 만들어지지 않게 함.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // version 이 바뀔 때만 새 조회 함수 생성 (useMemo = 메모이제이션), 아니면 같은 함수 재사용
  return useMemo(() => (id: string) => cache.get(id), [v])
}
// infoOf: Entry가 객체(PlaceInfo)일 때만 반환, 아니면 null (loading/error 걸러냄)
export const infoOf = (e: Entry | undefined): PlaceInfo | null => (e && typeof e === 'object' ? e : null)
