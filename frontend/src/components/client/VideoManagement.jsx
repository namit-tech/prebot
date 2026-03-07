import React, { useState, useEffect } from 'react';
import { isElectron } from '../../utils/electron';
import { FaInfoCircle } from 'react-icons/fa';

const VideoManagement = () => {
  const [videos, setVideos] = useState([]);
  const [primaryVideo, setPrimaryVideo] = useState(null);
  const [processingVideo, setProcessingVideo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
     
    loadVideos();
  }, []);

  const loadVideos = () => {
    // Load from localStorage or Electron storage
    const stored = localStorage.getItem('videos') || '[]';
    const storedVideos = JSON.parse(stored);
    setVideos(storedVideos);
    
    const storedPrimary = localStorage.getItem('primary_video');
    if (storedPrimary) {
      setPrimaryVideo(Number(storedPrimary));
    }

    const storedProcessing = localStorage.getItem('processing_video');
    if (storedProcessing) {
      setProcessingVideo(Number(storedProcessing));
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please select a video file');
      return;
    }

    setUploading(true);

    try {
      // In Electron, save file to app data directory
      // In browser, convert to base64 or use FileReader
      if (isElectron() && window.electronAPI) {
        const result = await window.electronAPI.saveVideo(file.path, file.name);
        const newVideo = {
          id: Date.now(),
          name: file.name,
          path: result.path,
          size: file.size,
          type: file.type,
          createdAt: new Date().toISOString()
        };
        
        const updatedVideos = [...videos, newVideo];
        setVideos(updatedVideos);
        localStorage.setItem('videos', JSON.stringify(updatedVideos));
        setSaveStatus('Video Uploaded Successfully');
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        // Browser fallback - convert to base64
        const reader = new FileReader();
        reader.onload = (event) => {
          const newVideo = {
            id: Date.now(),
            name: file.name,
            data: event.target.result,
            size: file.size,
            type: file.type,
            createdAt: new Date().toISOString()
          };
          
          const updatedVideos = [...videos, newVideo];
          setVideos(updatedVideos);
          localStorage.setItem('videos', JSON.stringify(updatedVideos));
          setSaveStatus('Video Uploaded Successfully');
          setTimeout(() => setSaveStatus(null), 3000);
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('Failed to upload video:', error);
      alert('Failed to upload video');
    } finally {
      setUploading(false);
    }
  };

  const setAsPrimary = (videoId) => {
    setPrimaryVideo(videoId);
    localStorage.setItem('primary_video', videoId);
    
    setSaveStatus('Primary video synchronized successfully');
    setTimeout(() => setSaveStatus(null), 3000);
    
    // Notify Electron if available
    if (isElectron() && window.electronAPI) {
      const video = videos.find(v => v.id === videoId);
      if (video) {
        console.log('✅ Set Primary Video:', video.name);
        window.electronAPI.setPrimaryVideo(video);
      }
    }
  };

  const setAsProcessing = (videoId) => {
    setProcessingVideo(videoId);
    localStorage.setItem('processing_video', videoId);
    
    setSaveStatus('Thinking video synchronized successfully');
    setTimeout(() => setSaveStatus(null), 3000);
    
    const video = videos.find(v => v.id === videoId);
    if (video) {
        console.log('✅ Set Thinking Video:', video.name);
    }
  };

  const deleteVideo = (videoId) => {
    if (confirm('Are you sure you want to delete this video?')) {
      const updatedVideos = videos.filter(v => v.id !== videoId);
      setVideos(updatedVideos);
      localStorage.setItem('videos', JSON.stringify(updatedVideos));
      
      if (primaryVideo === videoId) {
        setPrimaryVideo(null);
        localStorage.removeItem('primary_video');
      }

      if (processingVideo === videoId) {
        setProcessingVideo(null);
        localStorage.removeItem('processing_video');
      }
      
      // Delete from Electron storage
      if (isElectron() && window.electronAPI) {
        const video = videos.find(v => v.id === videoId);
        if (video && video.path) {
          window.electronAPI.deleteVideo(video.path);
        }
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Video Management</h2>
          <button 
            onClick={() => setShowInfoModal(true)}
            className="text-gray-400 hover:text-blue-500 transition-colors"
            title="What are Primary and Thinking videos?"
          >
            <FaInfoCircle className="text-xl" />
          </button>
        </div>
        <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
          {uploading ? 'Uploading...' : '+ Upload Video'}
          <input
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
          <p className="text-lg font-bold text-slate-700 mb-2">No videos uploaded yet</p>
          <p className="text-xs uppercase font-black tracking-widest text-slate-400">Click "+ Upload Video" to begin</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => {
            const isPrimary = primaryVideo === video.id;
            const isThinking = processingVideo === video.id;
            
            return (
              <div
                key={video.id}
                className={`relative group rounded-[1.5rem] p-4 transition-all duration-300 border-2 overflow-hidden shadow-sm hover:shadow-md ${
                  isPrimary 
                    ? 'border-blue-600 bg-blue-50/30 ring-4 ring-blue-500/10' 
                    : isThinking 
                    ? 'border-indigo-600 bg-indigo-50/30 ring-4 ring-indigo-500/10'
                    : 'border-slate-100 bg-white hover:border-slate-200'
                }`}
              >
                {/* Header Info */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`font-black text-sm transition-colors ${isPrimary ? 'text-blue-900' : isThinking ? 'text-indigo-900' : 'text-slate-800'}`}>
                      {video.name.length > 25 ? video.name.substring(0, 22) + '...' : video.name}
                    </h3>
                  </div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    {formatFileSize(video.size)} • {new Date(video.createdAt).toLocaleDateString()}
                  </p>
                </div>
                
                {/* Badges Overlay */}
                <div className="flex gap-2 mb-4">
                  {isPrimary && (
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-lg uppercase tracking-widest shadow-lg shadow-blue-200">Primary</span>
                  )}
                  {isThinking && (
                    <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-lg uppercase tracking-widest shadow-lg shadow-indigo-200">Thinking</span>
                  )}
                </div>
                
                {/* Control Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  {!isPrimary && (
                    <button
                      onClick={() => setAsPrimary(video.id)}
                      className="flex-1 px-3 py-2 bg-slate-50 hover:bg-blue-600 text-slate-600 hover:text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-widest border border-slate-100 hover:border-blue-600 active:scale-95"
                    >
                      Primary
                    </button>
                  )}
                  {!isThinking && (
                    <button
                      onClick={() => setAsProcessing(video.id)}
                      className="flex-1 px-3 py-2 bg-slate-50 hover:bg-indigo-600 text-slate-600 hover:text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-widest border border-slate-100 hover:border-indigo-600 active:scale-95"
                    >
                      Thinking
                    </button>
                  )}
                  <button
                    onClick={() => deleteVideo(video.id)}
                    className="p-2 bg-red-50 text-red-500 hover:bg-red-600 hover:text-white text-[10px] font-black rounded-xl transition-all border border-red-100 hover:border-red-600 active:scale-95"
                    title="Delete Video"
                  >
                    DELETE
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- SUCCESS TOAST (CENTERED MODEL) --- */}
      {saveStatus && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-300">
          <div className="bg-white/95 backdrop-blur-2xl border border-emerald-500/20 px-10 py-8 rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(16,185,129,0.25)] flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 bg-emerald-500 text-white rounded-[1.25rem] flex items-center justify-center text-3xl shadow-xl shadow-emerald-200 animate-bounce">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none mb-2">Success!</h3>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">{saveStatus}</p>
            </div>
          </div>
        </div>
      )}


      {/* Display Controls Guide */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>📺</span> Display Screen Controls
        </h3>
        <p className="text-gray-600 mb-4 text-sm">
            Use these keyboard shortcuts on the <strong>Display Window</strong> to adjust the video for your screen (Holobox, Laptop, etc.).
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-3 rounded shadow-sm">
                <div className="font-bold text-gray-800">Zoom / Scale</div>
                <div className="text-sm text-gray-500">Press <kbd className="bg-gray-100 px-2 py-0.5 rounded font-mono border">+</kbd> or <kbd className="bg-gray-100 px-2 py-0.5 rounded font-mono border">-</kbd></div>
            </div>
            
            <div className="bg-white p-3 rounded shadow-sm">
                <div className="font-bold text-gray-800">Move Position (Pan)</div>
                <div className="text-sm text-gray-500">Use <kbd className="bg-gray-100 px-2 py-0.5 rounded font-mono border">Arrow Keys</kbd></div>
            </div>
            
            <div className="bg-white p-3 rounded shadow-sm">
                <div className="font-bold text-gray-800">Fit Mode</div>
                <div className="text-sm text-gray-500">Press <kbd className="bg-gray-100 px-2 py-0.5 rounded font-mono border">F</kbd></div>
                <div className="text-xs text-gray-400 mt-1">Cycle: Contain / Cover (Holobox) / Fill</div>
            </div>
            
            <div className="bg-white p-3 rounded shadow-sm">
                <div className="font-bold text-gray-800">Rotate Screen</div>
                <div className="text-sm text-gray-500">Press <kbd className="bg-gray-100 px-2 py-0.5 rounded font-mono border">R</kbd></div>
                <div className="text-xs text-gray-400 mt-1">Rotates 90° (For vertical screens)</div>
            </div>
            
             <div className="bg-white p-3 rounded shadow-sm">
                <div className="font-bold text-gray-800">Reset Settings</div>
                <div className="text-sm text-gray-500">Press <kbd className="bg-gray-100 px-2 py-0.5 rounded font-mono border">0</kbd></div>
            </div>
        </div>
      </div>

      {/* Video Role Information Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-2xl">
                <FaInfoCircle />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Understanding Video Roles</h3>
            </div>
            
            <div className="space-y-6">
              <section className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                <h4 className="text-indigo-900 font-bold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  Thinking Video
                </h4>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Its best use case is in <strong>AI Brain mode</strong> (Hands-free, Hardware Mute button, etc.). While the system takes time to understand your voice and generate a response, this video shows that the system is "thinking". It provides immediate visual feedback that the AI is working.
                </p>
              </section>

              <div className="flex justify-center py-2 text-blue-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>

              <section className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h4 className="text-blue-900 font-bold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Primary Video
                </h4>
                <p className="text-gray-600 text-sm leading-relaxed">
                  This is your main avatar's video. As soon as the AI response is ready, the system <strong>automatically switches</strong> from the Thinking video to this Primary video to deliver the message.
                </p>
              </section>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              className="mt-8 w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoManagement;






