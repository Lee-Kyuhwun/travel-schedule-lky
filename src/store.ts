// 앱 전체 상태 저장소 (Java 로 치면 상태를 든 서비스 + 리포지토리 동기화).
// 화면은 update() 로 상태를 즉시 바꾸고(낙관적 업데이트), 이 훅이 뒤에서 Supabase 에 저장한다.
// 저장에 실패하면 DB 의 실제 상태로 되돌리고 오류를 알린다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { freshIds, validateState, type AppState } from './logic'
import { loadState, pushDiff } from './lib/db'
import { getSupabase } from './lib/supabase/client'

// 예전(로그인 도입 전) 브라우저 저장 키. 첫 로그인 때 한 번만 계정으로 옮긴다.
const LEGACY_KEY = 'pinlog.v2'
// 빈 초기 상태 (Java 의 빈 DTO)
const EMPTY: AppState = { version: 2, trips: [], vault: [], collections: [] }

// loading: 첫 조회 중 · saved: DB 와 일치 · saving: 저장 중 · error: 마지막 저장/조회 실패
export type SyncStatus = 'loading' | 'saved' | 'saving' | 'error'

/** 예전 localStorage 데이터를 읽는다. 샘플(데모) 데이터는 버리고, 옮길 것이 없으면 null. */
function readLegacy(userId: string): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    // 없거나, 이 계정으로 이미 옮겼으면 건너뛴다
    if (!raw || localStorage.getItem(LEGACY_KEY + '.migrated') === userId) return null
    const s = validateState(JSON.parse(raw))
    // 's-' 로 시작하는 장소는 삭제된 데모 데이터라 실제 Place ID 가 아니다
    const real = (id: string) => !id.startsWith('s-')
    s.trips = s.trips.filter(t => t.id !== 'sample-kansai')
    for (const t of s.trips) {
      t.days = t.days.map(d => d.filter(i => i.kind === 'memo' || real(i.placeId)))
      t.stays = t.stays.filter(x => real(x.placeId))
    }
    s.vault = s.vault.filter(v => real(v.placeId))
    // 계정 DB 에 맞게 모든 id 를 UUID 로 새로 발급
    return s.trips.length || s.vault.length ? freshIds(s) : null
  } catch {
    // 읽을 수 없는 옛 데이터는 건드리지 않고 무시한다 (원본은 localStorage 에 그대로 남는다)
    return null
  }
}

