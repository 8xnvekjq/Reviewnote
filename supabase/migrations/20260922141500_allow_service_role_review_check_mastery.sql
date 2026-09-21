-- ================================================
-- private.guard_review_check_mastered_at: service_role(AI 자동채점 경로)도 통과하도록 허용
-- ================================================
-- 배경: apply_review_check_ai_grade_batch(신규, service_role 전용 RPC)가 확신 있게 채점된 문항마다
-- 기존 private.apply_review_check_outcome을 호출하는데, 그 안에서 public.mistakes.review_check_mastered_at
-- / reviews를 갱신할 때 이 트리거가 "private.is_current_user_admin()이 아니면 무조건 거부"하고
-- 있었다(admin 수동 채점 경로만 염두에 두고 만들어진 가드). AI 자동채점 경로는 auth.uid()가 아예
-- 없는(service_role) 호출이라 이 가드에 걸려 review-check-grade Edge Function이 실제로는 항상
-- 실패했을 것 — real-DB 테스트(reviewCheck-server.sql) 작성 중 발견.
--
-- current_setting('role', true) = 'service_role' 는 SECURITY DEFINER로 여러 단계 중첩돼도
-- current_user(postgres로 escalate됨)와 달리 그대로 'service_role'을 유지한다(실측 확인됨) —
-- 그리고 이 값은 PostgREST가 service_role JWT로만 SET ROLE 할 수 있으므로, 학생/관리자 클라이언트가
-- 흉내낼 수 없다(스푸핑 불가능한 신뢰 신호).

create or replace function private.guard_review_check_mastered_at()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if TG_OP = 'INSERT' then
    if NEW.review_check_mastered_at is not null
       and not (private.is_current_user_admin() or current_setting('role', true) = 'service_role') then
      NEW.review_check_mastered_at := null;
    end if;
    return NEW;
  end if;

  if NEW.review_check_mastered_at is distinct from OLD.review_check_mastered_at
     and not (private.is_current_user_admin() or current_setting('role', true) = 'service_role') then
    raise exception 'review_check_mastered_at can only be changed via admin grading';
  end if;

  if OLD.review_check_mastered_at is not null
     and NEW.review_check_mastered_at is not distinct from OLD.review_check_mastered_at
     and NEW.reviews is distinct from OLD.reviews
     and not (private.is_current_user_admin() or current_setting('role', true) = 'service_role') then
    raise exception 'a mastered mistake''s reviews can only change via admin review-check grading';
  end if;

  return NEW;
end;
$function$;
