import { useState } from 'react';
import type { MistakeEntry } from '../types';
import '../styles/examPrep.css';
import { ExamPrepStudentPicker } from './examPrep/ExamPrepStudentPicker';
import { ExamPrepStudentReport } from './examPrep/ExamPrepStudentReport';

interface Props {
  mistakes: MistakeEntry[];
  profilesMap: Record<string, string>;
  profilesGradeMap: Record<string, string>;
  scaffoldedMistakeIds: Set<string>;
  isAdmin: boolean;
  currentUserId?: string;
}

// "시험대비 분석" — 관리자는 학생을 선택해 전체 학생 리포트를 볼 수 있고(기존 그대로),
// 로그인한 모든 학생은 본인 리포트만 자동으로 볼 수 있다(학생 선택 UI 없음, 교사 전용
// 섹션은 ExamPrepStudentReport 내부에서 viewerRole로 숨김). 분석 로직/컴포넌트는 완전히
// 동일하게 재사용 — mistakes는 RLS로 이미 본인 소유 행만 내려오므로 다른 학생 데이터가
// 클라이언트에 아예 도달하지 않는다(추가로 studentId를 본인 id로 고정해 이중 보장).
export function ExamPrepAnalysis({ mistakes, profilesMap, profilesGradeMap, scaffoldedMistakeIds, isAdmin, currentUserId }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  if (!isAdmin) {
    if (!currentUserId) return null;
    return (
      <div>
        <h1 className="rn-title" style={{ marginBottom: 4 }}>📊 나의 시험대비 분석</h1>
        <p className="rn-caption" style={{ marginBottom: 16 }}>내 오답 기록을 바탕으로 시험 전 무엇을 먼저 봐야 할지 정리했어요.</p>
        <ExamPrepStudentReport
          studentId={currentUserId}
          studentName={profilesMap[currentUserId] || '나'}
          schoolGrade={profilesGradeMap[currentUserId]}
          mistakes={mistakes}
          scaffoldedMistakeIds={scaffoldedMistakeIds}
          viewerRole="student"
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="rn-title" style={{ marginBottom: 4 }}>📊 시험대비 분석</h1>
      <p className="rn-caption" style={{ marginBottom: 16 }}>학생별 오답 기록을 바탕으로 시험 전 무엇을 먼저 봐야 할지 정리해드려요.</p>
      {!selectedStudentId ? (
        <ExamPrepStudentPicker
          mistakes={mistakes}
          profilesMap={profilesMap}
          profilesGradeMap={profilesGradeMap}
          onSelect={setSelectedStudentId}
        />
      ) : (
        <ExamPrepStudentReport
          studentId={selectedStudentId}
          studentName={profilesMap[selectedStudentId] || selectedStudentId.slice(0, 8)}
          schoolGrade={profilesGradeMap[selectedStudentId]}
          mistakes={mistakes}
          scaffoldedMistakeIds={scaffoldedMistakeIds}
          onBack={() => setSelectedStudentId(null)}
          viewerRole="admin"
        />
      )}
    </div>
  );
}
