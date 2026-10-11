-- 게임 포인트 하루 전체 상한(2026-10-11 선생님 결정): 오늘 받은 포인트가 100P를 넘으면 별 4·5까지 모두 1/10.
-- - normal(별 1~3): 50P까지 그대로, 50~100P는 1/5, 100P 넘으면 1/10
-- - full(별 4·5): 100P까지 그대로, 넘으면 1/10
-- - junk(녹슨 동전): 50P까지 그대로, 넘으면 0
-- carry 단위를 1/5P 조각(0~4)에서 1/10P 조각(0~9)으로 바꾼다(기존 값은 ×2).
begin;
alter table pixel_private.game_point_days drop constraint if exists game_point_days_carry_check;
update pixel_private.game_point_days set carry = carry * 2 where carry between 1 and 4;
alter table pixel_private.game_point_days add constraint game_point_days_carry_check check (carry between 0 and 9);

create or replace function pixel_private.award_game_points(p_user uuid, p_points integer, p_kind text default 'normal')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c_cap constant integer := 50;
  c_total constant integer := 100;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_earned integer; v_carry integer; v_tenths integer; v_award integer;
begin
  if p_user is null or coalesce(p_points, 0) <= 0 then
    return jsonb_build_object('awarded', 0, 'todayEarned', 0, 'cap', c_cap, 'capped', false);
  end if;
  insert into pixel_private.game_point_days (user_id, kst_date) values (p_user, v_day) on conflict do nothing;
  select earned, carry into v_earned, v_carry from pixel_private.game_point_days
   where user_id = p_user and kst_date = v_day for update;
  -- 1/10P 단위로 한 점씩 더한다(점마다 그 순간의 구간 비율).
  v_tenths := v_earned * 10 + v_carry;
  for i in 1 .. least(p_points, 1000) loop
    v_tenths := v_tenths + case
      when p_kind = 'junk' then case when v_tenths < c_cap * 10 then 10 else 0 end
      when v_tenths >= c_total * 10 then 1
      when p_kind = 'full' or v_tenths < c_cap * 10 then 10
      else 2 end;
  end loop;
  v_award := v_tenths / 10 - v_earned;
  v_earned := v_tenths / 10; v_carry := v_tenths % 10;
  update pixel_private.game_point_days set earned = v_earned, carry = v_carry where user_id = p_user and kst_date = v_day;
  if v_award > 0 then
    perform set_config('reviewnote.pixel_rpc', 'true', true);
    update public.profiles set point_adjustment = point_adjustment + v_award where id = p_user;
  end if;
  return jsonb_build_object('awarded', v_award, 'todayEarned', v_earned, 'cap', c_cap, 'capped', v_earned >= c_cap);
end $$;
revoke all on function pixel_private.award_game_points(uuid, integer, text) from public, anon, authenticated, service_role;
commit;
