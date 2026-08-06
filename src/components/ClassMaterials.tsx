import React, { useState } from 'react';

interface MaterialItem {
  id: string;
  title: string;
  subtitle: string;
  grade: '고1' | '고2' | '고3' | '중등';
  category: string;
  date: string;
  htmlUrl: string;
  badge?: string;
  description: string;
  iconEmoji: string;
}

const MATERIAL_LIST: MaterialItem[] = [
  {
    id: 'g3-junkiller-3',
    title: '고3 준킬러 스피드 & 숏컷 클리닉 (특강 3탄)',
    subtitle: '수능 대비 준킬러 문제 및 스피드 숏컷 풀이 특강',
    grade: '고3',
    category: '수능 특강',
    date: '2026-08-06',
    htmlUrl: '/materials/g3_junkiller_clinic_3.html',
    badge: 'NEW',
    description: '준킬러 문항 정복을 위한 스피드 숏컷 공식과 핵심 유형별 인터랙티브 슬라이드 특강 자료입니다.',
    iconEmoji: '🔥'
  }
];

export const ClassMaterials: React.FC = () => {
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [activeViewerItem, setActiveViewerItem] = useState<MaterialItem | null>(null);

  const gradeOptions = [
    { label: '전체 자료', value: 'all' },
    { label: '고3', value: '고3' },
    { label: '고2', value: '고2' },
    { label: '고1', value: '고1' },
    { label: '중등', value: '중등' },
  ];

  const filteredMaterials = MATERIAL_LIST.filter(item => {
    if (selectedGrade === 'all') return true;
    return item.grade === selectedGrade;
  });

  return (
    <div className="space-y-6 animate-scale-up pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-5 rounded-3xl border border-indigo-500/20 shadow-lg">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">📚</span>
            <h2 className="text-xl font-extrabold text-white tracking-tight">수업자료실</h2>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              고3 전용 포함
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            선생님이 직접 검증하신 개념 슬라이드 및 특강 자료를 확인하세요.
          </p>
        </div>
      </div>

      {/* Grade Filter Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
        {gradeOptions.map(option => {
          const isActive = selectedGrade === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setSelectedGrade(option.value)}
              className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all duration-200 flex-none ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-105'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Material List */}
      {filteredMaterials.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-10 text-center space-y-3">
          <span className="text-4xl block opacity-60">📁</span>
          <p className="text-sm font-bold text-slate-400">선택하신 학년의 수업자료가 아직 없습니다.</p>
          <p className="text-xs text-slate-500">다른 학년 탭을 선택해 주시거나 선생님께 문의해 주세요.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredMaterials.map(item => (
            <div
              key={item.id}
              className="relative bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/30 border border-slate-800/90 hover:border-indigo-500/40 rounded-3xl p-5 shadow-xl transition-all duration-300 hover:-translate-y-1 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform">
                    {item.iconEmoji}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {item.grade}
                      </span>
                      <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-800/50">
                        {item.category}
                      </span>
                      {item.badge && (
                        <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30 animate-pulse">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-extrabold text-white mt-1 group-hover:text-indigo-300 transition-colors">
                      {item.title}
                    </h3>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 mt-3 leading-relaxed font-medium">
                {item.description}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">
                  등록일: {item.date}
                </span>

                <button
                  onClick={() => setActiveViewerItem(item)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 transition-all hover:scale-105"
                >
                  <span>수업자료 열기</span>
                  <span className="text-xs">➔</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HTML Material Viewer Modal */}
      {activeViewerItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <span className="text-xl flex-none">{activeViewerItem.iconEmoji}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-white truncate">
                    {activeViewerItem.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    {activeViewerItem.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 flex-none">
                <a
                  href={activeViewerItem.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors items-center space-x-1"
                >
                  <span>새 창에서 크게보기</span>
                  <span>↗</span>
                </a>
                <button
                  onClick={() => setActiveViewerItem(null)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-base font-bold transition-colors"
                  title="닫기"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body (Iframe) */}
            <div className="flex-1 bg-slate-950 relative">
              <iframe
                src={activeViewerItem.htmlUrl}
                title={activeViewerItem.title}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
