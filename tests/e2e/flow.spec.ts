// 핵심 사용자 흐름 E2E: 가입 → 여행 생성 → 장소 검색·저장 → 일정 추가·수정 → 새로고침/재로그인 복원 → 다른 계정 차단 → 삭제.
// Google Places 는 실제 API 를 호출한다(소량). 키가 이 주소를 허용하지 않으면 검색 단계에서 실패한다.
import { expect, test, type Page } from '@playwright/test'

// 실행·프로젝트마다 다른 계정을 쓴다
const stamp = Date.now().toString(36)
const PASSWORD = 'e2e-password-1234'

// 화면 상단 저장 상태가 '저장됨' 이 될 때까지 기다린다 (DB 반영 완료 신호)
const saved = (page: Page) => expect(page.locator('[data-sync]')).toHaveAttribute('data-sync', 'saved')

async function signUp(page: Page, email: string) {
  await page.goto('/')
  // 비로그인 → 로그인 화면으로 보내져야 한다
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('button', { name: '계정이 없나요? 회원가입' }).click()
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill(PASSWORD)
  await page.getByRole('button', { name: '가입하기' }).click()
  await expect(page.getByRole('heading', { name: '첫 여행을 만들어보세요' })).toBeVisible()
}

async function signIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill(PASSWORD)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.locator('[data-sync]')).toBeVisible()
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

