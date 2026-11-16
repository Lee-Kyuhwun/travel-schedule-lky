// 직접 만든 여행지 일러스트 + 브랜드 마크. 외부 이미지 없음.

// 문자열 → 숫자 해시 (Java의 hashCode 와 유사). 같은 입력이면 항상 같은 값
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

// 건물 층(지붕+몸체)을 n 개 쌓은 SVG 요소 배열을 만드는 함수
function tiers(cx: number, top: number, n: number, w0: number, grow: number, step: number) {
  // 길이 n 배열을 인덱스 i 로 매핑 (IntStream.range(0,n).mapToObj 와 유사)
  return Array.from({ length: n }, (_, i) => {
    // 층별 너비 w 와 세로 위치 y 계산
    const w = w0 + i * grow, y = top + i * step
    return (
      // 리스트 렌더링 시 필요한 고유 key 를 가진 그룹
      <g key={i}>
        {/* 사다리꼴 지붕 */}
        <polygon points={`${cx - w / 2 - 6},${y + 11} ${cx + w / 2 + 6},${y + 11} ${cx + w / 2 - 12},${y} ${cx - w / 2 + 12},${y}`} />
        {/* 지붕 아래 직사각형 몸체 */}
        <rect x={cx - w / 2 + 12} y={y + 11} width={w - 24} height={step - 11} />
      </g>
    )
  })
}

// 여행 이름(seed)으로 표지 그림을 만드는 컴포넌트. props 는 { seed } 구조분해
export function Cover({ seed }: { seed: string }) {
  // seed 의 해시값
  const h = hash(seed)
  // 해시로 기본 색상(색상환 각도) 결정
  const hue = h % 360
  // SVG 그라디언트의 고유 id
  const id = 'c' + h.toString(36)
  // 정규식으로 도시 이름 판별해 모티프 선택 (삼항 연산자 중첩)
  const motif = /오사카|osaka/i.test(seed) ? 'castle' : /교토|kyoto/i.test(seed) ? 'torii' : /나라|nara/i.test(seed) ? 'pagoda' : 'city'
  // 실루엣 색상
  const ink = '#0b0c0e'
  return (
    // 400x240 SVG 캔버스 (꽉 채우고 넘치는 부분은 잘라냄)
    <svg className="cover" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* 재사용할 정의 영역 */}
      <defs>
        {/* 위→아래 세로 그라디언트 정의 */}
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {/* 하늘 위쪽 어두운 색 */}
          <stop offset="0" stopColor={`hsl(${hue} 55% 16%)`} />
          {/* 중간 색 */}
          <stop offset=".55" stopColor={`hsl(${(hue + 35) % 360} 60% 38%)`} />
          {/* 아래쪽 밝은 색 */}
          <stop offset="1" stopColor={`hsl(${(hue + 80) % 360} 75% 62%)`} />
        </linearGradient>
      </defs>
      {/* 그라디언트로 배경 채우기 */}
      <rect width="400" height="240" fill={`url(#${id})`} />
      {/* 해/달 원 (위치는 해시로 결정) */}
      <circle cx={90 + (h % 180)} cy="118" r="38" fill="#fff" opacity=".8" />
      {/* 먼 산 실루엣 */}
      <path d="M0 170 Q70 120 140 158 T280 140 T400 160 V240 H0Z" fill={`hsl(${hue} 35% 22%)`} />
      {/* 가까운 산 실루엣 */}
      <path d="M0 200 Q90 160 190 192 T400 178 V240 H0Z" fill={`hsl(${hue} 30% 13%)`} />
      {/* 모티프 그룹 (기본 채움색 ink) */}
      <g fill={ink}>
        {/* 오사카: 성 (4층 + 석축) */}
        {motif === 'castle' && <>{tiers(285, 62, 4, 44, 26, 32)}<polygon points="205,190 365,190 385,240 185,240" /></>}
        {/* 나라: 5층탑 + 꼭대기 장식 + 기단 */}
        {motif === 'pagoda' && <>{tiers(285, 60, 5, 30, 12, 28)}<rect x="283" y="34" width="4" height="28" /><rect x="235" y="200" width="100" height="40" /></>}
        {/* 교토: 붉은 도리이 문 */}
        {motif === 'torii' && (
          <g fill="#e2472f">
            {/* 두 기둥 */}
            <rect x="228" y="92" width="12" height="148" /><rect x="320" y="92" width="12" height="148" />
            {/* 윗 가로대(휘어진 지붕)와 아래 가로대 */}
            <path d="M204 84 Q280 70 356 84 L352 100 Q280 88 208 100Z" /><rect x="218" y="116" width="124" height="10" />
          </g>
        )}
        {/* 기타 도시: 높이가 제각각인 빌딩 9개 */}
        {motif === 'city' && Array.from({ length: 9 }, (_, i) => {
          // 해시 비트로 빌딩 높이 결정
          const bh = 40 + ((h >> (i * 3)) & 63)
          return <rect key={i} x={180 + i * 24} y={240 - bh - 20} width="20" height={bh + 20} />
        })}
      </g>
      {/* 맨 앞 지면 실루엣 */}
      <path d="M0 222 Q120 204 240 220 T400 212 V240 H0Z" fill={ink} />
    </svg>
  )
}

