# Import school worksheets

The importer handles two-column PDFs with text layers. It preserves math glyphs as images, reads question/answer boundaries, and stitches explanations across columns and pages. It reuses the layout, whitespace, cropping, clipping checks and trimming helpers in `import_school.py`.

**The app does not currently support viewing explanations.** Explanation cropping and stitching remain available for local review only. Explanation PNGs, answer-bearing `data.json`, `review.html`, `sheet.png` and `validation.json` stay under `scripts/exam/worksheet-generated/<id>/`, which is excluded by `.gitignore`. Never add this directory to the repository or copy its contents into `src` or `public`. With `--out-dir`, the same relative directory is created under the supplied output root; keep that root local and excluded from commits too.

1. Keep source PDFs outside git. Copy `worksheet-configs/limits.json` or `derivatives.json` and update the PDF/reference root, unique paper id, school, grade, subject, unitName, question count and migration timestamp. Use `kind=worksheet`, `timeLimitMinutes=null`, `electives=[]`. For multiple curriculum chapters, provide per-question `chapters`; mistakes use these chapters while the paper list uses the original unit name.
2. Run `python scripts/exam/import_worksheet.py <config.json> --sheet`. Use `--out-dir <folder>` for a separate output root and `--force` to overwrite. Non-numeric answers stop generation unless a reviewed `questions` exception supplies number, answerType, answer and sourceAnswerText. Valid answers are choice5 1..5 or digits 0..999.
3. Open the local review HTML and compare questions, answers, points, provenance and explanations. Review warnings and validation JSON. Only question PNGs are emitted to `public/exams/<id>/q-NN.png`. The app receives neither answers nor local explanation paths.
4. The coordinator applies `20261003130000_exam_worksheets.sql` and the unpublished seed SQL. Seeds register questions, provenance and server answer keys only. Worksheets allow free mode only; maximum scores use original points. The importer never applies SQL to a live database.
5. After question/answer review, the coordinator may run the separate `publish_youngpa_worksheet_*.sql`. Unpublished papers remain hidden from student lists.

## Combining independently numbered textbook exams

`worksheet-configs/gaeplus-m3-s2-midfinal-1.json` combines selected questions from two exams in one PDF. Its `referenceRoot` is relative to the config directory; absolute roots in existing configs still work. Each `sections` entry specifies its question/solution pages, number font, answer-table rectangle, original question count, ordered `include` list, per-original-number `chapters`, and reviewed `questions` exceptions. The importer retains excluded anchors as crop boundaries and renumbers included questions consecutively across sections. `pageColumns` handles alternating page offsets, and solution `columnWindows` isolate adjacent answer blocks. `imageSegments` removes unrelated headings where necessary. Multi-line answer-table fractions require review and cannot silently become integers.

The importer also accepts `kind=school` with a positive `timeLimitMinutes` and at most 50 questions, using the existing school schema (including `20261004115900_exam_school_question_validation.sql`). The new combined paper uses 60 minutes and original points. No schema changes or database calls are made. Optional `slug` controls the seed/publish filenames. All imports now emit an answer-free `src/features/exam/data/<id>.json`; answer keys, source answer text, solution images and review assets remain local. The unpublished seed registers the production list entry through the existing RPC, so no frontend production registry is needed.

## Verification

`python -m unittest discover -s scripts/exam -p test_import_worksheet.py` checks real PDF counts, explanation stitching, local-only review assets and question-only public output. `node --test tests/exam/*.test.ts` verifies era bundles and worksheets on the same PGlite database, including provenance, grading, history and permissions. Keep the existing Python importer tests too.

`tests/exam/worksheet.browser.mjs` covers the list, free-mode start, provenance, checking an answer, submission and results without grades at 1180/820/390px. Browser execution belongs to the coordinator.

## Self-authored worksheets (no PDF)

`2026-g3m-trig-creative` (중3-2 삼각비 창의융합, 18문항) is written directly in `scripts/exam/trig-creative/questions.mjs` (background → "예를 들어," example → problem, plus a solution and a `compute` formula per question). `node scripts/exam/build_trig_creative_worksheet.mjs` verifies every answer with both trig-table values and exact values (same integer, ≥0.05 away from rounding edges), renders question PNGs and `trig-table.png` with Edge, and writes `src/features/exam/data/2026-g3m-trig-creative.json`, the unpublished seed `20261004190000_exam_trig_creative_worksheet_seed.sql` and `publish_trig_creative_worksheet.sql`. Solutions go only to the local `worksheet-generated/<id>/review.html`. Middle-school papers use `grade=9` (중3 tab); per-paper reference links (the trig table) live in `src/features/exam/ui/worksheetReferences.ts`.
