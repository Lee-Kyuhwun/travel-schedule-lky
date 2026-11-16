-- PINLOG 초기 스키마: 여행 · 일정 · 저장한 장소 · 컬렉션 + RLS
-- Java/JPA 관점: 테이블 = @Entity, FK = @ManyToOne, RLS 정책 = DB 레벨의 @PreAuthorize.
--
-- 날짜·시간 규칙: 여행 날짜는 date, 방문/항공 시각은 "현지 벽시계 시각"(time, 타임존 없음)으로 저장한다.
--   일정의 실제 날짜 = trips.start_date + day_index 로 계산하므로 기간이 바뀌어도 어긋나지 않는다.
-- Google 약관: Place ID 만 영구 저장한다. 이름·주소·평점·좌표는 저장하지 않고 열 때마다 다시 조회한다.

-- ───────────────────────── 공통 ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── profiles (사용자 프로필) ─────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  last_trip_id uuid,                                   -- 마지막으로 연 여행 (FK 는 trips 생성 뒤 추가)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ───────────────────────── trips (여행) ─────────────────────────
create table public.trips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  city       text not null default '' check (char_length(city) <= 100),
  country    text check (char_length(country) <= 60),
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_period check (end_date >= start_date and end_date - start_date < 60)  -- 최대 60일
);
create index trips_user_idx on public.trips (user_id, start_date desc);

alter table public.profiles
  add constraint profiles_last_trip_fk foreign key (last_trip_id) references public.trips(id) on delete set null;

-- ───────────────────────── places (장소 식별자) ─────────────────────────
-- google: provider_place_id(Place ID) 만 보관. custom: 사용자가 직접 등록한 장소라 내용을 우리가 소유한다.
create table public.places (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null check (provider in ('google', 'custom')),
  provider_place_id text,
  owner_id          uuid references auth.users(id) on delete cascade,
  name              text check (char_length(name) <= 120),
  address           text check (char_length(address) <= 300),
  lat               double precision check (lat between -90 and 90),
  lng               double precision check (lng between -180 and 180),
  category          text check (category in ('restaurant','cafe','bar','bakery','shopping','sight','lodging','airport')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint places_provider_uniq unique (provider, provider_place_id),     -- 같은 외부 장소는 한 행만
  constraint places_shape check (
    (provider = 'google' and provider_place_id is not null and owner_id is null
       and name is null and address is null and lat is null and lng is null and category is null)
    or
    (provider = 'custom' and provider_place_id is null and owner_id is not null
       and name is not null and lat is not null and lng is not null)
  )
);
create index places_owner_idx on public.places (owner_id) where owner_id is not null;

-- ───────────────────────── itinerary_items (일차별 일정) ─────────────────────────
create table public.itinerary_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  day_index    int  not null check (day_index between 0 and 59),             -- 0 = 1일차
  position     int  not null check (position >= 0),                          -- 그날 안에서의 순서
  kind         text not null check (kind in ('place', 'memo')),
  place_id     uuid references public.places(id) on delete restrict,         -- 일정이 참조 중인 장소는 못 지움
  alias        text check (char_length(alias) <= 120),
  visit_time   time,                                                         -- 현지 시각
  stay_minutes int  check (stay_minutes between 1 and 1440),                 -- 예상 체류 시간
  memo         text check (char_length(memo) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint itinerary_items_order unique (trip_id, day_index, position),
  constraint itinerary_items_shape check (
    (kind = 'place' and place_id is not null)
    or (kind = 'memo' and place_id is null and memo is not null and alias is null and visit_time is null and stay_minutes is null)
  )
);
create index itinerary_items_place_idx on public.itinerary_items (place_id);

-- ───────────────────────── flights / stays / checklist / expenses ─────────────────────────
create table public.flights (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  position   int  not null check (position >= 0),
  flight_no  text not null check (char_length(flight_no) between 1 and 12),
  from_code  text not null check (char_length(from_code) between 1 and 40),
  dep_date   date not null,
  dep_time   time not null,
  to_code    text not null check (char_length(to_code) between 1 and 40),
  arr_date   date not null,
  arr_time   time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flights_order unique (trip_id, position),
  constraint flights_dates check (arr_date >= dep_date - 1)                  -- 날짜변경선 때문에 하루 전까지 허용
);

create table public.stays (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  position   int  not null check (position >= 0),
  place_id   uuid not null references public.places(id) on delete restrict,
  alias      text check (char_length(alias) <= 120),
  check_in   date not null,
  check_out  date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stays_order unique (trip_id, position),
  constraint stays_dates check (check_out >= check_in)
);
create index stays_place_idx on public.stays (place_id);

create table public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  position   int  not null check (position >= 0),
  text       text not null check (char_length(text) between 1 and 200),
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_items_order unique (trip_id, position)
);

