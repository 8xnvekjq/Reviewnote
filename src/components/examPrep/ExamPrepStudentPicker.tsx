import { useMemo } from 'react';
import type { MistakeEntry } from '../../types';
import { AppIcon } from '../ui/AppIcon';
import { buildExamPrepStudentList, NO_GRADE_LABEL } from '../../utils/examPrepStudentList';

interface Props {
  mistakes: MistakeEntry[];
  profilesMap: Record<string, string>;
  profilesGradeMap: Record<string, string>;
  // 관리자 화면에서만 제외할 계정(예: QA용 test 계정) — App.tsx가 username으로 식별해 넘겨준다.
  excludedStudentIds?: Set<string>;
  onSelect: (studentId: string) => void;
}

// 목록 계산(필터/정렬) 자체는 examPrepStudentList.ts의 순수 함수로 분리돼 있다 — 여기서는
// 그 결과를 렌더링만 한다. 이전에는 '고1'/'고2'만 통과시켰는데, 관리자는 모든 학생을 선택할 수
// 있어야 한다는 정책과 어긋났다(고3/중3 실제 학생이 목록에서 통째로 빠짐). 이제는 학년으로
// 거르지 않고 excludedStudentIds(실제 학생이 아닌 계정)만 제외한다.
export function ExamPrepStudentPicker({ mistakes, profilesMap, profilesGradeMap, excludedStudentIds, onSelect }: Props) {
  const students = useMemo(
    () => buildExamPrepStudentList(mistakes, profilesMap, profilesGradeMap, excludedStudentIds),
    [mistakes, profilesMap, profilesGradeMap, excludedStudentIds],
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
                  {s.grade || NO_GRADE_LABEL} · {s.count > 0 ? `오답노트 ${s.count}건${s.latest ? ` · 최근 ${s.latest.slice(5, 10).replace('-', '/')}` : ''}` : '등록된 오답노트 없음'}
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
