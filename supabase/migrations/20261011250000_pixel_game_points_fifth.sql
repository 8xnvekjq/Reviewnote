-- 게임 포인트 하루 상한 뒤 비율 변경(2026-10-11 선생님 결정): 50P를 넘은 뒤로는 절반 → 1/5.
-- 남는 조각(0~4)은 carry에 모았다가 5조각이 되면 1P를 준다. 별 4·5('full')와 잡동사니('junk') 규칙은 그대로.
begin;
alter table pixel_private.game_point_days drop constraint if exists game_point_days_carry_check;
alter table pixel_private.game_point_days add constraint game_point_days_carry_check check (carry between 0 and 4);

create or replace function pixel_private.award_game_points(p_user uuid, p_points integer, p_kind text default 'normal')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c_cap constant integer := 50;
  c_div constant integer := 5;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_earned integer; v_carry integer; v_award integer := 0; v_full integer; v_pieces integer;
begin
  if p_user is null or coalesce(p_points, 0) <= 0 then
    return jsonb_build_object('awarded', 0, 'todayEarned', 0, 'cap', c_cap, 'capped', false);
  end if;
  insert into pixel_private.game_point_days (user_id, kst_date) values (p_user, v_day) on conflict do nothing;
  select earned, carry into v_earned, v_carry from pixel_private.game_point_days
   where user_id = p_user and kst_date = v_day for update;
  if p_kind = 'full' then
    v_award := p_points; v_earned := v_earned + p_points;
  elsif p_kind = 'junk' then
    v_award := greatest(0, least(p_points, c_cap - v_earned)); v_earned := v_earned + v_award;
  else
    v_full := greatest(0, least(p_points, c_cap - v_earned));
    v_pieces := v_carry + p_points - v_full;   -- 상한 넘은 부분은 1/5 조각으로 모은다
    v_award := v_full + v_pieces / c_div; v_carry := v_pieces % c_div;
    v_earned := v_earned + v_award;
  end if;
  update pixel_private.game_point_days set earned = v_earned, carry = v_carry where user_id = p_user and kst_date = v_day;
  if v_award > 0 then
    perform set_config('reviewnote.pixel_rpc', 'true', true);
    update public.profiles set point_adjustment = point_adjustment + v_award where id = p_user;
  end if;
  return jsonb_build_object('awarded', v_award, 'todayEarned', v_earned, 'cap', c_cap, 'capped', v_earned >= c_cap);
end $$;
revoke all on function pixel_private.award_game_points(uuid, integer, text) from public, anon, authenticated, service_role;
commit;
