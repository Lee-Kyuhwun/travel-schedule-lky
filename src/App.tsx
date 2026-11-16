// React 훅 import: useEffect(라이프사이클 콜백), useRef(변경 가능한 멤버 필드), useState(상태 필드+setter)
import { useEffect, useRef, useState, type FormEvent } from 'react'
// 도메인 로직 함수들과 타입 (Java의 유틸 클래스 + DTO import)
import { addDays, dayCount, fmtPeriod, isDate, resizeDays, uid, validateState, type AppState, type Trip } from './logic'
// 전역 상태 저장소 훅 (Spring 의 싱글톤 서비스 주입과 비슷)
import { useStore } from './store'
// 여행 편집 화면 컴포넌트
import { Editor } from './Editor'
// 삭제 버튼 컴포넌트
import { Del } from './Sheet'
// 표지/아이콘/로고 컴포넌트와 아이콘 상수
import { Cover, I, Icon, Logo } from './Cover'

// 여행 생성/수정 폼 데이터 타입 (DTO 클래스 역할)
type TripForm = { name: string; city: string; country: string; start: string; end: string; moveTo: number }

// 앱 최상위 컴포넌트 (Spring 의 메인 컨트롤러 같은 진입점)
export default function App() {
  // 전역 상태와 변경/교체 함수를 구조분해로 받음
  const { state, update, replace, status, error, email, signOut } = useStore()
  // URL 해시(#/trip/..) 상태: 간단한 라우팅에 사용
  const [hash, setHash] = useState(location.hash)
  // 여행 추가/수정 다이얼로그 상태 (null 이면 닫힘)
  const [dialog, setDialog] = useState<{ trip?: Trip } | null>(null)
  // 가져오기 결과 알림 메시지 상태
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // 마운트 시 1회 실행되는 콜백 (@PostConstruct)
  useEffect(() => {
    // 해시가 바뀌면 상태 갱신하는 핸들러(람다)
    const onHash = () => setHash(location.hash)
    // 브라우저 해시 변경 이벤트 리스너 등록
    addEventListener('hashchange', onHash)
    // 정리 함수 (@PreDestroy): 리스너 해제
    return () => removeEventListener('hashchange', onHash)
  }, [])

  // 해시에서 여행 id 를 정규식으로 뽑아 해당 여행 찾기 (없으면 undefined)
  const trip = state.trips.find(t => t.id === hash.match(/^#\/trip\/(.+)$/)?.[1])
  // 여행 열기: 마지막 열람 여행 저장 후 해시 이동
  const open = (id: string) => { update(s => { s.lastTripId = id }); location.hash = '#/trip/' + id }

  // 여행 저장(신규/수정 공통) 핸들러
  const saveTrip = (f: TripForm) => {
    // 시작~종료일의 일수 계산
    const n = dayCount(f.start, f.end)
    // 수정 중인 여행 (신규면 undefined)
    const editing = dialog?.trip
    // 수정 모드
    if (editing) {
      // 상태를 변경하는 콜백 (s 는 복사된 상태, 직접 수정 가능)
      update(s => {
        // 대상 여행 찾기
        const t = s.trips.find(t => t.id === editing.id)
        // 있으면 필드들을 한 번에 덮어씀 (일차 수는 resizeDays 로 조정)
        if (!t) return
        Object.assign(t, { name: f.name, city: f.city, start: f.start, end: f.end, days: resizeDays(t.days, n, f.moveTo) })
        // 국가는 선택 값: 비우면 키를 지운다
        if (f.country) t.country = f.country; else delete t.country
      })
    // 신규 모드
    } else {
      // 새 id 생성
      const id = uid()
      // 빈 여행 객체를 목록에 추가
      update(s => { s.trips.push({ id, name: f.name, city: f.city, ...(f.country ? { country: f.country } : {}), start: f.start, end: f.end, days: resizeDays([], n), flights: [], stays: [], checklist: [], expenses: [] }) })
      // 만든 여행을 바로 열기
      open(id)
    }
    // 다이얼로그 닫기
    setDialog(null)
  }

  // 전체 데이터를 JSON 파일로 내려받기
  const exportJson = () => {
    // 보이지 않는 다운로드용 <a> 생성
    const a = document.createElement('a')
    // 상태를 JSON 문자열로 직렬화해 Blob URL 생성 (들여쓰기 2칸)
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    // 파일명: pinlog-날짜.json
    a.download = `pinlog-${new Date().toISOString().slice(0, 10)}.json`
    // 클릭하여 다운로드 시작
    a.click()
    // 임시 URL 해제 (메모리 정리)
    URL.revokeObjectURL(a.href)
  }
  // JSON 파일 가져오기 (async = CompletableFuture 반환, await = join)
  const importJson = async (file: File) => {
    // 예외 처리 시작 (try-catch 동일)
    try {
      const next = validateState(JSON.parse(await file.text())) // 교체 전에 예외가 발생하므로 기존 데이터는 안전
      // 검증 통과한 데이터로 상태 전체 교체
      replace(next)
      // 성공 알림 표시
      setNotice({ ok: true, text: `여행 ${next.trips.length}개를 가져왔어요.` })
    // 실패 시
    } catch (e) {
      // 오류 종류별 메시지로 실패 알림 표시 (instanceof 는 Java 와 동일)
      setNotice({ ok: false, text: `가져오기 실패: ${e instanceof SyntaxError ? 'JSON 형식이 아닙니다' : (e as Error).message}. 기존 데이터는 그대로예요.` })
    }
  }

  // 화면 렌더링 (JSX = 템플릿). <></> 는 부모 없는 묶음(Fragment)
  return (
    <>
      {/* 여행이 선택되면 편집 화면, 아니면 홈 화면 (삼항 연산자). props 는 생성자 인자처럼 전달 */}
      {/* 첫 조회가 끝나기 전에는 빈 화면 대신 안내를 보여준다 */}
      {status === 'loading' ? <p className="empty boot" role="status">여행을 불러오는 중…</p> : trip
        ? <Editor key={trip.id} trip={trip} state={state} update={update} onBack={() => { location.hash = '' }} onEditTrip={() => setDialog({ trip })} />
        : <Home state={state} notice={notice} email={email} onSignOut={() => void signOut()} onOpen={open} onNew={() => setDialog({})} onEdit={t => setDialog({ trip: t })}
            onDelete={id => update(s => { s.trips = s.trips.filter(t => t.id !== id) })} onExport={exportJson} onImport={importJson} />}
      {/* dialog 상태가 있으면 여행 다이얼로그 표시 (&& 조건부 렌더링) */}
      {/* 저장 상태 표시: 저장 중 / 저장됨 / 실패 (E2E 테스트도 이 값을 기다린다) */}
      {status !== 'loading' && <p className={'sync ' + status} role="status" aria-live="polite" data-sync={status}>{status === 'saving' ? '저장 중…' : status === 'error' ? '저장 실패' : '저장됨'}</p>}
      {/* 조회·저장 오류 안내 (실패 시 변경은 이미 되돌려져 있다) */}
      {error && <p className="sync-error" role="alert">{error}</p>}
      {dialog && <TripDialog trip={dialog.trip} onClose={() => setDialog(null)} onSave={saveTrip} />}
    </>
  )
}

// 홈 화면 컴포넌트. p 는 props 객체(생성자 인자 DTO), 인라인 타입으로 정의
function Home(p: {
  // 전체 상태와 알림
  state: AppState; notice: { ok: boolean; text: string } | null; email: string; onSignOut: () => void
  // 열기/새로만들기/수정/삭제 콜백 (함수형 인터페이스)
  onOpen: (id: string) => void; onNew: () => void; onEdit: (t: Trip) => void; onDelete: (id: string) => void
  // 내보내기/가져오기 콜백
  onExport: () => void; onImport: (f: File) => void
}) {
  // 상태에서 여행 목록과 마지막 열람 id 꺼내기
  const { trips, lastTripId } = p.state
  // 최근 여행: lastTripId 와 일치하는 것, 없으면 첫 번째 (?? = orElse)
  const recent = trips.find(t => t.id === lastTripId) ?? trips[0]
  // 숨겨진 파일 input 참조 (변경 가능한 멤버 필드)
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="home">
      {/* 상단 헤더: 로고와 새 여행 버튼 */}
      <header className="home-top">
        {/* 로고 컴포넌트 */}
        <Logo />
        {/* 새 여행 버튼: onClick 에 콜백 연결 */}
        <button type="button" className="btn" onClick={p.onNew}><Icon d={I.plus} size={16} />새 여행</button>
        {/* 로그인한 계정과 로그아웃 */}
        <span className="who" title={p.email}>{p.email}</span>
        <button type="button" className="btn" onClick={p.onSignOut}>로그아웃</button>
      </header>

      {/* 인사 문구 영역 */}
      <div className="home-lead">
        {/* 작은 라벨 */}
        <p className="eyebrow">내 여행</p>
        {/* 큰 제목 (br 은 줄바꿈) */}
        <h1>다음 여행,<br />어디로 떠날까요?</h1>
      </div>

      {/* 최근 여행이 있으면 히어로 카드, 없으면 빈 상태 카드 */}
      {recent ? (
        <section className="hero" aria-label="최근 여행">
          {/* 도시+이름으로 표지 그림 생성 */}
          <Cover seed={recent.city + recent.name} />
          {/* 배지와 D-day 표시 */}
          <div className="hero-top"><span className="badge solid">최근 여행</span><span className="pill glass">{dday(recent)}</span></div>
          <div className="hero-body">
            {/* 도시명 */}
            <p className="eyebrow">{where(recent)}</p>
            {/* 여행 이름 */}
            <h2>{recent.name}</h2>
            {/* 기간/일수/장소수 요약 */}
            <Stats t={recent} />
            {/* 이어서 편집 버튼 */}
            <button type="button" className="btn primary big" onClick={() => p.onOpen(recent.id)}>이어서 편집<Icon d={I.arrow} size={18} /></button>
          </div>
        </section>
      ) : (
        <section className="hero empty-hero">
          <div className="hero-body">
            {/* 빈 상태 안내 제목 */}
            <h2>첫 여행을 만들어보세요</h2>
            {/* 안내 문구 */}
            <p>도시와 날짜만 정하면 일차가 자동으로 만들어져요.</p>
            {/* 새 여행 만들기 버튼 */}
            <button type="button" className="btn primary big" onClick={p.onNew}>새 여행 만들기</button>
          </div>
        </section>
      )}

      {/* 전체 여행 섹션 제목과 개수 */}
      <h2 className="section-title">모든 여행 <small>{trips.length}</small></h2>
      {/* 여행 카드 목록 */}
      <div className="cards">
        {/* 여행 배열을 카드로 변환 (Stream.map). key 는 리스트 항목 식별자 */}
        {trips.map(t => (
          <article key={t.id} className="trip-card" role="link" tabIndex={0} aria-label={`${t.name} 열기`}
            onClick={() => p.onOpen(t.id)} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) p.onOpen(t.id) }}>
            {/* 카드 표지 그림 */}
            <Cover seed={t.city + t.name} />
            <div className="trip-top">
              {/* D-day 표시 */}
              <span className="pill glass">{dday(t)}</span>
              {/* 수정/삭제 버튼 영역 (클릭이 카드로 전파되지 않게 막음) */}
              <span className="trip-acts" onClick={e => e.stopPropagation()}>
                {/* 수정 버튼 */}
                <button type="button" className="btn glass" aria-label={`${t.name} 수정`} onClick={() => p.onEdit(t)}><Icon d={I.edit} size={15} /></button>
                {/* 삭제 버튼 (확인 후 onDelete 호출) */}
                <Del onDelete={() => p.onDelete(t.id)} />
              </span>
            </div>
            {/* 카드 하단 정보 */}
            <div className="trip-info">
              {/* 도시명 */}
              <p className="eyebrow">{where(t)}</p>
              {/* 여행 이름 */}
              <h3>{t.name}</h3>
              {/* 요약 정보 */}
              <Stats t={t} />
            </div>
          </article>
        ))}
        {/* 새 여행 만들기 카드 버튼 */}
        <button type="button" className="trip-new" onClick={p.onNew}><Icon d={I.plus} size={22} />새 여행 만들기</button>
      </div>

      {/* 하단 푸터 */}
      <footer className="home-foot">
        {/* 저장 방식 안내 문구 */}
        <p>여행·일정·보관함은 내 계정에 자동 저장되어 다른 기기에서도 이어서 볼 수 있어요. 장소는 ID만 저장하고 이름·평점은 열 때마다 다시 불러와요.</p>
        <div className="chips">
          {/* JSON 내보내기 버튼 */}
          <button type="button" className="btn" onClick={p.onExport}>JSON 내보내기</button>
          {/* 가져오기 버튼: 숨겨진 파일 input 을 대신 클릭 (?. = null-safe) */}
          <button type="button" className="btn" onClick={() => file.current?.click()}>JSON 가져오기</button>
          {/* 숨겨진 파일 선택 input. ref 로 위 버튼에서 접근 */}
          <input ref={file} type="file" accept="application/json,.json" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) p.onImport(f); e.target.value = '' }} />
        </div>
        {/* 가져오기 결과 알림 (있을 때만, ok 여부로 스타일 분기) */}
        {p.notice && <p className={p.notice.ok ? 'ok' : 'error'} role="status">{p.notice.text}</p>}
      </footer>
    </div>
  )
}

