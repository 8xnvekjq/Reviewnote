import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import type { MistakeEntry } from '../types';

interface ScaffoldingThread {
  mistakeId: string;
  studentId: string;
  studentName: string;
  mistakeTitle: string;
  grade?: string;
  chapter?: string;
  scaffoldingCount: number;
  latestImageUrl: string;
  latestCaption: string;
  latestTimestamp: string;
  mistakeEntry: MistakeEntry;
}

interface ScaffoldingListPanelProps {
  currentUserId: string;
  isAdmin?: boolean;
  onSelectMistake: (entry: MistakeEntry) => void;
}

export const ScaffoldingListPanel: React.FC<ScaffoldingListPanelProps> = ({
  currentUserId,
  isAdmin = false,
  onSelectMistake,
}) => {
  const [threads, setThreads] = useState<ScaffoldingThread[]>([]);
  const [loading, setLoading] = useState(true);

  const loadScaffoldings = async () => {
    if (!currentUserId) return;
    try {
      setLoading(true);

      // 1. Fetch scaffoldings
      let query = supabase
        .from('mistake_scaffoldings')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('student_id', currentUserId); // 🔒 학생은 본인의 스캐폴딩 힌트 내역만 조회
      }

      const { data: rows, error: sErr } = await query;
      if (sErr) throw sErr;

      if (!rows || rows.length === 0) {
        setThreads([]);
        return;
      }

      // Group by mistake_id
      const grouped: Record<string, any[]> = {};
      rows.forEach((r: any) => {
        if (!grouped[r.mistake_id]) grouped[r.mistake_id] = [];
        grouped[r.mistake_id].push(r);
      });

      const mistakeIds = Object.keys(grouped);

      // 2. Fetch profiles for student names
      const studentIds = Array.from(new Set(rows.map((r: any) => r.student_id)));
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, nickname, display_name, email')
        .in('id', studentIds);

      const profileMap: Record<string, string> = {};
      (profileRows || []).forEach((p: any) => {
        profileMap[p.id] = p.nickname || p.display_name || (p.email || '').split('@')[0] || '';
      });

      // 3. Fetch mistake entries
      const { data: mistakeRows, error: mErr } = await supabase
        .from('mistakes')
        .select('*')
        .in('id', mistakeIds);

      if (mErr) throw mErr;

      const list: ScaffoldingThread[] = [];

      (mistakeRows || []).forEach((m: any) => {
        const scList = grouped[m.id] || [];
        if (scList.length === 0) return;

        // Sort ascending by date
        scList.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const latest = scList[scList.length - 1];
        const studentName = profileMap[m.user_id] || profileMap[latest.student_id] || '';

        const entry: MistakeEntry = {
          id: m.id,
          title: m.title,
          imageUrl: m.image_url,
          userId: m.user_id,
          date: m.date,
          updatedAt: m.updated_at,
          analysis: m.analysis,
          reviews: m.reviews,
          grade: m.grade,
          chapter: m.chapter,
          rootCauses: m.root_causes,
          userActionPlan: m.user_action_plan,
        };

        list.push({
          mistakeId: m.id,
          studentId: m.user_id,
          studentName,
          mistakeTitle: m.title,
          grade: m.grade,
          chapter: m.chapter,
          scaffoldingCount: scList.length,
          latestImageUrl: latest.image_url,
          latestCaption: latest.caption || '선생님 풀이 힌트',
          latestTimestamp: latest.created_at,
          mistakeEntry: entry,
        });
      });

      // 📍 최근 스캐폴딩 힌트가 첨부된 순서(최신순)로 정렬하여 맨 위에 표출
      list.sort((a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime());
      setThreads(list);
    } catch (err) {
      console.error('Failed to load scaffolding list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScaffoldings();
  }, [currentUserId, isAdmin]);

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSec < 60) return '방금 전';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}분 전`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}시간 전`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay}일 전`;
    } catch {
      return '최근';
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-12 animate-fade-in">
      {/* ── 헤더 타이틀 바 ────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border border-slate-800 p-4 rounded-3xl shadow-lg flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-2xl animate-bounce">🧩</span>
          <div>
            <h2 className="text-base font-black text-white flex items-center space-x-2 whitespace-nowrap">
              <span>Scaffolding(스캐폴딩)</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isAdmin ? '선생님이 첨부한 풀이 힌트 이력 (스캐폴딩)' : '선생님이 올려주신 힌트 사진 모음 (스캐폴딩)'}
            </p>
          </div>
        </div>

        <button
          onClick={loadScaffoldings}
          className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-750 px-2.5 py-1.5 rounded-xl border border-slate-700 font-bold transition-all flex-none"
          title="새로고침"
        >
          🔄
        </button>
      </div>

      {/* ── 스캐폴딩 미니 카드 목록 (최신순) ───────────────────────── */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-xs font-bold space-y-2">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>스캐폴딩 힌트 목록을 불러오는 중...</p>
        </div>
      ) : threads.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center text-xs text-slate-500 space-y-2">
          <span className="text-3xl block">🧩</span>
          <p>등록된 스캐폴딩 힌트 내역이 없습니다.</p>
          <p className="text-[11px] text-slate-600">
            선생님이 문제 카드에 힌트 사진을 남기면 이곳에서 한눈에 모아볼 수 있습니다!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map(t => (
            <div
              key={t.mistakeId}
              onClick={() => onSelectMistake(t.mistakeEntry)}
              className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer shadow-lg group space-y-2.5"
            >
              {/* 카드 상단: 학생 이름 / 작성 시각 */}
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black text-white group-hover:text-amber-300 transition-colors">
                    {t.studentName ? `${t.studentName} 학생의 오답노트` : '오답노트'}
                  </span>
                  <span className="text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                    🧩 힌트 {t.scaffoldingCount}개
                  </span>
                </div>

                <span className="text-[10px] text-amber-400 font-bold">
                  {formatRelativeTime(t.latestTimestamp)}
                </span>
              </div>

              {/* 문제 정보 & 힌트 사진/이모지 섬네일 */}
              <div className="flex items-center space-x-3">
                {/* 힌트 사진/이모지 썸네일 */}
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-800 bg-black flex-none flex items-center justify-center">
                  {t.latestImageUrl ? (
                    <img src={t.latestImageUrl} alt="Thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <span className="text-2xl select-none">🐶</span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center space-x-1.5">
                    {t.grade && (
                      <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-bold flex-none">
                        {t.grade}
                      </span>
                    )}
                    <h4 className="text-xs font-extrabold text-slate-200 truncate group-hover:text-white">
                      {t.mistakeTitle}
                    </h4>
                  </div>

                  <p className="text-[11.5px] text-slate-400 truncate">
                    <span className="text-amber-300 font-semibold">
                      {t.latestCaption ? `🐶 : ${t.latestCaption}` : '🧩 손글씨 힌트 첨부됨'}
                    </span>
                  </p>
                </div>

                {/* 문제 바로가기 이동 버튼 */}
                <div className="flex flex-col items-end space-y-1 flex-none">
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-xl font-black group-hover:bg-amber-500 group-hover:text-slate-950 transition-all shadow-sm">
                    힌트 보기 →
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
