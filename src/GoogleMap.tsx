// 지도: Google Maps JavaScript API + Advanced Markers.
// React 훅 import: useEffect(라이프사이클 콜백), useRef(변경 가능한 멤버 필드), useState(상태 필드+setter)
import { useEffect, useRef, useState } from 'react'
// viewOf: 지도 영역 변환 함수, LatLng: 위경도 타입
import { viewOf, type LatLng } from './logic'
// 구글 지도 ID 상수와 SDK 로더 함수
import { GOOGLE_MAP_ID, loadGoogle } from './places'
// 핀 HTML 생성 함수들과 props/핀 타입
import { ME_HTML, pinHtml, rpinHtml, type MapProps, type Pin } from './MapView'

// 그려진 객체: 마커 또는 폴리라인 중 하나 (유니온 타입 = sealed interface 와 유사)
type Drawn = { marker: google.maps.marker.AdvancedMarkerElement } | { line: google.maps.Polyline }

// 지도 컴포넌트 (함수 = 클래스, props = 생성자 인자 DTO)
export function GoogleMap(props: MapProps) {
  // 지도를 붙일 DOM 요소 참조 (렌더링 후 채워지는 필드)
  const el = useRef<HTMLDivElement>(null)
  // 생성된 지도 객체 보관 (값이 바뀌어도 재렌더링 안 함)
  const map = useRef<google.maps.Map | null>(null)
  // 현재 지도에 그려진 마커/선 목록 (지울 때 사용)
  const drawn = useRef<Drawn[]>([])
  // 최신 props 를 담는 ref (콜백이 옛날 props 를 잡는 문제 방지)
  const latest = useRef(props)
  // 렌더링마다 최신 props 로 갱신
  latest.current = props
  // 지도 로딩 완료 여부 상태 (setReady 가 setter)
  const [ready, setReady] = useState(false)
  // 에러 메시지 상태
  const [error, setError] = useState('')

  // 마운트 시 1회 실행 (@PostConstruct), 빈 배열 [] = 의존값 없음
  useEffect(() => {
    // 언마운트 후 콜백 무시용 플래그
    let dead = false
    // 구글 SDK 비동기 로드 (Promise = CompletableFuture)
    loadGoogle()
      // 로드 후 maps, marker 라이브러리를 병렬 로드 (allOf 와 유사)
      .then(() => Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')]))
      // 모두 끝나면 실행되는 thenAccept
      .then(() => {
        // 이미 언마운트됐다면 중단
        if (dead) return
        // 지도 생성: DOM 요소(! = null 아님 단언)와 옵션 객체 전달
        const m = new google.maps.Map(el.current!, {
          // 초기 중심(오사카 부근), 줌, 지도 ID
          center: { lat: 34.75, lng: 135.6 }, zoom: 9, mapId: GOOGLE_MAP_ID,
          // 불필요한 컨트롤 숨김, 아이콘 클릭 비활성, 한 손가락 제스처 허용
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy',
        })
        // 지도가 멈추면(idle) 호출되는 리스너 등록
        m.addListener('idle', () => {
          // 경계와 중심 좌표를 JSON 으로 (?. 는 null-safe 호출)
          const b = m.getBounds()?.toJSON(), c = m.getCenter()?.toJSON()
          // 둘 다 있으면 최신 onView 콜백에 보이는 영역 전달
          if (b && c) latest.current.onView(viewOf(b, c))
        })
        // 만든 지도를 ref 에 저장
        map.current = m
        // 준비 완료 상태로 변경 → 재렌더링 발생
        setReady(true)
      })
      // 실패 시 (언마운트 전이면) 에러 메시지 저장 (exceptionally)
      .catch((e: Error) => { if (!dead) setError(e.message) })
    // 정리 함수 (@PreDestroy): 언마운트 시 dead 표시
    return () => { dead = true }
  }, [])

  // props 를 구조분해해 지역 변수로 꺼냄 (getter 여러 개 호출과 유사)
  const { pins, results, selectedId, selectedResultId, fitKey, focus, me } = props
  // 마커 다시 그리기: 아래 배열의 값이 바뀔 때마다 실행
  useEffect(() => {
    // 현재 지도 객체 꺼내기
    const m = map.current
    // 아직 준비 안 됐으면 중단
    if (!ready || !m) return
    // 기존 마커/선 모두 제거 ('marker' in d 는 타입 판별)
    drawn.current.forEach(d => ('marker' in d ? (d.marker.map = null) : d.line.setMap(null)))
    // 목록 비우기
    drawn.current = []
    // 마커 하나를 만들어 지도에 추가하는 내부 헬퍼 람다 (onClick 은 선택 인자)
    const marker = (pos: LatLng, html: string, title: string, zIndex: number, onClick?: () => void) => {
      // 마커 내용을 담을 div 생성
      const wrap = document.createElement('div')
      wrap.className = 'gm-pin' // Advanced Marker 는 하단 중앙 기준이라, 원이 좌표 위에 오도록 중심을 맞춘다
      // div 안에 핀 HTML 삽입
      wrap.innerHTML = html
      // 고급 마커 생성 (클릭 핸들러가 있을 때만 클릭 가능)
      const mk = new google.maps.marker.AdvancedMarkerElement({ map: m, position: pos, content: wrap, title, zIndex, gmpClickable: !!onClick })
      // 클릭 핸들러가 있으면 이벤트 리스너 등록
      if (onClick) mk.addEventListener('gmp-click', onClick)
      // 나중에 지울 수 있게 목록에 기록
      drawn.current.push({ marker: mk })
    }
    // 일차별로 핀을 묶을 Map<Integer, List<Pin>>
    const byDay = new Map<number, Pin[]>()
    // 각 핀을 해당 일차 리스트에 추가 (없으면 빈 배열 ?? 로 대체, 스프레드로 복사)
    pins.forEach(p => byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]))
    // 일차별로 점선 경로(폴리라인)를 만들어 기록
    byDay.forEach(list => drawn.current.push({
      line: new google.maps.Polyline({
        // 선 자체는 투명, 클릭 불가, 경로는 핀 좌표 목록
        map: m, path: list, strokeOpacity: 0, clickable: false,
        // 투명한 선 위에 10px 간격으로 원 아이콘을 반복 -> 점선 효과
        icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: list[0].color, fillOpacity: 1, strokeOpacity: 0, scale: 2.5 }, offset: '0', repeat: '10px' }],
      }),
    }))
    // 검색 결과 마커 추가 (선택되면 zIndex 높임, 클릭 시 onResult 호출)
    results.forEach(r => marker(r, rpinHtml(r, r.id === selectedResultId), r.name, r.id === selectedResultId ? 900 : 1, () => latest.current.onResult(r.id)))
    // 일정 핀 마커 추가 (제목은 "N일차 번호. 이름", 클릭 시 onPin 호출)
    pins.forEach(p => marker(p, pinHtml(p, p.id === selectedId), `${p.day + 1}일차 ${p.n}. ${p.name}`, p.id === selectedId ? 1000 : 100, () => latest.current.onPin(p.id)))
    // 내 위치가 있으면 점 마커 추가
    if (me) marker(me, ME_HTML, '내 위치', 50)
  // 의존 배열: 이 값들이 바뀔 때만 위 콜백 재실행
  }, [ready, pins, results, selectedId, selectedResultId, me])

  // 주어진 좌표들이 다 보이도록 지도 범위를 맞추는 함수
  const fit = (points: LatLng[]) => {
    // 지도 객체
    const m = map.current
    // 지도 없거나 좌표가 비었으면 중단
    if (!m || !points.length) return
    // 점이 하나면 그 위치로 중심 이동 후 줌 15
    if (points.length === 1) { m.setCenter(points[0]); m.setZoom(15); return }
    // 여러 점이면 경계 박스 생성
    const b = new google.maps.LatLngBounds()
    // 모든 점을 경계에 포함시킴
    points.forEach(p => b.extend(p))
    m.fitBounds(b, { top: 100, bottom: 56, left: 40, right: 40 }) // 위쪽 여백은 검색창과 칩이 가리지 않게 하기 위함
    // 한 번만 실행: 맞춘 뒤 줌이 16 초과면 16 으로 제한
    google.maps.event.addListenerOnce(m, 'idle', () => { if ((m.getZoom() ?? 0) > 16) m.setZoom(16) })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 탭/여행 변경, 핀 추가/삭제 시에만 다시 맞춤(순서 변경은 제외)
  // 준비/탭 변경/핀 개수 변경 시 일정 핀에 맞춰 지도 이동
  useEffect(() => fit(pins), [ready, fitKey, pins.length])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // focus 요청(key 변경)이 오면 해당 좌표들로 이동
  useEffect(() => { if (focus) fit(focus.points) }, [ready, focus?.key])

  // 선택 항목이 바뀔 때 실행
  useEffect(() => {
    // 선택된 일정 핀 또는 검색 결과를 찾음 (?? = 앞이 null/undefined 면 뒤 값)
    const p = pins.find(p => p.id === selectedId) ?? results.find(r => r.id === selectedResultId)
    // 지도 객체
    const m = map.current
    // 선택 위치가 화면 밖이면 부드럽게 이동
    if (p && m && !m.getBounds()?.contains(p)) m.panTo(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedResultId])

  // 화면 렌더링 (JSX = HTML 비슷한 템플릿, JSP/Thymeleaf 역할)
  return (
    <div className="map">
      {/* 구글 지도가 붙는 영역 (ref 로 DOM 연결) */}
      <div ref={el} className="map-canvas" aria-label="일정 지도" />
      {/* error 가 비어있지 않을 때만 에러 박스 표시 (&& 조건부 렌더링) */}
      {error && (
        <div className="map-error" role="alert">
          {/* 에러 제목 */}
          <b>Google 지도를 불러오지 못했어요</b>
          {/* 에러 상세 메시지 */}
          <p>{error}</p>
          {/* 대체 기능 안내 */}
          <p>일정 목록 편집과 길찾기 링크는 계속 사용할 수 있어요.</p>
        </div>
      )}
    </div>
  )
}
