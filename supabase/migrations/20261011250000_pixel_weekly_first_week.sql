-- 보상 규칙은 2026-10-11에 정했다 — 그 전 주(9/28~10/4)는 지급 없이 정산된 것으로 둔다.
-- 첫 정산은 10/5~10/11 주(10/12 월요일 첫 접속 때). 운영 데이터 한 줄이라 테스트 마이그레이션과 분리했다.
insert into pixel_private.weekly_settlements(week_start) values (timestamptz '2026-09-28 00:00:00+09') on conflict do nothing;
