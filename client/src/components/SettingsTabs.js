import React, { useState } from 'react';
import SetupModal from './SetupModal';
import ScrapingPanel from './ScrapingPanel';

const SettingsTabs = ({ onClose }) => {
  const [tab, setTab] = useState('ai');
  const [setupKey, setSetupKey] = useState(0);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="px-6 pt-4">
          <div className="flex gap-6 border-b">
            <button className={`pb-2 ${tab==='ai'?'border-b-2 border-blue-600 text-blue-600':''}`} onClick={()=>setTab('ai')}>AI</button>
            <button className={`pb-2 ${tab==='scraping'?'border-b-2 border-blue-600 text-blue-600':''}`} onClick={()=>setTab('scraping')}>Scraping</button>
          </div>
        </div>
        <div className="p-6">
          {tab==='ai' && (
            // Reuse SetupModal content inline by rendering it and disabling its overlay
            <div className="max-h-[75vh] overflow-y-auto">
              <SetupModal key={setupKey} onComplete={()=>setSetupKey(setupKey+1)} />
            </div>
          )}
          {tab==='scraping' && (
            <div className="max-h-[75vh] overflow-y-auto">
              <ScrapingPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsTabs;


