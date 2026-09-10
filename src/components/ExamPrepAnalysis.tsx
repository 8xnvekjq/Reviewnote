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
}

// 관리자 전용 "시험대비 분석" — 학생 선택 → 시험범위 지정 → 리포트, 전부 이미 로드된
// mistakes/profilesMap을 클라이언트에서 집계해 즉시 계산한다(AI 호출도, 새 Supabase 조회도,
// 새 DB 테이블도 없음 — 열 때마다 현재 데이터 기준으로 다시 계산되므로 캐시가 필요 없다).
export function ExamPrepAnalysis({ mistakes, profilesMap, profilesGradeMap, scaffoldedMistakeIds }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

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
          mistakes={mistakes}
          scaffoldedMistakeIds={scaffoldedMistakeIds}
          onBack={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}
