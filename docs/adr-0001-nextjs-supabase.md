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
- 다음 작업: Supabase Auth 도입 → `store.ts` 를 DB 읽기/쓰기로 교체 → localStorage 제거.
