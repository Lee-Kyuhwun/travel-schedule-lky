// logic 모듈에서 import (Java의 import static 과 유사). type 은 타입 전용 import
import { DAY_COLORS, addDays, fmtDay, fmtPeriod, type Trip } from './logic'

// 이미지 너비와 여백 상수 (Java의 static final int)
const W = 720, PAD = 40
// 캔버스에 쓸 폰트 스택 (앞쪽부터 우선 적용)
const FONT = '"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif'

// 글자 폭을 측정해 maxW 를 넘으면 줄바꿈한 문자열 배열을 반환하는 함수
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  // 결과 줄들을 담는 List<String>
  const lines: string[] = []
  // 개행 문자 기준으로 문단 분리 후 순회 (for-each)
  for (const para of text.split('\n')) {
    // 현재 만들고 있는 줄 (StringBuilder 역할)
    let line = ''
    // 문단의 글자를 한 글자씩 순회
    for (const ch of para) {
      // 한 글자 더 붙이면 폭 초과 시 현재 줄 확정 후 새 줄 시작, 아니면 이어 붙임
      if (line && ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch.trimStart() } else line += ch
    }
    // 문단의 마지막 줄 추가
    lines.push(line)
  }
  // 줄바꿈된 결과 반환
  return lines
}

/** 여행 전체(day = null) 또는 하루를 그려 PNG data URL 로 반환한다. */
// 여행 전체(day=null) 또는 특정 일차를 PNG data URL 로 그려 반환. label 은 콜백(함수형 인터페이스 인자)
export function renderTripImage(trip: Trip, day: number | null, label: (placeId: string, alias?: string) => string): string {
  // 메모리상의 <canvas> 요소 생성 (화면에 붙이지 않음)
  const canvas = document.createElement('canvas')
  // 그리기 함수(람다). 최종 이미지 높이를 반환
  const paint = (ctx: CanvasRenderingContext2D) => {
    // 현재 세로 커서 위치
    let y = PAD
    // 텍스트를 줄바꿈하며 그리고 y 를 내리는 내부 헬퍼 (maxW 기본값 지정)
    const text = (s: string, x: number, font: string, color: string, lh: number, maxW = W - PAD - x) => {
      // 폰트/색/세로정렬 설정
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'
      // 줄 단위로 그리고 줄 높이만큼 y 증가
      for (const line of wrap(ctx, s, maxW)) { ctx.fillText(line, x, y + lh / 2); y += lh }
    }
    // 여행 이름 제목 그리기
    text(trip.name, PAD, `700 34px ${FONT}`, '#1f2329', 44)
    // 기간 · 도시 부제 그리기
    text(`${fmtPeriod(trip.start, trip.end)} · ${trip.city}`, PAD, `400 18px ${FONT}`, '#868b94', 30)
    // 제목 아래 간격
    y += 12
    // 전체면 모든 일차 인덱스, 아니면 지정한 일차만 순회
    for (const d of day == null ? trip.days.keys() : [day]) {
      // 일차별 색상 (배열 길이로 나머지 연산해 순환)
      const color = DAY_COLORS[d % DAY_COLORS.length]
      // 구분선 위 여백
      y += 16
      // 얇은 구분선(높이 1px 사각형) 그리기
      ctx.fillStyle = '#eeeff1'; ctx.fillRect(PAD, y, W - PAD * 2, 1)
      // 구분선 아래 여백
      y += 16
      // "N일차 날짜" 헤더 그리기
      text(`${d + 1}일차  ${fmtDay(addDays(trip.start, d))}`, PAD, `700 22px ${FONT}`, color, 36)
      // 그날 일정이 비었으면 안내 문구
      if (!trip.days[d].length) text('일정 없음', PAD, `400 16px ${FONT}`, '#a0a5ad', 30)
      // 장소 번호 카운터 (메모는 번호 제외)
      let n = 0
      // 그날의 항목 순회
      for (const it of trip.days[d]) {
        // 항목 간 간격
        y += 8
        // 메모 항목이면 텍스트만 그리고 다음 항목으로 (continue)
        if (it.kind === 'memo') { text(it.text, PAD + 40, `400 16px ${FONT}`, '#4b5058', 24); continue }
        // 장소 번호 증가
        n++
        // 일차 색상의 원형 배지 그리기
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(PAD + 14, y + 15, 14, 0, Math.PI * 2); ctx.fill()
        // 배지 안 숫자의 폰트/색/가운데 정렬 설정
        ctx.font = `700 14px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        // 숫자를 그린 뒤 정렬을 왼쪽으로 복구
        ctx.fillText(String(n), PAD + 14, y + 16); ctx.textAlign = 'left'
        // 시간(있으면) + 장소명 그리기. ? : 는 삼항 연산자
        text((it.time ? it.time + '  ' : '') + label(it.placeId, it.alias), PAD + 40, `700 19px ${FONT}`, '#1f2329', 30)
        // 장소 메모가 있으면 회색 작은 글씨로 그리기
        if (it.memo) text(it.memo, PAD + 40, `400 15px ${FONT}`, '#868b94', 22)
      }
    }
    // 하단 여백
    y += 28
    // 브랜드 워터마크
    text('PINLOG', PAD, `700 14px ${FONT}`, '#0a8f86', 20)
    // 필요한 총 높이(하단 여백 포함) 반환
    return y + PAD
  }
  // 캔버스 너비 지정
  canvas.width = W
  // 먼저 한 번 그려서 높이만 측정 (! 는 null 아님 단언)
  const h = paint(canvas.getContext('2d')!) // 높이를 재기 위한 사전 실행
  // 측정한 높이 적용 (크기 변경 시 캔버스가 초기화됨)
  canvas.height = h
  // 초기화된 캔버스의 컨텍스트를 다시 획득
  const ctx = canvas.getContext('2d')!
  // 흰색 배경 칠하기
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, h)
  // 실제로 다시 그리기
  paint(ctx)
  // PNG data URL 문자열로 변환해 반환
  return canvas.toDataURL('image/png')
}
