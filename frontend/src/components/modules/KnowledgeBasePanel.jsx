import React, { useState } from 'react';
import { isElectron } from '../../utils/electron';

const KnowledgeBasePanel = ({ onContextUpdate, onClose }) => {
  const [activeFile, setActiveFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!isElectron() || !window.electronAPI) {
      setError('Document reading is only available in the desktop app.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.readDocument(file.path);
      
      if (result.success) {
        setActiveFile({ name: file.name, size: file.size });
        onContextUpdate(result.content);
      } else {
        setError(result.error);
        onContextUpdate(null);
      }
    } catch (err) {
      console.error('File read error:', err);
      setError('Failed to read document');
      onContextUpdate(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setActiveFile(null);
    onContextUpdate(null);
    setError('');
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          📚 Foundation Knowledge
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      <p className="text-slate-400 text-xs mb-4">
        Upload a PDF or TXT file to serve as a strict boundary for the AI's answers.
      </p>

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 text-xs p-2 rounded mb-3">
          {error}
        </div>
      )}

      {!activeFile ? (
        <label className={`
          flex flex-col items-center justify-center w-full h-24 border-2 border-slate-600 border-dashed rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors
          ${loading ? 'opacity-50 cursor-wait' : ''}
        `}>
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <p className="text-sm text-slate-400">
              {loading ? 'Reading document...' : 'Click to upload PDF or TXT'}
            </p>
          </div>
          <input 
            type="file" 
            className="hidden" 
            accept=".pdf,.txt" 
            onChange={handleFileSelect} 
            disabled={loading}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between bg-slate-700/50 rounded p-3 border border-slate-600">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-2xl">📄</span>
            <div className="truncate">
              <p className="text-white text-sm font-medium truncate">{activeFile.name}</p>
              <p className="text-slate-400 text-xs">{(activeFile.size / 1024).toFixed(1)} KB • Active</p>
            </div>
          </div>
          <button 
            onClick={handleClear}
            className="text-red-400 hover:text-red-300 text-sm font-medium px-2 py-1"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBasePanel;
