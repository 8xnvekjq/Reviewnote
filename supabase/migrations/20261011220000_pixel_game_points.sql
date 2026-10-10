-- 게임(낚시·잠자리) 포인트 하루 상한(2026-10-11 선생님 결정). 모든 게임 보상은 이 함수 하나로만 준다.
-- - 하루(KST) 50P까지는 그대로, 넘은 뒤로는 절반(반 포인트는 carry로 모았다가 1P가 되면 준다).
-- - kind 'full'(별 4·5): 상한과 상관없이 전부. 받은 만큼 오늘 합계에도 더한다.
-- - kind 'junk'(녹슨 동전 등): 상한 전이면 그대로(상한까지만), 넘으면 0.
begin;
create table if not exists pixel_private.game_point_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kst_date date not null,
  earned integer not null default 0 check (earned >= 0),
  carry smallint not null default 0 check (carry in (0, 1)),
  primary key (user_id, kst_date)
);
alter table pixel_private.game_point_days enable row level security;
revoke all on pixel_private.game_point_days from public, anon, authenticated, service_role;

create or replace function pixel_private.award_game_points(p_user uuid, p_points integer, p_kind text default 'normal')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c_cap constant integer := 50;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_earned integer; v_carry integer; v_award integer := 0; v_full integer; v_rest integer; v_half integer;
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
    v_rest := p_points - v_full;
    v_half := v_carry + v_rest;          -- 상한 넘은 부분은 반 포인트 단위로 모은다
    v_award := v_full + v_half / 2; v_carry := v_half % 2;
    v_earned := v_earned + v_full + v_half / 2;
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
