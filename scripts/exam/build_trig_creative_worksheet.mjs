// 중3-2 삼각비 창의융합 학습지 생성기: 직접 작성한 문항 → 정답 검증 →
// HTML(KaTeX) → 문항 PNG·삼각비 표 PNG(public/exams/<id>/) + 데이터 JSON + 비공개 시드 SQL + 공개 SQL.
// 해설은 로컬 검토 HTML(scripts/exam/worksheet-generated/<id>/review.html, git 제외)에만 둔다.
// · 기본: 개편판 1차(12문항)·2차(6문항) — trig-creative/questions-v2.mjs → 시드 하나(두 paper) + publish_trig_creative_v2.sql
// · --original: 기존 18문항 학습지(trig-creative/questions.mjs) — 진행 중 응시가 있으니 문항·이미지는 바꾸지 않는다.
//   node scripts/exam/build_trig_creative_worksheet.mjs                          # 1차·2차 전부 생성(Edge로 PNG 렌더링)
//   node scripts/exam/build_trig_creative_worksheet.mjs --no-render              # PNG 없이 JSON·SQL·검토 HTML만
//   node scripts/exam/build_trig_creative_worksheet.mjs --original [--no-render] # 기존 학습지
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import katex from 'katex';
import { PAPER, QUESTIONS, TYPES, answerOf, tableValue, trigFor } from './trig-creative/questions.mjs';
import { MIGRATION_TIMESTAMP as V2_TIMESTAMP, SHEETS as V2_SHEETS } from './trig-creative/questions-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const POINTS = 5;
const MIN_ROUND_MARGIN = 0.05;
const MIN_ANGLE_MARGIN = 0.1;
const render = !process.argv.includes('--no-render');

/** 기존 18문항 학습지. 개편판 시트(V2_SHEETS)와 같은 모양: paper·questions·출처 라벨·문항 머리 태그. */
export const ORIGINAL_SHEET = { paper: PAPER, questions: QUESTIONS, label: q => `리뷰노트 변형 문항 · 유형 ${q.code}`, tag: q => `유형 ${q.code}` };
export { V2_SHEETS };
export const V2_SEED_FILE = `supabase/migrations/${V2_TIMESTAMP}_exam_trig_creative_v2_seed.sql`;
export const V2_PUBLISH_FILE = 'scripts/exam/publish_trig_creative_v2.sql';

const imageUrl = (paperId, n) => `/exams/${paperId}/q-${String(n).padStart(2, '0')}.png`;
export const trigTableUrl = paperId => `/exams/${paperId}/trig-table.png`;
export const TRIG_TABLE_URL = trigTableUrl(PAPER.id);

/** 표 값·정확한 값 모두 같은 정수인지, 반올림/올림 경계·각 어림 경계에서 충분히 떨어져 있는지 확인한다. */
export function verifyQuestion(q) {
  const problems = [];
  const table = answerOf(q, 'table');
  const exact = answerOf(q, 'exact');
  if (table !== exact) problems.push(`표 값 ${table} ≠ 정확한 값 ${exact}`);
  if (!Number.isInteger(table) || table < 0 || table > 999) problems.push(`정답 범위 밖: ${table}`);
  for (const mode of ['table', 'exact']) {
    const raw = q.compute(trigFor(mode));
    const frac = raw - Math.floor(raw);
    if (q.finalize === 'round' && Math.abs(frac - 0.5) <= MIN_ROUND_MARGIN) problems.push(`${mode} 반올림 경계: ${raw}`);
    if (q.finalize === 'ceil' && Math.min(frac, 1 - frac) <= MIN_ROUND_MARGIN) problems.push(`${mode} 올림 경계: ${raw}`);
    if (q.finalize === 'int' && Math.abs(raw - Math.round(raw)) > 1e-9) problems.push(`${mode} 정수 아님: ${raw}`);
  }
  // 정수 몇 개를 각각 반올림해 더하는 문항: 각 부분도 반올림 경계에서 떨어져 있어야 한다.
  for (const mode of ['table', 'exact']) {
    for (const part of q.roundParts?.(trigFor(mode)) ?? []) {
      if (Math.abs(part - Math.floor(part) - 0.5) <= MIN_ROUND_MARGIN) problems.push(`${mode} 부분 반올림 경계: ${part}`);
    }
  }
  for (const [fn, value] of q.angleChecks ?? []) {
    const exactDeg = ({ sin: Math.asin, cos: Math.acos, tan: Math.atan })[fn](value) * 180 / Math.PI;
    const f = exactDeg - Math.floor(exactDeg);
    if (Math.abs(f - 0.5) < MIN_ANGLE_MARGIN) problems.push(`각 어림 경계: ${fn}=${value} → ${exactDeg.toFixed(3)}°`);
    if (trigFor('table').angle(fn, value) !== Math.round(exactDeg)) problems.push(`표 어림 각 불일치: ${fn}=${value}`);
  }
  return { table, exact, problems };
}

