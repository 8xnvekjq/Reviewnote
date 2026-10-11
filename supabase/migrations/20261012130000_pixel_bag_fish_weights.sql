-- 가방 무게를 물고기 종류별로(현실 순서는 지키되 게임용으로 줄인 값). 판매 포인트·상한 종류는 그대로 희귀도별.
-- 상어 30kg은 혼자서도 가방(20kg)을 넘기고, 고래 80kg은 잡자마자 최저 속도(20%) — 광장에 팔러 가야 한다.
-- 모르는 종류(새로 추가된 물고기)는 예전처럼 희귀도별 무게.
create or replace function pixel_private.bag_item_spec(p_kind text, p_ref text)
returns table(weight numeric, points integer, award_kind text)
language sql stable security definer set search_path = '' as $$
  select coalesce(case s.id
      when 'minnow' then 0.1 when 'pirami' then 0.2 when 'moonfish' then 0.3 when 'goby' then 0.4 when 'buri' then 0.5
      when 'catfish_small' then 0.6 when 'trout' then 1.0 when 'mandarin' then 1.5 when 'eel' then 2.0 when 'carp' then 3.0
      when 'catfish' then 4.0 when 'rainbow_koi' then 5.0 when 'shark' then 30.0 when 'whale' then 80.0 end,
      case s.rarity when 'common' then 1.0 when 'uncommon' then 1.5 when 'rare' then 2.5 when 'legendary' then 4.0 else 6.0 end),
    case s.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 4 when 'legendary' then 15 else 40 end,
    case when s.rarity in ('legendary', 'mythic') then 'full' else 'normal' end
  from public.pixel_fish_species s where p_kind = 'fish' and s.id = p_ref
  union all
  select 0.2 + 0.1 * b.stars, b.points, case when b.stars >= 4 then 'full' else 'normal' end
  from public.pixel_bug_species b where p_kind = 'bug' and b.id = p_ref;
$$;
revoke all on function pixel_private.bag_item_spec(text, text) from public, anon, authenticated;
