import React, { useState, useEffect } from 'react';

const VoiceSettings = () => {
  const [settings, setSettings] = useState({
    voice: 'default',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    interactionMode: 'adaptive'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    const stored = localStorage.getItem('voice_settings');
    if (stored) {
      setSettings(JSON.parse(stored));
    }
  };

  const saveSettings = () => {
    localStorage.setItem('voice_settings', JSON.stringify(settings));
    alert('Voice settings saved!');
  };

  const testVoice = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('This is a test of the voice settings.');
      utterance.voice = speechSynthesis.getVoices().find(v => v.name === settings.voice) || null;
      utterance.pitch = settings.pitch;
      utterance.rate = settings.rate;
      utterance.volume = settings.volume;
      speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech is not supported in your browser');
    }
  };

  /* Voice Loading Logic */
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    const fetchVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) {
        setVoices(available);
        // Set default if not set or is generic 'default'
        setSettings(prev => {
            if (!prev.voice || prev.voice === 'default') {
                return { ...prev, voice: available[0].name };
            }
            return prev;
        });
      }
    };

    // 1. Try immediately
    fetchVoices();

    // 2. Listen for event
    window.speechSynthesis.onvoiceschanged = fetchVoices;

    // 3. Fallback polling
    const interval = setInterval(fetchVoices, 500);

    // 4. Fetch Piper Voices (Offline Neural)
    if (window.electronAPI && window.electronAPI.getPiperVoices) {
        window.electronAPI.getPiperVoices().then(piperVoices => {
            if (piperVoices && piperVoices.length > 0) {
                setVoices(prev => {
                    // Avoid duplicates if re-running
                    const existingNames = new Set(prev.map(v => v.name));
                    const newPiper = piperVoices.filter(v => !existingNames.has(v.name));
                    return [...prev, ...newPiper];
                });
            }
        });
    }

    // Cleanup
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      clearInterval(interval);
    };
  }, [settings.voice]);

  /* Language Filter Logic */
  const [filterLang, setFilterLang] = useState('All');
  
  // Extract unique languages
  const languages = ['All', ...new Set(voices.map(v => v.lang))];

  // Filter voices based on selection
  const filteredVoices = voices.filter(v => filterLang === 'All' || v.lang === filterLang);

  // Auto-select first voice if current selection is invalid for the filter
  useEffect(() => {
      if (filteredVoices.length > 0) {
          const isCurrentVoiceValid = filteredVoices.some(v => v.name === settings.voice);
          if (!isCurrentVoiceValid) {
              setSettings(prev => ({ ...prev, voice: filteredVoices[0].name }));
          }
      }
  }, [filterLang, voices, settings.voice]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">Voice Settings</h2>
      
      <div className="space-y-6">
        
        {/* Language Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Language/Region
          </label>
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-gray-50"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang === 'All' ? 'All Languages' : lang}
              </option>
            ))}
          </select>
        </div>

        {/* Voice Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Voice
          </label>
          <select
            value={settings.voice}
            onChange={(e) => setSettings({ ...settings, voice: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {filteredVoices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
             Don&apos;t see your language? Add more voices in Windows Settings &rarr; Time & Language &rarr; Speech.
          </p>
        </div>

        {/* Pitch */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pitch: {settings.pitch.toFixed(1)}
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.pitch}
            onChange={(e) => setSettings({ ...settings, pitch: parseFloat(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Speed: {settings.rate.toFixed(1)}
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.rate}
            onChange={(e) => setSettings({ ...settings, rate: parseFloat(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Slow</span>
            <span>Fast</span>
          </div>
        </div>

        {/* Volume */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Volume: {Math.round(settings.volume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.volume}
            onChange={(e) => setSettings({ ...settings, volume: parseFloat(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Quiet</span>
            <span>Loud</span>
          </div>
        </div>

        {/* Interaction Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Interaction Mode
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <button
                onClick={() => setSettings({ ...settings, interactionMode: 'text_only' })}
                className={`p-3 border rounded-lg text-left ${
                    settings.interactionMode === 'text_only' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                }`}
             >
                <div className="font-medium text-gray-900">Silent Mode 🔇</div>
                <div className="text-xs text-gray-500 mt-1">Text-to-text only</div>
             </button>

             <button
                onClick={() => setSettings({ ...settings, interactionMode: 'always_speak' })}
                className={`p-3 border rounded-lg text-left ${
                    settings.interactionMode === 'always_speak' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                }`}
             >
                <div className="font-medium text-gray-900">Always Talk 🗣️</div>
                <div className="text-xs text-gray-500 mt-1">Always read answers</div>
             </button>

             <button
                onClick={() => setSettings({ ...settings, interactionMode: 'adaptive' })}
                className={`p-3 border rounded-lg text-left ${
                    (settings.interactionMode === 'adaptive' || !settings.interactionMode) ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                }`}
             >
                <div className="font-medium text-gray-900">Adaptive 🧠</div>
                <div className="text-xs text-gray-500 mt-1">Match my input (Text/Voice)</div>
             </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <button
            onClick={testVoice}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Test Voice
          </button>
          <button
            onClick={saveSettings}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceSettings;

