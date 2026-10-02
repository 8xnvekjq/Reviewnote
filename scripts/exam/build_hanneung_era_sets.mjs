// node scripts/exam/build_hanneung_era_sets.mjs [new-seed-migration.sql]
// Offline only. Answers are copied inside Postgres; the public manifest has no keys.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const data = path.join(root, 'src/features/exam/data');
const migrations = path.join(root, 'supabase/migrations');
const eras = ['prehistory', 'three-kingdoms', 'north-south', 'goryeo', 'joseon-early', 'joseon-late', 'opening', 'colonial', 'modern', 'cross'];
const labels = ['선사·초기 국가', '삼국·가야', '남북국', '고려', '조선 전기', '조선 후기', '개항기·대한제국', '일제 강점기', '현대', '시대 통합'];
const quote = s => `'${String(s).replaceAll("'", "''")}'`;
export function buildEraSets(directory = data) {
  const papers = fs.readdirSync(directory).filter(f => f.endsWith('-advanced.topics.json')).map(f => {
    const topics = JSON.parse(fs.readFileSync(path.join(directory, f), 'utf8'));
    const paper = JSON.parse(fs.readFileSync(path.join(directory, `${topics.paperId}.json`), 'utf8'));
    const round = Number(/hanneung-(\d+)-/.exec(paper.id)?.[1]);
    if (!round || topics.questions.length !== paper.questions.length || new Set(topics.questions.map(q => q.number)).size !== paper.questions.length || topics.questions.some(q => !eras.includes(q.era))) throw Error(`Invalid tags: ${f}`);
    return { topics, paper, round };
  }).sort((a, b) => a.round - b.round);
  return eras.map((era, index) => {
    const members = papers.flatMap(({ topics, paper, round }) => topics.questions.filter(t => t.era === era).sort((a, b) => a.number - b.number).map(t => {
      const q = paper.questions.find(q => q.number === t.number);
      if (!q) throw Error(`Missing question ${paper.id}/${t.number}`);
      return { sourcePaperId: paper.id, sourceNumber: q.number, sourceRound: round, imageUrl: q.imageUrl };
    }));
    // Membership revision prevents retagging/reordering from changing old attempts or ink.
    // Hash complete source keys, never a small era's answers (which could be brute-forced).
    const sourceKeyRevisions = papers.map(p => createHash('sha256').update(JSON.stringify(p.paper.questions.map(q => q.answer))).digest('hex'));
    const revision = createHash('sha256').update(JSON.stringify([members, sourceKeyRevisions])).digest('hex').slice(0, 12);
    return { id: `hanneung-era-${era}-${revision}`, era, title: `${labels[index]} 모아 풀기`, members };
  });
}
export function renderSeed(sets) {
  return 'begin;\n' + sets.map(set => {
    if (!set.members.length || set.members.length > 32767) throw Error(`Era ${set.era} must contain 1..32767 questions`);
    const values = set.members.map((m, i) => `(${i + 1}, ${quote(m.sourcePaperId)}, ${m.sourceNumber}, ${m.sourceRound})`).join(',\n');
    return `-- ${set.era}: ${set.members.length} questions\nupdate public.exam_papers set published = false where practice_era = ${quote(set.era)} and id <> ${quote(set.id)};
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values (${quote(set.id)},${quote(set.title)},'국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',${set.members.length},${set.members.length},'advanced',${quote(set.era)}) on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values ${values}) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> ${set.members.length} then
    raise exception 'EXAM_ERA_SOURCE_MISSING: ${set.era}';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select ${quote(set.id)},m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values ${values}) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id=${quote(set.id)} on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id=${quote(set.id)} and not p.published) where id=${quote(set.id)};`;
  }).join('\n') + '\ncommit;\n';
}
function schemaMigration() {
  const functions = new Map();
  for (const file of fs.readdirSync(migrations).filter(f => /^2026100[23].*exam.*\.sql$/.test(f) && !f.includes('_era_')).sort()) {
    const sql = fs.readFileSync(path.join(migrations, file), 'utf8');
    for (const match of sql.matchAll(/create or replace function ([\w.]+)\([\s\S]*?\$function\$;/g)) functions.set(match[1], match[0]);
  }
  const names = ['private.exam_validate_question', 'private.exam_attempt_payload', 'private.exam_result_payload', 'public.start_exam_attempt', 'public.submit_exam_attempt', 'public.list_exam_papers_for_me', 'public.list_my_exam_results', 'public.list_my_paper_history'];
  const definitions = names.map(name => {
    let sql = functions.get(name);
    if (!sql) throw Error(`Missing function ${name}`);
    sql = sql.replaceAll("'hanneungLevel', p.hanneung_level", "'practiceEra', p.practice_era, 'hanneungLevel', p.hanneung_level");
    sql = sql.replaceAll("'number', q.number,", "'number', q.number, 'sourcePaperId', q.source_paper_id, 'sourceNumber', q.source_number, 'sourceRound', q.source_round,");
    sql = sql.replaceAll("when p.kind = 'school' then null", "when p.kind = 'school' or p.practice_era is not null then null");
    sql = sql.replaceAll("and p.kind <> 'school' then", "and p.kind <> 'school' and p.practice_era is null then");
    if (name === 'private.exam_validate_question') sql = sql.replace("if v_paper.kind = 'hanneung' then", "if new.number > 50 and v_paper.practice_era is null then raise exception 'EXAM_INVALID_QUESTION'; end if;\n  if v_paper.practice_era is not null and (new.source_paper_id is null or new.number > v_paper.question_count) then raise exception 'EXAM_INVALID_QUESTION'; end if;\n  if v_paper.kind = 'hanneung' then");
    if (name === 'public.start_exam_attempt') sql = sql.replace("if p_mode is null", "if v_paper.practice_era is not null and p_mode <> 'free' then raise exception 'EXAM_INVALID_MODE'; end if;\n  if p_mode is null");
    if (name === 'public.submit_exam_attempt') sql = sql.replace("when v_kind = 'school' then null", "when v_kind = 'school' or exists (select 1 from public.exam_papers p where p.id = v_attempt.paper_id and p.practice_era is not null) then null");
    return sql;
  });
  return `begin;
alter table public.exam_papers add column practice_era text check (practice_era in (${eras.map(quote).join(',')}));
alter table public.exam_papers add constraint exam_papers_practice_era_kind_check check (practice_era is null or (kind='hanneung' and hanneung_level='advanced'));
alter table public.exam_questions drop constraint exam_questions_number_check;
alter table public.exam_questions add constraint exam_questions_number_check check (number > 0);
alter table public.exam_questions add column source_paper_id text references public.exam_papers(id), add column source_number integer, add column source_round integer;
alter table public.exam_questions add constraint exam_questions_source_check check ((source_paper_id is null and source_number is null and source_round is null) or (source_paper_id is not null and source_number is not null and source_round is not null and source_number between 1 and 50 and source_round > 0));
grant select (source_paper_id,source_number,source_round) on public.exam_questions to authenticated;
${definitions.join('\n')}
commit;\n`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sets = buildEraSets();
  const schema = path.join(migrations, '20261003100000_exam_era_schema.sql');
  if (!fs.existsSync(schema)) fs.writeFileSync(schema, schemaMigration());
  fs.writeFileSync(process.argv[2] ?? path.join(migrations, '20261003100001_exam_era_seed.sql'), renderSeed(sets));
  fs.writeFileSync(path.join(data, 'hanneungEraSets.json'), JSON.stringify(sets, null, 2) + '\n');
}