/** D-day 표시: 시작일까지 카운트다운하거나 여행의 현재 상태를 알려준다. */
// 여행 시작일까지 남은 일수/상태 문자열을 반환
function dday(t: Trip) {
  // 현재 시각
  const now = new Date()
  // 로컬 시간대 기준 오늘 날짜(YYYY-MM-DD) 문자열
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  // 오늘~시작일 사이 남은 일수
  const left = dayCount(today, t.start) - 1
  // 남았으면 D-n, 종료 전이면 여행 중, 아니면 다녀온 여행
  return left > 0 ? `D-${left}` : today <= t.end ? '여행 중' : '다녀온 여행'
}
// 여행 요약(기간/일수/장소 수) 컴포넌트. { t } 는 props 구조분해
// 카드에 표시할 여행지: '국가 · 도시' (국가가 없으면 도시만)
const where = (t: Trip) => [t.country, t.city].filter(Boolean).join(' · ')

function Stats({ t }: { t: Trip }) {
  return (
    <ul className="pills">
      {/* 기간 */}
      <li>{fmtPeriod(t.start, t.end)}</li>
      {/* 일차 수 */}
      <li>{t.days.length}일</li>
      {/* 모든 일차를 평탄화(flatMap)하고 장소만 필터링해 개수 표시 */}
      <li>{t.days.flat().filter(i => i.kind === 'place').length}곳</li>
    </ul>
  )
}