/** 24px 선(stroke) 아이콘 path 모음. */
// 아이콘 이름 → SVG path 문자열 맵 (상수 Map<String,String>)
export const I = {
  back: 'M15 5l-7 7 7 7', home: 'M4 11l8-7 8 7v9H4z', cal: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4', arrow: 'M5 12h14M13 6l6 6-6 6', close: 'M6 6l12 12M18 6L6 18', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16z', plus: 'M12 5v14M5 12h14', check: 'M5 12l5 5 9-10',
  plane: 'M3 13l18-8-6 16-3-7z', bed: 'M3 18v-8m0 5h18m0 3v-6a3 3 0 0 0-3-3h-7v6',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4zM4 7V6a2 2 0 0 1 2-2h10M16 13h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', locate: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4', sort: 'M4 7h12M4 12h8M4 17h4M18 8v10m0 0l-3-3m3 3l3-3',
}
/** 탐색 결과 핀 아이콘: 카테고리별 하나씩(분류 없는 결과는 기본 핀). */
// 기본 핀 아이콘 path 상수
const PIN = 'M12 21s-6-6.5-6-11a6 6 0 0 1 12 0c0 4.500-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4'
// 카테고리 → 아이콘 path 맵 (Record<string,string> = Map<String,String>)
export const CAT_ICON: Record<string, string> = {
  airport: PIN, // 전용 아이콘 없음: 공항도 그냥 하나의 장소
  restaurant: 'M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 9v9',
  cafe: 'M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2 2 0 0 1 0 4h-2M8 4v2M12 4v2',
  bar: 'M5 4h14l-7 8zM12 12v8M8 20h8',
  bakery: 'M4 14a4 4 0 0 1 4-6h8a4 4 0 0 1 4 6v4H4zM9 8v4M15 8v4',
  shopping: 'M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2',
  sight: 'M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z',
  lodging: 'M3 18v-8m0 5h18m0 3v-6a3 3 0 0 0-3-3h-7v6',
  other: PIN,
}

// 아이콘 컴포넌트: path(d)와 크기(size, 기본 18)를 받아 SVG 렌더링
export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    // 24x24 좌표계의 선(stroke) 스타일 SVG, 스크린리더에서는 숨김
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* 전달받은 path 그리기 */}
      <path d={d} />
    </svg>
  )
}

// 앱 로고 컴포넌트
export function Logo() {
  return (
    <span className="logo">
      {/* 32x32 로고 SVG */}
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        {/* 둥근 사각형 배경 */}
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        {/* 흰색 지도 핀 모양 */}
        <path d="M16 6a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" fill="#fff" />
        {/* 핀 가운데 구멍 */}
        <circle cx="16" cy="13" r="2.6" fill="var(--accent)" />
      </svg>
      PINLOG
    </span>
  )
}
