// scratch/query_test_student.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wcvkmdvrowljypueucwx.supabase.co';
const supabaseKey = 'sb_publishable_BtAepfY-CiPuAsOSxJ_Y8w_ZTNZ7UWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('1. profiles 조회 중...');
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, email, display_name');

    if (pError) throw pError;
    console.log('등록된 전체 프로필:', profiles);

    console.log('\n2. 최근 등록된 오답노트 5개 조회 중...');
    const { data: mistakes, error: mError } = await supabase
      .from('mistakes')
      .select('id, user_id, title, grade, chapter, analysis, date')
      .order('date', { ascending: false })
      .limit(5);

    if (mError) throw mError;
    
    mistakes.forEach((m, idx) => {
      const prof = profiles.find(p => p.id === m.user_id);
      const studentLabel = prof 
        ? `${prof.display_name || '이름없음'} (${prof.email?.split('@')[0]})` 
        : m.user_id;

      console.log(`\n[오답 ${idx + 1}]`);
      console.log(`- 학생: ${studentLabel}`);
      console.log(`- ID: ${m.id}`);
      console.log(`- 제목: ${m.title}`);
      console.log(`- 분류: ${m.grade} > ${m.chapter}`);
      console.log(`- 본문 내용 추출 여부: ${m.analysis?.problemText ? '있음' : '없음'}`);
      if (m.analysis?.problemText) {
        console.log(`- 원문 내용: ${m.analysis.problemText.slice(0, 150)}...`);
      }
    });

  } catch (err) {
    console.error('조회 중 에러 발생:', err);
  }
}

run();
