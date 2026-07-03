import React from 'react';
import type { ActiveTab } from '../types';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin?: boolean;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, setActiveTab, isAdmin }) => {
  return (
    <nav className="fixed bottom-3 left-4 right-4 z-40 h-16 rounded-2xl border border-slate-800/80 bg-slate-900/75 backdrop-blur-lg flex items-center justify-around px-4 shadow-xl shadow-black/40">
      
      {/* Admin Tab (only shown when isAdmin) */}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('admin')}
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'admin' ? 'text-amber-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <span className="text-lg">👑</span>
          <span className="text-[10px] mt-0.5">어드민</span>
        </button>
      )}

      {/* Tab 1: Notes List */}
      <button 
        onClick={() => setActiveTab('notes')}
        className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'notes' ? 'text-indigo-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
      >
        <span className="text-lg">📓</span>
        <span className="text-[10px] mt-0.5">오답노트</span>
      </button>

      {/* Tab 2: Floating Camera Trigger */}
      <button 
        onClick={() => setActiveTab('camera')}
        className={`flex items-center justify-center w-14 h-14 rounded-full transition-all -translate-y-4 shadow-lg ${activeTab === 'camera' ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white scale-110 shadow-indigo-600/40 ring-4 ring-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-750 shadow-black/50 ring-4 ring-slate-950 hover:scale-105'}`}
      >
        <span className="text-xl">📷</span>
      </button>

      {/* Tab 3: Completed Reviews */}
      <button 
        onClick={() => setActiveTab('completed')}
        className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'completed' ? 'text-emerald-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
      >
        <span className="text-lg">✅</span>
        <span className="text-[10px] mt-0.5">복습완료</span>
      </button>
    </nav>
  );
};
