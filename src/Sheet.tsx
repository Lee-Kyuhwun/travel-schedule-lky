// import: React 훅(useState=상태 필드+setter, useEffect=라이프사이클 콜백, useRef=렌더 간 유지되는 변수)과 타입을 가져옴
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
// import: ./logic 모듈에서 유틸 함수와 타입(=DTO/interface)을 가져옴 (Java의 import static + 클래스)
import {
  addDays, CATS, catOf, fmtDay, placeUrl, ratingLabel, saveToVault, tabelogLink, uid,
  type AppState, type Cat, type Collection, type Flight, type Item, type PlaceInfo, type PlaceRef, type Stay, type Trip,
} from './logic'
// import: 장소 캐시 모듈의 조회 함수와 Entry 타입
import { infoOf, nativeOf, retry, type Entry } from './places'
// import: 일정을 PNG 이미지로 그려주는 함수
import { renderTripImage } from './exportImage'
// import: 아이콘 상수와 Icon 컴포넌트(=재사용 뷰 조각)
import { CAT_ICON, I, Icon } from './Cover'
// import: 꾹 누르면 선택 모드로 들어가는 목록 행 컴포넌트
import { Hold } from './Hold'
// import: 영어로 내려오는 가게 설명을 한국어로 바꿔주는 훅
import { useKoText } from './translate'

// type: 문자열 리터럴 유니온 (Java enum과 유사) - 추가 화면의 탭 종류
export type AddTab = 'place' | 'memo' | 'flight' | 'stay'
// type: 시트의 모드. 'type' 필드로 구분되는 합집합 타입 (sealed interface + record와 유사)
export type SheetMode =
  // add 모드: 탭과 (선택) 수정할 항목 id. '?'는 있어도 되고 없어도 되는 필드(nullable)
  | { type: 'add'; tab: AddTab; editId?: string }
  // item 모드: 수정할 일차(day)와 항목 id
  | { type: 'item'; day: number; id: string }
  | { type: 'checklist' }
  | { type: 'budget' }
  | { type: 'export' }
// 탐색 결과 상태 DTO: status는 enum처럼 5가지 값 중 하나, items는 List<PlaceInfo>
export type Explore = { status: 'idle' | 'loading' | 'ok' | 'empty' | 'error'; title: string; items: PlaceInfo[]; message?: string }

// Props: 컴포넌트가 부모에게서 받는 입력값 (생성자 인자/DTO와 유사)
type Props = {
  // 현재 여행 데이터
  trip: Trip
  // 저장해 둔 장소 목록(보관함)
  vault: PlaceRef[]
  /** 보관함 장소를 묶는 사용자 컬렉션. */
  collections: Collection[]
  // 상태 수정 콜백: 함수를 받아 상태를 바꿔 달라고 부모에게 요청 (Consumer<BiConsumer> 느낌)
  up: (fn: (t: Trip, s: AppState) => void) => void
  // 현재 시트 모드
  mode: SheetMode
  // 모드를 바꾸는 setter 함수
  setMode: (m: SheetMode) => void
  // 시트를 닫는 콜백 (인자 없는 Runnable)
  close: () => void
  /** 휴대폰 전용: 목록을 헤더만 남기고 접어 지도를 전부 보이게 함. */
  // peek 여부 (boolean)
  peek: boolean
  // peek 토글 콜백
  onPeek: () => void
  /** 새 항목의 기본 일차: 사용자가 보고 있는 일차 탭. */
  // 현재 일차 (신규 항목 기본값)
  day: number
  // 현재 일차 setter(일차 바꾸는 함수)
  setDay: (d: number) => void
  // id로 장소 캐시를 조회 (없으면 undefined = null)
  get: (id: string) => Entry | undefined
  // 탐색 결과 상태
  explore: Explore
  // 선택된 결과 id (null 가능)
  selectedResultId: string | null
  // 결과 선택 콜백
  onSelectResult: (id: string) => void
  // 검색 재시도 콜백
  onRetrySearch: () => void
  // 검색 재시도 콜백
  /** 숙소 폼용: 현재 지도에 보이는 영역의 숙소 목록. */
  // 주변 숙소 비동기 조회 (Promise = CompletableFuture)
  nearbyStays: () => Promise<PlaceInfo[]>
  // 주변 숙소 비동기 조회 (Promise = CompletableFuture)
  /** 숙소 폼용 텍스트 검색 (장소 캐시를 이미 채워 둠). */
  // 검색 비동기 함수 (Promise<List<PlaceInfo>> 반환)
  search: (q: string) => Promise<PlaceInfo[]>
  // 항목이 추가된 뒤 부모에게 알리는 콜백
  onAdded: (day: number, id: string) => void
// 항목이 추가된 뒤 부모에게 알리는 콜백
}
// Ctx: Props에서 필요한 필드만 골라낸(Pick) 타입에 두 메서드를 더한 공유 컨텍스트
type Ctx = Pick<Props, 'trip' | 'vault' | 'collections' | 'up' | 'get' | 'day' | 'search' | 'nearbyStays'> & {
  // 항목 추가 함수 시그니처 (item, 일차, 라벨)
  addItem: (item: Item, day: number, label: string) => void
  // 하단 메시지 표시 함수
  say: (msg: string) => void
}

// 모드별 시트 제목 (Map<String,String>과 유사한 객체 상수)
const TITLES = { add: '장소 탐색 · 일정에 추가', item: '일정 수정', checklist: '준비물 체크리스트', budget: '여행 가계부', export: '일정 이미지 저장' }
// 추가 탭 목록: [키, 화면 라벨] 튜플 배열
const ADD_TABS: [AddTab, string][] = [['place', '장소'], ['memo', '메모'], ['flight', '항공편'], ['stay', '숙소']]
// 상수 (static final String)
const SRC = 'Google'

