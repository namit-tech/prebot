import React, { useState } from 'react';
import PredefinedAdmin from '../modules/PredefinedAdmin';
import { FaInfoCircle } from 'react-icons/fa';

const QAManagement = () => {
  const [showInfoModal, setShowInfoModal] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-2xl font-bold">Q&A Management</h2>
        <button 
          onClick={() => setShowInfoModal(true)}
          className="text-gray-400 hover:text-blue-500 transition-colors"
          title="How does Q&A management work?"
        >
          <FaInfoCircle className="text-xl" />
        </button>
      </div>
      
      <PredefinedAdmin />

      {/* Q&A Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200 border border-gray-100">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-3xl shadow-sm">
                <FaInfoCircle />
              </div>
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Q&A Management</h3>
                <p className="text-blue-600 text-xs font-black uppercase tracking-widest">Dual-Purpose Module</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <section className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <h4 className="text-gray-900 font-black text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    AI Brain Mode
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed font-medium">
                    If you use the <strong>AI Brain</strong> module, you only need to set the questions here. The AI will automatically generate dynamic, conversational answers as a response.
                  </p>
                </section>

                <section className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <h4 className="text-gray-900 font-black text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Predefined Mode
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed font-medium">
                    In <strong>Predefined</strong> mode, you set both questions and answers. The system will strictly return only the static answers you have manually stated.
                  </p>
                </section>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border-l-4 border-amber-400">
                <p className="text-amber-800 text-xs font-black leading-relaxed italic">
                  "This module working is totally dependent which model you have purchased from elloIndia"
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              className="mt-8 w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QAManagement;






