// 클라이언트 전용 앱 컴포넌트 import
import ClientApp from './ClientApp'

// Page: "/" 경로에 대응하는 페이지 컴포넌트 (@GetMapping("/") 컨트롤러 비슷), ClientApp을 렌더
export default function Page() { return <ClientApp /> }
