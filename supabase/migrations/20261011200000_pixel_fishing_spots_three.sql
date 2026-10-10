-- 물고기 떼는 항상 3마리(원 안 그림자 3개가 낚을 때마다 하나씩 사라진다). 2026-10-11 선생님 의견.
begin;
create or replace function pixel_private.refresh_fish_spots(p_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
 insert into pixel_private.fish_spot_state(user_id, spot_id, "left")
 select p_user, id, 3 from generate_series(0,3) id
 on conflict(user_id,spot_id) do nothing;
 update pixel_private.fish_spot_state set "left"=3, ready_at=null
 where user_id=p_user and ready_at <= now();
end $$;
revoke all on function pixel_private.refresh_fish_spots(uuid) from public, anon, authenticated, service_role;
-- 이미 4~5마리로 잡혀 있던 포인트도 3마리로 맞춘다.
update pixel_private.fish_spot_state set "left" = 3 where "left" > 3;
commit;
