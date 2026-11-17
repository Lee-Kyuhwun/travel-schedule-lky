// 꾹 누르기(길게 누르기) 감지. 터치·마우스 모두 지원하고, 길게 누른 직후의 클릭은 한 번 무시한다.
import { useRef, type LiHTMLAttributes, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * 같은 자리에 ms 동안 누르고 있으면 onLongPress 를 실행한다.
 * 10px 넘게 움직이면 취소해서 드래그(순서 변경)와 겹치지 않게 한다.
 */
export function useLongPress(onLongPress?: () => void, ms = 450) {
  // 진행 중인 타이머 (숫자 id)
  const timer = useRef<number | null>(null)
  // 누르기 시작한 좌표 (움직임 판정용)
  const start = useRef<{ x: number; y: number } | null>(null)
  // 이번 누르기에서 길게 누르기가 발동했는지 (이어지는 클릭 억제용)
  const held = useRef(false)

  // 타이머 정리
  const clear = () => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
  }

  // 길게 눌러 편집모드로 들어간 직후의 클릭은 한 번 무시한다
  const onClickCapture = (e: ReactMouseEvent) => {
    if (!held.current) return
    e.preventDefault(); e.stopPropagation()
    held.current = false
  }

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (!onLongPress) return
      // 새로 누르기 시작: 이전 상태 초기화 후 타이머 시작
      held.current = false
      start.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = window.setTimeout(() => { held.current = true; onLongPress() }, ms)
    },
    // 손가락·마우스가 10px 넘게 움직이면 길게 누르기 취소 (드래그 보호)
    onPointerMove: (e: ReactPointerEvent) => {
      const s = start.current
      if (!s) return
      if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    // 모바일 길게 누르기에서 뜨는 컨텍스트 메뉴 방지
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
    onClickCapture,
  }
}

/** 길게 누르면 선택(편집) 모드로 들어가는 목록 행. li 의 나머지 속성은 그대로 전달된다. */
export function Hold({ onHold, children, ...rest }: LiHTMLAttributes<HTMLLIElement> & { onHold?: () => void }) {
  // 훅은 컴포넌트 안에서만 호출할 수 있어, 목록 map 안에서 직접 쓰지 않고 이 컴포넌트로 감싼다
  const props = useLongPress(onHold)
  return <li {...rest} {...props}>{children}</li>
}
