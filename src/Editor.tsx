// React 훅/타입 import: useState(상태 필드+setter), useEffect(라이프사이클 콜백), useRef(변경 가능한 멤버 필드), useMemo/useCallback(캐시된 계산/함수)
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
// 도메인 로직 유틸 함수/상수와 타입들 (Java의 static 유틸 + DTO import)
import {
  CATS, DAY_COLORS, addDays, catOf, dayCount, dirUrl, fmtDay, fmtDist, fmtPeriod, legs, placeUrl, ratingLabel, routeLength, saveToVault, sortResults, suggestOrder, tabelogLink, uid,
  type AppState, type Cat, type Item, type LatLng, type Stop, type Trip, type View,
} from './logic'
// 장소 정보 조회/캐시/검색 관련 함수들 (서비스 계층과 유사)
import { ensure, infoOf, remember, retry, retryDetail, searchNearby, searchText, useDetail, usePlaces } from './places'
// 지도 props 타입과 핀 타입
import type { MapProps, Pin } from './MapView'
// 구글 지도 컴포넌트
import { GoogleMap } from './GoogleMap'
// 바텀시트 컴포넌트와 관련 타입/함수
import { Del, Sheet, placeName, type Explore, type SheetMode } from './Sheet'
// 카테고리 아이콘/아이콘 상수와 아이콘 컴포넌트
import { CAT_ICON, I, Icon } from './Cover'
// 꾹 누르면 선택 모드로 들어가는 목록 행 컴포넌트
import { Hold } from './Hold'
// 영어로 내려오는 가게 설명을 한국어로 바꿔주는 훅
import { useKoText } from './translate'

// Editor 컴포넌트의 props 타입 (생성자 인자 DTO)
type Props = {
  // 편집 중인 여행
  trip: Trip
  // 전체 앱 상태
  state: AppState
  // 상태 변경 함수 (Consumer<Consumer<AppState>> 형태의 콜백)
  update: (fn: (d: AppState) => void) => void
  // 뒤로가기 콜백
  onBack: () => void
  // 여행 정보 수정 콜백
  onEditTrip: () => void
}
// 예약(항공/숙소) 한 줄 표시용 타입
type Booking = { key: string; date: string; tag: string; text: string; sub?: string; open: SheetMode }
// 검색 질의 타입: 텍스트 검색 또는 주변 검색 (유니온 = sealed interface)
type Query = { kind: 'text'; q: string } | { kind: 'nearby'; cat: Cat }

// 일차 번호로 색상 선택 (배열 길이로 나눈 나머지로 순환)
const color = (d: number) => DAY_COLORS[d % DAY_COLORS.length]
// 모션 줄이기 설정이면 즉시, 아니면 부드럽게 스크롤하도록 결정
const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
// id 로 DOM 요소를 찾아 화면에 스크롤 (렌더링이 끝난 다음 프레임에 실행)
const scrollToEl = (id: string, block: ScrollLogicalPosition) =>
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block, behavior: smooth() }))
// 탐색 상태의 초기값 (대기 상태 상수)
const IDLE: Explore = { status: 'idle', title: '', items: [] }

