import React, { useState, useEffect } from 'react';
import { FaMicrophone, FaDownload, FaCheckCircle, FaExclamationTriangle, FaMicrochip, FaMemory } from 'react-icons/fa';
import { SiNvidia } from 'react-icons/si';

const WhisperSetupWizard = ({ onComplete, onSkip }) => {
    const [status, setStatus] = useState('auditing');
    const [progress, setProgress] = useState(0);
    const [log, setLog] = useState('Scanning system hardware...');
    const [error, setError] = useState(null);
    const [hardware, setHardware] = useState(null);

    useEffect(() => {
        const startAudit = async () => {
            try {
                // 1. Audit Hardware
                const results = await window.electronAPI.whisperAuditHardware();
                setHardware(results);
                
                // 2. Check if model exists
                const setup = await window.electronAPI.whisperCheckSetup();
                
                if (setup.exists && setup.isComplete) {
                    setStatus('complete');
                    setTimeout(onComplete, 1500);
                } else {
                    setLog(results.hasNvidia ? 'Elite Hardware Detected.' : 'Scanning complete.');
                    setStatus('ready');
                }
            } catch (err) {
                setError('Failed to perform system audit.');
                setStatus('error');
            }
        };

        startAudit();

        const unsubProgress = window.electronAPI.onWhisperProgress((data) => {
            setProgress(data.progress);
            setLog(data.status);
        });

        return () => {
            unsubProgress();
        };
    }, []);

    const handleStartDownload = async () => {
        setStatus('downloading');
        try {
            const result = await window.electronAPI.whisperDownloadModel();
            if (result.success) {
                setStatus('complete');
                setTimeout(onComplete, 1500);
            } else {
                setError(result.error || 'Download failed.');
                setStatus('error');
            }
        } catch (err) {
            setError('Connection lost during download.');
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaMicrophone className="text-3xl" />
                    </div>
                    <h2 className="text-2xl font-bold">Neural Engine Setup</h2>
                    <p className="text-blue-100 text-sm mt-1">Smart Hardware Optimization</p>
                </div>

                {/* Content */}
                <div className="p-8">
                    {status === 'auditing' && (
                        <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-4 text-gray-600 font-medium">{log}</p>
                        </div>
                    )}

                    {status === 'ready' && hardware && (
                        <div className="space-y-6">
                            {/* Hardware Specs Card */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <div className="flex items-center gap-2 text-blue-600 mb-1">
                                        {hardware.hasNvidia ? <SiNvidia className="text-lg" /> : <FaMicrochip />}
                                        <span className="text-[10px] uppercase font-bold tracking-wider">Graphics</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-700 truncate">{hardware.gpuName}</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <div className="flex items-center gap-2 text-indigo-600 mb-1">
                                        <FaMemory />
                                        <span className="text-[10px] uppercase font-bold tracking-wider">Memory</span>
                                    </div>
                                    <p className="text-sm font-bold text-gray-700">{hardware.totalRamGB} GB RAM</p>
                                </div>
                            </div>

                            <div className="text-gray-600 text-center">
                                <p className="text-sm mb-4">We've selected the **Small Neural Model** ({hardware.hasNvidia ? 'GPU Accelerated' : 'CPU Optimized'}) for your system.</p>
                                
                                <div className="bg-blue-50 p-4 rounded-xl text-left border border-blue-100">
                                    <ul className="text-xs space-y-2 text-blue-700">
                                        <li className="flex items-start gap-2">
                                            <FaCheckCircle className="mt-0.5" /> 
                                            <span>Elite Word Recognition</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <FaCheckCircle className="mt-0.5" /> 
                                            <span>{hardware.hasNvidia ? 'High-Speed GPU Processing' : 'CPU Thread Optimization'}</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            <button 
                                onClick={handleStartDownload}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <FaDownload /> Activate Neural Core
                            </button>
                            
                            <div className="text-center">
                                <button onClick={onSkip} className="text-xs text-gray-400 hover:text-gray-600 font-medium">
                                    Skip & use basic accuracy
                                </button>
                            </div>
                        </div>
                    )}

                    {status === 'downloading' && (
                        <div className="space-y-6 text-center py-4">
                            <div className="relative w-full h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                                <div 
                                    className="absolute top-0 left-0 h-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center px-1">
                                <p className="text-sm font-bold text-blue-600">{log}</p>
                                <p className="text-sm font-mono text-gray-400">{progress}%</p>
                            </div>
                        </div>
                    )}

                    {status === 'complete' && (
                        <div className="text-center py-8">
                            <FaCheckCircle className="text-5xl text-green-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-gray-900">Optimization Complete</h3>
                            <p className="text-gray-600 mt-2">Hardware Tuning: Done.</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="space-y-6 text-center py-4">
                            <FaExclamationTriangle className="text-5xl text-amber-500 mx-auto mb-4" />
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-red-700 text-sm">
                                {error}
                            </div>
                            <button onClick={() => setStatus('auditing')} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold">Try Again</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WhisperSetupWizard;
