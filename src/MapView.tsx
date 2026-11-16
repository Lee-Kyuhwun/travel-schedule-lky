// GoogleMap 이 공유해서 쓰는 지도 props / 핀 마크업.
// 타입만 import (Java의 import 와 비슷하지만 컴파일 후 사라짐)
import { type Cat, type LatLng, type View } from './logic'
// 카테고리별 아이콘 SVG 경로 맵 (Map<String,String> 상수)
import { CAT_ICON } from './Cover'

/** 일정 장소: 번호가 있고 일차별 색상으로 표시. */
// Pin = LatLng 필드 + 추가 필드 (& 는 상속/합성, DTO 정의와 유사)
export type Pin = LatLng & { id: string; n: number; day: number; color: string; name: string }
/** 탐색 결과: 카테고리 아이콘으로 표시. */
// 검색 결과 핀 DTO. cat? 는 있을 수도 없을 수도 있는 필드(nullable)
export type RPin = LatLng & { id: string; cat?: Cat; name: string }

// GoogleMap 컴포넌트가 받는 props (생성자 인자 DTO / interface)
export type MapProps = {
  // 일정 핀 목록
  pins: Pin[]
  // 검색 결과 핀 목록
  results: RPin[]
  // 선택된 일정 핀 id (없으면 null)
  selectedId: string | null
  // 선택된 검색 결과 id (없으면 null)
  selectedResultId: string | null
  /** 이 값이 바뀔 때마다(여행/일차 탭) 일정 핀에 맞춰 지도를 다시 맞춘다. */
  // 값이 바뀌면 지도를 핀에 맞춰 다시 맞춤
  fitKey: string
  /** 카메라를 이 좌표들로 이동(텍스트 검색 결과, 내 위치). 주변 검색은 이 값을 설정하지 않는다. */
  // 카메라 이동 요청. key 가 바뀌면 같은 좌표여도 다시 이동
  focus: { points: LatLng[]; key: number } | null
  // 내 현재 위치 (없으면 null)
  me: LatLng | null
  // 핀 클릭 콜백 (Consumer<String>)
  onPin: (id: string) => void
  // 검색 결과 클릭 콜백
  onResult: (id: string) => void
  /** 지도 이동이 멈추면 보이는 영역과 함께 호출된다. */
  // 지도 이동이 멈추면 보이는 영역을 전달하는 콜백
  onView: (v: View) => void
}

// 일정 핀의 HTML 문자열 생성 (번호 표시, 선택 시 sel 클래스, 색은 CSS 변수로)
export const pinHtml = (p: Pin, sel: boolean) => `<span class="pin${sel ? ' sel' : ''}" style="--c:${p.color}">${p.n}</span>`
// 검색 결과 핀의 HTML 문자열 생성 (카테고리 SVG 아이콘 포함)
export const rpinHtml = (r: RPin, sel: boolean) =>
  `<span class="rpin${sel ? ' sel' : ''}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${CAT_ICON[r.cat ?? 'other']}"/></svg></span>`
// 내 위치를 나타내는 점 HTML 상수
export const ME_HTML = '<span class="me-dot"></span>'
