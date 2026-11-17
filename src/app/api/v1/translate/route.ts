import { NextResponse } from 'next/server'

// 구글 번역(gtx) 응답 형식: [[["번역문", "원문", ...], ...], null, "en", ...]
type Gtx = [Array<[string, string]>, unknown, string]

// gtx: 키 없이 쓰는 구글 번역 엔드포인트 (서버에서만 호출해 CORS·키 노출을 피한다)
const gtx = (text: string) =>
  `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(text)}`

// 1순위: 구글 번역 (문장 품질이 좋다)
async function viaGoogle(text: string) {
  const res = await fetch(gtx(text), { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`gtx ${res.status}`)
  const json = (await res.json()) as Gtx
  // 첫 번째 배열의 각 조각을 이어 붙이면 전체 번역문이 된다
  return (json[0] ?? []).map(seg => seg[0]).join('')
}

// 2순위: MyMemory 공개 API (구글이 막힐 때 대비)
async function viaMemory(text: string) {
  const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`mymemory ${res.status}`)
  const json = (await res.json()) as { responseData?: { translatedText?: string } }
  return json.responseData?.translatedText ?? ''
}

/** POST /api/v1/translate — 가게 설명을 한국어로 바꾼다. 한국어가 아니면 빈 문자열을 돌려준다. */
export async function POST(req: Request) {
  let text = ''
  try {
    const body = (await req.json()) as { text?: unknown }
    if (typeof body.text === 'string') text = body.text
  } catch {
    // 잘못된 본문은 아래에서 400 으로 처리
  }
  // 가게 설명은 몇 문장이라 이 길이면 충분하다 (남용 방지)
  if (!text.trim() || text.length > 1200) {
    return NextResponse.json({ text: '' }, { status: 400 })
  }
  // 번역에 실패해도 화면이 깨지지 않도록 항상 200 + 빈 문자열로 응답한다
  for (const run of [viaGoogle, viaMemory]) {
    try {
      const ko = await run(text)
      // 한국어가 들어 있지 않으면(실패·원문 반환) 다음 방법으로 넘어간다
      if (/[가-힣]/.test(ko)) {
        return NextResponse.json({ text: ko }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
      }
    } catch (e) {
      console.error('[translate]', (e as Error).message)
    }
  }
  return NextResponse.json({ text: '' })
}