create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  position   int  not null check (position >= 0),
  spent_on   date not null,
  title      text not null check (char_length(title) between 1 and 200),
  amount     numeric(14, 2) not null check (amount >= 0),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_order unique (trip_id, position)
);

-- ───────────────────────── saved_places (보관함 = 즐겨찾기) ─────────────────────────
create table public.saved_places (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_id   uuid not null references public.places(id) on delete restrict,
  alias      text check (char_length(alias) <= 120),
  note       text check (char_length(note) <= 2000),                         -- 장소별 사용자 메모
  position   int  not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_places_uniq unique (user_id, place_id)                    -- 같은 장소 중복 저장 방지
);
create index saved_places_place_idx on public.saved_places (place_id);

-- ───────────────────────── collections (사용자 정의 장소 묶음) ─────────────────────────
create table public.collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  position   int  not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_name_uniq unique (user_id, name)
);

create table public.collection_places (
  collection_id  uuid not null references public.collections(id) on delete cascade,
  saved_place_id uuid not null references public.saved_places(id) on delete cascade,  -- 보관함에서 빼면 컬렉션에서도 빠짐
  created_at     timestamptz not null default now(),
  primary key (collection_id, saved_place_id)
);
create index collection_places_saved_idx on public.collection_places (saved_place_id);

-- ───────────────────────── updated_at 트리거 ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','trips','places','itinerary_items','flights','stays','checklist_items','expenses','saved_places','collections']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- ───────────────────────── 가입 시 프로필 자동 생성 ─────────────────────────
-- auth.users 는 Supabase 가 관리하므로 security definer 트리거로 profiles 행을 만든다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(split_part(coalesce(new.email, ''), '@', 1), 60));
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles          enable row level security;
alter table public.trips             enable row level security;
alter table public.places            enable row level security;
alter table public.itinerary_items   enable row level security;
alter table public.flights           enable row level security;
alter table public.stays             enable row level security;
alter table public.checklist_items   enable row level security;
alter table public.expenses          enable row level security;
alter table public.saved_places      enable row level security;
alter table public.collections       enable row level security;
alter table public.collection_places enable row level security;

-- (select auth.uid()) 로 감싸면 행마다 재평가하지 않아 빠르다.
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy trips_own on public.trips for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 자식 테이블: 부모 여행의 소유자만. trips 정책은 자식을 참조하지 않으므로 재귀가 없다.
do $$
declare t text;
begin
  foreach t in array array['itinerary_items','flights','stays','checklist_items','expenses']
  loop
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (exists (select 1 from public.trips tr where tr.id = trip_id and tr.user_id = (select auth.uid())))
        with check (exists (select 1 from public.trips tr where tr.id = trip_id and tr.user_id = (select auth.uid())))
    $f$, t || '_own', t);
  end loop;
end $$;

-- places: Google 식별자 행은 로그인 사용자 모두 조회·등록 가능(내용이 Place ID 뿐). 수정·삭제는 본인 custom 행만.
create policy places_select on public.places for select to authenticated
  using (provider = 'google' or owner_id = (select auth.uid()));
create policy places_insert on public.places for insert to authenticated
  with check ((provider = 'google' and owner_id is null) or (provider = 'custom' and owner_id = (select auth.uid())));
create policy places_update on public.places for update to authenticated
  using (provider = 'custom' and owner_id = (select auth.uid()))
  with check (provider = 'custom' and owner_id = (select auth.uid()));
create policy places_delete on public.places for delete to authenticated
  using (provider = 'custom' and owner_id = (select auth.uid()));

create policy saved_places_own on public.saved_places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy collections_own on public.collections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy collection_places_own on public.collection_places for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.saved_places sp where sp.id = saved_place_id and sp.user_id = (select auth.uid()))
  );

