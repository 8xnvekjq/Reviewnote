-- 한석만TV(@HANmath) 해설 영상: 올려 둔 수능·모평 6개 × 공통·미적분·기하·확통(채널 검색 제목으로 짝지음). 운영 DB에 적용함.
insert into public.exam_paper_videos (paper_id, section, url) values
('2025-06-math','common','https://www.youtube.com/watch?v=2n7ujeupko8'),('2025-06-math','미적분','https://www.youtube.com/watch?v=dGbfxhCwoMY'),('2025-06-math','기하','https://www.youtube.com/watch?v=2DOETElXloI'),('2025-06-math','확률과 통계','https://www.youtube.com/watch?v=zcq_bvBVRqA'),
('2025-09-math','common','https://www.youtube.com/watch?v=IrmVANQubgA'),('2025-09-math','미적분','https://www.youtube.com/watch?v=bkmeViXZJD0'),('2025-09-math','기하','https://www.youtube.com/watch?v=EPIOQz3rSfE'),('2025-09-math','확률과 통계','https://www.youtube.com/watch?v=v4ZeHkX4uUw'),
('2025-11-math','common','https://www.youtube.com/watch?v=7P82MJZvFQ8'),('2025-11-math','미적분','https://www.youtube.com/watch?v=DlyHsVXQ1ZU'),('2025-11-math','기하','https://www.youtube.com/watch?v=d6Ajk0nZ7Uo'),('2025-11-math','확률과 통계','https://www.youtube.com/watch?v=-3xLSA8hZwk'),
('2026-06-math','common','https://www.youtube.com/watch?v=4p3Te-sIgoA'),('2026-06-math','미적분','https://www.youtube.com/watch?v=zBWOAOh0amQ'),('2026-06-math','기하','https://www.youtube.com/watch?v=ilIUukJ_dw0'),('2026-06-math','확률과 통계','https://www.youtube.com/watch?v=5-i98h38hPQ'),
('2026-09-math','common','https://www.youtube.com/watch?v=HvZ3Lf3zIiY'),('2026-09-math','미적분','https://www.youtube.com/watch?v=BtOMqzz0KS4'),('2026-09-math','기하','https://www.youtube.com/watch?v=b1BSiU8Evco'),('2026-09-math','확률과 통계','https://www.youtube.com/watch?v=7ZzmMjKny6w'),
('2026-11-math','common','https://www.youtube.com/watch?v=HikNy1xFcLw'),('2026-11-math','미적분','https://www.youtube.com/watch?v=YWecEng8lJU'),('2026-11-math','기하','https://www.youtube.com/watch?v=F9ldJO-cH4c'),('2026-11-math','확률과 통계','https://www.youtube.com/watch?v=RgZoPkVocfA')
on conflict (paper_id, section) do update set url = excluded.url, updated_at = now();

-- 2025년 10월 고3 학력평가(2026수능대비 10월 학평): 한석만TV에 공통·미적분 해설만 있음.
insert into public.exam_paper_videos (paper_id, section, url) values
('2025-10-g3-math','common','https://www.youtube.com/watch?v=L_ZDmWRU0j0'),('2025-10-g3-math','미적분','https://www.youtube.com/watch?v=iAkD2z_PlSA')
on conflict (paper_id, section) do update set url = excluded.url, updated_at = now();
