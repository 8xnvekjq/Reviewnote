import React from 'react';
import type { ActiveTab } from '../types';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, setActiveTab }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/80 bg-slate-900/90 backdrop-blur-lg flex items-center justify-around px-6 py-2 bottom-nav-safe shadow-xl shadow-black/40">
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
    </nav>
  );
};