// Sheet 컴포넌트: Props를 받아 화면(JSX)을 반환하는 함수. 클래스 대신 함수로 만든 뷰
export function Sheet(p: Props) {
  // 구조분해 할당: p.trip, p.mode, p.close를 지역 변수로 꺼냄 (필드 3개를 getter로 꺼내는 것과 동일)
  const { trip, mode, close } = p
  // 상태 선언: msg(값)와 setMsg(setter). 초기값 '' (필드+setter, 값 바뀌면 화면 재렌더)
  const [msg, setMsg] = useState('')
  // 선택 일차가 범위를 벗어나지 않게 상한을 자름 (Math.min)
  const day = Math.min(p.day, trip.days.length - 1)

  // useEffect: 마운트 시 실행되는 콜백 (@PostConstruct), return 함수는 정리 (@PreDestroy). 의존성 [close]가 바뀔 때만 재실행
  useEffect(() => {
    // ESC 키를 누르면 시트를 닫는 키보드 리스너 (람다)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    // 전역 keydown 이벤트 리스너 등록
    addEventListener('keydown', onKey)
    // 정리(cleanup): 컴포넌트가 사라질 때 리스너 제거 (메모리 누수 방지)
    return () => removeEventListener('keydown', onKey)
  }, [close])

  // 하위 컴포넌트에 내려줄 공유 컨텍스트 객체 (DI로 주입하는 서비스 묶음과 유사)
  const c: Ctx = {
    // 부모 props와 계산된 값을 필드로 채움
    trip, vault: p.vault, collections: p.collections, up: p.up, get: p.get, day, search: p.search, nearbyStays: p.nearbyStays,
    // say는 단순히 메시지 상태를 바꾸는 setter
    say: setMsg,
    // 항목 추가 로직: 람다 (item, d, label) -> {...}
    addItem: (item, d, label) => {
      // 부모에게 상태 변경 요청: 해당 일차 리스트에 항목 push (?.는 null-safe 호출)
      p.up(t => { t.days[d]?.push(item) })
      // 추가 완료를 부모에게 통지
      p.onAdded(d, item.id)
      // 템플릿 리터럴(`${}`)로 문자열 포맷해 안내 메시지 설정 (String.format)
      setMsg(`${d + 1}일차에 ‘${label}’ 추가했어요`)
    },
  }

  // JSX 반환: HTML과 비슷한 문법의 화면 정의 (템플릿 엔진 뷰)
  return (
    // <aside> 루트 요소: className은 HTML의 class, peek이면 ' peek' 클래스를 덧붙임 (삼항 연산자)
    <aside className={'sheet' + (p.peek ? ' peek' : '')} aria-label={TITLES[mode.type]}>
      {/* 헤더 영역 */}
      <header className="sheet-head">
        {/* 모드에 맞는 제목 출력 */}
        <h2>{TITLES[mode.type]}</h2>
        {/* 접기/펼치기 버튼: onClick에 콜백 연결, 아이콘은 peek 상태에 따라 선택 */}
        <button type="button" className="icon peek-btn" aria-label={p.peek ? '목록 펼치기' : '목록 접고 지도 보기'} aria-expanded={!p.peek} onClick={p.onPeek}><Icon d={p.peek ? I.up : I.down} /></button>
        {/* 닫기 버튼 */}
        <button type="button" className="icon" aria-label="닫기" onClick={close}><Icon d={I.close} /></button>
      </header>

      {/* mode가 'add'일 때만 렌더링 (조건 && 요소 = if문) */}
      {mode.type === 'add' && (
        <>
          {/* 탭 버튼 묶음 */}
          <div className="tabs seg" role="tablist" aria-label="추가할 항목">
            {/* ADD_TABS 배열을 map으로 순회해 버튼 생성 (Stream.map) */}
            {ADD_TABS.map(([k, label]) => (
              // 각 탭 버튼: key는 리스트 항목의 식별자, 선택된 탭이면 'on' 클래스
              <button key={k} type="button" role="tab" aria-selected={mode.tab === k} className={mode.tab === k ? 'on' : ''}
                onClick={() => { setMsg(''); p.setMode({ type: 'add', tab: k }) }}>{label}</button>
            ))}
          </div>
          {/* 메모/숙소 탭에서만 날짜 선택 표시 */}
          {(mode.tab === 'memo' || mode.tab === 'stay') && (
            // Field: 라벨 + 입력을 감싸는 컴포넌트. 태그 사이 내용은 children으로 전달됨
            <Field label={mode.tab === 'stay' ? '숙소를 방문 장소로 넣을 날짜' : '추가할 날짜'}>
              {/* 일차 선택 드롭다운 컴포넌트 호출 (props 전달) */}
              <DaySelect trip={trip} value={day} onChange={p.setDay} />
            </Field>
          )}
        </>
      )}

      {/* 본문 영역: 모드와 탭에 따라 서로 다른 컴포넌트를 렌더링 (switch 대신 조건식) */}
      <div className="sheet-body">
        {/* 장소 탭이면 PlaceTab 표시 */}
        {mode.type === 'add' && mode.tab === 'place' && (
          <PlaceTab c={c} explore={p.explore} selectedId={p.selectedResultId} onSelect={p.onSelectResult} onRetry={p.onRetrySearch} />
        )}
        {/* 메모 탭이면 MemoForm 표시 */}
        {mode.type === 'add' && mode.tab === 'memo' && <MemoForm c={c} />}
        {/* 항공편 탭: key가 바뀌면 컴포넌트를 새로 생성(상태 초기화) */}
        {mode.type === 'add' && mode.tab === 'flight' && <FlightForm key={mode.editId} c={c} editId={mode.editId} />}
        {/* 숙소 탭: 마찬가지로 key로 상태 초기화 */}
        {mode.type === 'add' && mode.tab === 'stay' && <StayForm key={mode.editId} c={c} editId={mode.editId} />}
        {/* 일정 항목 수정 화면 */}
        {mode.type === 'item' && <ItemEdit key={mode.id} c={c} day={mode.day} id={mode.id} close={close} />}
        {/* 체크리스트 화면 */}
        {mode.type === 'checklist' && <Checklist c={c} />}
        {/* 가계부 화면 */}
        {mode.type === 'budget' && <Budget c={c} />}
        {/* 이미지 저장 화면 */}
        {mode.type === 'export' && <ExportPanel c={c} />}
      </div>
      {/* 하단 상태 메시지 (스크린리더에 알림) */}
      <p className="sheet-msg" role="status" aria-live="polite">{msg}</p>
    </aside>
  )
}

// ---------- 공용 소품 컴포넌트 ----------
// Field 컴포넌트: label(문자열)과 children(내부 요소)을 받아 라벨로 감쌈
function Field({ label, children }: { label: string; children: ReactNode }) {
  // label 태그 안에 라벨 텍스트와 자식 요소를 출력
  return <label className="field"><span>{label}</span>{children}</label>
}
// DaySelect: 일차 선택 <select> 컴포넌트, props는 인라인 타입으로 선언
function DaySelect({ trip, value, onChange }: { trip: Trip; value: number; onChange: (d: number) => void }) {
  return (
    // select 요소: 값이 바뀌면 +문자열 → 숫자 변환 후 onChange 콜백 호출
    <select value={value} onChange={e => onChange(+e.target.value)}>
      {/* 일차 수만큼 option 생성: 'N일차 · 날짜' (_는 안 쓰는 인자) */}
      {trip.days.map((_, i) => <option key={i} value={i}>{i + 1}일차 · {fmtDay(addDays(trip.start, i))}</option>)}
    </select>
  )
}
/** 삭제 버튼: 한 번 누르면 바로 지운다 (예전의 ‘정말 삭제’ 확인 단계는 없앴다). */
// Del 컴포넌트 (export = public). label 은 기본값 '삭제'
export function Del({ onDelete, label = '삭제' }: { onDelete: () => void; label?: string }) {
  // 카드 안에서 눌러도 그 카드의 클릭 동작이 실행되지 않게 전파를 막는다
  return <button type="button" className="btn danger" onClick={e => { e.stopPropagation(); onDelete() }}>{label}</button>
}
/** 저장된 장소의 표시 이름: 사용자 별칭 우선, 다음 실시간 데이터, 마지막은 상태 문구. */
// placeName 함수: 별칭 > 실시간 정보 이름 > 상태 문구 순으로 표시할 이름 결정
export function placeName(e: Entry | undefined, alias?: string) {
  // ?? 는 null/undefined일 때만 다음 값 사용 (Optional.orElse), ?.는 null-safe 접근
  return alias ?? infoOf(e)?.name ?? (e === 'error' ? '정보를 불러오지 못한 장소' : '장소 정보 불러오는 중…')
}

