import React, { useState, useEffect } from 'react';
import { isElectron } from '../../utils/electron';

const WiFiHotspot = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [networkInfo, setNetworkInfo] = useState({
    ssid: 'PreBot-Hotspot',
    password: 'prebot123',
    ip: '192.168.137.1'
  });
  const [connectedDevices, setConnectedDevices] = useState([]);

  useEffect(() => {
    // Check if hotspot is already running
    checkHotspotStatus();
  }, []);

  const checkHotspotStatus = async () => {
    if (isElectron() && window.electronAPI) {
      const status = await window.electronAPI.getHotspotStatus();
      setIsRunning(status.isRunning || false);
      if (status.networkInfo) {
        setNetworkInfo(status.networkInfo);
      }
    }
  };

  const startHotspot = async () => {
    if (!isElectron() || !window.electronAPI) {
      alert('WiFi Hotspot is only available in the desktop app');
      return;
    }

    try {
      const result = await window.electronAPI.startHotspot({
        ssid: networkInfo.ssid,
        password: networkInfo.password
      });

      if (result.success) {
        setIsRunning(true);
        setNetworkInfo(result.networkInfo);
        alert('WiFi Hotspot started successfully!');
      } else {
        alert('Failed to start hotspot: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to start hotspot:', error);
      alert('Failed to start hotspot');
    }
  };

  const stopHotspot = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.stopHotspot();
      if (result.success) {
        setIsRunning(false);
        alert('WiFi Hotspot stopped');
      }
    } catch (error) {
      console.error('Failed to stop hotspot:', error);
    }
  };

  const getLocalIP = () => {
    // Try to get local IP address
    if (isElectron() && window.electronAPI) {
      window.electronAPI.getLocalIP().then(ip => {
        if (ip) {
          setNetworkInfo({ ...networkInfo, ip });
        }
      });
    }
  };

  useEffect(() => {
    getLocalIP();
  }, []);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">WiFi Hotspot</h2>

      {!isElectron() ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">WiFi Hotspot is only available in the desktop app</p>
          <p className="text-sm">Please use the PC app to create a hotspot</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status */}
          <div className={`p-4 rounded-lg ${isRunning ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  Status: <span className={isRunning ? 'text-green-600' : 'text-gray-600'}>
                    {isRunning ? 'Running' : 'Stopped'}
                  </span>
                </p>
              </div>
              <button
                onClick={isRunning ? stopHotspot : startHotspot}
                className={`px-6 py-2 rounded-lg font-medium ${
                  isRunning
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {isRunning ? 'Stop Hotspot' : 'Start Hotspot'}
              </button>
            </div>
          </div>

          {/* Network Info */}
          {isRunning && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold mb-4">Network Information</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">Network Name (SSID):</label>
                  <p className="text-lg font-mono font-semibold">{networkInfo.ssid}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Password:</label>
                  <p className="text-lg font-mono font-semibold">{networkInfo.password}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">IP Address:</label>
                  <p className="text-lg font-mono font-semibold">{networkInfo.ip}</p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-white rounded border border-blue-200">
                <p className="text-sm text-gray-700">
                  <strong>Instructions:</strong> Connect your mobile device to this WiFi network,
                  then open the PreBot mobile app and enter the IP address above.
                </p>
              </div>
            </div>
          )}

          {/* Settings */}
          {!isRunning && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold mb-4">Hotspot Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Network Name (SSID)
                  </label>
                  <input
                    type="text"
                    value={networkInfo.ssid}
                    onChange={(e) => setNetworkInfo({ ...networkInfo, ssid: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={isRunning}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="text"
                    value={networkInfo.password}
                    onChange={(e) => setNetworkInfo({ ...networkInfo, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={isRunning}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WiFiHotspot;