export function buildData(sheet = ORIGINAL_SHEET) {
  const { paper, questions } = sheet;
  return {
    ...Object.fromEntries(Object.entries(paper).filter(([key]) => key !== 'migrationTimestamp' && key !== 'curriculumGrade' && key !== 'curriculumChapter')),
    examDate: null,
    questionCount: questions.length,
    maxScore: questions.length * POINTS,
    referenceLinks: [{ label: '삼각비 표', url: trigTableUrl(paper.id) }],
    questions: questions.map((q, i) => ({
      number: i + 1,
      section: 'common',
      imageUrl: imageUrl(paper.id, i + 1),
      points: POINTS,
      answer: String(answerOf(q)),
      answerType: 'digits',
      curriculumGrade: paper.curriculumGrade,
      curriculumChapter: paper.curriculumChapter,
      sourceLabel: sheet.label(q),
      typeName: TYPES[q.type],
    })),
  };
}

const sql = v => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);

function paperInsertSql(data) {
  const lines = [
    `insert into public.exam_papers (id,title,exam_date,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,school_name,grade,question_count,max_score,unit_name) values (${[
      data.id, data.title].map(sql).join(',')},null,${sql(data.source)},${sql(data.subject)},${sql(data.schoolGrade)},null,'{}'::text[],null,false,'worksheet',${sql(data.schoolName)},${data.grade},${data.questionCount},${data.maxScore.toFixed(1)},${sql(data.unitName)}) on conflict do nothing;`,
  ];
  for (const q of data.questions) {
    lines.push(`insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,source_label) values (${sql(data.id)},${q.number},'common',${sql(q.imageUrl)},false,${q.points.toFixed(1)},${sql(q.curriculumGrade)},${sql(q.curriculumChapter)},'digits',${sql(q.sourceLabel)}) on conflict do nothing;`);
    lines.push(`insert into public.exam_answer_keys select id,${sql(q.answer)} from public.exam_questions where paper_id=${sql(data.id)} and number=${q.number} on conflict do nothing;`);
  }
  return lines;
}

export function buildSeedSql(data) {
  return [
    '-- 중3-2 삼각비 창의융합 학습지(리뷰노트 직접 작성 18문항). 비공개로 등록; 공개는 scripts/exam/publish_trig_creative_worksheet.sql.',
    '-- 생성: node scripts/exam/build_trig_creative_worksheet.mjs (직접 고치지 말 것)', // 이미 적용된 마이그레이션과 같아야 하므로 문구 고정
    'begin;',
    ...paperInsertSql(data),
    'commit;', '',
  ].join('\n');
}

export function buildPublishSql(data) {
  return `-- 문항·정답 검토 뒤에만.\nupdate public.exam_papers set published=true where id=${sql(data.id)} and kind='worksheet';\n`;
}

/** 개편판 1차·2차를 한 마이그레이션으로(둘 다 비공개). */
export function buildV2SeedSql(datas) {
  return [
    `-- 중3-2 삼각비 창의융합 학습지 개편판: ${datas.map(d => `${d.id}(${d.questionCount}문항)`).join(', ')}. 비공개로 등록; 공개는 ${V2_PUBLISH_FILE}.`,
    `-- 기존 ${PAPER.id}(18문항)는 진행 중 응시가 있어 건드리지 않는다.`,
    '-- 생성: node scripts/exam/build_trig_creative_worksheet.mjs (직접 고치지 말 것)',
    'begin;',
    ...datas.flatMap(paperInsertSql),
    'commit;', '',
  ].join('\n');
}

