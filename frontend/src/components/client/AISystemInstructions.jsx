import React, { useState, useEffect } from 'react';
import { FaSave, FaExclamationTriangle, FaInfoCircle, FaMagic } from 'react-icons/fa';

const AISystemInstructions = () => {
  const [instructions, setInstructions] = useState('');
  const [status, setStatus] = useState(null); // 'saving', 'saved', 'error'

  useEffect(() => {
    const saved = localStorage.getItem('ai_system_instructions');
    if (saved) {
      setInstructions(saved);
    } else {
      // Default persona
      setInstructions("You are a helpful, professional AI assistant. Keep your responses concise and direct. Do not use markdown symbols like asterisks (*) or underscores (_) for emphasis, as your responses will be read aloud.");
    }
  }, []);

  const handleSave = () => {
    setStatus('saving');
    try {
      localStorage.setItem('ai_system_instructions', instructions);
      setStatus('saved');
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error('Failed to save instructions:', error);
      setStatus('error');
    }
  };

  const setTemplate = (template) => {
    let text = "";
    switch(template) {
        case 'concise':
            text = "Be extremely brief and to the point. No small talk. Answer directly.";
            break;
        case 'professional':
            text = "You are a professional corporate assistant. Use formal language. Avoid emojis and slang.";
            break;
        case 'friendly':
            text = "You are a warm, helpful companion. Speak in a friendly, enthusiastic tone.";
            break;
        default:
            text = "";
    }
    setInstructions(text);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl">
            <FaMagic className="text-2xl" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">AI System Persona</h2>
            <p className="text-blue-100 text-sm font-bold opacity-80 uppercase tracking-widest mt-1">Control how your assistant speaks and behaves</p>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="mb-8">
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FaInfoCircle className="text-blue-500" />
                Quick Templates
            </h3>
            <div className="flex flex-wrap gap-4">
                {['concise', 'professional', 'friendly'].map(t => (
                    <button 
                        key={t}
                        onClick={() => setTemplate(t)}
                        className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black uppercase text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all active:scale-95"
                    >
                        {t}
                    </button>
                ))}
            </div>
        </div>

        <div className="relative group">
          <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-1">System Instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Tell the AI how to behave (e.g., 'Be short and concise')..."
            className="w-full h-64 p-6 bg-slate-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-0 transition-all font-medium text-gray-700 resize-none shadow-inner"
          />
          
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm font-bold">
              {status === 'saving' && <span className="text-blue-600 animate-pulse">Saving changes...</span>}
              {status === 'saved' && <span className="text-green-600 flex items-center gap-2 border border-green-200 bg-green-50 px-3 py-1 rounded-lg">✅ Settings updated</span>}
              {status === 'error' && <span className="text-red-600 flex items-center gap-2"><FaExclamationTriangle /> Failed to save</span>}
              {!status && (
                <div className="flex items-center gap-2 text-gray-400 italic font-medium">
                  <FaInfoCircle />
                  <span>These rules apply to all AI voice and chat responses.</span>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
            >
              <FaSave />
              <span>SAVE INSTRUCTIONS</span>
            </button>
          </div>
        </div>

        <div className="mt-10 p-6 bg-amber-50 rounded-2xl border border-amber-100 border-l-8 border-l-amber-400">
            <h4 className="text-amber-800 font-black text-sm uppercase tracking-tighter mb-2">Pro Tip for Voice</h4>
            <p className="text-amber-700 text-sm font-medium leading-relaxed">
                Since you are using the Voice Assistant, avoid instructions that result in lists or long tables. 
                Instead, tell the AI to <strong>"keep responses conversational and clear of punctuation symbols like asterisks"</strong>. 
                Don't worry, the app will also automatically filter out most of these symbols for you!
            </p>
        </div>
      </div>
    </div>
  );
};

export default AISystemInstructions;
