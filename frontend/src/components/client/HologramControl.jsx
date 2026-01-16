import React, { useState, useEffect } from 'react';
import { isElectron } from '../../utils/electron';

const HologramControl = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVideo, setCurrentVideo] = useState(null);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (isElectron() && window.electronAPI) {
      const status = await window.electronAPI.getHologramStatus();
      setIsConnected(status.isConnected || false);
    }
  };

  const testHologram = async () => {
    if (!isElectron() || !window.electronAPI) {
      alert('Hologram control is only available in the desktop app');
      return;
    }

    try {
      const videos = JSON.parse(localStorage.getItem('videos') || '[]');
      const primaryVideoId = localStorage.getItem('primary_video');
      const video = videos.find(v => v.id === parseInt(primaryVideoId));

      if (!video) {
        alert('Please set a primary video first');
        return;
      }

      const result = await window.electronAPI.playHologramVideo(video);
      if (result.success) {
        setIsPlaying(true);
        setCurrentVideo(video.name);
      } else {
        alert('Failed to play video: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to test hologram:', error);
      alert('Failed to test hologram');
    }
  };

  const stopHologram = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.stopHologramVideo();
      if (result.success) {
        setIsPlaying(false);
        setCurrentVideo(null);
      }
    } catch (error) {
      console.error('Failed to stop hologram:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">Hologram Fan Control</h2>

      {!isElectron() ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">Hologram control is only available in the desktop app</p>
          <p className="text-sm">Please use the PC app to control the hologram fan</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connection Status */}
          <div className={`p-4 rounded-lg ${isConnected ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <p className="font-semibold">
              HDMI Connection: <span className={isConnected ? 'text-green-600' : 'text-yellow-600'}>
                {isConnected ? 'Connected' : 'Not Detected'}
              </span>
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {isConnected
                ? 'Hologram fan is connected via HDMI'
                : 'Please connect the hologram fan via HDMI cable'}
            </p>
          </div>

          {/* Control */}
          <div className="border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold mb-4">Video Control</h3>
            
            {isPlaying ? (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <p className="text-sm text-gray-600">Currently Playing:</p>
                  <p className="font-semibold">{currentVideo || 'Unknown'}</p>
                </div>
                <button
                  onClick={stopHologram}
                  className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  Stop Video
                </button>
              </div>
            ) : (
              <button
                onClick={testHologram}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Test Hologram Video
              </button>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Setup Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>Connect the hologram fan to your PC via HDMI cable</li>
              <li>Set a primary video in the Videos tab</li>
              <li>Click "Test Hologram Video" to verify playback</li>
              <li>Videos will automatically play when questions are asked from mobile app</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default HologramControl;






