// React 훅 import (useState = 상태 필드, useEffect = 부수효과, useCallback = 함수 캐싱)
import { useCallback, useEffect, useState } from 'react'
// JSON 검증 함수와 타입 import
import { validateState, type AppState } from './logic'

// v2 = 장소 ID 모델. v1 저장본(OSM 프로토타입)은 예전 키로 그대로 남겨둠.
// KEY: 브라우저 localStorage 키 상수 (static final String)
const KEY = 'pinlog.v2'

// 목데이터 없이 빈 상태로 시작. Supabase 연동 후에는 DB 조회 결과로 대체.
// EMPTY: 초기 빈 상태 상수
const EMPTY: AppState = { version: 2, trips: [], vault: [] }

// load: localStorage에서 저장된 상태를 읽음 (실패 시 빈 상태)
function load(): AppState {
  // raw: 저장된 JSON 문자열 (null 가능, let = 재할당 가능 변수)
  let raw: string | null = null
  // try 블록 = Java try와 동일
  try {
    // localStorage(브라우저 키-값 저장소)에서 조회
    raw = localStorage.getItem(KEY)
    // 값이 있으면 JSON 파싱 + 검증 후 반환
    if (raw) return validateState(JSON.parse(raw))
  // catch: 읽기/검증 실패 시 (예외 변수 생략 가능)
  } catch {
    // 읽을 수 없는 저장본: 샘플이 덮어쓰기 전에 사본을 보관.
    // 손상된 데이터를 백업 키로 보관 (실패해도 무시)
    try { if (raw) localStorage.setItem(KEY + '.corrupt', raw) } catch { /* 저장소 사용 불가 */ }
  }
  // 저장값이 없거나 손상이면 빈 상태 반환
  return EMPTY
}

// useStore: 상태 관리 커스텀 훅 (상태 + 변경 메서드를 제공하는 서비스 객체 비슷)
export function useStore() {
  // [state, setState] 구조분해: 현재 상태와 setter (getter/setter 쌍), load는 초기값 공급자
  const [state, setState] = useState(load)
  // state가 바뀔 때마다 실행되는 부수효과 (의존성 배열 [state])
  useEffect(() => {
    // 상태를 JSON 문자열로 localStorage에 저장 (실패해도 무시)
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 용량 초과/시크릿 모드: 메모리에서 계속 동작 */ }
  // 의존성 배열: state 변경 시에만 재실행
  }, [state])
  /** 깊은 복사본을 수정. id는 `fn` 밖에서 생성 (StrictMode는 업데이터를 두 번 실행). */
  // update: 깊은 복사본을 fn으로 수정한 뒤 상태 교체 (불변성 유지, fn은 Consumer<AppState>)
  const update = useCallback((fn: (draft: AppState) => void) => setState(s => { const d = structuredClone(s); fn(d); return d }), [])
  // state/update/replace를 담은 객체 반환 (구조분해로 받아 사용)
  return { state, update, replace: setState }
}
