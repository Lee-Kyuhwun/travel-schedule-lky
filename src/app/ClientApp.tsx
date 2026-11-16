'use client'
// localStorage / window 를 쓰는 기존 SPA 라서 SSR 을 끄고 브라우저에서만 렌더 (하이드레이션 불일치 방지).
// dynamic: 지연 로딩 도구 (필요할 때 import, Lazy 빈 비슷)
import dynamic from 'next/dynamic'

// App을 동적 import, ssr:false = 서버 렌더링 끔
const App = dynamic(() => import('../App'), { ssr: false })
// ClientApp: App을 감싸는 클라이언트 컴포넌트 (위 "use client" 지시어로 브라우저 실행 표시)
export default function ClientApp() { return <App /> }
