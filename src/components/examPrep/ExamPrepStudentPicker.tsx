import { useMemo } from 'react';
import type { MistakeEntry } from '../../types';
import { AppIcon } from '../ui/AppIcon';

interface Props {
  mistakes: MistakeEntry[];
  profilesMap: Record<string, string>;
  profilesGradeMap: Record<string, string>;
  onSelect: (studentId: string) => void;
}

// 시험대비 분석 대상은 고1로 한정(현재 운영 학년) — profilesGradeMap은 get_profile_directory가
// 관리자 계정을 이미 제외하고 내려주므로 별도의 admin/테스트 계정 필터링이 필요 없다.
export function ExamPrepStudentPicker({ mistakes, profilesMap, profilesGradeMap, onSelect }: Props) {
  const students = useMemo(() => {
    return Object.keys(profilesGradeMap)
      .filter(id => profilesGradeMap[id] === '고1')
      .map(id => {
        const own = mistakes.filter(m => m.userId === id);
        const latest = own.reduce<string | null>((acc, m) => (!acc || m.date > acc ? m.date : acc), null);
        return { id, name: profilesMap[id] || id.slice(0, 8), count: own.length, latest };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [mistakes, profilesMap, profilesGradeMap]);

  return (
    <div>
      <p className="rn-caption" style={{ marginBottom: 14 }}>고1 학생을 선택하면 시험범위를 지정해 분석할 수 있어요.</p>
      {students.length === 0 ? (
        <div className="rn-empty"><span>고1로 등록된 학생이 없어요.</span></div>
      ) : (
        <div className="rn-examprep-student-grid">
          {students.map(s => (
            <button type="button" key={s.id} className="rn-examprep-student-card" onClick={() => onSelect(s.id)}>
              <span>
                <span className="rn-examprep-student-name">{s.name}</span>
                <span className="rn-examprep-student-sub">
                  {s.count > 0 ? `오답노트 ${s.count}건${s.latest ? ` · 최근 ${s.latest.slice(5, 10).replace('-', '/')}` : ''}` : '등록된 오답노트 없음'}
                </span>
              </span>
              <AppIcon name="arrow" width={16} height={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
