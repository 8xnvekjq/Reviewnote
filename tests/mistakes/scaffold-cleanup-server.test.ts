import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../../supabase/migrations/20261021100000_scaffold_cleanup_on_review_complete.sql', import.meta.url), 'utf8');
const handwriting = '✏️ 직접 손으로 쓴 풀이';
const otherCaptions = ['원래풀이', '📝 추가 필기장', '선생님 풀이 힌트', `${handwriting} `, '', null];

async function setup() {
  const db = new PGlite();
  // 운영 테이블의 관련 컬럼과 권한을 재현하고 실제 신규 마이그레이션을 실행한다.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.mistakes(id uuid primary key, reviews jsonb, title text);
    create table public.mistake_scaffoldings(
      id uuid primary key default gen_random_uuid(),
      mistake_id uuid not null references public.mistakes(id) on delete cascade,
      caption text, image_url text not null
    );
    alter table public.mistake_scaffoldings enable row level security;
    grant select, update on public.mistakes to authenticated;
  `);
  const addMistake = async (reviews: unknown) => {
    const { rows } = await db.query<{ id: string }>('insert into public.mistakes values (gen_random_uuid(), $1, $2) returning id', [JSON.stringify(reviews), '오답']);
    return rows[0].id;
  };
  const addScaffolding = (id: string, caption: string | null = handwriting) => db.query(
    'insert into public.mistake_scaffoldings(mistake_id, caption, image_url) values ($1, $2, $3)', [id, caption, 'data:image/png;base64,test'],
  );
  const captions = async (id: string) => (await db.query<{ caption: string | null }>(
    'select caption from public.mistake_scaffoldings where mistake_id = $1 order by caption nulls last', [id],
  )).rows.map(row => row.caption);
  const review = (id: string, reviews: unknown) => db.query('update public.mistakes set reviews = $2 where id = $1', [id, JSON.stringify(reviews)]);
  return { db, addMistake, addScaffolding, captions, review };
}

test('완료 전환은 해당 오답의 정확한 손풀이 캡션만 삭제한다 (PGlite)', async () => {
  const { db, addMistake, addScaffolding, captions, review } = await setup();
  try {
    await db.exec(migration);
    const target = await addMistake(['O', 'O', 'X']);
    const incomplete = await addMistake(['O', 'X', 'star']);
    const completed = await addMistake(['O', 'O', 'O']);
    for (const id of [target, incomplete, completed]) await addScaffolding(id);
    await addScaffolding(target);
    for (const caption of otherCaptions) await addScaffolding(target, caption);
    const before = await captions(target);
    // 학생에게 이미지 삭제 권한이 없어도 승인된 복습 수정의 트리거는 동작한다.
    await db.exec('set role authenticated');
    await review(target, ['O', 'O', 'O']);
    await db.exec('reset role');
    assert.deepEqual(await captions(target), before.filter(caption => caption !== handwriting));
    assert.deepEqual(await captions(incomplete), [handwriting]);
    assert.deepEqual(await captions(completed), [handwriting]);
    await review(incomplete, ['O', 'O', 'X']);
    assert.deepEqual(await captions(incomplete), [handwriting]);
  } finally { await db.close(); }
});

test('기존 완료 데이터 정리와 재실행은 안전하며 O 개수를 정확히 센다 (PGlite)', async () => {
  const { db, addMistake, addScaffolding, captions } = await setup();
  try {
    const cases = [
      { reviews: ['O', 'O', 'O'], cleaned: true },
      { reviews: ['O', 'X', 'O', 'O'], cleaned: true },
      { reviews: ['O', 'O', 'O', 'O'], cleaned: false },
      { reviews: ['O', 'O', ''], cleaned: false },
      { reviews: ['o', 'O', 'O'], cleaned: false },
      { reviews: [], cleaned: false },
      { reviews: null, cleaned: false },
      { reviews: { O: 3 }, cleaned: false },
    ];
    const entries = [];
    for (const item of cases) {
      const id = await addMistake(item.reviews);
      await addScaffolding(id);
      for (const caption of otherCaptions) await addScaffolding(id, caption);
      entries.push({ ...item, id, before: await captions(id) });
    }
    await db.exec(migration);
    await db.exec(migration);
    for (const entry of entries) assert.deepEqual(await captions(entry.id),
      entry.cleaned ? entry.before.filter(caption => caption !== handwriting) : entry.before);
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[]; callable: boolean }>(`
      select prosecdef, proconfig,
        has_function_privilege('authenticated', oid, 'EXECUTE') as callable
      from pg_proc where oid = 'private.cleanup_scaffoldings_on_review_complete()'::regprocedure
    `);
    assert.equal(rows[0].prosecdef, true);
    assert.deepEqual(rows[0].proconfig, ['search_path=""']);
    assert.equal(rows[0].callable, false);
  } finally { await db.close(); }
});

test('완료 유지와 취소는 삭제하지 않고 재완료 때만 새 손풀이를 삭제한다 (PGlite)', async () => {
  const { db, addMistake, addScaffolding, captions, review } = await setup();
  try {
    await db.exec(migration);
    const id = await addMistake(['O', 'O', 'O']);
    await addScaffolding(id);
    await review(id, ['O', 'O', 'O']);
    await db.query('update public.mistakes set title = $2 where id = $1', [id, '제목 변경']);
    assert.deepEqual(await captions(id), [handwriting]);
    await review(id, ['O', 'O', 'X']);
    assert.deepEqual(await captions(id), [handwriting]);
    await review(id, ['O', 'O', 'O']);
    assert.deepEqual(await captions(id), []);
    await review(id, ['O', 'O', 'X']);
    assert.deepEqual(await captions(id), []);
    const four = await addMistake(['O', 'O', 'X', 'O']);
    await addScaffolding(four);
    await review(four, ['O', 'O', 'O', 'O']);
    assert.deepEqual(await captions(four), [handwriting]);
    const malformed = await addMistake(null);
    await addScaffolding(malformed);
    await review(malformed, ['O', 'O', 'O']);
    assert.deepEqual(await captions(malformed), []);
  } finally { await db.close(); }
});