export function useStore() {
  // state: 화면이 보는 현재 상태 (useState = 필드 + setter, 바뀌면 화면이 다시 그려진다)
  const [state, setState] = useState<AppState>(EMPTY)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  // synced: 마지막으로 DB 와 같았던 스냅샷. 저장할 차이를 계산하고, 실패 시 되돌릴 기준이 된다.
  const synced = useRef<AppState>(EMPTY)
  // latest: 비동기 코드에서 "지금" 상태를 읽기 위한 참조 (렌더마다 갱신)
  const latest = useRef(state)
  latest.current = state
  // busy: 저장 루프가 이미 도는 중인지 (중복 실행 방지용 락)
  const busy = useRef(false)
  // ready: 첫 조회가 끝났는지. 끝나기 전에는 저장하지 않는다 (빈 상태로 DB 를 덮어쓰지 않도록)
  const ready = useRef(false)
  // legacyFor: 옛 데이터를 옮기는 중인 사용자 id. 저장이 성공하면 "옮김" 표시를 남긴다.
  const legacyFor = useRef<string | null>(null)

  // ── 첫 조회: 로그인 사용자의 데이터를 DB 에서 읽는다 (@PostConstruct 와 비슷) ──
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const db = getSupabase()
        const { data: { user } } = await db.auth.getUser()
        // 세션이 없으면 로그인 화면으로 (평소에는 proxy.ts 가 먼저 막는다)
        if (!user) { location.assign('/login'); return }
        const loaded = await loadState(db)
        if (!alive) return
        setEmail(user.email ?? '')
        synced.current = loaded
        ready.current = true
        // 계정이 비어 있고 이 브라우저에 옛 데이터가 있으면 한 번만 가져온다
        const legacy = loaded.trips.length || loaded.vault.length ? null : readLegacy(user.id)
        if (legacy) legacyFor.current = user.id
        setState(legacy ?? loaded)
        setStatus('saved')
      } catch (e) {
        if (!alive) return
        setError(`데이터를 불러오지 못했어요. 새로고침해 주세요. (${(e as Error).message})`)
        setStatus('error')
      }
    })()
    // 컴포넌트가 사라진 뒤 도착한 응답은 무시
    return () => { alive = false }
  }, [])

  // ── 저장 루프: 화면 상태가 DB 스냅샷과 같아질 때까지 차이를 밀어 넣는다 ──
  const flush = useCallback(async () => {
    if (busy.current || !ready.current) return
    busy.current = true
    const db = getSupabase()
    try {
      // 저장하는 동안 사용자가 또 고치면 한 번 더 돈다
      while (latest.current !== synced.current) {
        const target = latest.current
        setStatus('saving')
        await pushDiff(db, synced.current, target)
        synced.current = target
      }
      // 옛 데이터 이관이 끝났으면 표시를 남겨 다시 가져오지 않게 한다 (원본은 지우지 않는다)
      if (legacyFor.current) {
        try { localStorage.setItem(LEGACY_KEY + '.migrated', legacyFor.current) } catch { /* 저장소 사용 불가 */ }
        legacyFor.current = null
      }
      setError('')
      setStatus('saved')
    } catch (e) {
      // 롤백: 일부만 저장됐을 수 있으므로 DB 를 다시 읽어 그 상태로 맞춘다. 그것도 안 되면 마지막 스냅샷으로.
      let back = synced.current
      try { back = await loadState(db) } catch { /* 오프라인: 마지막으로 확인된 상태로 되돌린다 */ }
      synced.current = back
      setState(back)
      setError(`저장하지 못해 방금 변경을 되돌렸어요. 네트워크를 확인하고 다시 시도해주세요. (${(e as Error).message})`)
      setStatus('error')
    } finally {
      busy.current = false
    }
  }, [])

  // 상태가 바뀌면 0.4초 뒤 저장 (연속 입력을 한 번으로 묶는 디바운스)
  useEffect(() => {
    if (!ready.current || state === synced.current) return
    setStatus('saving')
    const timer = setTimeout(() => void flush(), 400)
    return () => clearTimeout(timer)
  }, [state, flush])

  // 저장이 끝나기 전에 탭을 닫으려 하면 브라우저가 한 번 물어보게 한다
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (ready.current && latest.current !== synced.current) e.preventDefault() }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [])

  /** 깊은 복사본을 수정. id는 `fn` 밖에서 생성 (StrictMode는 업데이터를 두 번 실행). */
  const update = useCallback((fn: (draft: AppState) => void) => setState(s => { const d = structuredClone(s); fn(d); return d }), [])
  /** JSON 가져오기: 전체 교체. 다른 계정의 행과 부딪히지 않게 id 를 새로 발급한다. */
  const replace = useCallback((next: AppState) => setState(freshIds(next)), [])
  /** 로그아웃 후 로그인 화면으로. */
  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut()
    location.assign('/login')
  }, [])

  // 화면에 보여줄 상태: 아직 DB 에 들어가지 않은 변경이 있으면 같은 렌더에서 곧바로 '저장 중' 으로 보인다.
  // (effect 에서 바꾸면 한 박자 늦어, 그 사이 새로고침하면 '저장됨' 을 믿고 변경을 잃을 수 있다)
  const shown: SyncStatus = status === 'saved' && state !== synced.current ? 'saving' : status

  return { state, update, replace, status: shown, error, email, signOut }
}
