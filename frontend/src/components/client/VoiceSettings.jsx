import React, { useState, useEffect } from 'react';
import { FaVolumeUp, FaRobot, FaBrain, FaCheckCircle, FaClipboardList } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';

const VoiceSettings = () => {
    const { user } = useAuth();
    const isAIAuthorized = (user?.models || []).includes('gemma') || (user?.models || []).includes('gemini') || user?.role === 'superadmin';
    const aiName = isAIAuthorized ? 'AI' : 'Predefined';

    const [settings, setSettings] = useState({
        voice: 'default',
        pitch: 1.1,
        rate: 1.0,
        volume: 1.0,
        interactionMode: 'adaptive'
    });

    const [voices, setVoices] = useState([]);
    const [filterLang, setFilterLang] = useState('All');
    const [saveStatus, setSaveStatus] = useState(null);

    // Initial Load
    useEffect(() => {
        const stored = localStorage.getItem('voice_settings');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed) setSettings(prev => ({ ...prev, ...parsed }));
            } catch (e) {
                console.error('Failed to parse voice settings:', e);
            }
        }
    }, []);

    // Fetch Voices Logic
    useEffect(() => {
        const fetchVoices = () => {
            const available = window.speechSynthesis.getVoices();
            if (available.length > 0) {
                setVoices(available);
                // Set default if needed
                setSettings(prev => {
                    if (!prev.voice || prev.voice === 'default') {
                        return { ...prev, voice: available[0].name };
                    }
                    return prev;
                });
            }
        };

        fetchVoices();
        window.speechSynthesis.onvoiceschanged = fetchVoices;
        const interval = setInterval(fetchVoices, 1000);

        // Fetch Piper Voices (Offline Neural) if available
        if (window.electronAPI && window.electronAPI.getPiperVoices) {
            window.electronAPI.getPiperVoices().then(piperVoices => {
                if (piperVoices && piperVoices.length > 0) {
                    setVoices(prev => {
                        const existingNames = new Set(prev.map(v => v.name));
                        const newPiper = piperVoices.filter(v => !existingNames.has(v.name));
                        return [...prev, ...newPiper];
                    });
                }
            });
        }

        return () => {
            window.speechSynthesis.onvoiceschanged = null;
            clearInterval(interval);
        };
    }, []);

    const toggleMobilePresets = async (enabled) => {
        setSettings({ ...settings, enableMobilePresets: enabled });
        if (window.electronAPI && window.electronAPI.setMobilePresetsEnabled) {
            try {
                await window.electronAPI.setMobilePresetsEnabled(enabled);
                console.log(`📱 Mobile presets sync updated: ${enabled}`);
            } catch (e) {
                console.error('Failed to update mobile presets sync:', e);
            }
        }
    };

    const saveSettings = () => {
        localStorage.setItem('voice_settings', JSON.stringify(settings));
        setSaveStatus('Settings Saved Successfully!');
        setTimeout(() => setSaveStatus(null), 3000);
    };

    const testVoice = () => {
        if (!('speechSynthesis' in window)) return alert('TTS not supported');
        
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance('Voice test. I am ready to assist you.');
        const selected = voices.find(v => v.name === settings.voice);
        if (selected) utter.voice = selected;
        utter.pitch = settings.pitch;
        utter.rate = settings.rate;
        utter.volume = settings.volume;
        window.speechSynthesis.speak(utter);
    };

    const languages = ['All', ...new Set(voices.map(v => v.lang))];
    const filteredVoices = voices.filter(v => filterLang === 'All' || v.lang === filterLang);

    return (
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-8 py-6 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <FaVolumeUp /> Voice Interaction Settings
                    </h2>
                    <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mt-1">Configure {aiName} Response & Interaction Behavior</p>
                </div>
                {saveStatus && (
                    <div className="bg-green-500/20 text-green-100 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 animate-bounce">
                        <FaCheckCircle /> {saveStatus}
                    </div>
                )}
            </div>

            <div className="p-8 space-y-8">
                {/* 1. INTERACTION MODE - MOVED TO TOP FOR VISIBILITY */}
                {isAIAuthorized && (
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
                            Core Interaction Mode (Required Action)
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => setSettings({ ...settings, interactionMode: 'always_speak' })}
                                className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                                    settings.interactionMode === 'always_speak' 
                                        ? 'border-blue-600 bg-blue-50 shadow-md' 
                                        : 'border-gray-100 hover:border-gray-200'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`p-2 rounded-lg ${settings.interactionMode === 'always_speak' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                        <FaRobot />
                                    </span>
                                    {settings.interactionMode === 'always_speak' && <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>}
                                </div>
                                <h3 className="font-black text-gray-900">Always Talk</h3>
                                <p className="text-xs text-gray-500 mt-2 leading-relaxed">{aiName} will speak back to every question (Mobile or PC). Perfect for kiosks.</p>
                            </button>

                            <button
                                onClick={() => setSettings({ ...settings, interactionMode: 'adaptive' })}
                                className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                                    (settings.interactionMode === 'adaptive' || !settings.interactionMode)
                                        ? 'border-blue-600 bg-blue-50 shadow-md' 
                                        : 'border-gray-100 hover:border-gray-200'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`p-2 rounded-lg ${(settings.interactionMode === 'adaptive' || !settings.interactionMode) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                        <FaBrain />
                                    </span>
                                    {(settings.interactionMode === 'adaptive' || !settings.interactionMode) && <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>}
                                </div>
                                <h3 className="font-black text-gray-900">Adaptive (Smart)</h3>
                                <p className="text-xs text-gray-500 mt-2 leading-relaxed">{aiName} only speaks if you use your voice. Silent if you type on mobile.</p>
                            </button>
                        </div>
                        <div className="h-px bg-gray-100 mt-8"></div>
                    </div>
                )}

                {/* 2. VOICE SELECTION */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Language Filter</label>
                        <select
                            value={filterLang}
                            onChange={(e) => setFilterLang(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        >
                            {languages.map(l => <option key={l} value={l}>{l === 'All' ? '🌐 All Languages' : l}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Choose {aiName} Voice</label>
                        <select
                            value={settings.voice}
                            onChange={(e) => setSettings({ ...settings, voice: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        >
                            {filteredVoices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* 3. ENGINE TUNING */}
                <div className="space-y-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pitch</label>
                                <span className="text-blue-600 font-black">{settings.pitch.toFixed(1)}</span>
                            </div>
                            <input type="range" min="0.5" max="2" step="0.1" value={settings.pitch} onChange={(e)=>setSettings({...settings, pitch: parseFloat(e.target.value)})} className="w-full" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Speed</label>
                                <span className="text-blue-600 font-black">{settings.rate.toFixed(1)}</span>
                            </div>
                            <input type="range" min="0.5" max="2" step="0.1" value={settings.rate} onChange={(e)=>setSettings({...settings, rate: parseFloat(e.target.value)})} className="w-full" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Volume</label>
                                <span className="text-blue-600 font-black">{Math.round(settings.volume * 100)}%</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.1" value={settings.volume} onChange={(e)=>setSettings({...settings, volume: parseFloat(e.target.value)})} className="w-full" />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-gray-100"></div>

                {/* 4. MOBILE DISPLAY SETTINGS */}
                {isAIAuthorized && (
                    <>
                        <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-black text-indigo-900 flex items-center gap-2">
                                        <FaClipboardList className="text-indigo-600" /> Mobile Q&A Sync
                                    </h3>
                                    <p className="text-xs text-indigo-700/70 mt-1 font-medium italic">
                                        Enable this to show Predefined Q&A buttons on the mobile app even when using {aiName} Brain.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={settings.enableMobilePresets || false}
                                        onChange={(e) => toggleMobilePresets(e.target.checked)}
                                    />
                                    <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                        </div>
                        <div className="h-px bg-gray-100"></div>
                    </>
                )}

                {/* 5. ACTIONS */}
                <div className="flex items-center gap-4 pt-4">
                    <button
                        onClick={testVoice}
                        className="flex-1 bg-white border-2 border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-black hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                    >
                        TEST VOICE
                    </button>
                    <button
                        onClick={saveSettings}
                        className="flex-[2] bg-blue-600 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
                    >
                        APPLY & SAVE SETTINGS
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoiceSettings;
