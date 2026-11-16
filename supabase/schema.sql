-- Supabase SQL Editor 에서 실행. 앱 상태(AppState)의 trips 를 행 단위 JSONB 로 영속화한다.
create table if not exists public.trips (
  id         text primary key,                                  -- 앱이 만든 trip id
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,                                    -- Trip 객체 전체 (days/flights/stays/...)
  updated_at timestamptz not null default now()
);
create index if not exists trips_owner_idx on public.trips(owner_id);

-- RLS: 본인 행만 접근 (Java 의 메서드 보안 @PreAuthorize 를 DB 레벨로 내린 것). 로그인(Auth) 도입 전에는 조회 결과가 비어 있다.
alter table public.trips enable row level security;
create policy "own trips" on public.trips for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