// 여행 편집 화면 컴포넌트. props 를 구조분해로 받음
export function Editor({ trip, state, update, onBack, onEditTrip }: Props) {
  // 일차 수
  const n = trip.days.length
  // 선택된 탭 상태: 'all' 또는 일차 인덱스
  const [tabRaw, setTabRaw] = useState<'all' | number>('all')
  // 일차가 줄어 범위를 벗어났으면 'all' 로 보정
  const tab = tabRaw !== 'all' && tabRaw >= n ? 'all' : tabRaw
  // 선택된 일정 항목 id
  const [sel, setSel] = useState<string | null>(null)
  // 선택 삭제 모드 여부 / 고른 항목 id 목록 (일차를 넘어 함께 고를 수 있다)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  // 열려 있는 바텀시트 모드 (null 이면 닫힘)
  const [sheet, setSheet] = useState<SheetMode | null>(null)
  // 항목을 추가할 대상 일차
  const [addDay, setAddDay] = useState(0)
  // 거리순 정렬 제안 상태 (미리보기용)
  const [suggest, setSuggest] = useState<{ day: number; order: Item[] | null } | null>(null)
  // 드래그 중인 항목 위치 (렌더링과 무관한 변경 가능 필드)
  const drag = useRef<{ day: number; idx: number } | null>(null)

  // ---- 탐색(explore) 상태 ----
  // 검색어 입력 상태
  const [q, setQ] = useState('')
  // 선택된 카테고리 (기본: 음식점)
  const [cat, setCat] = useState<Cat>('restaurant')
  // 탐색 결과 상태
  const [explore, setExplore] = useState<Explore>(IDLE)
  // 선택된 검색 결과 id
  const [selResult, setSelResult] = useState<string | null>(null)
  // 지도가 움직였는지 여부 (이 지역 재검색 버튼 표시용)
  const [moved, setMoved] = useState(false)
  // 휴대폰 전용 하단 내비 뒤의 하위 화면 (넓은 화면에서는 모두 표시하므로 무시됨)
  const [screen, setScreen] = useState<'plan' | 'explore' | 'tools'>('plan')
  // 결과 목록을 아래로 접어 지도를 완전히 보이게 하는 상태
  const [peek, setPeek] = useState(false)
  // 지도 카메라 이동 요청 상태 (props 타입을 재사용)
  const [focus, setFocus] = useState<MapProps['focus']>(null)
  // 내 위치 좌표 상태
  const [me, setMe] = useState<LatLng | null>(null)
  // 위치 조회 진행/메시지 상태
  const [geo, setGeo] = useState<{ busy?: boolean; msg?: string }>({})
  // 현재 지도의 보이는 영역 (ref 라서 바뀌어도 재렌더링 없음)
  const view = useRef<View | null>(null)
  // 요청 번호 카운터 (오래된 응답 무시용)
  const req = useRef(0)
  // 마지막 검색 질의 (재시도용)
  const lastQuery = useRef<Query | null>(null)

  // 장소 정보 캐시 조회 함수 획득 (커스텀 훅)
  const get = usePlaces()
  // 항목의 좌표 정보 반환: 장소면 캐시에서 조회, 메모면 null (함수를 메모이제이션)
  const coord = useCallback((it: Item) => (it.kind === 'place' ? infoOf(get(it.placeId)) : null), [get])
  // 저장된 여행은 장소 ID 만 보관하므로, 여행을 열 때마다 다시 조회한다.
  // 일정/숙소/보관함의 모든 장소 id 를 모음 (flatMap = Stream.flatMap, 스프레드로 배열 합침)
  const ids = [...trip.days.flat().flatMap(it => (it.kind === 'place' ? [it.placeId] : [])), ...trip.stays.map(s => s.placeId), ...state.vault.map(v => v.placeId)]
  // id 목록을 문자열 키로 만들어 변경 감지에 사용
  const idsKey = ids.join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // id 목록이 바뀔 때마다 장소 정보를 확보 (라이프사이클 콜백)
  useEffect(() => ensure(ids), [idsKey])

  // 현재 여행을 수정하는 헬퍼 (fn 에 여행과 상태를 넘겨줌)
  const up = useCallback((fn: (t: Trip, s: AppState) => void) => {
    setSuggest(null) // 어떤 수정이든 대기 중인 순서 제안을 무효화한다
    // 상태 복사본에서 현재 여행을 찾아 있으면 fn 실행
    update(s => { const t = s.trips.find(t => t.id === trip.id); if (t) fn(t, s) })
  }, [update, trip.id])

  // 일차별 날짜 문자열 배열 (Stream.map)
  const dates = trip.days.map((_, i) => addDays(trip.start, i))
  // 화면에 보여줄 일차 인덱스 목록 ('all' 이면 전체)
  const shown = tab === 'all' ? trip.days.map((_, i) => i) : [tab]

  // 지도 핀 목록 계산 (의존값이 바뀔 때만 재계산하는 캐시)
  const pins = useMemo<Pin[]>(() =>
    // 대상 일차들을 순회하며 핀을 이어 붙임
    (tab === 'all' ? trip.days.map((_, i) => i) : [tab]).flatMap(d => {
      // 일차 내 장소 번호 카운터
      let k = 0
      // 해당 일차의 항목을 핀으로 변환
      return trip.days[d].flatMap(it => {
        // 메모는 핀 없음 (빈 배열 반환 = 필터링 효과)
        if (it.kind !== 'place') return []
        // 장소 번호 증가
        k++
        // 좌표 정보 조회
        const p = coord(it)
        // 좌표가 있으면 핀 객체 생성 (별칭 우선, 없으면 장소명), 없으면 제외
        return p ? [{ lat: p.lat, lng: p.lng, id: it.id, n: k, day: d, color: color(d), name: it.alias ?? p.name }] : []
      })
    // 의존 배열: 이 값들이 바뀔 때만 재계산
    }), [trip.days, tab, coord])
  // 탐색 결과를 지도용 핀 형태로 변환 (캐시)
  const results = useMemo(() => explore.items.map(p => ({ lat: p.lat, lng: p.lng, id: p.id, cat: p.cat, name: p.name })), [explore.items])
  // 조회에 실패한 장소 id 목록 (Set 으로 중복 제거 후 필터)
  const failed = [...new Set(ids)].filter(id => get(id) === 'error')
  // 지도에서 누른 장소의 상세 카드: 방금 고른 탐색 결과를 먼저, 없으면 선택한 일정 항목을 보여준다.
  const detail = useMemo(() => {
    // 탐색 결과를 눌렀다면 그 장소 정보를 그대로 사용
    const picked = explore.items.find(p => p.id === selResult)
    if (picked) return { p: picked, alias: undefined as string | undefined, inPlan: false }
    // 일정 핀이면 그 항목의 장소 정보(별칭 포함)를 사용
    const it = trip.days.flat().find(x => x.id === sel)
    if (!it || it.kind !== 'place') return null
    const p = infoOf(get(it.placeId))
    return p ? { p, alias: it.alias, inPlan: true } : null
  }, [explore.items, selResult, trip.days, sel, get])
  // 상세 카드의 장소가 이미 보관함에 있는지
  const saved = !!detail && state.vault.some(v => v.placeId === detail.p.id)
  // 선택된 장소의 구글 상세(사진·요약·후기). 카드가 열릴 때만 조회한다
  const rich = useDetail(detail?.p.id, detail?.p.country)
  // rich 는 'loading'/'error' 문자열일 수 있으므로 내용이 있는 객체만 꺼내 쓴다
  const rd = rich && typeof rich === 'object' ? rich : null
  // 가게 설명(편집 요약·Gemini 후기 요약)은 영어로 내려오므로 한국어로 번역해 보여준다
  const summaryKo = useKoText(rd?.summary)
  const gistKo = useKoText(rd?.reviewSummary?.text)

  // 항공/숙소 예약을 한 줄씩 표시할 목록으로 변환
  const bookings: Booking[] = [
    // 항공권: 출발 행(+필요 시 도착 행)을 만든다
    ...trip.flights.flatMap(f => {
      // 클릭 시 열 시트 모드 (항공권 수정)
      const open: SheetMode = { type: 'add', tab: 'flight', editId: f.id }
      // 도착이 출발보다 며칠 뒤인지 (당일이면 0)
      const plus = dayCount(f.depDate, f.arrDate) - 1
      // 출발 행 목록 생성
      const list: Booking[] = [{
        // 출발 행의 키/날짜/태그/본문, 날짜가 다르면 부가 설명 추가
        key: f.id + 'd', date: f.depDate, tag: '항공', open, text: `${f.no} · ${f.from} ${f.depTime} → ${f.to} ${f.arrTime}`,
        sub: plus ? `${plus > 0 ? '+' : ''}${plus}일 도착 (${fmtDay(f.arrDate)})` : undefined,
      }]
      // 도착일이 다르면 도착일에도 행 추가
      if (plus) list.push({ key: f.id + 'a', date: f.arrDate, tag: '도착', open, text: `${f.no} · ${f.to} ${f.arrTime} 도착`, sub: `${fmtDay(f.depDate)} ${f.depTime} ${f.from} 출발` })
      // 생성한 행들 반환
      return list
    }),
    // 숙소: 체크인/체크아웃 두 행을 만든다
    ...trip.stays.flatMap(s => {
      // 클릭 시 열 시트 모드 (숙소 수정)
      const open: SheetMode = { type: 'add', tab: 'stay', editId: s.id }
      // 숙소 장소 정보 조회
      const e = get(s.placeId)
      // 표시할 숙소 이름
      const text = placeName(e, s.alias)
      return [
        // 체크인 행 (주소가 있으면 부가 설명으로, || 로 빈 문자열은 undefined 처리)
        { key: s.id + 'i', date: s.checkIn, tag: '체크인', text, sub: infoOf(e)?.address || undefined, open },
        // 체크아웃 행
        { key: s.id + 'o', date: s.checkOut, tag: '체크아웃', text, open },
      ]
    }),
  ]
  // 여행 기간 밖 날짜의 예약만 걸러 날짜순 정렬
  const outside = bookings.filter(b => !dates.includes(b.date)).sort((a, b) => a.date.localeCompare(b.date))

  // 탭 선택: 일차 탭이면 추가 대상 일차도 같이 변경
  const pickTab = (t: 'all' | number) => { setTabRaw(t); if (t !== 'all') setAddDay(t) }
  // 시트 열기: 접힘 해제, 장소 추가면 탐색 화면으로 전환
  const openSheet = (m: SheetMode) => { setPeek(false); if (m.type === 'add' && m.tab === 'place') setScreen('explore'); setSheet(m) }
  // 시트 닫기 (참조가 바뀌지 않도록 캐시한 함수)
  const closeSheet = useCallback(() => setSheet(null), [])
  // 일정 항목 순서 이동 (from → to)
  const move = (day: number, from: number, to: number) => {
    // 범위를 벗어나거나 같은 위치면 중단
    if (to < 0 || to >= trip.days[day].length || from === to) return
    // 배열에서 항목을 빼서 새 위치에 끼워 넣음 (splice = List.remove + add)
    up(t => { const l = t.days[day]; l.splice(to, 0, l.splice(from, 1)[0]) })
  }
  // ---- 선택 삭제 ----
  // 선택 모드를 끄고 고른 항목을 비운다
  const endPick = () => { setPicking(false); setPicked([]) }
  // 한 항목을 고르거나 해제
  const togglePick = (id: string) => setPicked(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))
  // 고른 항목들을 모든 일차에서 한 번에 지운다
  const deletePicked = () => {
    // 고른 게 없으면 아무 것도 하지 않음
    if (!picked.length) return
    // 각 일차에서 고른 id 를 제외한 목록으로 교체
    up(t => { t.days = t.days.map(list => list.filter(it => !picked.includes(it.id))) })
    // 지운 항목이 선택돼 있었으면 선택도 해제
    if (sel && picked.includes(sel)) setSel(null)
    endPick()
  }

  // ---- 탐색 동작 ----
  // 검색 실행 (async = CompletableFuture 를 반환하는 비동기 메서드)
  const run = async (query: Query) => {
    // 현재 지도 영역
    const v = view.current
    // 지도가 아직 없으면 에러 상태를 표시하고 종료
    if (!v) { setExplore({ status: 'error', title: '', items: [], message: '지도가 아직 준비되지 않았어요.' }); openSheet({ type: 'add', tab: 'place' }); return }
    const my = ++req.current // 더 새로운 요청이 생기면 이전 응답은 모두 무효(stale)가 된다
    // 재시도를 위해 마지막 질의 저장
    lastQuery.current = query
    // 결과 제목: 텍스트 검색이면 검색어, 주변 검색이면 카테고리 문구
    const title = query.kind === 'text' ? `‘${query.q}’ 검색` : `이 지역 ${catOf(query.cat)!.find}`
    // 로딩 상태로 전환
    setExplore({ status: 'loading', title, items: [] })
    // 선택 해제 및 이동 플래그 초기화
    setSelResult(null); setMoved(false)
    // 결과를 보여줄 시트 열기
    openSheet({ type: 'add', tab: 'place' })
    // 예외 처리 시작 (try-catch)
    try {
      // 질의 종류별로 비동기 검색 (await = 완료까지 대기), 주변 검색은 정렬
      const list = query.kind === 'text' ? await searchText(query.q, v) : sortResults(await searchNearby(query.cat, v), query.cat)
      // 그 사이 새 요청이 있었다면 이 응답은 버림
      if (my !== req.current) return
      // 결과를 장소 캐시에 기억
      remember(list)
      // 결과 상태 반영 (비었으면 empty)
      setExplore({ status: list.length ? 'ok' : 'empty', title, items: list })
      // 텍스트 검색은 다른 지역을 가리킬 수 있으므로("교토 니시키시장") 카메라를 따라 이동한다. 주변 검색은 사용자가 둔 위치를 유지한다.
      if (query.kind === 'text' && list.length) setFocus({ points: list, key: my })
    // 실패 시
    } catch (e) {
      // 최신 요청일 때만 에러 상태 표시
      if (my === req.current) setExplore({ status: 'error', title, items: [], message: (e as Error).message })
    }
  }
  // 검색 폼 제출: 기본 동작을 막고 검색어가 있으면 텍스트 검색 실행 (void = 결과 Promise 무시)
  const submitSearch = (e: FormEvent) => { e.preventDefault(); if (q.trim()) void run({ kind: 'text', q: q.trim() }) }
  // 카테고리 선택: 상태 갱신 후 주변 검색
  const pickCat = (c: Cat) => { setCat(c); void run({ kind: 'nearby', cat: c }) }
  // 내 위치 찾기
  const locate = () => {
    // 브라우저가 위치 기능을 지원하지 않으면 안내 후 종료
    if (!navigator.geolocation) { setGeo({ msg: '이 브라우저는 위치 기능을 지원하지 않아요. 검색이나 지도 이동으로 찾아보세요.' }); return }
    // 진행 중 표시
    setGeo({ busy: true })
    // 현재 위치 조회 (성공 콜백, 실패 콜백, 옵션)
    navigator.geolocation.getCurrentPosition(
      // 성공: 좌표 저장, 카메라 이동 요청, 진행 상태 해제
      pos => { const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setMe(p); setFocus({ points: [p], key: Date.now() }); setGeo({}) },
      // 실패: 권한 거부 여부에 따라 메시지 설정
      err => setGeo({ msg: (err.code === err.PERMISSION_DENIED ? '위치 권한이 거부됐어요.' : '현재 위치를 가져오지 못했어요.') + ' 여행지 검색이나 지도 이동으로 계속 찾을 수 있어요.' }),
      // 옵션: 10초 타임아웃, 1분 이내 캐시 위치 허용
      { timeout: 10000, maximumAge: 60000 },
    )
  }
  // 검색 결과 선택: 지도에 상세 카드를 띄우고 목록 카드를 강조한다.
  const selectResult = (id: string) => setSelResult(id)
  // 상세 카드에서 '일정에 추가': 시트를 거치지 않고 카드에서 고른 일차 맨 끝에 바로 넣는다
  const addFromMap = (id: string) => {
    // 카드에서 고른 일차 (일차 수를 넘지 않게 보정)
    const d = Math.min(addDay, n - 1)
    // 해당 일차 끝에 장소 항목 추가
    up(t => { t.days[d].push({ id: uid(), kind: 'place', placeId: id }) })
    // 카드를 닫고 추가한 일차를 열어 바로 확인할 수 있게 한다
    setSelResult(null); setSel(null); setTabRaw(d); setScreen('plan')
  }

  // 일정 항목을 길찾기용 Stop 으로 변환
  const stopOf = (it: Item): Stop => {
    // 좌표 정보 (! 는 null 아님 단언)
    const p = coord(it)!
    // 구글 장소면 이름/placeId 를 덧붙여 반환 (스프레드로 객체 병합)
    return { lat: p.lat, lng: p.lng, ...(p.source === 'google' && it.kind === 'place' ? { name: p.name, placeId: it.placeId } : {}) }
  }
  // 예약 한 줄을 그리는 함수 (JSX 를 반환하는 헬퍼)
  const bookingRow = (b: Booking, withDate = false) => (
    // 클릭하면 해당 예약 시트를 여는 버튼
    <button key={b.key} type="button" className="booking" onClick={() => openSheet(b.open)}>
      {/* 태그(항공/체크인 등) */}
      <span className="tag">{b.tag}</span>
      {/* 날짜(선택), 본문, 부가 설명 */}
      <span className="booking-text">{withDate && <small>{fmtDay(b.date)}</small>}{b.text}{b.sub && <small>{b.sub}</small>}</span>
    </button>
  )
  // 사용할 지도 구현체 (컴포넌트도 변수에 담을 수 있음)
  const MapImpl = GoogleMap

  // 화면 렌더링 (JSX = 템플릿). 상태에 따라 CSS 클래스를 조합
  return (
    <div className={'editor v-' + screen + (sheet ? ' with-sheet' : '') + (sheet && peek ? ' peek' : '')}>
      {/* 상단 헤더 */}
      <header className="e-head">
        <div className="e-top">
          {/* 뒤로가기 버튼 */}
          <button type="button" className="icon" aria-label="내 여행으로" onClick={onBack}><Icon d={I.back} size={22} /></button>
          {/* 여행 제목과 기간/도시 */}
          <div className="e-title">
            <h1>{trip.name}</h1>
            <p>{fmtPeriod(trip.start, trip.end)} · {[trip.country, trip.city].filter(Boolean).join(' · ')}</p>
          </div>
          {/* 여행 정보 수정 버튼 */}
          <button type="button" className="icon" aria-label="여행 정보 수정" onClick={onEditTrip}><Icon d={I.edit} /></button>
        </div>
        {/* 바로가기 버튼들: 각 버튼이 해당 시트를 연다 */}
        <nav className="shortcuts" aria-label="바로가기">
          {/* 항공권 (개수가 0이면 빈 문자열) */}
          <button type="button" onClick={() => openSheet({ type: 'add', tab: 'flight' })}><Icon d={I.plane} size={16} />항공권<b>{trip.flights.length || ''}</b></button>
          {/* 숙소 */}
          <button type="button" onClick={() => openSheet({ type: 'add', tab: 'stay' })}><Icon d={I.bed} size={16} />숙소<b>{trip.stays.length || ''}</b></button>
          {/* 준비물 (완료/전체 개수) */}
          <button type="button" onClick={() => openSheet({ type: 'checklist' })}><Icon d={I.check} size={16} />준비물<b>{trip.checklist.length ? `${trip.checklist.filter(c => c.done).length}/${trip.checklist.length}` : ''}</b></button>
          {/* 가계부 */}
          <button type="button" onClick={() => openSheet({ type: 'budget' })}><Icon d={I.wallet} size={16} />가계부</button>
          {/* 이미지 내보내기 */}
          <button type="button" onClick={() => openSheet({ type: 'export' })}><Icon d={I.image} size={16} />이미지</button>
        </nav>
      </header>

      {/* 지도 영역 */}
      <div className="e-map">
        {/* 지도 컴포넌트: 핀/결과/선택/카메라/내 위치를 props 로 전달하고 콜백으로 이벤트 수신 */}
        <MapImpl pins={pins} results={results} selectedId={sel} selectedResultId={selResult} fitKey={trip.id + ':' + tab + (sheet ? ':sheet' : '')}
          focus={focus} me={me}
          onPin={id => { setSel(id); scrollToEl('it-' + id, 'center') }}
          onResult={selectResult}
          onView={v => { view.current = v; setMoved(true) }} />
        {/* 지도 위에 얹는 UI */}
        <div className="map-ui">
          <div className="map-row">
            {/* 검색 폼 */}
            <form className="map-search" role="search" onSubmit={submitSearch}>
              {/* 검색어 입력 (value+onChange 로 상태와 동기화) */}
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="가게 · 관광지 · 호텔 · 주소 (예: 난바 라멘)" aria-label="장소 검색" />
              {/* 검색 버튼 */}
              <button className="icon" aria-label="검색"><Icon d={I.search} /></button>
            </form>
            {/* 내 위치 버튼 (조회 중에는 비활성) */}
            <button type="button" className="map-btn" onClick={locate} disabled={geo.busy} aria-label="내 위치"><Icon d={I.locate} size={16} />{geo.busy ? '확인 중…' : '내 위치'}</button>
          </div>
          {/* 카테고리 칩 목록 */}
          <div className="map-chips" role="group" aria-label="카테고리">
            {/* 숨김이 아닌 카테고리만 버튼으로 변환 (filter + map) */}
            {CATS.filter(c => !c.hidden).map(c => (
              <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} aria-pressed={cat === c.id} onClick={() => pickCat(c.id)}><Icon d={CAT_ICON[c.id]} size={14} />{c.label}</button>
            ))}
          </div>
          {/* 위치 관련 안내 메시지 (있을 때만) */}
          {geo.msg && <p className="map-note" role="status">{geo.msg} <button type="button" className="link" onClick={() => setGeo({})}>닫기</button></p>}
        </div>
        {/* 지도가 움직였고 로딩 중이 아니면 이 지역 재검색 버튼 표시 (상세 카드가 열리면 자리 양보) */}
        {moved && !detail && explore.status !== 'loading' && (
          <button type="button" className="map-find" onClick={() => void run({ kind: 'nearby', cat })}><Icon d={I.search} size={14} />이 지역 {catOf(cat)!.find} 찾기</button>
        )}
        {/* 지도에서 장소를 누르면 그 자리에서 뜨는 상세 카드 */}
        {detail && (
          <section className="map-card" aria-label={`${detail.alias ?? detail.p.name} 상세`}>
            {/* 닫기 버튼: 선택 해제 */}
            <button type="button" className="icon map-card-x" aria-label="상세 닫기" onClick={() => { setSelResult(null); setSel(null) }}><Icon d={I.close} size={16} /></button>
            {/* 아이콘 + 이름 + 카테고리·주소 */}
            <div className="map-card-head">
              <span className="tile"><Icon d={CAT_ICON[detail.p.cat ?? 'other']} /></span>
              <div>
                <b>{detail.alias ?? detail.p.name}</b>
                <small>{catOf(detail.p.cat)?.label ?? '장소'} · {detail.p.address}</small>
              </div>
            </div>
            {/* 평점 (없으면 '평점 없음') + 가격대 */}
            <div className="map-rating">
              <small className={'rating' + (detail.p.rating == null ? ' none' : '')}>{ratingLabel(detail.p)}</small>
              {rich && typeof rich === 'object' && rich.price && <small>{rich.price}</small>}
            </div>
            {/* 구글 상세: 무슨 집인지 알려주는 내용 (불러오는 중/실패 상태도 표시) */}
            {rich === 'loading' && <p className="hint">장소 정보 불러오는 중…</p>}
            {rich === 'error' && (
              <p className="hint">장소 정보를 불러오지 못했어요. <button type="button" className="link" onClick={() => retryDetail(detail.p.id, detail.p.country)}>다시 시도</button></p>
            )}
            {/* 업종 (카테고리보다 세부: 예 '게 요리 전문점') */}
            {rd?.type && rd.type !== (catOf(detail.p.cat)?.label ?? '') && <p className="map-type">{rd.type}</p>}
            {/* 구글 편집 요약: 한 줄로 어떤 곳인지 설명 (한국어만) */}
            {summaryKo && <p className="map-summary">{summaryKo}</p>}
            {/* 오늘 영업시간 */}
            {rd?.hours && <p className="map-hours">{rd.hours}</p>}
            {/* Gemini 후기 요약: 사람들이 뭐라고 하는지 한눈에 */}
            {gistKo && (
              <div className="map-gist">
                <p>{gistKo}</p>
                <small>{rd?.reviewSummary?.note ?? '후기 요약'}</small>
              </div>
            )}
            {/* 사진이 오면 사진 줄 (프로젝트 권한에 따라 비어 있을 수 있다) */}
            {!!rd?.photos.length && (
              <div className="map-photos">
                {rd.photos.map((ph, i) => (
                  <figure key={i} className="map-photo">
                    <img src={ph.url} alt={`${detail.alias ?? detail.p.name} 사진 ${i + 1}`} loading="lazy" />
                    {ph.credit && <figcaption>{ph.credit}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
            {/* 후기 원문이 오면 목록 (본문은 3줄까지) */}
            {!!rd?.reviews.length && (
              <ul className="map-reviews">
                {rd.reviews.slice(0, 3).map((r, i) => (
                  <li key={i}>
                    <span className="map-review-head"><b>{r.author}</b>{r.rating != null && <em>★ {r.rating}</em>}{r.when && <small>{r.when}</small>}</span>
                    <p>{r.text}</p>
                  </li>
                ))}
              </ul>
            )}
            {/* 외부 링크: 구글 지도, 일본 음식점이면 타 베로그 */}
            <span className="pcard-links">
              <a className="link" href={placeUrl(detail.p)} target="_blank" rel="noreferrer">Google 지도</a>
              {/* 구글 사진·후기 탭: 사진·후기 원문이 안 올 때도 여기서 바로 볼 수 있다 */}
              {rd?.photosUrl && <a className="link" href={rd.photosUrl} target="_blank" rel="noreferrer">사진 보기</a>}
              {rd?.reviewsUrl && <a className="link" href={rd.reviewsUrl} target="_blank" rel="noreferrer">후기 보기</a>}
              {rd?.website && <a className="link" href={rd.website} target="_blank" rel="noreferrer">홈페이지</a>}
              {/* 타베로그: 일본어 매장명·지역으로 검색해야 그 가게가 나온다 */}
              {tabelogLink(detail.p, { name: rd?.nativeName, area: rd?.nativeArea }) && (
                <a className="link" href={tabelogLink(detail.p, { name: rd?.nativeName, area: rd?.nativeArea })!} target="_blank" rel="noreferrer">타베로그</a>
              )}
            </span>
            {/* 저장·추가 동작 */}
            <div className="pcard-acts">
              <button type="button" className={'btn' + (saved ? ' on' : '')} aria-pressed={saved}
                onClick={() => up((_, s) => {
                  // 이미 저장됨: 보관함과 컬렉션에서 함께 제거
                  if (saved) {
                    s.vault = s.vault.filter(v => v.placeId !== detail.p.id)
                    s.collections.forEach(k => { k.placeIds = k.placeIds.filter(x => x !== detail.p.id) })
                    return
                  }
                  // 아니면 보관함에 새로 저장 (같은 장소는 한 번만)
                  saveToVault(s.vault, { placeId: detail.p.id })
                })}>{saved ? '저장됨' : '보관함에 저장'}</button>
              {/* 일정 항목이 아닌 탐색 결과만: 일차를 고르고 바로 추가 */}
              {!detail.inPlan && (
                <>
                  <select className="map-add-day" aria-label="추가할 일차" value={Math.min(addDay, n - 1)} onChange={e => setAddDay(+e.target.value)}>
                    {trip.days.map((_, i) => <option key={i} value={i}>{i + 1}일차 · {fmtDay(dates[i])}</option>)}
                  </select>
                  <button type="button" className="btn strong" onClick={() => addFromMap(detail.p.id)}>일정에 추가</button>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* 일차 탭 영역 */}
      <div className="e-tabs">
        <div className="tabs" role="tablist" aria-label="일차">
          {/* 전체 탭 */}
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => pickTab('all')}>전체</button>
          {/* 일차별 탭 (map 으로 반복 렌더링) */}
          {trip.days.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => pickTab(i)}>
              {/* 일차 색상 점과 날짜 */}
              <i className="daydot" style={{ background: color(i) }} /><span>{i + 1}일차<small>{fmtDay(dates[i])}</small></span>
            </button>
          ))}
        </div>
        {/* 선택 모드면 일괄 삭제 버튼을, 아니면 선택·추가 버튼을 보여준다 */}
        {picking ? (
          <>
            {/* 고른 항목을 바로 지우는 버튼 (기존 Del 컴포넌트 재사용) */}
            <Del label={`선택 ${picked.length}개 삭제`} onDelete={deletePicked} />
            <button type="button" className="btn" onClick={endPick}>취소</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setPicking(true)}>선택</button>
            {/* 장소 추가 버튼 */}
            <button type="button" className="btn primary" onClick={() => openSheet({ type: 'add', tab: 'place' })}><Icon d={I.plus} size={16} />추가</button>
          </>
        )}
      </div>

      {/* 일정 목록 (key 가 바뀌면 통째로 새로 마운트) */}
      <main className="e-list" key={tab}>
        {/* 장소 조회 실패가 있으면 경고와 재시도 버튼 표시 */}
        {failed.length > 0 && (
          <p className="load-fail" role="alert">
            장소 {failed.length}곳의 정보를 불러오지 못했어요. 일정과 메모는 그대로 있어요.
            <button type="button" className="btn" onClick={() => failed.forEach(retry)}>다시 불러오기</button>
          </p>
        )}
        {/* 보여줄 일차마다 섹션 렌더링 */}
        {shown.map(d => {
          // 해당 일차의 항목들
          const items = trip.days[d]
          // 인접 항목 간 이동 구간(거리) 계산
          const lg = legs(items, coord)
          // 장소 개수
          const places = items.filter(it => it.kind === 'place').length
          // 총 이동 거리
          const total = routeLength(items, coord)
          // 장소 번호 카운터
          let k = 0
          return (
            // 일차 섹션 (CSS 변수 --c 로 일차 색상 전달)
            <section key={d} className="day" style={{ '--c': color(d) } as CSSProperties}>
              <header className="day-head">
                {/* 일차 제목과 날짜 */}
                <h2><b>day {d + 1}</b>{fmtDay(dates[d])}</h2>
                {/* 장소 수와 총 거리 */}
                <ul className="pills small"><li>{places}곳</li>{total > 0 && <li>{fmtDist(total)}</li>}</ul>
                {/* 핀이 3개 이상이면 거리순 정렬 제안 버튼 */}
                {pins.filter(p => p.day === d).length > 2 && (
                  <button type="button" className="link" onClick={() => setSuggest({ day: d, order: suggestOrder(items, coord) })}><Icon d={I.sort} size={14} />거리순 정렬</button>
                )}
              </header>

              {/* 이 일차에 대한 정렬 제안이 있으면 미리보기 표시 (?. = null-safe) */}
              {suggest?.day === d && (
                <div className="suggest" role="status">
                  {/* 제안된 순서가 있으면 미리보기, 없으면 이미 가까운 순서라는 안내 */}
                  {suggest.order ? (
                    <>
                      {/* 거리 변화 요약 */}
                      <p><b>첫 장소 기준 거리순 미리보기</b> · {fmtDist(total)} → {fmtDist(routeLength(suggest.order, coord))}</p>
                      {/* 제안된 장소 이름 순서 (시간 지정 항목은 고정 표시) */}
                      <p className="order">{suggest.order.flatMap(it => (it.kind === 'place' ? [placeName(get(it.placeId), it.alias) + (it.time ? '(고정)' : '')] : [])).join(' → ')}</p>
                      <div className="form-actions">
                        {/* 취소 버튼 */}
                        <button type="button" className="btn" onClick={() => setSuggest(null)}>취소</button>
                        {/* 제안된 순서를 실제로 적용 */}
                        <button type="button" className="btn primary" onClick={() => { const order = suggest.order!; up(t => { t.days[d] = order }) }}>이 순서로 적용</button>
                      </div>
                    </>
                  ) : (
                    <p>이미 가까운 순서예요. 시간 지정 항목은 고정돼요. <button type="button" className="link" onClick={() => setSuggest(null)}>닫기</button></p>
                  )}
                </div>
              )}

              {/* 이 날짜의 예약 행들 */}
              {bookings.filter(b => b.date === dates[d]).map(b => bookingRow(b))}
              {/* 일정이 없으면 빈 상태 안내 */}
              {!items.length && <p className="empty">아직 일정이 없어요. 지도에서 장소를 찾아 <b>일정에 추가</b>해보세요.</p>}

              {/* 타임라인 목록 */}
              <ol className="tl">
                {/* 항목마다 행 렌더링 (i 는 인덱스) */}
                {items.map((it, i) => {
                  // 이전 항목에서 이 항목까지의 이동 구간
                  const leg = lg[i]
                  // 장소면 번호 증가, 메모면 0
                  const num = it.kind === 'place' ? ++k : 0
                  // 장소 캐시 항목 (메모면 undefined)
                  const e = it.kind === 'place' ? get(it.placeId) : undefined
                  // 장소 상세 정보 (아직 없으면 undefined)
                  const p = infoOf(e)
                  return (
                    // 부모 DOM 없이 여러 요소를 묶는 Fragment (key 필요)
                    <Fragment key={it.id}>
                      {/* 이동 구간이 있으면 거리 링크 표시 (구글 지도 길찾기) */}
                      {leg && (
                        <li className="leg">
                          <a className="dist" href={dirUrl(stopOf(items[leg.from]), stopOf(it))} target="_blank" rel="noreferrer" title="Google Maps에서 길찾기">{fmtDist(leg.meters)}</a>
                        </li>
                      )}
                      {/* 항목 행: 드래그 앤 드롭으로 순서 변경 가능 (선택 모드에서는 끔) */}
                      <Hold id={'it-' + it.id} className={'row' + (sel === it.id && !picking ? ' sel' : '') + (picked.includes(it.id) ? ' picked' : '')} draggable={!picking}
                        onDragStart={ev => { drag.current = { day: d, idx: i }; ev.dataTransfer.effectAllowed = 'move' }}
                        onDragOver={ev => { if (drag.current?.day === d) ev.preventDefault() }}
                        onDrop={ev => { ev.preventDefault(); if (drag.current?.day === d) move(d, drag.current.idx, i); drag.current = null }}
                        onHold={() => { setPicking(true); setPicked(p => (p.includes(it.id) ? p : [...p, it.id])) }}>
                        {/* 왼쪽 레일: 선택 모드면 체크박스, 아니면 장소 번호/점 */}
                        <span className="rail">
                          {picking
                            ? <input type="checkbox" checked={picked.includes(it.id)} onChange={() => togglePick(it.id)} aria-label="항목 선택" />
                            : num ? <span className="num">{num}</span> : <span className="dot" />}
                        </span>
                        {/* 항목 카드 버튼: 선택 모드면 고르기, 아니면 항목 선택 */}
                        <button type="button" className={'card' + (it.kind === 'memo' ? ' memo' : '')}
                          onClick={() => (picking ? togglePick(it.id) : setSel(it.id))}
                          aria-pressed={picking ? picked.includes(it.id) : sel === it.id}>
                          {/* 장소면 상세 표시, 메모면 텍스트만 표시 */}
                          {it.kind === 'place' ? (
                            <>
                              {/* 카테고리 아이콘 */}
                              <span className="tile"><Icon d={CAT_ICON[p?.cat ?? 'other']} /></span>
                              {/* 장소 이름 */}
                              <b>{placeName(e, it.alias)}</b>
                              {/* 카테고리/원래 이름, 실패 또는 로딩 상태 문구 */}
                              <small>
                                {p ? `${catOf(p.cat)?.label ?? '장소'}${it.alias ? ` · ${p.name}` : ''}` : e === 'error' ? '장소 정보를 불러오지 못함 · 수정에서 다시 시도' : '불러오는 중…'}
                              </small>
                              {/* 메모가 있으면 표시 */}
                              {it.memo && <span className="note">{it.memo}</span>}
                            </>
                          ) : <span className="note">{it.text}</span>}
                        </button>
                        {/* 행 오른쪽 동작 버튼들 (선택 모드에서는 숨김) */}
                        {!picking && (
                          <span className="acts">
                            {/* 위로 이동 (첫 항목은 비활성) */}
                            <button type="button" aria-label="위로 이동" disabled={i === 0} onClick={() => move(d, i, i - 1)}><Icon d={I.up} size={16} /></button>
                            {/* 아래로 이동 (마지막 항목은 비활성) */}
                            <button type="button" aria-label="아래로 이동" disabled={i === items.length - 1} onClick={() => move(d, i, i + 1)}><Icon d={I.down} size={16} /></button>
                            {/* 수정 시트 열기 */}
                            <button type="button" aria-label="수정" onClick={() => { setSel(it.id); openSheet({ type: 'item', day: d, id: it.id }) }}><Icon d={I.edit} size={15} /></button>
                          </span>
                        )}
                      </Hold>
                    </Fragment>
                  )
                })}
              </ol>
              {/* 일차별 장소/메모 추가 버튼 */}
              <div className="day-add">
                {/* 이 일차에 장소 추가 */}
                <button type="button" onClick={() => { setAddDay(d); openSheet({ type: 'add', tab: 'place' }) }}>장소 추가</button>
                {/* 이 일차에 메모 추가 */}
                <button type="button" onClick={() => { setAddDay(d); openSheet({ type: 'add', tab: 'memo' }) }}>메모 추가</button>
              </div>
            </section>
          )
        })}
        {/* 전체 탭에서 기간 밖 예약이 있으면 별도 섹션으로 표시 */}
        {tab === 'all' && outside.length > 0 && (
          <section className="day">
            <header className="day-head"><h2><b>여행 기간 밖 예약</b></h2></header>
            {/* 날짜를 포함해 예약 행 렌더링 */}
            {outside.map(b => bookingRow(b, true))}
          </section>
        )}
      </main>

      {/* 여행 도구 섹션 (휴대폰의 도구 화면) */}
      <section className="tools" aria-label="여행 도구">
        <h2>여행 도구</h2>
        {/* [아이콘, 라벨, 부가문구, 클릭동작] 튜플 배열을 버튼으로 변환 (as const = 읽기 전용 튜플) */}
        {([
          [I.plane, '항공권', `${trip.flights.length}건`, () => openSheet({ type: 'add', tab: 'flight' })],
          [I.bed, '숙소', `${trip.stays.length}곳`, () => openSheet({ type: 'add', tab: 'stay' })],
          [I.check, '준비물 체크리스트', `${trip.checklist.filter(c => c.done).length}/${trip.checklist.length}`, () => openSheet({ type: 'checklist' })],
          [I.wallet, '여행 가계부', `${trip.expenses.length}건`, () => openSheet({ type: 'budget' })],
          [I.image, '일정 이미지 저장', '', () => openSheet({ type: 'export' })],
          [I.edit, '여행 정보 수정', '', onEditTrip],
        ] as const).map(([icon, label, sub, run]) => (
          <button key={label} type="button" className="tool-row" onClick={run}><span className="tile"><Icon d={icon} /></span>{label}<small>{sub}</small><Icon d={I.arrow} size={16} /></button>
        ))}
      </section>

      {/* 하단 내비게이션 (휴대폰) */}
      <nav className="bnav" aria-label="여행 메뉴">
        {/* 여행 홈으로 */}
        <button type="button" onClick={onBack}><Icon d={I.home} size={22} />여행 홈</button>
        {/* 일정 화면: 시트 닫고 맨 위로 스크롤 */}
        <button type="button" className={screen === 'plan' ? 'on' : ''} onClick={() => { setScreen('plan'); closeSheet(); scrollTo({ top: 0, behavior: smooth() }) }}><Icon d={I.cal} size={22} />일정</button>
        {/* 장소 탐색 화면: 결과가 있으면 시트를 연다 */}
        <button type="button" className={screen === 'explore' ? 'on' : ''} onClick={() => { setScreen('explore'); setPeek(false); setSheet(explore.status === 'idle' ? null : { type: 'add', tab: 'place' }) }}><Icon d={I.search} size={22} />장소 탐색</button>
        {/* 여행 도구 화면: 시트 닫기 */}
        <button type="button" className={screen === 'tools' ? 'on' : ''} onClick={() => { setScreen('tools'); closeSheet() }}><Icon d={I.check} size={22} />여행 도구</button>
      </nav>

      {/* 시트가 열려 있을 때만 Sheet 컴포넌트 렌더링 (많은 props 와 콜백 전달) */}
      {sheet && (
        <Sheet trip={trip} vault={state.vault} collections={state.collections} up={up} mode={sheet} setMode={setSheet} close={closeSheet} peek={peek} onPeek={() => setPeek(p => !p)}
          day={Math.min(addDay, n - 1)} setDay={setAddDay} get={get}
          explore={explore} selectedResultId={selResult} onSelectResult={selectResult}
          onRetrySearch={() => { if (lastQuery.current) void run(lastQuery.current) }}
          nearbyStays={async () => { const list = view.current ? await searchNearby('lodging', view.current) : []; remember(list); return list }}
          search={async text => { const list = view.current ? await searchText(text, view.current) : []; remember(list); return list }}
          onAdded={(day, id) => { setSel(id); if (tab !== 'all' && tab !== day) setTabRaw(day); scrollToEl('it-' + id, 'nearest') }} />
      )}
    </div>
  )
}
