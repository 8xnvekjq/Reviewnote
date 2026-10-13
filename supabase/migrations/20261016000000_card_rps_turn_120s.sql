-- 천광명월 카드 가위바위보: 한 턴(카드 고르기·승부차기 한 번) 제한 시간을 60초에서 120초로 늘린다.
-- 함수 본문은 최신 정의를 그대로 옮기고 간격만 바꾼다. 친구 초대 응답 30초는 그대로.
begin;

create or replace function public.respond_card_rps(p_match_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.pixel_card_rps_matches%rowtype;
begin perform pixel_private.card_rps_expire(p_match_id); select * into m from public.pixel_card_rps_matches where id=p_match_id and player_b=u for update;
 if not found then perform pixel_private.card_rps_error('not_found'); end if; if m.status='expired' then return pixel_private.card_rps_view(p_match_id,u); end if; if m.status<>'invited' then perform pixel_private.card_rps_error('not_your_turn'); end if;
 if not p_accept then update public.pixel_card_rps_matches set status='declined',settled=true,a_delta=0,updated_at=now() where id=p_match_id;perform pixel_private.card_rps_adjust(p_match_id,m.player_a,m.stake,'invite_refund');
 else perform pixel_private.card_rps_adjust(p_match_id,u,-m.stake,'friend_escrow');update public.pixel_card_rps_matches set status='choosing',deadline_at=now()+interval '120 seconds',updated_at=now() where id=p_match_id; end if;
 return pixel_private.card_rps_view(p_match_id,u); end $$;

create or replace function public.start_npc_card_rps() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v_id uuid;cfg public.pixel_card_rps_settings%rowtype;pay boolean;
begin
 if exists(select 1 from public.pixel_card_rps_matches where status in('invited','choosing','revealing','shootout') and u in(player_a,player_b)) then perform pixel_private.card_rps_error('busy');end if;
 select * into cfg from public.pixel_card_rps_settings where singleton;
 -- 날짜와 상관없이 보상받은 NPC 승리 기록이 한 번도 없을 때만 상금을 건다.
 pay:=not exists(select 1 from pixel_private.card_rps_npc_wins n where n.user_id=u);
 insert into public.pixel_card_rps_matches(mode,status,player_a,stake,prize,deadline_at)
 values('npc','choosing',u,0,case when pay then cfg.npc_reward else 0 end,now()+interval '120 seconds')
 returning pixel_card_rps_matches.id into v_id;
 return pixel_private.card_rps_view(v_id,u);
exception when unique_violation then perform pixel_private.card_rps_error('busy');return null;
end $$;

create or replace function pixel_private.card_rps_submit(p_id uuid,p_cards text[],p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.pixel_card_rps_matches%rowtype;side text;other text;v_turn integer;other_cards text[];rr jsonb;st jsonb;winner text;result integer;npc text[];
begin perform pixel_private.card_rps_expire(p_id);select * into m from public.pixel_card_rps_matches where id=p_id and u in(player_a,player_b) for update;if not found then perform pixel_private.card_rps_error('not_found');end if;side:=case when m.player_a=u then 'a' else 'b' end;other:=case side when 'a' then 'b' else 'a' end;v_turn:=jsonb_array_length(m.state->'rounds')+1;
 if (p_kind='round' and m.status<>'choosing') or (p_kind='shootout' and m.status<>'shootout') then perform pixel_private.card_rps_error('not_your_turn');end if;
 if p_kind='round' and not pixel_private.card_rps_valid(m.state->'inventory'->side,p_cards) then perform pixel_private.card_rps_error('invalid_cards');end if;if p_kind='shootout' and (cardinality(p_cards)<>1 or not p_cards[1]=any(array['rock','scissors','paper'])) then perform pixel_private.card_rps_error('invalid_cards');end if;
 insert into pixel_private.card_rps_submissions(match_id,turn,side,kind,cards) values(p_id,v_turn,side,p_kind,p_cards) on conflict do nothing;if not found then perform pixel_private.card_rps_error('not_your_turn');end if;
 if m.mode='npc' then if p_kind='round' then npc:=pixel_private.card_rps_npc_cards(m.state->'inventory'->'b',m.state->'inventory'->'a',v_turn,(m.state->'wins'->>'a')::int);else npc:=array[(array['rock','scissors','paper'])[1+floor(random()*3)::int]];end if;insert into pixel_private.card_rps_submissions values(p_id,v_turn,'b',p_kind,npc,now()) on conflict do nothing;end if;
 select x.cards into other_cards from pixel_private.card_rps_submissions x where x.match_id=p_id and x.turn=v_turn and x.side=other and x.kind=p_kind;if other_cards is null then return pixel_private.card_rps_view(p_id,u);end if;
 if side='b' then npc:=p_cards;p_cards:=other_cards;other_cards:=npc;end if;st:=m.state;
 if p_kind='round' then rr:=pixel_private.card_rps_resolve_round(p_cards,other_cards);st:=jsonb_set(st,'{rounds}',st->'rounds'||jsonb_build_array(rr));st:=jsonb_set(st,'{inventory,a}',pixel_private.card_rps_remove(st->'inventory'->'a',p_cards));st:=jsonb_set(st,'{inventory,b}',pixel_private.card_rps_remove(st->'inventory'->'b',other_cards));if rr->>'winner'<>'draw' then st:=jsonb_set(st,array['wins',rr->>'winner'],to_jsonb((st->'wins'->>(rr->>'winner'))::int+1));end if;
  if (st->'wins'->>'a')::int>=2 then winner:=m.player_a::text;elsif (st->'wins'->>'b')::int>=2 then winner:=coalesce(m.player_b::text,'npc_mouse');elsif jsonb_array_length(st->'rounds')>=3 or (((st->'inventory'->'a'->>'rock')::int+(st->'inventory'->'a'->>'scissors')::int+(st->'inventory'->'a'->>'paper')::int)=0 and ((st->'inventory'->'b'->>'rock')::int+(st->'inventory'->'b'->>'scissors')::int+(st->'inventory'->'b'->>'paper')::int)=0) then if (st->'wins'->>'a')::int<>(st->'wins'->>'b')::int then winner:=case when (st->'wins'->>'a')::int>(st->'wins'->>'b')::int then m.player_a::text else coalesce(m.player_b::text,'npc_mouse') end;else update public.pixel_card_rps_matches set state=st,status='shootout',deadline_at=now()+interval '120 seconds',updated_at=now() where id=p_id;return pixel_private.card_rps_view(p_id,u);end if;end if;
 else result:=pixel_private.card_rps_compare(p_cards[1],other_cards[1]);st:=jsonb_set(st,'{shootout}',st->'shootout'||jsonb_build_array(jsonb_build_object('a',p_cards[1],'b',other_cards[1],'result',case when result=0 then 'draw' when result>0 then 'a' else 'b' end)));if result<>0 then winner:=case when result>0 then m.player_a::text else coalesce(m.player_b::text,'npc_mouse') end;else delete from pixel_private.card_rps_submissions where match_id=p_id and turn=v_turn and kind='shootout';end if;end if;
 update public.pixel_card_rps_matches set state=st,deadline_at=now()+interval '120 seconds',updated_at=now() where id=p_id;if winner is not null then perform pixel_private.card_rps_settle(p_id,winner,case when p_kind='shootout' then 'shootout' else 'wins' end);end if;return pixel_private.card_rps_view(p_id,u);end $$;

revoke all on function public.respond_card_rps(uuid,boolean),public.start_npc_card_rps() from public,anon;
grant execute on function public.respond_card_rps(uuid,boolean),public.start_npc_card_rps() to authenticated;
revoke all on function pixel_private.card_rps_submit(uuid,text[],text) from public,anon,authenticated,service_role;
commit;
