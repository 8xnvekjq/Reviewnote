-- 천광명월 카드 가위바위보: NPC(치즈) 대결은 계속 무료, 보상은 하루(KST) 첫 승리만 npc_reward.
-- 같은 날 이후 승리는 연습 판(prize 0), 다음 날(KST)이면 다시 보상이 걸린다.
-- 함수 본문은 20261016000000_card_rps_turn_120s.sql 의 최신 정의를 그대로 옮기고 보상 조건만 바꾼다.
-- card_rps_settle 은 그대로 둔다: prize>0 승리면 +prize 지급과 그날(정산 시각 KST) card_rps_npc_wins 기록.
-- 자정 전에 시작해 자정 후에 이긴 판은 시작할 때 정한 prize 를 받고, 승리 기록은 정산한 날에 남는다.
begin;

comment on column public.pixel_card_rps_settings.npc_entry is '사용 안 함(20261015): NPC 대결은 항상 무료';
comment on column public.pixel_card_rps_settings.npc_daily_reward_wins is '사용 안 함(20261017): NPC 보상은 하루(KST) 첫 승리 1번으로 고정';

create or replace function public.start_npc_card_rps() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v_id uuid;cfg public.pixel_card_rps_settings%rowtype;pay boolean;
begin
 if exists(select 1 from public.pixel_card_rps_matches where status in('invited','choosing','revealing','shootout') and u in(player_a,player_b)) then perform pixel_private.card_rps_error('busy');end if;
 select * into cfg from public.pixel_card_rps_settings where singleton;
 -- 오늘(KST) 보상받은 NPC 승리 기록이 없을 때만 상금을 건다.
 pay:=not exists(select 1 from pixel_private.card_rps_npc_wins n where n.user_id=u and n.kst_date=(now() at time zone 'Asia/Seoul')::date);
 insert into public.pixel_card_rps_matches(mode,status,player_a,stake,prize,deadline_at)
 values('npc','choosing',u,0,case when pay then cfg.npc_reward else 0 end,now()+interval '120 seconds')
 returning pixel_card_rps_matches.id into v_id;
 return pixel_private.card_rps_view(v_id,u);
exception when unique_violation then perform pixel_private.card_rps_error('busy');return null;
end $$;

revoke all on function public.start_npc_card_rps() from public,anon;
grant execute on function public.start_npc_card_rps() to authenticated;
commit;
