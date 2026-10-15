// 서로 도와주기 풀이 파일 정리 — pg_cron이 하루 한 번 부른다(x-cleanup-key = private.app_settings의 help_cleanup_key).
// 지울 대상은 DB 함수가 정한다: 선생님이 지운 풀이, 닫힌 지 7일 지난 요청의 '좋아요 아닌' 풀이,
// 완성·삭제된 오답의 모든 풀이, 제출되지 않은 하루 지난 업로드. 파일을 지운 뒤에만 줄에 표시한다.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'help-solutions';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // 비밀값은 DB(private.app_settings)에만 있다: pg_cron이 읽어 보내고 여기서 같은 값인지 확인한다.
  const { data: ok } = await client.rpc('help_cleanup_key_ok', { p_key: request.headers.get('x-cleanup-key') ?? '' });
  if (ok !== true) return json({ error: 'unauthorized' }, 401);
  let removed = 0, orphans = 0;
  // 한 번에 조금씩(최대 5번 × 200개) — DB·저장소에 부담을 주지 않게.
  for (let round = 0; round < 5; round++) {
    const { data: due, error: dueError } = await client.rpc('help_cleanup_due', { p_limit: 200 });
    if (dueError) return json({ error: dueError.message, removed, orphans }, 500);
    const { data: lost, error: lostError } = await client.rpc('help_orphan_files', { p_limit: 200 });
    if (lostError) return json({ error: lostError.message, removed, orphans }, 500);
    const duePaths = (due ?? []) as string[], lostPaths = (lost ?? []) as string[];
    const paths = [...new Set([...duePaths, ...lostPaths])];
    if (!paths.length) break;
    const { error: removeError } = await client.storage.from(BUCKET).remove(paths);
    if (removeError) return json({ error: removeError.message, removed, orphans }, 500);
    if (duePaths.length) {
      const { error: markError } = await client.rpc('help_mark_files_deleted', { p_paths: duePaths });
      if (markError) return json({ error: markError.message, removed, orphans }, 500);
    }
    removed += duePaths.length; orphans += lostPaths.length;
  }
  return json({ removed, orphans });
});
