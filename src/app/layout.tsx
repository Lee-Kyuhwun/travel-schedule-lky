// Next.js 메타데이터 타입 import (type = 타입 전용)
import type { Metadata, Viewport } from 'next'
// 전역 CSS 로드 (부수효과 import)
import '../styles.css'

// metadata: 페이지 <title> 등 메타정보 상수 (Next.js가 읽어 사용)
export const metadata: Metadata = { title: 'PINLOG · 여행 일정 짜기' }
// viewport: 브라우저 테마색 설정
export const viewport: Viewport = { themeColor: '#ffffff' }

// RootLayout: 모든 페이지를 감싸는 루트 레이아웃 컴포넌트 (React 컴포넌트 = 화면을 반환하는 함수, 템플릿 같은 역할)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // JSX(HTML 비슷한 문법) 반환: children = 현재 페이지가 들어갈 자리 (Thymeleaf layout fragment 비슷)
  return <html lang="ko"><body><div id="root">{children}</div></body></html>
}
