// 장소 제공자(Google Places 라이브러리) + 런타임 전용 장소 캐시.
// 여기 데이터는 localStorage에 저장하지 않음: 저장된 여행은 place ID만 갖고 열 때 다시 조회.
// React 훅 import (useMemo = 계산 캐싱, useEffect = 라이프사이클, useSyncExternalStore = 외부 저장소 구독)
import { useEffect, useMemo, useSyncExternalStore } from 'react'
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
/**
 * 호출자가 보이는 지도에서 계산한 원 안에서 카테고리 검색.
 * 인기순 20곳만 받으면 백화점·대형 체인이 목록을 다 차지하고, 거리순만 받으면
 * 유명한 곳이 빠진다. 두 랭킹을 함께 받아 합쳐 최대 40곳을 보여준다.
 */
// searchNearby: 카테고리별 주변 검색 (반경 안, 인기순 + 거리순 병합)
export async function searchNearby(cat: Cat, view: View): Promise<PlaceInfo[]> {
  // Place와 정렬 상수 enum 꺼냄
  const { Place, SearchNearbyRankPreference } = await lib()
  // 두 요청이 공통으로 쓰는 옵션 (요청 DTO)
  const request = {
    fields: FIELDS, locationRestriction: { center: view.center, radius: view.radius },
    includedTypes: catOf(cat)!.types, maxResultCount: 20, language: 'ko',
  }
  // 인기순과 거리순을 동시에 요청 (Promise.all = CompletableFuture.allOf)
  const [popular, near] = await Promise.all([
    Place.searchNearby({ ...request, rankPreference: SearchNearbyRankPreference.POPULARITY }),
    Place.searchNearby({ ...request, rankPreference: SearchNearbyRankPreference.DISTANCE }),
  ])
  // 두 결과를 이어 붙이고 place ID 로 중복 제거 (인기순 결과를 앞에 둔다)
  const seen = new Set<string>()
  const places = [...(popular.places ?? []), ...(near.places ?? [])].filter(p => {
    // 이미 본 장소면 버림
    if (seen.has(p.id)) return false
    // 처음 본 장소는 기록 후 통과
    seen.add(p.id)
    return true
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

// ---- 상세(사진·요약·후기) 캐시 ----
// 목록 조회(FIELDS)에는 넣지 않고, 카드가 열릴 때만 비싼 필드를 따로 요청한다.
/** 지도 카드에 보여줄 구글 상세 내용. */
export type PlaceDetail = {
  // photos: 사진 URL + 제공자 표기 (구글 약관상 출처 표기가 필요). 프로젝트 권한에 따라 비어 있을 수 있다
  photos: { url: string; credit?: string }[]
  // reviews: 사람들 후기 (글쓴이·별점·작성 시점)
  reviews: { author: string; text: string; rating?: number; when?: string }[]
  // summary: 구글 편집 요약 ("도톤보리의 오코노미야키 전문점" 같은 한 줄 설명)
  summary?: string
  // reviewSummary: 구글 Gemini 후기 요약 (사진·후기 원문이 안 올 때 무엇을 하는 집인지 알려줌)
  reviewSummary?: { text: string; note?: string }
  // type: 카테고리보다 세부적인 업종 이름 (예: 게 요리 전문점)
  type?: string
  // hours: 오늘 영업시간 한 줄
  hours?: string
  // website: 가게 홈페이지 (메뉴판이 있는 곳이 많다)
  website?: string
  // photosUrl / reviewsUrl: 구글 지도 사진·후기 탭 링크
  photosUrl?: string
  reviewsUrl?: string
  // price: 가격대 기호 (\u20a9~\u20a9\u20a9\u20a9\u20a9)
  price?: string
  // nativeName / nativeArea: 타베로그 검색에 쓸 일본어 상점명·지역 (일본 장소만)
  nativeName?: string
  nativeArea?: string
}
// DETAIL_FIELDS: 상세 카드용 필드 (사진·후기·요약·업종·영업시간·링크)
const DETAIL_FIELDS = ['id', 'photos', 'reviews', 'editorialSummary', 'reviewSummary', 'primaryTypeDisplayName', 'currentOpeningHours', 'websiteURI', 'googleMapsLinks', 'priceLevel']
// PRICE: 구글 가격대 enum → 기호
const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '\u20a9', PRICE_LEVEL_MODERATE: '\u20a9\u20a9', PRICE_LEVEL_EXPENSIVE: '\u20a9\u20a9\u20a9', PRICE_LEVEL_VERY_EXPENSIVE: '\u20a9\u20a9\u20a9\u20a9',
}
// detailsCache: 장소 ID → 상세 내용 또는 상태 (Map = HashMap)
const detailsCache = new Map<string, PlaceDetail | 'loading' | 'error'>()
// detailSubs: 상세 캐시 구독자 목록
const detailSubs = new Set<() => void>()
// detailVersion: 상세 캐시 변경 횟수
let detailVersion = 0
// detailBump: 버전 증가 후 구독자에게 알림
const detailBump = () => { detailVersion++; detailSubs.forEach(f => f()) }

/** 카드가 열릴 때 한 번만 사진·후기를 조회한다 (같은 장소를 다시 눌러도 재사용). */
// ensureDetail: 상세 정보를 캐시에 없을 때만 조회 (country 는 일본어 이름 조회 여부 판단에 씀)
export function ensureDetail(id: string, country?: string) {
  // 이미 조회 중이거나 결과가 있으면 종료
  if (detailsCache.has(id)) return
  // 우선 로딩 상태로 표시
  detailsCache.set(id, 'loading')
  detailBump()
  // 비동기 조회: 성공 시 캐시 저장, 실패 시 'error', 끝나면 알림 (whenComplete)
  ;(async () => {
    // places 라이브러리와 Place 클래스
    const { Place } = await lib()
    // 한국어로 상세 필드 조회
    const place = new Place({ id, requestedLanguage: 'ko' })
    await place.fetchFields({ fields: DETAIL_FIELDS })
    // 사진: 최대 6장, 480px URL 로 변환 (getURI 가 키를 포함한 URL 을 준다)
    const photos = (place.photos ?? []).slice(0, 6).map(p => {
      const credit = p.authorAttributions?.[0]?.displayName
      return { url: p.getURI({ maxWidth: 480 }), ...(credit ? { credit } : {}) }
    })
    // 후기: 본문이 있는 것만 최대 4개
    const reviews = (place.reviews ?? []).slice(0, 4).flatMap(r =>
      r.text
        ? [{ author: r.authorAttribution?.displayName ?? 'Google 사용자', text: r.text, ...(r.rating != null ? { rating: r.rating } : {}), ...(r.relativePublishTimeDescription ? { when: r.relativePublishTimeDescription } : {}) }]
        : [])
    // 오늘 요일 영업시간 한 줄: weekdayDescriptions 는 언어마다 배열 순서가 달라 요일 이름으로 찾는다
    const today = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()]
    const hours = place.currentOpeningHours?.weekdayDescriptions?.find(d => d.startsWith(`${today}요일`))
    // Gemini 후기 요약 (구글 고지문 포함)
    const gist = place.reviewSummary?.text
      ? { text: place.reviewSummary.text, note: place.reviewSummary.disclosureText ?? undefined }
      : undefined
    // 가격대 기호 (없으면 undefined)
    const price = place.priceLevel ? PRICE[place.priceLevel] : undefined
    // 일본 장소는 타베로그 검색용 일본어 이름·지역도 확인한다
    // (구글의 한국어 응답은 이름·지역이 로마자라 타베로그 검색이 걸리지 않는다)
    let nativeName: string | undefined
    let nativeArea: string | undefined
    if (country === 'JP') {
      try {
        // 같은 장소를 일본어로 한 번 더 조회 (이름·주소만)
        const jp = new Place({ id, requestedLanguage: 'ja' })
        await jp.fetchFields({ fields: ['id', 'displayName', 'addressComponents'] })
        // comp: 주소 구성요소 longText (예: 大阪府, 大阪市)
        const comp = (type: string) => jp.addressComponents?.find(c => c.types.includes(type))?.longText
        // 타베로그 지역명은 '大阪' 처럼 짧은 형태: 都/道/府/県 르 접미사를 때어낸다
        const pref = comp('administrative_area_level_1')?.replace(/[都道府県]$/, '')
        nativeName = jp.displayName ?? undefined
        nativeArea = pref ?? undefined
      } catch {
        // 일본어 이름을 못 가져와도 카드는 그대로 보여준다
      }
    }
    // 구글 지도 사진·후기 탭 링크
    const links = place.googleMapsLinks
    const photosUrl = links?.photosURI ?? undefined
    const reviewsUrl = links?.reviewsURI ?? undefined
    // 결과 저장 (선택 필드는 있을 때만 포함)
    detailsCache.set(id, {
      photos, reviews,
      ...(place.editorialSummary ? { summary: place.editorialSummary } : {}),
      ...(gist ? { reviewSummary: gist } : {}),
      ...(place.primaryTypeDisplayName ? { type: place.primaryTypeDisplayName } : {}),
      ...(hours ? { hours } : {}),
      ...(place.websiteURI ? { website: place.websiteURI } : {}),
      ...(photosUrl ? { photosUrl } : {}),
      ...(reviewsUrl ? { reviewsUrl } : {}),
      ...(price ? { price } : {}),
      ...(nativeName ? { nativeName } : {}),
      ...(nativeArea ? { nativeArea } : {}),
    })
  })().catch(() => detailsCache.set(id, 'error')).finally(detailBump)
}
// retryDetail: 실패한 상세를 지우고 다시 조회
export function retryDetail(id: string, country?: string) { detailsCache.delete(id); ensureDetail(id, country) }
/** 이미 상세를 불러온 장소의 일본어 이름·지역 (없으면 undefined). 목록 카드의 타베로그 링크도 이걸 쓴다. */
export function nativeOf(id: string) {
  // 캐시된 상세만 읽는다 (새 요청 없음)
  const e = detailsCache.get(id)
  return e && typeof e === 'object' ? { name: e.nativeName, area: e.nativeArea } : undefined
}

/** 컴포넌트를 상세 캐시에 구독시키고, 선택된 장소의 상세를 돌려준다. */
// useDetail: id 가 바뀔 때마다 상세 조회를 보장하고 캐시 값을 반환
export function useDetail(id?: string, country?: string): PlaceDetail | 'loading' | 'error' | undefined {
  // 외부 저장소(상세 캐시)를 구독
  const v = useSyncExternalStore(f => { detailSubs.add(f); return () => detailSubs.delete(f) }, () => detailVersion)
  // 카드가 열린 장소의 상세를 확보 (이미 있으면 요청하지 않음)
  useEffect(() => { if (id) ensureDetail(id, country) }, [id, country])
  // id 또는 캐시 버전이 바뀔 때만 다시 꺼냄
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (id ? detailsCache.get(id) : undefined), [id, v])
}