// 여행 생성/수정 다이얼로그 컴포넌트 (trip 이 있으면 수정, 없으면 신규)
function TripDialog({ trip, onClose, onSave }: { trip?: Trip; onClose: () => void; onSave: (f: TripForm) => void }) {
  // <dialog> DOM 참조
  const ref = useRef<HTMLDialogElement>(null)
  // 오늘 날짜 문자열 (기본값용)
  const today = new Date().toISOString().slice(0, 10)
  // 폼 입력 상태들: 이름 (수정이면 기존값, 아니면 빈 문자열)
  const [name, setName] = useState(trip?.name ?? '')
  // 도시 상태
  const [city, setCity] = useState(trip?.city ?? '')
  // 국가 (선택 입력)
  const [country, setCountry] = useState(trip?.country ?? '')
  // 시작일 상태 (기본 오늘)
  const [start, setStart] = useState(trip?.start ?? today)
  // 종료일 상태 (기본 오늘+2일)
  const [end, setEnd] = useState(trip?.end ?? addDays(today, 2))
  // 줄어든 기간 때문에 밀려난 일정을 옮길 일차 인덱스
  const [moveTo, setMoveTo] = useState(0)
  // 폼 에러 메시지 상태
  const [err, setErr] = useState('')
  // 마운트 시 모달로 열기 (@PostConstruct)
  useEffect(() => { ref.current?.showModal() }, [])

  // 날짜가 유효하고 종료>=시작이면 일수, 아니면 0
  const n = isDate(start) && isDate(end) && end >= start ? dayCount(start, end) : 0
  // 기간이 줄어 범위 밖이 된 일정 개수 계산 (없으면 0)
  const overflow = trip && n > 0 && n < trip.days.length ? trip.days.slice(n).flat().length : 0
  // 폼 제출 핸들러
  const submit = (e: FormEvent) => {
    // 브라우저 기본 제출(페이지 이동) 막기
    e.preventDefault()
    // 날짜 범위 오류 검증
    if (!n) { setErr('종료일은 시작일과 같거나 뒤여야 해요.'); return }
    // 최대 60일 검증
    if (n > 60) { setErr('여행 기간은 최대 60일까지예요.'); return }
    // 검증 통과: 공백 제거한 값들로 부모의 onSave 호출
    onSave({ name: name.trim(), city: city.trim(), country: country.trim(), start, end, moveTo: Math.min(moveTo, n - 1) })
  }
  return (
    // 네이티브 모달 다이얼로그 (닫히면 onClose 콜백)
    <dialog ref={ref} className="dialog" onClose={onClose}>
      {/* 폼: 제출 시 submit 호출 */}
      <form className="form" onSubmit={submit}>
        {/* 제목: 수정/신규 분기 */}
        <h2>{trip ? '여행 수정' : '새 여행'}</h2>
        {/* 이름 입력: value+onChange 로 상태와 양방향 동기화 */}
        <label className="field"><span>여행 이름</span><input value={name} onChange={e => setName(e.target.value)} placeholder="간사이 3일 여행" maxLength={100} required /></label>
        {/* 도시 입력 */}
        <label className="field"><span>여행 도시</span><input value={city} onChange={e => setCity(e.target.value)} placeholder="오사카 · 교토" required /></label>
        {/* 국가 입력 (선택) */}
        <label className="field"><span>국가 (선택)</span><input value={country} onChange={e => setCountry(e.target.value)} placeholder="일본" maxLength={60} /></label>
        {/* 시작/종료일 2열 배치 */}
        <div className="grid2">
          {/* 시작일: 종료일이 더 앞서면 종료일도 같이 맞춤 */}
          <label className="field"><span>시작일</span><input type="date" value={start} onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} required /></label>
          {/* 종료일: 최소값은 시작일 */}
          <label className="field"><span>종료일</span><input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} required /></label>
        </div>
        {/* 생성될 일수 안내 (유효할 때만) */}
        {n > 0 && <p className="hint">양 끝 날짜 포함 <b>{n}일</b> 일정이 만들어져요.</p>}
        {/* 범위를 벗어난 일정이 있으면 옮길 날짜 선택 UI 표시 */}
        {overflow > 0 && (
          <label className="field warn">
            {/* 경고 문구 */}
            <span>기간이 줄어 {n + 1}일차 이후 일정 {overflow}개가 범위를 벗어나요. 옮길 날짜를 골라주세요.</span>
            {/* 옮길 일차 선택 드롭다운 (+ 는 문자열→숫자 변환) */}
            <select value={Math.min(moveTo, n - 1)} onChange={e => setMoveTo(+e.target.value)}>
              {/* n 개의 옵션을 생성 (IntStream.range 와 유사) */}
              {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{i + 1}일차 · {addDays(start, i)}</option>)}
            </select>
          </label>
        )}
        {/* 에러가 있으면 표시 */}
        {err && <p className="error" role="alert">{err}</p>}
        {/* 버튼 영역 */}
        <div className="form-actions">
          {/* 취소 버튼 */}
          <button type="button" className="btn" onClick={onClose}>취소</button>
          {/* 저장 버튼 (type 생략 시 submit) */}
          <button className="btn primary">저장</button>
        </div>
      </form>
    </dialog>
  )
}
