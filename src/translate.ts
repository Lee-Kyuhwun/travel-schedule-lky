// 구글 Gemini 후기 요약·편집 요약은 영어(en-US)로만 내려온다.
// 화면에는 한국어만 보여주기 위해 서버 번역 라우트를 거쳐 한국어로 바꾸고, 실패하면 아무것도 표시하지 않는다.
import { useEffect, useState } from 'react'

// 번역 결과 캐시 (같은 문장은 세션 동안 한 번만 번역)
const cache = new Map<string, string>()
// 진행 중인 요청 (같은 문장 중복 요청 방지)
const inflight = new Map<string, Promise<string>>()
// 동시에 보낼 요청 수 제한: 목록에 카드가 수십 개 떠도 한꺼번에 몰리지 않게 한다
const MAX = 2
const queue: (() => void)[] = []
let active = 0

// 대기열에서 하나씩 꺼내 실행
function pump() {
  while (active < MAX && queue.length) {
    const job = queue.shift()!
    active++
    job()
  }
}

// 한글이 들어 있는지 (이미 한국어면 번역하지 않는다)
const hasKo = (s: string) => /[가-힣]/.test(s)

// translateKo: 서버 라우트로 번역 요청 (실패하면 빈 문자열)
function translateKo(text: string): Promise<string> {
  const hit = cache.get(text)
  if (hit !== undefined) return Promise.resolve(hit)
  const running = inflight.get(text)
  if (running) return running
  const p = new Promise<string>(resolve => {
    queue.push(() => {
      fetch('/api/v1/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then(res => (res.ok ? res.json() : { text: '' }))
        .then((json: { text?: string }) => {
          const ko = typeof json.text === 'string' ? json.text : ''
          cache.set(text, ko)
          resolve(ko)
        })
        .catch(() => {
          cache.set(text, '')
          resolve('')
        })
        .finally(() => {
          inflight.delete(text)
          active--
          pump()
        })
    })
    pump()
  })
  inflight.set(text, p)
  return p
}

/** 화면에 보여줄 한국어 문장. 이미 한국어면 그대로, 아니면 번역이 끝난 뒤 반환한다 (그 전엔 빈 문자열). */
export function useKoText(raw?: string) {
  // 초기값: 한국어이거나 이미 캐시에 있으면 바로 보여준다
  const [ko, setKo] = useState(() => (raw ? (hasKo(raw) ? raw : cache.get(raw) ?? '') : ''))
  useEffect(() => {
    if (!raw) { setKo(''); return }
    if (hasKo(raw)) { setKo(raw); return }
    const hit = cache.get(raw)
    if (hit !== undefined) { setKo(hit); return }
    // 화면이 바뀌면 늦게 온 응답을 버린다
    let alive = true
    setKo('')
    translateKo(raw).then(t => { if (alive) setKo(t) })
    return () => { alive = false }
  }, [raw])
  return ko
}
