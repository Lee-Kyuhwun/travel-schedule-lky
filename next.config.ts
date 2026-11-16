// Next.js 설정 타입 import
import type { NextConfig } from 'next'

// Next.js 16: next dev 는 기본이 Turbopack. 별도 설정 없음.
// nextConfig: 설정 객체 (reactStrictMode: 개발 중 이중 렌더링으로 문제 조기 발견)
// devIndicators: 개발 모드의 'N' 배지가 모바일 하단 내비게이션 버튼을 가려서 끈다 (운영 빌드에는 원래 없음)
const nextConfig: NextConfig = { reactStrictMode: true, devIndicators: false }
// 기본 export = 설정 파일의 public 반환값
export default nextConfig
