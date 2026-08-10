import React, { useState, useEffect } from 'react';
import { FaVolumeUp, FaRobot, FaBrain, FaCheckCircle, FaClipboardList, FaMicrophone, FaHandPaper, FaInfoCircle, FaWindows, FaTrophy, FaTools } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';

const VoiceSettings = () => {
    const { user } = useAuth();
    const { activeModule } = useModule();
    const isAIAuthorized = (user?.models || []).includes('gemma') || (user?.models || []).includes('gemini') || user?.role === 'superadmin';
    const aiName = isAIAuthorized ? 'AI' : 'Predefined';

    const [settings, setSettings] = useState({
        voice: 'default',
        pitch: 1.1,
        rate: 1.0,
        volume: 1.0,
        interactionMode: 'adaptive',
        sttLanguage: 'en',
        listeningProfile: 'balanced',
        handsFreeMode: false,
        voiceGuide: false,
        wakeWord: 'hello prebot',
        fullDuplex: false,
        piperVoice: 'en_US-lessac-medium'
    });

    const [voices, setVoices] = useState([]);
    const [filterLang, setFilterLang] = useState('All');
    const [saveStatus, setSaveStatus] = useState(null);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [showGuideSyncModal, setShowGuideSyncModal] = useState(false);
    const [showListeningLangModal, setShowListeningLangModal] = useState(false);
    const [helpOS, setHelpOS] = useState('win11'); // 'win10' or 'win11'
    const [originalSettings, setOriginalSettings] = useState(null);

    const isDirty = originalSettings && JSON.stringify(settings) !== JSON.stringify(originalSettings);

    // Initial Load
    useEffect(() => {
        const stored = localStorage.getItem('voice_settings');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed) {
                    setSettings(prev => ({ ...prev, ...parsed }));
                    setOriginalSettings(parsed);
                }
            } catch (e) {
                console.error('Failed to parse voice settings:', e);
            }
        } else {
            setOriginalSettings(settings);
        }
    }, []);

    // Fetch Voices Logic
    useEffect(() => {
        const fetchVoices = () => {
            const available = window.speechSynthesis.getVoices();
            if (available.length > 0) {
                setVoices(available);
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
            } catch (e) {
                console.error('Failed to update mobile presets sync:', e);
            }
        }
    };

    const saveSettings = async () => {
        const oldSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
        localStorage.setItem('voice_settings', JSON.stringify(settings));
        setOriginalSettings(settings);
        
        // If language or profile changed and STT is active, restart it
        if (oldSettings.sttLanguage !== settings.sttLanguage || oldSettings.listeningProfile !== settings.listeningProfile) {
            console.log('[Settings] Language or Profile changed, restarting STT engine...');
            if (window.electronAPI && window.electronAPI.stopSTT) {
                await window.electronAPI.stopSTT();
                // We don't auto-start here because we are in manual mode now.
                // The user will start it when they click the button.
            }
        }

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
        <div className="bg-slate-50 rounded-[2rem] shadow-2xl border border-slate-200/50 overflow-hidden font-sans relative">
            {isDirty && (
                <div className="bg-amber-500 text-white px-6 py-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider animate-in slide-in-from-top duration-300">
                    <FaInfoCircle className="animate-pulse text-sm" />
                    <span>You have unsaved changes. Click "Save Configuration" below to apply!</span>
                </div>
            )}
            {/* Compact Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 flex justify-between items-center border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                        <FaVolumeUp size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white tracking-tight leading-tight">
                            Voice Interaction
                        </h2>
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Configuring {aiName} Systems</p>
                    </div>
                </div>
            </div>

            {/* Listening Language Info Modal */}
            {showListeningLangModal && (
                <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200 border border-slate-100">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-3xl shadow-sm">
                                <FaInfoCircle />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase">Listening Accuracy</h3>
                                <p className="text-amber-600 text-[10px] font-black uppercase tracking-widest">Accent & Language Optimization</p>
                            </div>
                        </div>
                        
                        <div className="space-y-4 text-slate-600 font-bold text-xs leading-relaxed">
                            <p>
                                This setting tells the Voice Assistant which <strong>specific language or accent</strong> you want it to prioritize while listening to your questions.
                            </p>
                            <p className="bg-amber-50 p-4 rounded-2xl border-l-4 border-amber-400 italic">
                                "Setting your native language helps the AI understand your unique tone and pronunciation, ensuring much more accurate response generation."
                            </p>
                        </div>

                        <button
                            onClick={() => setShowListeningLangModal(false)}
                            className="mt-8 w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}

            {/* Guide & Sync Info Modal */}
            {showGuideSyncModal && (
                <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200 border border-slate-100">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl shadow-sm">
                                <FaInfoCircle />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tighter italic">GUIDE & SYNC</h3>
                                <p className="text-indigo-600 text-[10px] font-black uppercase tracking-widest">System Feedback & Connectivity</p>
                            </div>
                        </div>
                        
                        <div className="space-y-5">
                            <section className="bg-indigo-50/50 p-5 rounded-3xl border border-indigo-100/50 group hover:border-indigo-300 transition-colors">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                    <h4 className="text-slate-900 font-black text-xs uppercase tracking-wider">Voice Guide</h4>
                                </div>
                                <p className="text-slate-600 text-[11px] leading-relaxed font-bold">
                                    When <strong className="text-indigo-700 underline underline-offset-4 decoration-2">OPEN</strong>, the AI speaks status updates like <span className="italic">"Listening"</span> or <span className="italic">"Processing"</span> for a premium AI-boosted experience. If <strong className="text-slate-700 underline underline-offset-4 decoration-2">CLOSED</strong>, feedback is provided via minimalist beep sounds.
                                </p>
                            </section>

                            <section className="bg-emerald-50/50 p-5 rounded-3xl border border-emerald-100/50 group hover:border-emerald-300 transition-colors">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <h4 className="text-slate-900 font-black text-xs uppercase tracking-wider">Mobile Sync</h4>
                                </div>
                                <p className="text-slate-600 text-[11px] leading-relaxed font-bold">
                                    When <strong className="text-emerald-700 underline underline-offset-4 decoration-2">ON</strong>, all 3 modules are active and your predefined questions will be synced to the <strong className="text-emerald-800">elloIndia mobile application</strong>. If <strong className="text-slate-700 underline underline-offset-4 decoration-2">OFF</strong>, only the Voice Assistant modules will operate.
                                </p>
                            </section>
                        </div>

                        <button
                            onClick={() => setShowGuideSyncModal(false)}
                            className="mt-8 w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95"
                        >
                            Understand Settings
                        </button>
                    </div>
                </div>
            )}

            <div className="p-5 space-y-5">
                {/* Section 1: Interaction Intelligence */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Mode Selection Card */}
                    <div className="lg:col-span-2 bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm flex flex-col justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                             AI Personality Mode
                        </label>
                        <div className="flex">
                            <button
                                onClick={() => setSettings({ ...settings, interactionMode: 'adaptive' })}
                                className={`group p-3 rounded-xl border-2 text-left transition-all relative overflow-hidden flex-1 ${
                                    (settings.interactionMode === 'adaptive' || !settings.interactionMode || settings.interactionMode === 'always_speak')
                                        ? 'border-indigo-600 bg-indigo-50/50' 
                                        : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'
                                }`}
                            >
                                <div className="flex items-center gap-3 relative z-10">
                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${(settings.interactionMode === 'adaptive' || !settings.interactionMode || settings.interactionMode === 'always_speak') ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 text-slate-500'}`}>
                                        <FaBrain size={14} />
                                    </span>
                                    <div>
                                        <h3 className={`text-xs font-black ${(settings.interactionMode === 'adaptive' || !settings.interactionMode || settings.interactionMode === 'always_speak') ? 'text-indigo-900' : 'text-slate-700'}`}>Smart Adaptive</h3>
                                        <p className="text-[9px] text-slate-400 font-bold mt-0.5 whitespace-nowrap">Voice only triggers when spoken to manually.</p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Quick Toggles */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm space-y-3">
                         <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                Guide & Sync
                                <button 
                                    onClick={() => setShowGuideSyncModal(true)}
                                    className="text-slate-300 hover:text-indigo-500 transition-colors"
                                >
                                    <FaInfoCircle size={10} />
                                </button>
                            </h4>
                         </div>
                         <div className="space-y-2">
                            {/* Voice Guide Toggle */}
                            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50/50 border border-slate-100 hover:border-indigo-200 transition-colors">
                                <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${settings.voiceGuide ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                        <FaVolumeUp />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-700">Voice Guide</span>
                                </div>
                                <button
                                    onClick={() => setSettings({ ...settings, voiceGuide: !settings.voiceGuide })}
                                    className={`relative w-8 h-4 rounded-full transition-all ${settings.voiceGuide ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${settings.voiceGuide ? 'left-4.5' : 'left-0.5'}`} />
                                </button>
                            </div>

                            {/* Mobile Sync Toggle */}
                            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50/50 border border-slate-100 hover:border-emerald-200 transition-colors">
                                <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${settings.enableMobilePresets ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                                        <FaClipboardList />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-700">Mobile Sync</span>
                                </div>
                                <button
                                    onClick={() => toggleMobilePresets(!settings.enableMobilePresets)}
                                    className={`relative w-8 h-4 rounded-full transition-all ${settings.enableMobilePresets ? 'bg-emerald-600' : 'bg-slate-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${settings.enableMobilePresets ? 'left-4.5' : 'left-0.5'}`} />
                                </button>
                            </div>
                         </div>
                    </div>
                </div>

                {/* Section 2: Audio Pipeline Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* STT Language */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            Listening Language
                            <button 
                                onClick={() => setShowListeningLangModal(true)}
                                className="text-slate-300 hover:text-amber-500 transition-colors"
                            >
                                <FaInfoCircle size={10} />
                            </button>
                        </label>
                        <select
                            value={settings.sttLanguage || 'en'}
                            onChange={(e) => setSettings({ ...settings, sttLanguage: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                        >
                            <option value="en">English (EN)</option>
                            <option value="hi">Hindi (HI)</option>
                            <option value="es">Spanish (ES)</option>
                            <option value="fr">French (FR)</option>
                            <option value="de">German (DE)</option>
                            <option value="it">Italian (IT)</option>
                            <option value="pt">Portuguese (PT)</option>
                            <option value="zh">Chinese (ZH)</option>
                            <option value="ja">Japanese (JA)</option>
                            <option value="ar">Arabic (AR)</option>
                        </select>
                    </div>

                    {/* Voice Selection */}
                    <div className="md:col-span-2 bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm relative">
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Speaking Voice</label>
                            <button 
                                onClick={() => setShowHelpModal(true)}
                                className="text-[9px] font-black text-indigo-600 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
                            >
                                <FaInfoCircle /> HELP
                            </button>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                            <div className="col-span-2">
                                <select
                                    value={filterLang}
                                    onChange={(e) => setFilterLang(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 outline-none appearance-none cursor-pointer"
                                >
                                    {languages.map(l => <option key={l} value={l}>{l === 'All' ? 'Languages' : l}</option>)}
                                </select>
                            </div>
                            <div className="col-span-3">
                                <select
                                    value={settings.voice || 'default'}
                                    onChange={(e) => setSettings({ ...settings, voice: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 outline-none appearance-none cursor-pointer"
                                >
                                    {filteredVoices.map(v => (
                                        <option key={v.name} value={v.name}>{v.name.length > 25 ? v.name.substring(0, 22) + '...' : v.name}</option>
                                    ))}
                                    {filteredVoices.length === 0 && <option value="default">Default System</option>}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Performance Profile */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Engine Quality</label>
                        <select
                            value={settings.listeningProfile || 'balanced'}
                            onChange={(e) => setSettings({ ...settings, listeningProfile: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                        >
                            <option value="lite">🚀 Lite Fast</option>
                            <option value="balanced">⚖️ Balanced</option>
                            <option value="power">🔥 Max Power</option>
                        </select>
                    </div>
                </div>

                {/* Section 3: Fine Tuning & Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Sliders Card */}
                    <div className="lg:col-span-2 bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 block">Audio Fidelity Controls</label>
                         <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black">
                                    <span className="text-slate-400">PITCH</span>
                                    <span className="text-indigo-600">{settings.pitch.toFixed(1)}</span>
                                </div>
                                <input type="range" min="0.5" max="2" step="0.1" value={settings.pitch} onChange={(e)=>setSettings({...settings, pitch: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black">
                                    <span className="text-slate-400">SPEED</span>
                                    <span className="text-indigo-600">{settings.rate.toFixed(1)}</span>
                                </div>
                                <input type="range" min="0.5" max="2" step="0.1" value={settings.rate} onChange={(e)=>setSettings({...settings, rate: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black">
                                    <span className="text-slate-400">VOLUME</span>
                                    <span className="text-indigo-600">{Math.round(settings.volume * 100)}%</span>
                                </div>
                                <input type="range" min="0" max="1" step="0.1" value={settings.volume} onChange={(e)=>setSettings({...settings, volume: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            </div>
                         </div>
                    </div>

                    {/* Hands Free / Wake Word */}
                    {isAIAuthorized && (
                        <div className={`rounded-2xl p-4 border transition-all duration-300 ${settings.handsFreeMode ? 'bg-indigo-600 border-indigo-700 shadow-lg shadow-indigo-200' : 'bg-white border-slate-200/60'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <label className={`text-[10px] font-black uppercase tracking-widest ${settings.handsFreeMode ? 'text-white/60' : 'text-slate-400'}`}>Hands-Free Mode</label>
                                <button
                                    onClick={() => setSettings({ ...settings, handsFreeMode: !settings.handsFreeMode })}
                                    className={`relative w-8 h-4 rounded-full transition-all ${settings.handsFreeMode ? 'bg-white' : 'bg-slate-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${settings.handsFreeMode ? 'left-4.5 bg-indigo-600' : 'left-0.5 bg-white'}`} />
                                </button>
                            </div>
                            {settings.handsFreeMode ? (
                                <div className="space-y-2 animate-in slide-in-from-top-1 duration-300">
                                    <div className="flex items-center gap-2 text-white/40 mb-1">
                                        <FaMicrophone size={10} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Wake Word</span>
                                    </div>
                                    <input 
                                        type="text" 
                                        value={settings.wakeWord || 'hello prebot'} 
                                        onChange={(e) => setSettings({ ...settings, wakeWord: e.target.value.toLowerCase() })}
                                        className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-black text-white outline-none focus:border-white/50 transition-all placeholder:text-white/20"
                                        placeholder="Enter wake word..."
                                    />
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center py-4 opacity-30 grayscale">
                                    <FaMicrophone size={24} className="text-slate-300" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Interruptible Voice (full duplex) — desktop only, needs streaming Piper */}
                    {isAIAuthorized && !!window.electronAPI?.piperStreamStart && (
                        <div className={`rounded-2xl p-4 border transition-all duration-300 ${settings.fullDuplex ? 'bg-emerald-600 border-emerald-700 shadow-lg shadow-emerald-200' : 'bg-white border-slate-200/60'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <label className={`text-[10px] font-black uppercase tracking-widest ${settings.fullDuplex ? 'text-white/60' : 'text-slate-400'}`}>Interruptible Voice</label>
                                <button
                                    onClick={() => setSettings({ ...settings, fullDuplex: !settings.fullDuplex })}
                                    className={`relative w-8 h-4 rounded-full transition-all ${settings.fullDuplex ? 'bg-white' : 'bg-slate-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${settings.fullDuplex ? 'left-4.5 bg-emerald-600' : 'left-0.5 bg-white'}`} />
                                </button>
                            </div>
                            <p className={`text-[9px] font-bold leading-relaxed ${settings.fullDuplex ? 'text-white/70' : 'text-slate-400'}`}>
                                {settings.fullDuplex
                                    ? 'Mic stays open while the assistant speaks, so users can cut in mid-sentence. Uses the offline Piper voice. If the assistant starts replying to itself, lower the speaker volume or turn this off.'
                                    : 'Assistant finishes every sentence before listening again. Turn on to allow users to interrupt.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 pt-2">
                    <button onClick={testVoice} className="flex-1 bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl text-xs font-black hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                        DEBUG AUDIO
                    </button>
                    <button 
                        onClick={saveSettings} 
                        className={`flex-[3] px-6 py-3 rounded-2xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest ${
                            isDirty 
                                ? 'bg-indigo-600 text-white shadow-[0_0_25px_rgba(99,102,241,0.6)] hover:bg-indigo-700 ring-2 ring-indigo-400 ring-offset-2 animate-pulse' 
                                : 'bg-indigo-600/80 text-white/80 hover:bg-indigo-700 shadow-lg shadow-indigo-100'
                        }`}
                    >
                        Save Configuration {isDirty ? '(Unsaved Changes)' : ''}
                    </button>
                </div>
            </div>
            
            <VoiceGuideModal 
                isOpen={showHelpModal}
                onClose={() => setShowHelpModal(false)}
                os={helpOS}
                setOS={setHelpOS}
            />

            {/* --- SUCCESS TOAST (CENTERED MODEL) --- */}
            {saveStatus && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-300">
                    <div className="bg-white/90 backdrop-blur-xl border border-emerald-500/30 px-8 py-6 rounded-[2rem] shadow-[0_20px_50px_rgba(16,185,129,0.2)] flex flex-col items-center gap-4 text-center">
                        <div className="w-16 h-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-emerald-200 animate-bounce">
                            <FaCheckCircle />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Configuration Saved!</h3>
                            <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest text-[10px]">{saveStatus}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/* --- VOICE INSTALLATION GUIDE MODAL --- */
const VoiceGuideModal = ({ isOpen, onClose, os, setOS }) => {
    if (!isOpen) return null;

    const steps = {
        win11: [
            { title: "Open Settings", desc: "Press Windows Key + I on your keyboard." },
            { title: "Time & Language", desc: "Select 'Time & language' from the left sidebar." },
            { title: "Speech Settings", desc: "Click on 'Speech' menu to see voice options." },
            { title: "Add Voices", desc: "Click 'Add voices' under Manage voices. Choose a language, then click Add." },
            { title: "Restart PreBot", desc: "Once download finishes, restart this app. New voices will appear!" }
        ],
        win10: [
            { title: "Settings", desc: "Open Start Menu and click the Gear icon (Settings)." },
            { title: "Time & Language", desc: "Select 'Time & Language' square." },
            { title: "Speech Tab", desc: "Click 'Speech' on the left sidebar." },
            { title: "Manage Voices", desc: "Click 'Add voices' under Manage voices section." },
            { title: "Restart App", desc: "Download the voice pack, then restart PreBot to use them." }
        ]
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-700 to-indigo-900 p-8 text-white relative">
                    <button 
                        onClick={onClose}
                        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl transition-all"
                    >
                        &times;
                    </button>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
                            <FaWindows />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black italic tracking-tighter">VOICE INSTALLATION GUIDE</h2>
                            <p className="text-blue-100 text-xs font-bold uppercase tracking-widest">Get High-Quality Neural Voices on your PC</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 p-1 bg-black/20 rounded-2xl w-fit">
                        <button 
                            onClick={() => setOS('win11')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${os === 'win11' ? 'bg-white text-blue-800 shadow-lg' : 'text-white/60 hover:text-white'}`}
                        >
                            WINDOWS 11
                        </button>
                        <button 
                            onClick={() => setOS('win10')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${os === 'win10' ? 'bg-white text-blue-800 shadow-lg' : 'text-white/60 hover:text-white'}`}
                        >
                            WINDOWS 10
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            {steps[os].map((step, idx) => (
                                <div key={idx} className="flex gap-4 group">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-black text-sm group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{step.title}</h4>
                                        <p className="text-xs text-gray-500 font-medium leading-relaxed">{step.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 relative overflow-hidden group">
                           <div className="relative z-10">
                                <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
                                    <FaTrophy className="text-amber-400" /> PRO TIP
                                </h3>
                                <p className="text-xs text-gray-600 font-medium leading-relaxed mb-4">
                                    Look for voices that mention <span className="text-blue-600 font-bold italic">"Natural"</span> in the settings. These are high-quality AI voices provided for free by Microsoft.
                                </p>
                                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <FaTools /> Integration
                                    </p>
                                    <p className="text-[11px] text-gray-600 font-bold leading-snug">
                                        Once installed in Windows, they automatically appear in the <span className="text-blue-600">"Speaking Voice"</span> dropdown of this app.
                                    </p>
                                </div>
                           </div>
                           <FaWindows className="absolute -bottom-8 -right-8 text-9xl text-gray-100/50 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
                        </div>
                    </div>

                    <button 
                        onClick={onClose}
                        className="w-full mt-10 py-4 bg-gray-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95"
                    >
                        GO BACK TO SETTINGS
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoiceSettings;
