import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { getTitleBadgeStyle } from '../utils/gachaCatalog';

interface ActivityEvent {
  mistake_id: string;
  user_id: string;
  event_type: 'register' | 'review';
  chapter: string;
  event_time: string;
  name: string;
  equipped_title: string | null;
  equipped_theme: string | null;
}

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatRelativeTime = (isoString: string): string => {
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
    return '';
  }
};

export const RecentActivityFeed: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('recent_activity_feed')
        .select('*')
        .limit(100);
      if (fetchError) throw fetchError;
      setEvents(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || '최근 활동을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    // 실시간 갱신: 누군가 오답을 등록하거나 복습을 수행하면 새로고침 없이 즉시 반영
    const channel = supabase
      .channel('recent_activity_feed_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mistakes' }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4 w-full">
      <div>
        <h2 className="text-lg font-bold text-white">🕘 최근 활동기록</h2>
        <p className="text-xs text-slate-400 mt-0.5">최근 7일간 친구들의 오답 등록 & 복습 활동</p>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-slate-500 text-sm">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-8 text-red-400 text-xs">{error}</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-slate-600 text-xs border border-dashed border-slate-850 rounded-2xl">
          최근 7일간 활동 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-2.5">
          {events.map((ev, idx) => {
            const titleBadge = ev.equipped_title ? getTitleBadgeStyle(ev.equipped_title) : null;
            const cardStyle: React.CSSProperties = ev.equipped_theme
              ? { borderColor: hexToRgba(ev.equipped_theme, 0.5), backgroundColor: hexToRgba(ev.equipped_theme, 0.08) }
              : {};

            return (
              <div
                key={`${ev.mistake_id}-${ev.event_type}-${ev.event_time}-${idx}`}
                className="p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60 flex items-center space-x-3"
                style={cardStyle}
              >
                <span className="text-2xl flex-none">{ev.event_type === 'register' ? '📝' : '✅'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                    <span className="text-xs font-black text-white truncate">{ev.name}</span>
                    {titleBadge && (
                      <span className={`text-[8px] px-1.5 py-0.2 rounded-full border flex items-center space-x-0.5 flex-none ${titleBadge.style}`}>
                        <span>{titleBadge.icon}</span>
                        <span>{ev.equipped_title}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {ev.event_type === 'register'
                      ? `'${ev.chapter}' 오답노트를 작성했습니다`
                      : `'${ev.chapter}' 복습을 수행했습니다`}
                  </p>
                </div>
                <span className="text-[9.5px] text-slate-500 flex-none">{formatRelativeTime(ev.event_time)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
