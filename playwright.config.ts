// Playwright E2E 설정. 실제 Next 개발 서버 + 실제 Supabase(로컬) 를 대상으로 돈다.
import { defineConfig, devices } from '@playwright/test'

// 포트 3000 을 다른 프로그램이 쓰고 있으면 E2E_BASE_URL 로 바꿔 지정한다
const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests/e2e',
  // 한 시나리오가 앞 단계의 데이터에 의존하므로 순서대로 한 워커에서 실행
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { baseURL: base, actionTimeout: 15_000, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'ko-KR' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 모바일 화면(Pixel 7 크기)에서도 같은 시나리오를 검증
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // 서버가 이미 떠 있으면 재사용, 없으면 띄운다
  webServer: { command: 'npm run dev', url: base + '/login', reuseExistingServer: true, timeout: 120_000 },
})