test('여행을 만들고 장소를 저장·편성한 뒤 다시 접속해도 그대로 복원된다', async ({ page, browser }, info) => {
  const mobile = info.project.name === 'mobile'
  const email = `e2e-${info.project.name}-${stamp}@example.com`
  // 화면에 주석이 텍스트로 새어 나오지 않는지도 함께 본다
  // 오른쪽(모바일은 아래) 편집 시트 안의 요소만 고르기 위한 범위
  const sheet = page.locator('aside.sheet')
  const noLeak = async () => expect(page.locator('body')).not.toContainText('// ')

  // 1. 회원가입 (가입 즉시 로그인)
  await signUp(page, email)

  // 2~3. 3일짜리 새 여행
  await page.getByRole('button', { name: '새 여행 만들기' }).first().click()
  await page.getByLabel('여행 이름').fill('E2E 오사카 여행')
  await page.getByLabel('여행 도시').fill('오사카')
  await page.getByLabel('국가 (선택)').fill('일본')
  await page.getByLabel('시작일').fill('2027-03-10')
  await page.getByLabel('종료일').fill('2027-03-12')
  await expect(page.getByText('3일 일정이 만들어져요')).toBeVisible()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E 오사카 여행' })).toBeVisible()
  await saved(page)
  await expect(page.getByRole('tab', { name: /3일차/ })).toBeVisible()
  const tripUrl = page.url()

  // 4. 지도에서 음식점 검색 (텍스트 검색은 지도 위치와 무관하게 동작)
  if (mobile) await page.getByRole('button', { name: '장소 탐색' }).click()
  // 지도가 첫 화면 영역을 알려 줄 때까지 기다린다 (그 전에 검색하면 앱이 '지도가 아직 준비되지 않았어요' 를 보여준다)
  await expect(page.locator('.map-find')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('장소 검색').fill('도톤보리 라멘')
  await page.getByRole('button', { name: '검색', exact: true }).click()
  const firstCard = page.locator('.pcard').first()
  await expect(firstCard).toBeVisible({ timeout: 30_000 })
  await expect(firstCard.locator('.rating')).toContainText(/Google ★|평점 없음/)
  const placeName = (await firstCard.locator('.pcard-main b').innerText()).trim()
  expect(placeName.length).toBeGreaterThan(0)

  // 5. 즐겨찾기(보관함) 저장
  await firstCard.getByRole('button', { name: '보관함에 저장' }).click()
  await expect(firstCard.getByRole('button', { name: '저장됨' })).toBeVisible()
  await saved(page)

  // 보관함 탭: 컬렉션 만들기 + 장소 메모
  await page.getByRole('tab', { name: /^보관함/ }).click()
  await page.getByLabel('새 컬렉션 이름').fill('오사카 맛집')
  await page.getByRole('button', { name: '컬렉션 만들기' }).click()
  // 방금 만든 컬렉션으로 필터가 걸려 목록이 비므로 전체로 되돌린다
  await page.locator('.vault-tools select').nth(1).selectOption('')
  const vaultCard = page.locator('.pcard').first()
  await vaultCard.getByRole('button', { name: '오사카 맛집' }).click()
  await vaultCard.getByLabel('내 메모').fill('예약 필수')
  await vaultCard.getByLabel('내 메모').blur()
  await saved(page)

  // 6. 보관함의 장소를 둘째 날 일정에 추가
  await vaultCard.getByRole('button', { name: '일정에 추가' }).click()
  await vaultCard.getByLabel('날짜').selectOption('1')
  await vaultCard.getByRole('button', { name: '이 날짜에 추가' }).click()
  await expect(page.getByRole('status').filter({ hasText: '2일차에' })).toBeVisible()
  // 같은 날에 메모도 하나 추가 (순서 변경 검증용)
  await sheet.getByRole('tab', { name: '메모', exact: true }).click()
  await page.getByLabel('추가할 날짜').selectOption('1')
  await sheet.getByLabel('메모', { exact: true }).fill('점심 뒤 산책')
  await sheet.getByRole('button', { name: '메모 추가' }).click()
  await saved(page)
  await sheet.getByRole('button', { name: '닫기', exact: true }).click()
  if (mobile) await page.getByRole('button', { name: '일정', exact: true }).click()

  // 7. 메모·순서 수정
  await page.getByRole('tab', { name: /2일차/ }).click()
  const rows = page.locator('.tl > li.row')
  await expect(rows).toHaveCount(2)
  await rows.nth(0).getByRole('button', { name: '수정' }).click()
  await sheet.getByLabel('메모', { exact: true }).fill('창가 자리 요청')
  await sheet.getByRole('button', { name: '저장', exact: true }).click()
  // 메모를 장소 위로 올린다
  await rows.nth(1).getByRole('button', { name: '위로 이동' }).click()
  await expect(rows.nth(0)).toContainText('점심 뒤 산책')
  await expect(rows.nth(1)).toContainText('창가 자리 요청')
  await saved(page)
  await noLeak()

  // 8. 새로고침 후에도 그대로
  const verifyPlan = async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'E2E 오사카 여행' })).toBeVisible()
    await page.getByRole('tab', { name: /2일차/ }).click()
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('점심 뒤 산책')
    await expect(rows.nth(1)).toContainText('창가 자리 요청')
    // 장소 이름은 저장하지 않고 Place ID 로 다시 불러온다
    await expect(rows.nth(1)).toContainText(placeName, { timeout: 30_000 })
  }
  await page.reload()
  await verifyPlan()

  // 9. 로그아웃 → 다시 로그인해도 복원
  await page.getByRole('button', { name: mobile ? '여행 홈' : '내 여행으로' }).click()
  await signOut(page)
  await signIn(page, email)
  await expect(page.getByRole('heading', { name: 'E2E 오사카 여행' }).first()).toBeVisible()
  await expect(page.getByText('일본 · 오사카').first()).toBeVisible()
  await page.goto(tripUrl)
  await verifyPlan()
  // 보관함·컬렉션·메모도 복원
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.getByRole('tab', { name: /^보관함 1/ }).click()
  await expect(page.locator('.pcard').first().getByLabel('내 메모')).toHaveValue('예약 필수')
  await expect(page.locator('.pcard').first().getByRole('button', { name: '오사카 맛집' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: '닫기', exact: true }).click()

  // 10. 다른 계정은 이 여행을 볼 수 없다 (완전히 분리된 브라우저 컨텍스트)
  const other = await browser.newContext()
  const p2 = await other.newPage()
  await signUp(p2, `e2e-other-${info.project.name}-${stamp}@example.com`)
  await p2.goto(tripUrl)
  await expect(p2.getByRole('heading', { name: '첫 여행을 만들어보세요' })).toBeVisible()
  await expect(p2.getByText('E2E 오사카 여행')).toHaveCount(0)
  await other.close()

  // 12. 네트워크 실패: 저장이 실패하면 변경을 되돌리고 오류를 보여준다
  if (mobile) await page.getByRole('button', { name: '일정', exact: true }).click()
  await page.getByRole('tab', { name: /2일차/ }).click()
  await page.route('**/rest/v1/rpc/save_trip', route => route.abort())
  await rows.nth(1).getByRole('button', { name: '위로 이동' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '저장하지 못해' })).toBeVisible()
  await expect(rows.nth(0)).toContainText('점심 뒤 산책') // 원래 순서로 롤백
  await page.unroute('**/rest/v1/rpc/save_trip')

  // 12. 외부 API 실패: Google 요청이 막혀도 일정과 메모는 남는다
  await page.route(/googleapis\.com|gstatic\.com/, route => route.abort())
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E 오사카 여행' })).toBeVisible()
  await page.getByRole('tab', { name: /2일차/ }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('점심 뒤 산책')
  await expect(rows.nth(1)).toContainText('창가 자리 요청')
  await page.unroute(/googleapis\.com|gstatic\.com/)
  await page.reload()

  // 11. 일정·즐겨찾기 삭제 → 새로고침 후에도 사라져 있다
  await page.getByRole('tab', { name: /2일차/ }).click()
  await rows.nth(1).getByRole('button', { name: '수정' }).click()
  await sheet.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.getByRole('tab', { name: /^보관함/ }).click()
  await page.locator('.pcard').first().getByRole('button', { name: '저장됨' }).click()
  await expect(page.getByText('보관함이 비어 있어요')).toBeVisible()
  await saved(page)
  await page.reload()
  await page.getByRole('tab', { name: /2일차/ }).click()
  await expect(rows).toHaveCount(1)
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^보관함 0/ })).toBeVisible()
  await sheet.getByRole('button', { name: '닫기', exact: true }).click()

  // 여행 삭제까지
  await page.getByRole('button', { name: mobile ? '여행 홈' : '내 여행으로' }).click()
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByRole('heading', { name: '첫 여행을 만들어보세요' })).toBeVisible()
  await saved(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: '첫 여행을 만들어보세요' })).toBeVisible()
})