-- ───────────────────────── 권한 ─────────────────────────
-- 비로그인(anon)은 어떤 테이블에도 접근하지 못한다. 로그인 사용자는 RLS 를 통과한 행만.
revoke all on all tables in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, delete on public.profiles from authenticated;                 -- 프로필은 트리거가 만들고 계정과 함께 지워짐

-- ───────────────────────── RPC: 여행 한 건을 트랜잭션으로 저장 ─────────────────────────
-- 일정 추가·이동·순서 변경은 여러 행이 함께 바뀌므로 한 함수(= 한 트랜잭션)에서 처리한다. (@Transactional 서비스 메서드)
-- security invoker 이므로 호출자의 RLS 가 그대로 적용된다.
create or replace function public.save_trip(p jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_trip  uuid := (p->>'id')::uuid;
  v_start date := (p->>'start')::date;
  v_end   date := (p->>'end')::date;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p->'days') <> 'array' or jsonb_array_length(p->'days') <> (v_end - v_start + 1) then
    raise exception 'days does not match trip period' using errcode = '22023';
  end if;

  insert into public.trips (id, user_id, name, city, country, start_date, end_date)
  values (v_trip, v_uid, p->>'name', coalesce(p->>'city', ''), nullif(p->>'country', ''), v_start, v_end)
  on conflict (id) do update
    set name = excluded.name, city = excluded.city, country = excluded.country,
        start_date = excluded.start_date, end_date = excluded.end_date
    where public.trips.user_id = v_uid;
  if not found then raise exception 'trip not owned by caller' using errcode = '42501'; end if;

  -- 참조할 Google 장소 식별자 행을 보장 (이미 있으면 그대로)
  insert into public.places (provider, provider_place_id)
  select distinct 'google', x.pid from (
    select it->>'placeId' as pid
      from jsonb_array_elements(p->'days') d, jsonb_array_elements(d) it
    union all
    select s->>'placeId' from jsonb_array_elements(coalesce(p->'stays', '[]'::jsonb)) s
  ) x
  where x.pid is not null and x.pid <> ''
  on conflict (provider, provider_place_id) do nothing;

  -- ponytail: 자식 행은 지우고 다시 넣는다(행의 created_at 이 갱신됨). 행 단위 이력이 필요해지면 upsert+차집합 삭제로 바꿀 것.
  delete from public.itinerary_items where trip_id = v_trip;
  insert into public.itinerary_items (id, trip_id, day_index, position, kind, place_id, alias, visit_time, stay_minutes, memo)
  select (i.it->>'id')::uuid, v_trip, (d.ord - 1)::int, (i.ord - 1)::int, i.it->>'kind', pl.id,
         case when i.it->>'kind' = 'place' then nullif(i.it->>'alias', '') end,
         case when i.it->>'kind' = 'place' then nullif(i.it->>'time', '')::time end,
         case when i.it->>'kind' = 'place' then (i.it->>'stay')::int end,
         case when i.it->>'kind' = 'memo' then i.it->>'text' else nullif(i.it->>'memo', '') end
  from jsonb_array_elements(p->'days') with ordinality d(val, ord)
  cross join lateral jsonb_array_elements(d.val) with ordinality i(it, ord)
  left join public.places pl
    on i.it->>'kind' = 'place' and pl.provider = 'google' and pl.provider_place_id = i.it->>'placeId';

  delete from public.flights where trip_id = v_trip;
  insert into public.flights (id, trip_id, position, flight_no, from_code, dep_date, dep_time, to_code, arr_date, arr_time)
  select (f.val->>'id')::uuid, v_trip, (f.ord - 1)::int, f.val->>'no', f.val->>'from',
         (f.val->>'depDate')::date, (f.val->>'depTime')::time, f.val->>'to', (f.val->>'arrDate')::date, (f.val->>'arrTime')::time
  from jsonb_array_elements(coalesce(p->'flights', '[]'::jsonb)) with ordinality f(val, ord);

  delete from public.stays where trip_id = v_trip;
  insert into public.stays (id, trip_id, position, place_id, alias, check_in, check_out)
  select (s.val->>'id')::uuid, v_trip, (s.ord - 1)::int, pl.id, nullif(s.val->>'alias', ''),
         (s.val->>'checkIn')::date, (s.val->>'checkOut')::date
  from jsonb_array_elements(coalesce(p->'stays', '[]'::jsonb)) with ordinality s(val, ord)
  join public.places pl on pl.provider = 'google' and pl.provider_place_id = s.val->>'placeId';

  delete from public.checklist_items where trip_id = v_trip;
  insert into public.checklist_items (id, trip_id, position, text, done)
  select (c.val->>'id')::uuid, v_trip, (c.ord - 1)::int, c.val->>'text', coalesce((c.val->>'done')::boolean, false)
  from jsonb_array_elements(coalesce(p->'checklist', '[]'::jsonb)) with ordinality c(val, ord);

  delete from public.expenses where trip_id = v_trip;
  insert into public.expenses (id, trip_id, position, spent_on, title, amount, currency)
  select (e.val->>'id')::uuid, v_trip, (e.ord - 1)::int, (e.val->>'date')::date, e.val->>'title',
         (e.val->>'amount')::numeric, e.val->>'currency'
  from jsonb_array_elements(coalesce(p->'expenses', '[]'::jsonb)) with ordinality e(val, ord);
