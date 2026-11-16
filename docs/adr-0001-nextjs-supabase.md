# ADR-0001: Vite SPA → Next.js(App Router) + Supabase

**Status:** Accepted

## Context
localStorage 저장은 기기/브라우저에 묶여 지속성이 없다. 목데이터(데모 모드)는 제거했다.

## Decision
- Next.js 16 (App Router, Turbopack 기본). 기존 SPA 는 `ClientApp` 에서 CSR 로 유지.
- Supabase(Postgres + RLS + Auth). 서버 API 는 `src/app/api/v1/*` Route Handler (URL 버저닝).
- 계층: route(=Controller) → lib/supabase(=Repository/DataSource). 비즈니스 로직이 생기면 `src/server/*Service.ts` 추가.

## Consequences
- 쉬워짐: 다기기 동기화, RLS 기반 권한.
- 완료: Supabase Auth(이메일+비밀번호), 정규화 스키마 + RLS, `store.ts` 의 DB 동기화. localStorage 는 첫 로그인 때 한 번 읽어 계정으로 옮기는 용도로만 남는다.

## 추가 결정 (데이터 접근)
- **브라우저 → Supabase 직접 호출 + RLS.** 화면이 전부 클라이언트 렌더(SPA)라 Server Action 을 한 겹 더 두지 않았다. 권한은 DB 의 RLS 가 강제하므로 클라이언트 코드를 믿지 않는다.
- **쓰기는 RPC 두 개(`save_trip`, `save_library`).** 여러 행이 함께 바뀌는 작업을 한 트랜잭션으로 묶기 위해서다.
- **낙관적 업데이트 + 실패 시 DB 재조회로 롤백.** 화면은 즉시 바뀌고 0.4초 뒤 변경분만 저장한다.
- **입력 검증:** 기존 `validateState`(가져오기) + DB 의 CHECK/FK/UNIQUE. Zod 는 같은 일을 하는 코드가 이미 있어 추가하지 않았다.
- **Realtime 미도입:** 한 사용자의 여러 탭 동시 편집은 마지막 저장이 이긴다. 공동 편집이 필요해지면 도입한다.