/** 개편판 공개 + 기존 18문항 학습지 비공개 전환(응시 기록은 지우지 않는다). */
export function buildV2PublishSql(datas) {
  return [
    '-- 문항·정답 검토 뒤에만. 개편판 1차·2차 공개 + 기존 18문항 학습지 비공개 전환.',
    'begin;',
    `update public.exam_papers set published=true where id in (${datas.map(d => sql(d.id)).join(',')}) and kind='worksheet';`,
    `update public.exam_papers set published=false where id=${sql(PAPER.id)} and kind='worksheet';`,
    'commit;', '',
  ].join('\n');
}

// ───────────── HTML ─────────────
function tex(text) {
  return text.replace(/\$([^$]+)\$/g, (_, expr) => katex.renderToString(expr, { throwOnError: true, output: 'html' }));
}

const katexCss = pathToFileURL(path.join(root, 'node_modules/katex/dist/katex.min.css')).href;
const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #111; }
  body { font-family: "HANBatang", "Batang", "바탕", serif; font-size: 21px; line-height: 1.72; word-break: keep-all; overflow-wrap: break-word; }
  .katex { font-size: 1.04em; }
`;

function questionHtml(q, number, sheet) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="${katexCss}"><style>${BASE_CSS}
  .sheet { width: 860px; padding: 26px 30px 30px; }
  .head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
  .num { font-family: "Times New Roman", serif; font-style: italic; font-weight: 700; font-size: 34px; }
  .tag { font-family: "Malgun Gothic", sans-serif; font-size: 15px; color: #444; border: 1px solid #999; border-radius: 4px; padding: 1px 8px; }
  .box { border: 1.5px solid #333; padding: 14px 18px; margin: 0 0 14px; }
  .box p { margin: 0; text-align: left; }
  .box p + p { margin-top: 10px; }
  .problem { margin: 0; text-align: left; }
  .note { margin: 10px 0 0; font-size: 19px; color: #222; }
  .points { text-align: right; font-size: 18px; margin-top: 8px; }
  </style></head><body><div class="sheet" id="sheet">
  <div class="head"><span class="num">${number}.</span><span class="tag">${sheet.tag(q)} · ${TYPES[q.type]}</span></div>
  <div class="box"><p>${tex(q.background)}</p><p>${tex(q.example)}</p></div>
  <p class="problem">${tex(q.problem)}</p>
  <p class="note">(${tex(q.note)})</p>
  <div class="points">[${POINTS}점]</div>
  </div></body></html>`;
}

function trigTableHtml() {
  const fmt = (fn, d) => (fn === 'tan' && d === 90 ? '—' : tableValue(fn, d).toFixed(4));
  const rows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map(d => `<tr${d % 5 === 0 ? ' class="five"' : ''}><th>${d}°</th><td>${fmt('sin', d)}</td><td>${fmt('cos', d)}</td><td>${fmt('tan', d)}</td></tr>`).join('');
  const table = (from, to) => `<table><thead><tr><th>각도</th><th>sin</th><th>cos</th><th>tan</th></tr></thead><tbody>${rows(from, to)}</tbody></table>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${BASE_CSS}
  body { font-family: "Malgun Gothic", sans-serif; font-size: 15px; line-height: 1.3; }
  .sheet { width: 900px; padding: 22px 26px 26px; }
  h1 { font-size: 24px; margin: 0 0 4px; text-align: center; }
  .sub { text-align: center; color: #444; margin: 0 0 14px; font-size: 14px; }
  .cols { display: flex; gap: 18px; align-items: flex-start; }
  table { border-collapse: collapse; flex: 1 1 0; table-layout: fixed; font-variant-numeric: tabular-nums; }
  th, td { border: 1px solid #888; padding: 2.5px 8px; text-align: right; }
  thead th { background: #eef1f6; text-align: center; }
  tbody th { text-align: center; background: #f7f7f7; }
  tr.five td, tr.five th { border-bottom: 2px solid #444; }
  </style></head><body><div class="sheet" id="sheet">
  <h1>삼각비 표</h1><p class="sub">0° ~ 90° · 소수 넷째 자리까지(다섯째 자리에서 반올림)</p>
  <div class="cols">${table(0, 45)}${table(46, 90)}</div>
  </div></body></html>`;
}

