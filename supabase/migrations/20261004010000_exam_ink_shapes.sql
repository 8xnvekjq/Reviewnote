-- 꾹 눌러 도형 변환에 삼각형·사각형(polygon)과 매끈한 곡선(curve)을 더한다.
-- 필기 저장 검증(private.validate_exam_replay_strokes — save_exam_ink_replay·save_exam_ink_delta가 같이 쓴다)이
-- shape.kind를 line/ellipse만 받아 새 도형 획이 EXAM_INK_INVALID로 거절되므로, 두 종류를 받도록 검증만 바꾼다.
--   polygon: { kind, points: [[x,y], ...] } 꼭짓점 3~32개(닫힌 도형)
--   curve:   { kind, points: [[x,y], ...] } 곡선이 지나는 점 2~64개(Catmull-Rom)
-- 나머지 규칙은 20261003020000_exam_ink_replay.sql과 같다. 앱보다 먼저 적용해야 새 도형 획이 저장된다.
begin;

create or replace function private.validate_exam_replay_strokes(p_strokes jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare v_stroke jsonb; v_point jsonb; v_shape jsonb; v_field text; v_count integer;
begin
  if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' then raise exception 'EXAM_INK_INVALID'; end if;
  if jsonb_array_length(p_strokes) > 2000 or octet_length(p_strokes::text) > 2097152 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
  for v_stroke in select value from jsonb_array_elements(p_strokes) loop
    if jsonb_typeof(v_stroke) <> 'object' or jsonb_typeof(v_stroke->'id') is distinct from 'string'
      or coalesce(v_stroke->>'tool', '') not in ('pen', 'highlighter')
      or coalesce(v_stroke->>'color', '') !~ '^#[0-9a-fA-F]{6}$'
      or jsonb_typeof(v_stroke->'size') is distinct from 'number'
      or jsonb_typeof(v_stroke->'points') is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
    if (v_stroke->>'size')::numeric <= 0 or (v_stroke->>'size')::numeric > 50
      or jsonb_array_length(v_stroke->'points') > 100000 then raise exception 'EXAM_INK_INVALID'; end if;
    v_shape := v_stroke->'shape';
    if v_shape is not null then
      if jsonb_typeof(v_shape) <> 'object' or coalesce(v_shape->>'kind', '') not in ('line','ellipse','polygon','curve') then raise exception 'EXAM_INK_INVALID'; end if;
      if v_shape->>'kind' = 'line' then
        foreach v_field in array array['from','to'] loop
          if jsonb_typeof(v_shape->v_field) is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
          if jsonb_array_length(v_shape->v_field) <> 2 then raise exception 'EXAM_INK_INVALID'; end if;
          for v_point in select value from jsonb_array_elements(v_shape->v_field) loop
            if jsonb_typeof(v_point) <> 'number' then raise exception 'EXAM_INK_INVALID'; end if;
            if abs(v_point::text::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
          end loop;
        end loop;
      elsif v_shape->>'kind' in ('polygon','curve') then
        if jsonb_typeof(v_shape->'points') is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
        v_count := jsonb_array_length(v_shape->'points');
        if (v_shape->>'kind' = 'polygon' and v_count not between 3 and 32)
          or (v_shape->>'kind' = 'curve' and v_count not between 2 and 64) then raise exception 'EXAM_INK_INVALID'; end if;
        for v_point in select value from jsonb_array_elements(v_shape->'points') loop
          if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 2
            or jsonb_typeof(v_point->0) <> 'number' or jsonb_typeof(v_point->1) <> 'number' then raise exception 'EXAM_INK_INVALID'; end if;
          if abs((v_point->>0)::numeric) > 100 or abs((v_point->>1)::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
        end loop;
      else
        foreach v_field in array array['cx','cy','rx','ry','rotation'] loop
          if jsonb_typeof(v_shape->v_field) is distinct from 'number' then raise exception 'EXAM_INK_INVALID'; end if;
          if abs((v_shape->>v_field)::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
        end loop;
        if (v_shape->>'rx')::numeric < 0 or (v_shape->>'ry')::numeric < 0 then raise exception 'EXAM_INK_INVALID'; end if;
      end if;
    end if;
    for v_point in select value from jsonb_array_elements(v_stroke->'points') loop
      if jsonb_typeof(v_point->'x') is distinct from 'number' or jsonb_typeof(v_point->'y') is distinct from 'number'
        or jsonb_typeof(v_point->'pressure') is distinct from 'number' or jsonb_typeof(v_point->'t') is distinct from 'number' then
        raise exception 'EXAM_INK_INVALID';
      end if;
      if abs((v_point->>'x')::numeric) > 100 or abs((v_point->>'y')::numeric) > 100
        or (v_point->>'pressure')::numeric not between 0 and 1
        or (v_point->>'t')::numeric not between 0 and 86400000 then raise exception 'EXAM_INK_INVALID'; end if;
    end loop;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_strokes) s where length(s->>'id') not between 1 and 128)
    or (select count(distinct s->>'id') from jsonb_array_elements(p_strokes) s) <> jsonb_array_length(p_strokes) then
    raise exception 'EXAM_INK_INVALID';
  end if;
end;
$$;

revoke all on function private.validate_exam_replay_strokes(jsonb) from public, anon, authenticated;
commit;