end $$;

-- ───────────────────────── RPC: 보관함 + 컬렉션 저장 ─────────────────────────
create or replace function public.save_library(p_vault jsonb, p_collections jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- 같은 장소가 두 번 들어와도 첫 항목만 남긴다 (중복 저장 방지. 한 문장에서 같은 행을 두 번 upsert 하면 Postgres 가 거부한다)
  p_vault := coalesce((
    select jsonb_agg(q.val order by q.ord)
    from (select distinct on (t.val->>'placeId') t.val, t.ord
          from jsonb_array_elements(p_vault) with ordinality t(val, ord)
          order by t.val->>'placeId', t.ord) q), '[]'::jsonb);

  insert into public.places (provider, provider_place_id)
  select distinct 'google', v->>'placeId' from jsonb_array_elements(p_vault) v
  where coalesce(v->>'placeId', '') <> ''
  on conflict (provider, provider_place_id) do nothing;

  -- 보관함: 있으면 갱신, 없으면 추가, 목록에서 빠진 것은 삭제
  insert into public.saved_places (user_id, place_id, alias, note, position)
  select v_uid, pl.id, nullif(v.val->>'alias', ''), nullif(v.val->>'note', ''), (v.ord - 1)::int
  from jsonb_array_elements(p_vault) with ordinality v(val, ord)
  join public.places pl on pl.provider = 'google' and pl.provider_place_id = v.val->>'placeId'
  on conflict (user_id, place_id) do update
    set alias = excluded.alias, note = excluded.note, position = excluded.position;

  delete from public.saved_places sp
  where sp.user_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(p_vault) v
      join public.places pl on pl.provider = 'google' and pl.provider_place_id = v->>'placeId'
      where pl.id = sp.place_id);

  -- 컬렉션: 이름 유니크 충돌을 피하려고 빠진 것부터 지운다
  delete from public.collections c
  where c.user_id = v_uid
    and c.id not in (select (x->>'id')::uuid from jsonb_array_elements(p_collections) x);

  insert into public.collections (id, user_id, name, position)
  select (c.val->>'id')::uuid, v_uid, c.val->>'name', (c.ord - 1)::int
  from jsonb_array_elements(p_collections) with ordinality c(val, ord)
  on conflict (id) do update set name = excluded.name, position = excluded.position
    where public.collections.user_id = v_uid;

  delete from public.collection_places cp using public.collections c
  where cp.collection_id = c.id and c.user_id = v_uid;

  insert into public.collection_places (collection_id, saved_place_id)
  select distinct (c.val->>'id')::uuid, sp.id
  from jsonb_array_elements(p_collections) c(val)
  cross join lateral jsonb_array_elements_text(coalesce(c.val->'placeIds', '[]'::jsonb)) pid
  join public.places pl on pl.provider = 'google' and pl.provider_place_id = pid
  join public.saved_places sp on sp.place_id = pl.id and sp.user_id = v_uid;
end $$;

-- 연결 확인용 (비로그인 허용, 데이터 노출 없음)
create or replace function public.ping() returns text language sql stable set search_path = '' as $$ select 'ok' $$;

revoke execute on function public.save_trip(jsonb), public.save_library(jsonb, jsonb) from public, anon;
grant execute on function public.save_trip(jsonb), public.save_library(jsonb, jsonb) to authenticated;
grant execute on function public.ping() to anon, authenticated;
