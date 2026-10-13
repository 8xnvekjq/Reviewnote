-- 천광명월 카드 가위바위보: NPC(치즈) 대결은 항상 무료, 보상은 사람마다 최초 1승만.
-- pixel_card_rps_settings.npc_entry / npc_daily_reward_wins 는 더 이상 쓰지 않는다(컬럼은 호환을 위해 남겨 둔다).
begin;

comment on column public.pixel_card_rps_settings.npc_entry is '사용 안 함(20261015): NPC 대결은 항상 무료';
comment on column public.pixel_card_rps_settings.npc_daily_reward_wins is '사용 안 함(20261015): NPC 보상은 사람마다 최초 1승만';

-- card_rps_settle 은 그대로 둔다: stake 0 이면 패배 delta 0, prize>0 승리면 +prize 지급과 card_rps_npc_wins 기록.
create or replace function public.start_npc_card_rps() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v_id uuid;cfg public.pixel_card_rps_settings%rowtype;pay boolean;
begin
 if exists(select 1 from public.pixel_card_rps_matches where status in('invited','choosing','revealing','shootout') and u in(player_a,player_b)) then perform pixel_private.card_rps_error('busy');end if;
 select * into cfg from public.pixel_card_rps_settings where singleton;
 -- 날짜와 상관없이 보상받은 NPC 승리 기록이 한 번도 없을 때만 상금을 건다.
 pay:=not exists(select 1 from pixel_private.card_rps_npc_wins n where n.user_id=u);
 insert into public.pixel_card_rps_matches(mode,status,player_a,stake,prize,deadline_at)
 values('npc','choosing',u,0,case when pay then cfg.npc_reward else 0 end,now()+interval '60 seconds')
 returning pixel_card_rps_matches.id into v_id;
 return pixel_private.card_rps_view(v_id,u);
exception when unique_violation then perform pixel_private.card_rps_error('busy');return null;
end $$;

revoke all on function public.start_npc_card_rps() from public,anon;
grant execute on function public.start_npc_card_rps() to authenticated;
commit;