// ---------- 장소: 탐색 결과 / 보관함 ----------
// PlaceCard: 장소 한 건을 카드로 그리는 컴포넌트
function PlaceCard({ c, id, selected, onSelect, inVault, picking, picked, onPick, onHold }: { c: Ctx; id: string; selected: boolean; onSelect?: () => void; inVault?: boolean; picking?: boolean; picked?: boolean; onPick?: () => void; onHold?: () => void }) {
  // 캐시에서 장소 항목 조회
  const e = c.get(id)
  // 항목에서 실제 장소 정보 추출 (없으면 undefined)
  const p = infoOf(e)
  // 보관함에서 같은 id를 찾음 (Stream.filter().findFirst())
  const ref = c.vault.find(v => v.placeId === id)
  // '일정에 추가' 폼 열림 여부 상태
  const [adding, setAdding] = useState(false)
  // 폼의 일차 상태 (초기값은 현재 일차)
  const [day, setDay] = useState(c.day)
  // 메모 상태
  const [memo, setMemo] = useState('')
  // 표시할 이름 계산
  const name = placeName(e, ref?.alias)
  // Gemini 요약은 영어로만 내려오므로 한국어로 바꿔서 보여준다 (실패하면 표시 안 함)
  const gist = useKoText(p?.gist?.text)
  // 타베로그 링크 (p가 있을 때만 계산, && 단축 평가)
  // 일본어 매장명을 이미 확인했으면 그걸로 검색한다 (없으면 가진 값으로)
  const tabelog = p && tabelogLink(p, nativeOf(id))

  // add: 폼 제출 핸들러 (람다)
  const add = (ev: FormEvent) => {
    // 폼 기본 동작(페이지 새로고침) 막기
    ev.preventDefault()
    // 일정 항목 객체 생성 후 추가. 스프레드(...)로 값이 있을 때만 필드를 조건부로 포함
    c.addItem({ id: uid(), kind: 'place', placeId: id, ...(memo.trim() ? { memo: memo.trim() } : {}) }, day, name)
    // 추가 후 폼 닫고 입력값 초기화
    setAdding(false); setMemo('')
  }
  return (
    // 카드 루트 <li>: 선택되면 'sel' 클래스
    <Hold id={'rc-' + id} className={'pcard' + (selected ? ' sel' : '') + (picked ? ' picked' : '')} onHold={onHold}>
      <button type="button" className="pcard-main" onClick={picking ? onPick : onSelect} aria-pressed={picking ? !!picked : selected}>
        {/* 카테고리 아이콘 (없으면 'other') */}
        <span className="tile"><Icon d={CAT_ICON[p?.cat ?? 'other']} /></span>
        {/* 장소 이름 */}
        <b>{name}</b>
        {/* 장소 정보가 있을 때만 카테고리·주소 출력 */}
        {p && <small>{catOf(p.cat)?.label ?? '장소'} · {p.address}</small>}
        {/* 평점 라벨 (평점이 없으면 'none' 클래스) */}
        {p && <small className={'rating' + (p.rating == null ? ' none' : '')}>{ratingLabel(p)}</small>}
        {/* Gemini 후기 요약: 목록에서도 무엇을 하는 집인지 보여준다 (한국어만) */}
        {gist && <small className="pcard-gist">{gist}</small>}
      </button>
      {/* 로딩 실패 시 에러 문구와 재시도 버튼 */}
      {e === 'error' && <p className="error">장소 정보를 불러오지 못했어요. <button type="button" className="link" onClick={() => retry(id)}>다시 시도</button></p>}
      {/* 카드 하단 액션 영역 (선택 모드에서는 체크박스만) */}
      <div className="pcard-acts">
        {picking ? <input type="checkbox" checked={!!picked} onChange={onPick} aria-label={`${name} 선택`} /> : <>
        {/* 외부 링크 묶음 */}
        <span className="pcard-links">
          {/* Google 지도 링크 (새 탭으로 열기) */}
          {p && <a className="link" href={placeUrl(p)} target="_blank" rel="noreferrer">Google 지도에서 보기</a>}
          {/* 타베로그 링크가 있을 때만 표시 */}
          {tabelog && <a className="link" href={tabelog} target="_blank" rel="noreferrer">타베로그에서 확인</a>}
        </span>
        {/* 보관함 저장/해제 토글 버튼 */}
        <button type="button" className={'btn' + (ref ? ' on' : '')} aria-pressed={!!ref}
          onClick={() => c.up((_, s) => {
            if (!ref) { saveToVault(s.vault, { placeId: id }); return }
            // 보관함에서 빼면 컬렉션에서도 함께 뺀다 (DB 의 FK cascade 와 같은 규칙)
            s.vault = s.vault.filter(v => v.placeId !== id)
            s.collections.forEach(k => { k.placeIds = k.placeIds.filter(x => x !== id) })
          })}>
          {/* 저장 여부에 따라 문구 변경 */}
          {ref ? '저장됨' : '보관함에 저장'}
        </button>
        {/* 일정 추가 폼 열고 닫기 토글 (setAdding에 함수를 넘기면 이전 값 기반 갱신) */}
        <button type="button" className="btn strong" aria-expanded={adding} onClick={() => { setDay(c.day); setAdding(a => !a) }}>일정에 추가</button>
        </>}
      </div>
      {/* adding이 true일 때만 폼 표시 */}
      {/* 보관함 목록에서만: 장소별 내 메모와 컬렉션 지정 */}
      {inVault && ref && (
        <div className="vault-extra">
          <Field label="내 메모">
            <input defaultValue={ref.note ?? ''} maxLength={2000} placeholder="예: 예약 필수, 현금만 가능"
              onBlur={ev => {
                // 입력란을 벗어날 때 값이 바뀌었으면 저장
                const n = ev.target.value.trim()
                if (n !== (ref.note ?? '')) c.up((_, s) => { const v = s.vault.find(v => v.placeId === id); if (v) { if (n) v.note = n; else delete v.note } })
              }} />
          </Field>
          {c.collections.length > 0 && (
            <div className="chips" role="group" aria-label={`${name} 컬렉션`}>
              {c.collections.map(k => {
                const on = k.placeIds.includes(id)
                return (
                  <button key={k.id} type="button" className={'btn' + (on ? ' on' : '')} aria-pressed={on}
                    onClick={() => c.up((_, s) => { const x = s.collections.find(x => x.id === k.id); if (x) x.placeIds = on ? x.placeIds.filter(v => v !== id) : [...x.placeIds, id] })}>
                    {k.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      {adding && (
        // 추가 폼: 제출 시 add 호출
        <form className="form add-form" onSubmit={add}>
          {/* 2열 그리드 */}
          {/* 날짜 선택 (범위 초과 방지) */}
          <Field label="날짜"><DaySelect trip={c.trip} value={Math.min(day, c.trip.days.length - 1)} onChange={setDay} /></Field>
          {/* 메모 입력 필드 */}
          <Field label="메모 (선택)"><input value={memo} onChange={ev => setMemo(ev.target.value)} placeholder="예약 번호, 주문할 메뉴 등" /></Field>
          {/* 폼 버튼 영역 */}
          <div className="form-actions">
            {/* 취소 버튼: 폼 닫기 */}
            <button type="button" className="btn" onClick={() => setAdding(false)}>취소</button>
            {/* 제출 버튼 (button 기본 type=submit) */}
            <button className="btn primary">이 날짜에 추가</button>
          </div>
        </form>
      )}
    </Hold>
  )
}

// PlaceTab: 탐색 결과 / 보관함 전환 탭 컴포넌트
function PlaceTab({ c, explore, selectedId, onSelect, onRetry }: { c: Ctx; explore: Explore; selectedId: string | null; onSelect: (id: string) => void; onRetry: () => void }) {
  // 현재 보는 목록 상태 ('results' 또는 'vault')
  const [view, setView] = useState<'results' | 'vault'>('results')
  // explore가 바뀔 때마다 실행되는 콜백: 결과 탭으로 되돌림
  useEffect(() => setView('results'), [explore]) // 새 검색이 오면 항상 결과 탭을 앞으로 보여줌
  return (
    <>
      {/* 서브 탭 버튼 묶음 */}
      <div className="tabs sub" role="tablist" aria-label="장소 목록">
        {/* 탐색 결과 탭 버튼 */}
        <button type="button" role="tab" aria-selected={view === 'results'} className={view === 'results' ? 'on' : ''} onClick={() => setView('results')}>탐색 결과 {explore.items.length || ''}</button>
        {/* 보관함 탭 버튼 */}
        <button type="button" role="tab" aria-selected={view === 'vault'} className={view === 'vault' ? 'on' : ''} onClick={() => setView('vault')}>보관함 {c.vault.length}</button>
      </div>

      {/* 결과 탭일 때만 렌더링 */}
      {view === 'results' && (
        <>
          {/* idle: 안내 문구 */}
          {explore.status === 'idle' && <p className="empty">지도 위 검색창에서 가게·관광지·주소를 검색하거나, 지도를 움직인 뒤 <b>이 지역 찾기</b> 버튼을 눌러보세요.</p>}
          {/* loading: 로딩 문구 */}
          {explore.status === 'loading' && <p className="empty" role="status">{explore.title} 찾는 중…</p>}
          {/* empty: 결과 없음 문구 */}
          {explore.status === 'empty' && <p className="empty">{explore.title} 결과가 없어요. 지도를 옮기거나 다른 검색어·카테고리로 찾아보세요.</p>}
          {/* error: 에러 문구와 재시도 버튼 */}
          {explore.status === 'error' && (
            <div className="empty" role="alert">
              <p className="error">장소를 불러오지 못했어요. {explore.message}</p>
              <button type="button" className="btn" onClick={onRetry}>다시 시도</button>
            </div>
          )}
          {/* ok: 결과 목록 출력 */}
          {explore.status === 'ok' && (
            <>
              {/* 결과 제목과 출처 안내 */}
              <p className="hint"><b>{explore.title}</b> · 평점·평가 수 출처: Google</p>
              {/* 결과를 PlaceCard로 변환해 목록 출력 (map = Stream.map) */}
              <ul className="list">{explore.items.map(p => <PlaceCard key={p.id} c={c} id={p.id} selected={p.id === selectedId} onSelect={() => onSelect(p.id)} />)}</ul>
            </>
          )}
        </>
      )}

      {/* 보관함 탭: 비어있지 않으면 목록, 비어있으면 안내 (삼항 연산자) */}
      {view === 'vault' && <VaultView c={c} />}
    </>
  )
}

// ---------- 메모 ----------
// MemoForm: 메모 추가 폼
/** 보관함: 카테고리·컬렉션 필터, 컬렉션 만들기/삭제, 장소별 메모. */
function VaultView({ c }: { c: Ctx }) {
  // 선택한 카테고리 ('' = 전체)
  const [cat, setCat] = useState<Cat | ''>('')
  // 선택한 컬렉션 id ('' = 전체)
  const [col, setCol] = useState('')
  // 새 컬렉션 이름 입력값
  const [name, setName] = useState('')
  const active = c.collections.find(x => x.id === col)
  // 카테고리는 저장하지 않고 방금 불러온 장소 정보로 걸러낸다 (Google 데이터 비저장 원칙)
  const list = c.vault.filter(v => (!cat || infoOf(c.get(v.placeId))?.cat === cat) && (!active || active.placeIds.includes(v.placeId)))
  // 선택 삭제 모드와 고른 장소 id
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  // 한 장소를 고르거나 해제
  const togglePick = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  // 꾹 누르면 선택 모드로 들어가면서 그 장소를 고른다
  const startPick = (id: string) => { setPicking(true); setPicked(p => (p.includes(id) ? p : [...p, id])) }
  // 고른 장소를 보관함에서 한 번에 지운다 (컬렉션에서도 함께 제거)
  const removePicked = () => {
    if (!picked.length) return
    c.up((_, s) => {
      s.vault = s.vault.filter(v => !picked.includes(v.placeId))
      s.collections.forEach(k => { k.placeIds = k.placeIds.filter(x => !picked.includes(x)) })
    })
    setPicking(false); setPicked([])
  }
  const create = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    // 같은 이름은 DB 의 unique 제약에 걸리므로 미리 막는다
    if (c.collections.some(x => x.name === n)) { c.say('같은 이름의 컬렉션이 이미 있어요'); return }
    const id = uid()
    c.up((_, s) => { s.collections.push({ id, name: n, placeIds: [] }) })
    setName(''); setCol(id)
    c.say(`‘${n}’ 컬렉션을 만들었어요. 장소 카드에서 눌러 담아보세요`)
  }
  if (!c.vault.length) return <p className="empty">보관함이 비어 있어요. 탐색 결과에서 <b>보관함에 저장</b>을 눌러보세요.</p>
  return (
    <>
      <div className="vault-tools">
        <div className="grid2">
          <Field label="카테고리">
            <select value={cat} onChange={e => setCat(e.target.value as Cat | '')}>
              <option value="">전체</option>
              {CATS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="컬렉션">
            <select value={active ? col : ''} onChange={e => setCol(e.target.value)}>
              <option value="">전체</option>
              {c.collections.map(k => <option key={k.id} value={k.id}>{k.name} ({k.placeIds.length})</option>)}
            </select>
          </Field>
        </div>
        <form className="inline" onSubmit={create}>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="새 컬렉션 (예: 오사카 맛집)" aria-label="새 컬렉션 이름" />
          <button className="btn">컬렉션 만들기</button>
          {active && <Del label="컬렉션 삭제" onDelete={() => { c.up((_, s) => { s.collections = s.collections.filter(x => x.id !== active.id) }); setCol('') }} />}
        </form>
        {/* 여러 장소를 골라 한 번에 삭제 */}
        <div className="form-actions">
          {picking ? (
            <>
              <Del label={`선택 ${picked.length}개 삭제`} onDelete={removePicked} />
              <button type="button" className="btn" onClick={() => { setPicking(false); setPicked([]) }}>취소</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setPicking(true)}>여러 개 선택</button>
          )}
        </div>
      </div>
      {list.length
        ? <ul className="list">{list.map(v => <PlaceCard key={v.placeId} c={c} id={v.placeId} selected={false} inVault picking={picking} picked={picked.includes(v.placeId)} onPick={() => togglePick(v.placeId)} onHold={() => startPick(v.placeId)} />)}</ul>
        : <p className="empty">조건에 맞는 저장 장소가 없어요.</p>}
    </>
  )
}

function MemoForm({ c }: { c: Ctx }) {
  // 입력 텍스트 상태
  const [text, setText] = useState('')
  // 제출 핸들러
  const submit = (e: FormEvent) => {
    // 폼 기본 동작 방지
    e.preventDefault()
    // 공백만 있으면 중단 (early return)
    if (!text.trim()) return
    // 메모 항목 추가 (trim = 앞뒤 공백 제거)
    c.addItem({ id: uid(), kind: 'memo', text: text.trim() }, c.day, '메모')
    // 입력값 초기화
    setText('')
  }
  return (
    // 폼 렌더링
    <form className="form" onSubmit={submit}>
      {/* 메모 입력 textarea (required = 필수 입력) */}
      <Field label="메모"><textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="예: 점심 예약 12:30, 우산 챙기기" required /></Field>
      {/* 안내 문구 */}
      <p className="hint">그날 맨 끝에 추가돼요. 위·아래 버튼이나 드래그로 장소 사이에 옮길 수 있어요.</p>
      {/* 제출 버튼 */}
      <div className="form-actions"><button className="btn primary">메모 추가</button></div>
    </form>
  )
}

// ---------- 항공편 ----------
// FlightForm: 항공편 등록/수정 폼. editId는 선택(nullable) 인자
function FlightForm({ c, editId }: { c: Ctx; editId?: string }) {
  // 빈 폼 기본값 객체
  const blank = { no: '', from: '', depDate: c.trip.start, depTime: '', to: '', arrDate: c.trip.start, arrTime: '' }
  // 수정 중인 항공편 id 상태 (없으면 null)
  const [edit, setEdit] = useState(editId ?? null)
  // 폼 값 상태: 초기값은 함수로 지연 계산(수정 대상 있으면 그것, 없으면 blank)
  const [f, setF] = useState<Omit<Flight, 'id'>>(() => c.trip.flights.find(x => x.id === editId) ?? blank)
  // 에러 메시지 상태
  const [err, setErr] = useState('')
  // 필드 설정 함수: 불변 객체 복사({...o})로 갱신, 출발일이 도착일보다 늦으면 도착일도 맞춤
  const set = (k: keyof typeof f, v: string) => setF(o => ({ ...o, [k]: v, ...(k === 'depDate' && o.arrDate < v ? { arrDate: v } : {}) }))

  // 제출 핸들러
  const submit = (e: FormEvent) => {
    // 새로고침 방지
    e.preventDefault()
    // 서로 다른 시간대의 현지 시각이라 도착일이 출발일보다 최대 하루까지 빠를 수 있음(그 이상은 불가).
    // 도착일이 출발일보다 하루 넘게 빠르면 에러 표시 후 종료 (검증)
    if (f.arrDate < addDays(f.depDate, -1)) { setErr('도착 날짜가 출발 날짜보다 너무 이릅니다.'); return }
    // 저장할 항공편 객체 생성: 편명·공항 코드는 trim 후 대문자
    const v: Flight = { ...f, id: edit ?? uid(), no: f.no.trim().toUpperCase(), from: f.from.trim().toUpperCase(), to: f.to.trim().toUpperCase() }
    // 상태 수정: 같은 id 있으면 교체(update), 없으면 추가(insert)
    c.up(t => { const i = t.flights.findIndex(x => x.id === v.id); if (i < 0) t.flights.push(v); else t.flights[i] = v })
    // 완료 메시지 표시
    c.say(`${v.no} ${edit ? '수정' : '등록'}했어요`)
    // 폼 상태 초기화
    setEdit(null); setF(blank); setErr('')
  }
  // 렌더링: <>...</>는 부모 없이 여러 요소를 묶는 Fragment
  return (
    <>
      {/* 항공편 입력 폼 */}
      <form className="form" onSubmit={submit}>
        {/* 편명 입력 */}
        <Field label="편명"><input value={f.no} onChange={e => set('no', e.target.value)} placeholder="KE723" required /></Field>
        {/* 3열 그리드 (출발 정보) */}
        <div className="grid3">
          {/* 출발 공항 입력 */}
          <Field label="출발 공항"><input value={f.from} onChange={e => set('from', e.target.value)} placeholder="ICN" required /></Field>
          {/* 출발 날짜 입력 */}
          <Field label="출발 날짜 (현지)"><input type="date" value={f.depDate} onChange={e => set('depDate', e.target.value)} required /></Field>
          {/* 출발 시각 입력 */}
          <Field label="출발 시각"><input type="time" value={f.depTime} onChange={e => set('depTime', e.target.value)} required /></Field>
        </div>
        {/* 3열 그리드 (도착 정보) */}
        <div className="grid3">
          {/* 도착 공항 입력 */}
          <Field label="도착 공항"><input value={f.to} onChange={e => set('to', e.target.value)} placeholder="KIX" required /></Field>
          {/* 도착 날짜 입력 */}
          <Field label="도착 날짜 (현지)"><input type="date" value={f.arrDate} onChange={e => set('arrDate', e.target.value)} required /></Field>
          {/* 도착 시각 입력 */}
          <Field label="도착 시각"><input type="time" value={f.arrTime} onChange={e => set('arrTime', e.target.value)} required /></Field>
        </div>
        {/* 에러가 있을 때만 출력 */}
        {err && <p className="error" role="alert">{err}</p>}
        {/* 폼 버튼 영역 */}
        <div className="form-actions">
          {/* 수정 중이면 '새로 입력' 버튼으로 초기화 */}
          {edit && <button type="button" className="btn" onClick={() => { setEdit(null); setF(blank) }}>새로 입력</button>}
          {/* 제출 버튼: 수정/등록에 따라 문구 변경 */}
          <button className="btn primary">{edit ? '항공편 저장' : '항공편 등록'}</button>
        </div>
      </form>
      {/* 등록된 항공편 목록 */}
      <ul className="list">
        {/* 항공편마다 행 생성 (map) */}
        {c.trip.flights.map(x => (
          // 수정 중인 항목이면 'sel' 클래스
          <li key={x.id} className={'place-row' + (x.id === edit ? ' sel' : '')}>
            {/* 편명과 출발·도착 요약 */}
            <div><b>{x.no}</b><small>{x.from} {fmtDay(x.depDate)} {x.depTime} → {x.to} {fmtDay(x.arrDate)} {x.arrTime}</small></div>
            {/* 수정 버튼: 해당 항공편을 폼에 채움 */}
            <button type="button" className="btn" onClick={() => { setEdit(x.id); setF(x) }}>수정</button>
            {/* 삭제 버튼: 목록에서 제거(filter)하고 수정 중이었다면 폼 초기화 */}
            <Del onDelete={() => { c.up(t => { t.flights = t.flights.filter(y => y.id !== x.id) }); if (edit === x.id) { setEdit(null); setF(blank) } }} />
          </li>
        ))}
      </ul>
    </>
  )
}

// ---------- 숙소: 장소 검색으로 고른 뒤 체크인·체크아웃 ----------
// StayForm: 숙소 검색 후 체크인/체크아웃 등록 폼
function StayForm({ c, editId }: { c: Ctx; editId?: string }) {
  // 수정 대상 숙소를 찾음 (없으면 undefined)
  const init = c.trip.stays.find(x => x.id === editId)
  // 수정 중인 숙소 id 상태
  const [edit, setEdit] = useState(editId ?? null)
  // 선택한 장소 id 상태
  const [placeId, setPlaceId] = useState(init?.placeId ?? '')
  // 검색어 상태
  const [q, setQ] = useState('')
  // 검색 결과 상태 (null=아직 검색 안 함)
  const [found, setFound] = useState<PlaceInfo[] | null>(null)
  // 검색 중 여부 (중복 클릭 방지)
  const [busy, setBusy] = useState(false)
  // 체크인 날짜 상태
  const [checkIn, setCheckIn] = useState(init?.checkIn ?? c.trip.start)
  // 체크아웃 날짜 상태
  const [checkOut, setCheckOut] = useState(init?.checkOut ?? c.trip.end)
  // 에러 메시지 상태
  const [err, setErr] = useState('')
  // useRef: 렌더링 간 유지되는 변수 (재렌더 유발 없음). 요청 번호 카운터로 사용
  const req = useRef(0)

  // load: 폼을 주어진 숙소(없으면 빈 값)로 초기화하는 함수
  const load = (s?: Stay) => {
    // 수정 id, 장소, 결과, 검색어 초기화
    setEdit(s?.id ?? null); setPlaceId(s?.placeId ?? ''); setFound(null); setQ('')
    // 체크인/체크아웃 초기화 및 에러 제거
    setCheckIn(s?.checkIn ?? c.trip.start); setCheckOut(s?.checkOut ?? c.trip.end); setErr('')
  }
  // find: 비동기 검색 함수 (async = CompletableFuture 반환, await = join)
  const find = async (nearby = false) => {
    // 일반 검색인데 검색어가 비어 있으면 중단
    if (!nearby && !q.trim()) return
    // 요청 번호 증가 (최신 요청만 반영하기 위한 장치)
    const my = ++req.current
    // 검색 중 표시 및 에러 초기화
    setBusy(true); setErr('')
    // try-catch-finally는 Java와 동일
    try {
      // nearby이면 주변 숙소, 아니면 검색어로 조회 (await로 완료 대기)
      const list = nearby ? await c.nearbyStays() : await c.search(q.trim())
      // 그 사이 새 요청이 없었을 때만 결과 반영 (오래된 응답 무시)
      if (my === req.current) setFound(list)
    // 예외 처리
    } catch (e) {
      // 최신 요청일 때만 에러 메시지 설정
      if (my === req.current) setErr(`숙소를 검색하지 못했어요. ${(e as Error).message}`)
    // finally: 최신 요청이면 검색 중 표시 해제
    } finally { if (my === req.current) setBusy(false) }
  }
  // 제출 핸들러
  const submit = (e: FormEvent) => {
    // 기본 동작 방지
    e.preventDefault()
    // 숙소 미선택 시 에러 후 종료
    if (!placeId) { setErr('먼저 숙소를 검색해서 선택해주세요.'); return }
    // 체크아웃이 체크인보다 빠르면 에러 후 종료
    if (checkOut < checkIn) { setErr('체크아웃이 체크인보다 빠릅니다.'); return }
    // 저장할 숙소 객체 생성 (기존 별칭은 같은 장소일 때만 유지)
    const v: Stay = { id: edit ?? uid(), placeId, ...(init?.placeId === placeId && init.alias ? { alias: init.alias } : {}), checkIn, checkOut }
    // 있으면 교체, 없으면 추가 (upsert)
    c.up(t => { const i = t.stays.findIndex(x => x.id === v.id); if (i < 0) t.stays.push(v); else t.stays[i] = v })
    // 완료 메시지 표시
    c.say(`‘${placeName(c.get(placeId))}’ ${edit ? '수정' : '등록'}했어요`)
    // 폼 초기화
    load()
  }
  // 렌더링 시작
  return (
    <>
      {/* 숙소 폼 */}
      <form className="form" onSubmit={submit}>
        {/* 검색 입력 필드 */}
        <Field label="숙소 검색 (호텔명 · 주소)">
          {/* 입력과 버튼을 한 줄로 배치 */}
          <div className="inline">
            {/* 검색어 입력 (Enter 처리는 다음 줄) */}
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="예: 난바 호텔"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void find() } }} />
            {/* 검색 버튼: 검색 중이면 비활성화 */}
            <button type="button" className="btn" disabled={busy} onClick={() => void find()}>{busy ? '검색 중…' : '검색'}</button>
          </div>
        </Field>
        {/* 지도에 보이는 지역의 숙소 찾기 버튼 */}
        <button type="button" className="btn" disabled={busy} onClick={() => void find(true)}>지도에 보이는 지역의 숙소 찾기</button>
        {/* 검색 결과가 있으면: 결과 있음 → 목록, 없음 → 안내 문구 */}
        {found && (found.length ? (
          // 검색 결과 목록
          <ul className="list pick">
            {/* 결과마다 항목 생성 (map) */}
            {found.map(p => (
              // 리스트 항목 (key는 식별자)
              <li key={p.id}>
                {/* 클릭하면 해당 숙소 선택, 선택된 것은 'on' 클래스 */}
                <button type="button" className={'pick-row' + (p.id === placeId ? ' on' : '')} aria-pressed={p.id === placeId} onClick={() => setPlaceId(p.id)}>
                  {/* 이름·주소·평점 표시 */}
                  <b>{p.name}</b><small>{p.address}</small><small className={'rating' + (p.rating == null ? ' none' : '')}>{ratingLabel(p)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="hint">검색 결과가 없어요. 다른 이름이나 지역명을 넣어보세요.</p>)}
        {/* 선택한 숙소 이름 표시 (없으면 안내 문구) */}
        <div className="item-info"><small>선택한 숙소</small><b>{placeId ? placeName(c.get(placeId), init?.placeId === placeId ? init.alias : undefined) : '아직 선택하지 않았어요'}</b></div>
        {/* 2열 그리드 */}
        <div className="grid2">
          {/* 체크인 날짜 입력 */}
          <Field label="체크인"><input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} required /></Field>
          {/* 체크아웃 날짜 입력 (min으로 체크인 이전 선택 제한) */}
          <Field label="체크아웃"><input type="date" value={checkOut} min={checkIn} onChange={e => setCheckOut(e.target.value)} required /></Field>
        </div>
        {/* 에러가 있을 때만 출력 */}
        {err && <p className="error" role="alert">{err}</p>}
        {/* 폼 버튼 영역 */}
        <div className="form-actions">
          {/* 수정 중이면 '새로 입력' 버튼 */}
          {edit && <button type="button" className="btn" onClick={() => load()}>새로 입력</button>}
          {/* 제출 버튼: 수정/등록에 따라 문구 변경 */}
          <button className="btn primary">{edit ? '숙소 저장' : '숙소 등록'}</button>
        </div>
      </form>
      {/* 등록된 숙소 목록 */}
      <ul className="list">
        {/* 숙소마다 행 생성 (중괄호 블록이라 return 필요) */}
        {c.trip.stays.map(s => {
          // 표시할 숙소 이름 계산
          const name = placeName(c.get(s.placeId), s.alias)
          // 행 반환
          return (
            // 수정 중인 항목이면 'sel' 클래스
            <li key={s.id} className={'place-row wrap' + (s.id === edit ? ' sel' : '')}>
              {/* 이름과 체크인~체크아웃 표시 */}
              <div><b>{name}</b><small>{fmtDay(s.checkIn)} ~ {fmtDay(s.checkOut)}</small></div>
              {/* '일정에 추가' 버튼: 숙소를 방문 장소 항목으로 추가 */}
              <button type="button" className="btn strong" onClick={() => c.addItem({ id: uid(), kind: 'place', placeId: s.placeId, ...(s.alias ? { alias: s.alias } : {}) }, c.day, name)}>일정에 추가</button>
              {/* 수정 버튼: 폼에 값 채움 */}
              <button type="button" className="btn" onClick={() => load(s)}>수정</button>
              {/* 삭제 버튼: 목록에서 제거, 수정 중이었다면 폼 초기화 */}
              <Del onDelete={() => { c.up(t => { t.stays = t.stays.filter(y => y.id !== s.id) }); if (edit === s.id) load() }} />
            </li>
          )
        })}
      </ul>
    </>
  )
}

// ---------- 일정 항목 수정 ----------
// ItemEdit: 일정 항목 수정 화면. close는 닫기 콜백
function ItemEdit({ c, day, id, close }: { c: Ctx; day: number; id: string; close: () => void }) {
  // 해당 일차에서 id가 같은 항목을 찾음 (Stream.filter().findFirst())
  const item = c.trip.days[day]?.find(x => x.id === id)
  // 별칭 상태: 장소 항목일 때만 값 사용 (삼항 + ??로 null 대체)
  const [alias, setAlias] = useState(item?.kind === 'place' ? item.alias ?? '' : '')
  // 메모 상태: 장소면 memo, 메모 항목이면 text
  const [memo, setMemo] = useState(item ? (item.kind === 'place' ? item.memo ?? '' : item.text) : '')
  // 이동할 일차 상태 (기본은 현재 일차)
  const [to, setTo] = useState(day)
  // 항목이 없으면 안내 문구만 렌더링 (early return)
  if (!item) return <p className="empty">이 항목은 더 이상 없어요.</p>
  // 장소 항목이면 캐시 조회
  const e = item.kind === 'place' ? c.get(item.placeId) : undefined
  // 실제 장소 정보 추출
  const p = infoOf(e)

  // 저장 핸들러
  const save = (ev: FormEvent) => {
    // 기본 동작 방지
    ev.preventDefault()
    // 상태 수정 콜백 (이 안에서 직접 수정해도 되는 mutable 초안)
    c.up(t => {
      // 해당 일차의 항목 리스트
      const list = t.days[day]
      // 항목 인덱스 검색 (findIndex)
      const i = list.findIndex(x => x.id === id)
      // 못 찾으면 종료
      if (i < 0) return
      // 수정 대상 항목
      const it = list[i]
      // 장소 항목이면 별칭·시간·메모 갱신
      if (it.kind === 'place') {
        // 값이 있으면 설정, 없으면 필드 삭제 (delete = map.remove)
        if (alias.trim()) it.alias = alias.trim(); else delete it.alias
        // 방문 시간·체류 시간은 더 이상 쓰지 않는다 (예전에 저장된 값도 정리)
        delete it.time; delete it.stay
        // 메모도 동일하게 처리
        if (memo.trim()) it.memo = memo.trim(); else delete it.memo
      // 메모 항목이면 text만 갱신
      } else it.text = memo.trim()
      // 일차가 바뀌었다면 원래 리스트에서 제거 후 새 일차 끝에 추가
      if (to !== day && t.days[to]) { list.splice(i, 1); t.days[to].push(it) }
    })
    // 저장 후 시트 닫기
    close()
  }
  // 렌더링 시작
  return (
    // 수정 폼
    <form className="form" onSubmit={save}>
      {/* 장소 항목일 때만 표시되는 섹션 */}
      {item.kind === 'place' && (
        <>
          {/* 장소 정보 영역 */}
          <div className="item-info">
            {/* 장소 이름 */}
            <b>{placeName(e)}</b>
            {/* 카테고리와 주소 */}
            {p && <small>{catOf(p.cat)?.label ?? '장소'} · {p.address}</small>}
            {/* 평점 */}
            {p && <small className="rating">{ratingLabel(p)}</small>}
            {/* 정보가 있으면 링크들 표시 */}
            {p && (
              // 링크 묶음
              <span className="pcard-links">
                {/* Google 지도 링크 */}
                <a className="link" href={placeUrl(p)} target="_blank" rel="noreferrer">Google 지도에서 보기</a>
                {/* 타베로그 링크 (! 는 null 아님을 단언, Java엔 없는 TS 문법) */}
                {tabelogLink(p, nativeOf(p.id)) && <a className="link" href={tabelogLink(p, nativeOf(p.id))!} target="_blank" rel="noreferrer">타베로그에서 확인</a>}
              </span>
            )}
            {/* 로딩 실패 시 에러와 재시도 버튼 */}
            {e === 'error' && <p className="error">장소 정보를 불러오지 못했어요. 메모와 시간은 그대로 있어요. <button type="button" className="link" onClick={() => retry(item.placeId)}>다시 시도</button></p>}
          </div>
          {/* 별칭 입력 */}
          <Field label="별칭 (선택 · 내가 부르는 이름)"><input value={alias} onChange={ev => setAlias(ev.target.value)} placeholder="예: 첫날 저녁 라멘집" /></Field>
          {/* 일정에 있는 장소를 보관함(즐겨찾기)에 저장 */}
          <button type="button" className={'btn' + (c.vault.some(v => v.placeId === item.placeId) ? ' on' : '')} disabled={c.vault.some(v => v.placeId === item.placeId)}
            onClick={() => { c.up((_, s) => saveToVault(s.vault, { placeId: item.placeId })); c.say('보관함에 저장했어요') }}>
            {c.vault.some(v => v.placeId === item.placeId) ? '보관함에 저장됨' : '보관함에 저장'}
          </button>
        </>
      )}
      {/* 메모 입력 (메모 항목이면 필수) */}
      <Field label="메모"><textarea rows={4} value={memo} onChange={ev => setMemo(ev.target.value)} required={item.kind === 'memo'} /></Field>
      {/* 일차 변경 선택 */}
      <Field label="일차 (바꾸면 그날 맨 끝으로 이동)"><DaySelect trip={c.trip} value={to} onChange={setTo} /></Field>
      {/* 폼 버튼 영역 */}
      <div className="form-actions">
        {/* 삭제 버튼: 해당 항목 제거 후 시트 닫기 */}
        <Del onDelete={() => { c.up(t => { t.days[day] = t.days[day].filter(x => x.id !== id) }); close() }} />
        {/* 저장 버튼 */}
        <button className="btn primary">저장</button>
      </div>
    </form>
  )
}

// ---------- 준비물 ----------
// 기본 준비물 목록 상수 (static final List<String>)
const DEFAULT_CHECKS = ['여권', '항공권 (e-티켓)', '환전 · 해외결제 카드', '충전기 · 보조배터리', '상비약', 'eSIM / 로밍']
// Checklist: 준비물 체크리스트 컴포넌트
function Checklist({ c }: { c: Ctx }) {
  // 입력 텍스트 상태
  const [text, setText] = useState('')
  // 현재 준비물 목록 (별칭 변수)
  const list = c.trip.checklist
  // 추가 핸들러
  const add = (e: FormEvent) => {
    // 기본 동작 방지
    e.preventDefault()
    // 새 준비물 객체 생성 (미완료 상태)
    const v = { id: uid(), text: text.trim(), done: false }
    // 내용이 비어 있으면 중단
    if (!v.text) return
    // 목록에 추가하고 입력창 초기화
    c.up(t => { t.checklist.push(v) }); setText('')
  }
  // 렌더링 시작
  return (
    <>
      {/* 완료 개수 / 전체 개수 (filter = Stream.filter) */}
      <p className="hint">{list.filter(x => x.done).length} / {list.length} 완료</p>
      {/* 추가 폼 */}
      <form className="inline" onSubmit={add}>
        {/* 입력창 */}
        <input value={text} onChange={e => setText(e.target.value)} placeholder="준비물 추가" aria-label="준비물" />
        {/* 추가 버튼 */}
        <button className="btn primary">추가</button>
      </form>
      {/* 준비물 목록 */}
      <ul className="list">
        {/* 항목마다 행 생성 (map) */}
        {list.map(x => (
          // 행 요소
          <li key={x.id} className="place-row">
            {/* 완료되면 'done' 클래스 (취소선 등) */}
            <label className={'check' + (x.done ? ' done' : '')}>
              {/* 체크박스: 변경 시 해당 항목의 done 값을 토글 */}
              <input type="checkbox" checked={x.done} onChange={() => c.up(t => { const y = t.checklist.find(y => y.id === x.id); if (y) y.done = !y.done })} />
              {/* 준비물 텍스트 */}
              {x.text}
            </label>
            {/* 삭제 버튼: 목록에서 제거 (filter) */}
            <Del onDelete={() => c.up(t => { t.checklist = t.checklist.filter(y => y.id !== x.id) })} />
          </li>
        ))}
      </ul>
      {/* 목록이 비어 있을 때만 기본 준비물 버튼 표시 */}
      {!list.length && (
        // 클릭 시 기본 준비물을 객체로 변환(map)해 한꺼번에 추가 (push 스프레드)
        <button type="button" className="btn" onClick={() => { const items = DEFAULT_CHECKS.map(text => ({ id: uid(), text, done: false })); c.up(t => { t.checklist.push(...items) }) }}>
          기본 준비물 넣기
        </button>
      )}
    </>
  )
}

// ---------- 가계부 ----------
// 통화 코드 상수 목록
const CURRENCIES = ['KRW', 'JPY', 'USD', 'EUR', 'CNY', 'THB', 'VND']
// money: 금액을 통화 형식 문자열로 변환하는 함수 (NumberFormat = Java의 NumberFormat)
const money = (n: number, currency: string) => {
  // 지원하지 않는 통화 등 오류가 나면 단순 문자열로 대체 (try-catch)
  try { return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(n) } catch { return `${n.toLocaleString('ko-KR')} ${currency}` }
}
// Budget: 가계부 컴포넌트
function Budget({ c }: { c: Ctx }) {
  // 날짜 상태
  const [date, setDate] = useState(c.trip.start)
  // 내용 상태
  const [title, setTitle] = useState('')
  // 금액 상태 (입력값이라 문자열)
  const [amount, setAmount] = useState('')
  // 통화 상태
  const [currency, setCurrency] = useState('KRW')
  // 통화별 합계를 담는 Map (HashMap<String,Number>)
  const totals = new Map<string, number>()
  // 지출을 순회하며 통화별 합계 누적 (forEach, getOrDefault와 유사한 ??)
  c.trip.expenses.forEach(e => totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount))
  // 지출 추가 핸들러
  const add = (e: FormEvent) => {
    // 기본 동작 방지
    e.preventDefault()
    // 문자열을 숫자로 변환
    const n = Number(amount)
    // 내용이 비었거나 숫자가 아니거나 0 이하면 중단 (유효성 검사)
    if (!title.trim() || !Number.isFinite(n) || n <= 0) return
    // 새 지출 객체 생성
    const v = { id: uid(), date, title: title.trim(), amount: n, currency }
    // 목록에 추가하고 입력 초기화
    c.up(t => { t.expenses.push(v) }); setTitle(''); setAmount('')
  }
  // 렌더링 시작
  return (
    <>
      {/* 통화별 합계 영역 */}
      <div className="totals" aria-label="통화별 합계">
        {/* 합계가 있으면 통화별 표시, 없으면 안내 문구 (Map을 배열로 펼쳐 map) */}
        {totals.size ? [...totals].map(([cur, sum]) => <div key={cur}><small>{cur} 합계</small><b>{money(sum, cur)}</b></div>) : <p className="empty">지출을 입력하면 통화별 합계가 보여요.</p>}
      </div>
      {/* 지출 입력 폼 */}
      <form className="form" onSubmit={add}>
        {/* 2열 그리드 (날짜, 내용) */}
        <div className="grid2">
          {/* 날짜 입력 */}
          <Field label="날짜"><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></Field>
          {/* 내용 입력 */}
          <Field label="내용"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="라멘" required /></Field>
        </div>
        {/* 2열 그리드 (금액, 통화) */}
        <div className="grid2">
          {/* 금액 입력 (number 타입) */}
          <Field label="금액"><input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required /></Field>
          {/* 통화 선택 드롭다운 */}
          <Field label="통화"><select value={currency} onChange={e => setCurrency(e.target.value)}>{CURRENCIES.map(k => <option key={k}>{k}</option>)}</select></Field>
        </div>
        {/* 제출 버튼 */}
        <div className="form-actions"><button className="btn primary">지출 추가</button></div>
      </form>
      {/* 지출 목록 */}
      <ul className="list">
        {/* 날짜순 정렬 후 행 생성 (복사본 정렬 = Comparator + stream.sorted) */}
        {[...c.trip.expenses].sort((a, b) => a.date.localeCompare(b.date)).map(e => (
          // 행 요소
          <li key={e.id} className="place-row">
            {/* 내용과 날짜 */}
            <div><b>{e.title}</b><small>{fmtDay(e.date)}</small></div>
            {/* 금액 표시 */}
            <span className="amount">{money(e.amount, e.currency)}</span>
            {/* 삭제 버튼: 목록에서 제거 */}
            <Del onDelete={() => c.up(t => { t.expenses = t.expenses.filter(y => y.id !== e.id) })} />
          </li>
        ))}
      </ul>
    </>
  )
}

// ---------- 이미지 저장 ----------
// ExportPanel: 일정을 이미지로 저장하는 패널
function ExportPanel({ c }: { c: Ctx }) {
  // 생성된 이미지 URL 상태
  const [url, setUrl] = useState('')
  // 에러 메시지 상태
  const [err, setErr] = useState('')
  // 내보내기에는 사용자 입력 데이터만 담음. Google 장소 이름은 출력하지 않고 별칭으로 대체.
  // 라벨 함수: 별칭이 있으면 별칭, 없으면 안내 문구 (_placeId는 안 쓰는 인자 관례)
  const label = (_placeId: string, alias?: string) =>
    alias ?? 'Google 장소 (별칭을 입력하면 표시돼요)'
  // 저장 함수: d가 null이면 전체, 숫자면 해당 일차
  const save = (d: number | null) => {
    // try-catch: 이미지 생성 실패에 대비
    try {
      // 일정을 PNG(data URL)로 렌더링
      const u = renderTripImage(c.trip, d, label)
      // URL 상태 갱신 및 에러 초기화
      setUrl(u); setErr('')
      // 다운로드용 <a> 요소를 코드로 생성
      const a = document.createElement('a')
      // href에 이미지 URL 지정
      a.href = u
      // 다운로드 파일명 지정 (템플릿 리터럴)
      a.download = `${c.trip.name}-${d == null ? '전체' : `${d + 1}일차`}.png`
      // 클릭을 프로그램으로 실행해 다운로드 시작
      a.click()
      // 완료 메시지 표시
      c.say('이미지를 저장했어요')
    // 실패 시 에러 문구 설정 (catch의 e는 생략 가능)
    } catch { setErr('이미지를 만들지 못했어요. 다시 시도해주세요.') }
  }
  // 렌더링 시작
  return (
    <>
      {/* 안내 문구 (SRC가 'Google'일 때만 추가 설명) */}
      <p className="hint">날짜, 장소 순서, 방문 시간, 메모가 담긴 PNG로 저장돼요. {SRC === 'Google' && 'Google 장소 이름은 내보내지 않으니, 이미지에 표시할 이름은 일정 수정에서 별칭으로 적어주세요.'}</p>
      {/* 버튼 묶음 */}
      <div className="chips">
        {/* 전체 일정 저장 버튼 */}
        <button type="button" className="btn primary" onClick={() => save(null)}>전체 일정 저장</button>
        {/* 일차별 저장 버튼 (map) */}
        {c.trip.days.map((_, i) => <button key={i} type="button" className="btn" onClick={() => save(i)}>{i + 1}일차 저장</button>)}
      </div>
      {/* 에러가 있을 때만 출력 */}
      {err && <p className="error" role="alert">{err}</p>}
      {/* 이미지가 있으면 미리보기 표시 */}
      {url && <img className="preview" src={url} alt="저장한 일정 이미지 미리보기" />}
    </>
  )
}