function reviewHtml(data, sheet) {
  const cards = sheet.questions.map((q, i) => {
    const { table, exact } = verifyQuestion(q);
    const rawT = q.compute(trigFor('table'));
    const rawE = q.compute(trigFor('exact'));
    return `<section><h2>${i + 1}. ${sheet.tag(q)} — 정답 ${data.questions[i].answer}</h2>
    <img src="../../../../public${data.questions[i].imageUrl}" width="720">
    <p><b>해설</b> ${tex(q.solution)}</p>
    <p class="calc">표 값 계산 ${rawT.toFixed(4)} → ${table} · 정확한 값 계산 ${rawE.toFixed(4)} → ${exact} · 규칙 ${q.finalize}</p></section>`;
  }).join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${data.title} — 검토용(정답·해설)</title><link rel="stylesheet" href="${katexCss}"><style>
  body { font-family: "Malgun Gothic", sans-serif; max-width: 820px; margin: 24px auto; line-height: 1.6; }
  section { border-bottom: 1px solid #ccc; padding: 12px 0 18px; } img { border: 1px solid #ddd; display: block; margin: 8px 0; }
  .calc { color: #555; font-size: 13px; }</style></head><body>
  <h1>${data.title} — 로컬 검토용</h1><p>정답·해설 포함. 커밋·배포 금지(.gitignore).</p>
  <p><a href="../../../../public${trigTableUrl(data.id)}">삼각비 표</a></p>${cards}</body></html>`;
}

async function renderPngs(outDir, tmpDir, sheet) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 800 }, deviceScaleFactor: 1.4 });
    const shoot = async (html, name, file) => {
      const htmlPath = path.join(tmpDir, `${name}.html`);
      fs.writeFileSync(htmlPath, html);
      await page.goto(pathToFileURL(htmlPath).href);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#sheet').screenshot({ path: file });
    };
    for (const [i, q] of sheet.questions.entries()) {
      await shoot(questionHtml(q, i + 1, sheet), `q-${String(i + 1).padStart(2, '0')}`, path.join(outDir, `q-${String(i + 1).padStart(2, '0')}.png`));
    }
    await shoot(trigTableHtml(), 'trig-table', path.join(outDir, 'trig-table.png'));
  } finally {
    await browser.close();
  }
}

function writeSheet(sheet) {
  const data = buildData(sheet);
  const publicDir = path.join(root, 'public/exams', data.id);
  const localDir = path.join(root, 'scripts/exam/worksheet-generated', data.id);
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(path.join(localDir, 'html'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/features/exam/data', `${data.id}.json`), `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(path.join(localDir, 'review.html'), reviewHtml(data, sheet));
  return { sheet, data, publicDir, localDir };
}

async function main() {
  const original = process.argv.includes('--original');
  const sheets = original ? [ORIGINAL_SHEET] : V2_SHEETS;
  const failures = sheets.flatMap(s => s.questions.flatMap(q => verifyQuestion(q).problems.map(p => `${s.paper.id} ${q.code}: ${p}`)));
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  if (original && QUESTIONS.length !== 18) throw new Error('문항 수는 18');
  if (!original && V2_SHEETS.map(s => s.questions.length).join() !== '12,6') throw new Error('문항 수는 1차 12 · 2차 6');

  const written = sheets.map(writeSheet);
  const datas = written.map(w => w.data);
  if (original) {
    fs.writeFileSync(path.join(root, 'supabase/migrations', `${PAPER.migrationTimestamp}_exam_trig_creative_worksheet_seed.sql`), buildSeedSql(datas[0]));
    fs.writeFileSync(path.join(root, 'scripts/exam/publish_trig_creative_worksheet.sql'), buildPublishSql(datas[0]));
  } else {
    fs.writeFileSync(path.join(root, V2_SEED_FILE), buildV2SeedSql(datas));
    fs.writeFileSync(path.join(root, V2_PUBLISH_FILE), buildV2PublishSql(datas));
  }
  if (render) for (const w of written) await renderPngs(w.publicDir, path.join(w.localDir, 'html'), w.sheet);

  for (const data of datas) {
    console.log(`── ${data.title}`);
    for (const q of data.questions) console.log(`${String(q.number).padStart(2)} ${q.sourceLabel.padEnd(24)} 정답 ${q.answer}`);
    console.log(`maxScore ${data.maxScore}${render ? ' · PNG 렌더링 완료' : ' · PNG 생략(--no-render)'}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
