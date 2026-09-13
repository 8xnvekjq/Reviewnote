import { useMemo } from 'react';
import type { MistakeEntry } from '../../types';
import { buildExamPrepStudentOptions } from '../../utils/examPrepStudents';
import { AppIcon } from '../ui/AppIcon';

interface Props {
  mistakes: MistakeEntry[];
  profilesMap: Record<string, string>;
  profilesGradeMap: Record<string, string>;
  onSelect: (studentId: string) => void;
}

export function ExamPrepStudentPicker({ mistakes, profilesMap, profilesGradeMap, onSelect }: Props) {
  const students = useMemo(
    () => buildExamPrepStudentOptions(mistakes, profilesMap, profilesGradeMap),
    [mistakes, profilesMap, profilesGradeMap],
  );

  return (
    <div>
      <p className="rn-caption" style={{ marginBottom: 14 }}>학생을 선택하면 시험범위를 지정해 분석할 수 있어요.</p>
      {students.length === 0 ? (
        <div className="rn-empty"><span>등록된 학생이 없어요.</span></div>
      ) : (
        <div className="rn-examprep-student-grid">
          {students.map(s => (
            <button type="button" key={s.id} className="rn-examprep-student-card" onClick={() => onSelect(s.id)}>
              <span>
                <span className="rn-examprep-student-name">{s.name}</span>
                <span className="rn-examprep-student-sub">
                  {s.grade || '학년 미상'} · {s.count > 0 ? `오답노트 ${s.count}건${s.latest ? ` · 최근 ${s.latest.slice(5, 10).replace('-', '/')}` : ''}` : '등록된 오답노트 없음'}
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
