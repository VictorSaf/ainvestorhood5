import React from 'react';
import { RefreshCw, Settings, TrendingUp, Activity, Brain } from 'lucide-react';

const Header = ({ stats, onRefresh, onSettings, onMonitoring, onAIDashboard }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-200/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <TrendingUp size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                AIInvestorHood
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {stats && (
              <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-gray-50 rounded-full">
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold text-gray-900">{stats.totalArticles}</span>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">News</span>
                </div>
                <div className="w-px h-8 bg-gray-300"></div>
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold text-gray-900">{stats.averageConfidence}%</span>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Confidence</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-1">
              <button 
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900"
                onClick={onRefresh} 
                title="Refresh News"
              >
                <RefreshCw size={20} />
              </button>
              
              <button 
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900"
                onClick={onAIDashboard} 
                title="AI Dashboard"
              >
                <Brain size={20} />
              </button>
              
              <button 
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900"
                onClick={onMonitoring} 
                title="System Monitor"
              >
                <Activity size={20} />
              </button>
              
              <button 
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900"
                onClick={onSettings} 
                title="Settings"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;