# PINLOG — 지도 기반 여행 일정 편집 · 장소 탐색

Next.js 16 (App Router, Turbopack) + React + TypeScript + Supabase.

## 실행

```bash
npm install
cp .env.example .env.local   # 키 입력
npm run dev      # http://localhost:3000
npm run check    # 타입 검사 + 로직 단위 테스트
npm run build
```

## Supabase 설정

1. Supabase 프로젝트 생성 → Project Settings > API 의 URL / anon key 를 `.env.local` 에 입력
2. `supabase/schema.sql` 을 SQL Editor 에서 실행 (trips 테이블 + RLS)
3. `GET /api/v1/health` 가 `{"data":{"status":"ok"}}` 이면 연결 성공

현재 저장은 아직 브라우저 `localStorage` 입니다. 다음 단계: Supabase Auth → `src/store.ts` 를 DB 읽기/쓰기로 교체. 설계 근거는 `docs/adr-0001-nextjs-supabase.md`.

## Google Maps

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 필수 (Maps JavaScript API + Places API (New)). HTTP 리퍼러·API 제한을 반드시 설정하세요. 장소 정보(이름·주소·평점)는 저장하지 않고 Place ID 만 저장합니다.

## 주요 기능

- 내 여행 홈: 최근 여행 + `이어서 편집`, 여행 카드, 생성·수정·삭제, JSON 내보내기·가져오기
- 일정 편집: `전체 / 일차별` 탭, 번호 핀·일차별 색상·점선 동선, 드래그·버튼 순서 변경, 다른 날짜로 이동, 독립 메모
- 장소 탐색: 검색창(이름·주소·키워드), `내 위치`, 카테고리 칩, `이 지역 ○○ 찾기`(지도 이동만으로는 조회하지 않음, 늦게 온 이전 응답은 무시)
- 음식점·카페·술집·빵집은 평점 → 평가 수 순 정렬, 평점 없는 곳은 뒤에 `평점 없음`
- 일본의 음식 카테고리는 `타베로그에서 확인` 링크(확인된 URL이 없으면 매장명 + 지역 검색 링크). 타베로그 점수는 표시하지 않습니다.
- 구간 거리 `직선 750m` 버튼 → Google Maps 길찾기(Google 장소는 이름 + Place ID 전달)
- 거리순 재정렬 미리보기(시간 지정 항목 고정), 항공편·숙소, 준비물, 통화별 가계부, 전체·일별 이미지 저장

## 구조

```
src/logic.ts      순수 로직·데이터 모델·가져오기 검증 (테스트: logic.test.ts)
src/demo.ts       데모 모드 샘플 장소·샘플 여행
src/places.ts     Google/데모 장소 제공자 + 런타임 장소 캐시
src/MapView.tsx   데모 지도(Leaflet) + 지도 공통 props
src/GoogleMap.tsx 실제 지도(Google Maps)
src/Editor.tsx    일정 편집 화면   src/Sheet.tsx  하단 시트 / 사이드 패널
src/App.tsx       홈·여행 다이얼로그 src/styles.css 디자인 토큰(CSS 변수)
```
