import React, { useState, useEffect } from 'react';
import { isElectron } from '../../utils/electron';

const VideoManagement = () => {
  const [videos, setVideos] = useState([]);
  const [primaryVideo, setPrimaryVideo] = useState(null);
  const [uploading, setUploading] = useState(false);

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
      setPrimaryVideo(storedPrimary);
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
    
    // Notify Electron if available
    if (isElectron() && window.electronAPI) {
      const video = videos.find(v => v.id === videoId);
      if (video) {
        window.electronAPI.setPrimaryVideo(video);
      }
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
        <h2 className="text-2xl font-bold">Video Management</h2>
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
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No videos uploaded yet</p>
          <p className="text-sm">Click "Upload Video" to add your first video</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <div
              key={video.id}
              className={`border-2 rounded-lg p-4 ${
                primaryVideo === video.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              }`}
            >
              <div className="mb-2">
                <h3 className="font-semibold truncate">{video.name}</h3>
                <p className="text-sm text-gray-500">{formatFileSize(video.size)}</p>
              </div>
              
              {primaryVideo === video.id && (
                <div className="mb-2">
                  <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">Primary</span>
                </div>
              
              )}
              
              <div className="flex gap-2 mt-4">
                {primaryVideo !== video.id && (
                  <button
                    onClick={() => setAsPrimary(video.id)}
                    className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Set Primary
                  </button>
                )}
                <button
                  onClick={() => deleteVideo(video.id)}
                  className="flex-1 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
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
    </div>
  );
};

export default VideoManagement;






