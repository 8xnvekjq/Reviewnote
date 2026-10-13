-- Pixel World 텃밭(2026-10-20) 1/3 — 표 바꾸기와 기존 밭 옮기기.
-- · 마당의 2×2 밭 두 개 대신 울타리 친 텃밭 하나(지금 6×4칸). 칸마다 따로 갈고 심고 물을 준다.
-- · 칸 번호는 y*8+x(가로 최대 8칸, 세로 최대 8칸 → 0..63). 텃밭 크기는 pixel_private.garden_dims() 한 곳에만 있다
--   (20261020100200_pixel_garden_actions.sql). 나중에 '지식의 조각으로 밭 넓히기'는 그 값 + 구매만 바꾸면 된다 —
--   번호 체계가 그대로라 이미 심은 칸의 번호가 바뀌지 않는다.
-- · 예전 1번·2번 밭(plot_index 0, 1)은 그대로 텃밭 맨 윗줄 왼쪽 두 칸(0,0)·(1,0)이 된다. 자라던 작물은 그 칸에 남고
--   흙은 이미 간 상태로 바꾼다. 수확 기록·출품·주간 대회 기록(pixel_farm_crops의 수확된 줄)은 건드리지 않는다.
-- · 다시 실행해도 같은 결과(제약은 지우고 다시 만들고, 칸 옮기기는 '작물이 있는데 갈리지 않은 칸'만 고친다).
begin;

-- 칸 번호 범위(0..1 → 0..63)와 작물 종류(토마토 → 토마토·딸기) 제약을 이름과 상관없이 찾아 바꾼다.
do $$
declare r record;
begin
  for r in select con.conname, rel.relname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname in ('pixel_farm_plots', 'pixel_farm_crops') and con.contype = 'c'
      and (pg_get_constraintdef(con.oid) ~ 'plot_index' or pg_get_constraintdef(con.oid) ~ 'crop_type')
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;
alter table public.pixel_farm_plots add constraint pixel_farm_plots_plot_index_check check (plot_index between 0 and 63);
alter table public.pixel_farm_crops add constraint pixel_farm_crops_plot_index_check check (plot_index between 0 and 63);
alter table public.pixel_farm_crops drop constraint if exists pixel_farm_crops_status_check;
alter table public.pixel_farm_crops add constraint pixel_farm_crops_crop_type_check check (crop_type in ('tomato', 'strawberry'));
-- 'spent': 세 번 다 딴 딸기 포기(수확물·가방·출품에는 나오지 않는다 — 딸기 열매는 가방의 'crop' 칸으로 간다).
alter table public.pixel_farm_crops add constraint pixel_farm_crops_status_check check (status in ('stored', 'submitted', 'spent'));

-- 칸 상태: 잔디/간 흙, 오늘 물 준 날(젖은 흙 표시 — 다음 날이면 다시 마른다), 스프링클러를 놓은 날(없으면 null).
alter table public.pixel_farm_plots
  add column if not exists soil text not null default 'grass',
  add column if not exists watered_on date,
  add column if not exists sprinkler_since date;
alter table public.pixel_farm_plots drop constraint if exists pixel_farm_plots_soil_check;
alter table public.pixel_farm_plots add constraint pixel_farm_plots_soil_check check (soil in ('grass', 'tilled'));
-- 작물이 있는 칸에는 스프링클러가 없다.
alter table public.pixel_farm_plots drop constraint if exists pixel_farm_plots_sprinkler_empty;
alter table public.pixel_farm_plots add constraint pixel_farm_plots_sprinkler_empty check (sprinkler_since is null or crop_id is null);
-- 스프링클러는 학생마다 하나(상점에서 하나만 산다).
create unique index if not exists pixel_farm_one_sprinkler on public.pixel_farm_plots(user_id) where sprinkler_since is not null;

-- 딸기는 세 번까지 딴다(토마토는 한 번). 몇 번 땄는지.
alter table public.pixel_farm_crops add column if not exists harvests smallint not null default 0;
alter table public.pixel_farm_crops drop constraint if exists pixel_farm_crops_harvests_range;
alter table public.pixel_farm_crops add constraint pixel_farm_crops_harvests_range check (harvests between 0 and 3);

-- 자라던 작물을 텃밭 칸으로: 번호는 그대로(0 → (0,0), 1 → (1,0)), 흙만 간 상태로.
update public.pixel_farm_plots set soil = 'tilled' where crop_id is not null and soil <> 'tilled';

commit;
