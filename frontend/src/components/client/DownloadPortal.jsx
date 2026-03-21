import React from 'react';
import { FaWindows, FaAndroid, FaDownload, FaExclamationTriangle, FaShieldAlt, FaExternalLinkAlt } from 'react-icons/fa';

const DownloadPortal = () => {
    const [latestVersion, setLatestVersion] = React.useState({ 
        standard: { version: '1.0.13', filename: 'prebot-setup-v1.0.13.exe' },
        special: null 
    });
    const [os, setOs] = React.useState('unknown');

    React.useEffect(() => {
        // Simple OS detection
        const ua = window.navigator.userAgent.toLowerCase();
        if (ua.indexOf('win') !== -1) setOs('windows');
        else if (ua.indexOf('android') !== -1 || ua.indexOf('iphone') !== -1 || ua.indexOf('ipad') !== -1) setOs('mobile');

        fetch('/downloads/latest-version.json')
            .then(res => res.json())
            .then(data => {
                if (data.standard || data.special) {
                   setLatestVersion(prev => ({ ...prev, ...data }));
                }
            })
            .catch(err => console.log('[DownloadPortal] No version file found.'));
    }, []);

    const PC_DOWNLOAD_URL = `/downloads/${latestVersion.standard.filename}`;
    const SPECIAL_DOWNLOAD_URL = latestVersion.special ? `/downloads/${latestVersion.special.filename}` : '#';
    const MOBILE_DOWNLOAD_URL = '/downloads/prebot.apk';

    return (
        <div className="space-y-12 max-w-5xl mx-auto pb-20 fade-in">
            {/* Header Section */}
            <div className="text-center space-y-4">
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">GET PREBOT EVERYWHERE</h2>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Full access on your PC and mobile device</p>
            </div>

            <div className={`grid grid-cols-1 ${latestVersion.special ? 'lg:grid-cols-3' : 'md:grid-cols-2'} gap-8`}>
                {/* Windows Card */}
                <div className={`bg-white rounded-[2.5rem] shadow-xl border p-8 flex flex-col items-center text-center space-y-6 transition-all hover:scale-[1.02] active:scale-[0.98] ${os === 'windows' ? 'border-blue-500 scale-[1.05] ring-4 ring-blue-50' : 'border-slate-100'}`}>
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-inner relative">
                        <FaWindows className="text-4xl" />
                        {os === 'windows' && <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-white animate-pulse" />}
                    </div>
                    <div className="space-y-2">
                        {os === 'windows' && <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[8px] font-black tracking-widest uppercase">Recommended for you</span>}
                        <h3 className="text-xl font-black text-slate-900 leading-tight">PREBOT STANDARD</h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase">Version {latestVersion.standard.version}</p>
                    </div>
                    <div className="w-full space-y-4">
                        <a 
                            href={os === 'mobile' ? '#' : PC_DOWNLOAD_URL} 
                            onClick={(e) => os === 'mobile' && e.preventDefault()}
                            download={latestVersion.standard.filename}
                            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all ${os === 'mobile' ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200'}`}
                        >
                            <FaDownload size={14} />
                            {os === 'mobile' ? 'WINDOWS PC ONLY' : 'FOR WINDOWS'}
                        </a>
                        {os === 'mobile' && (
                            <p className="text-[9px] font-bold text-red-500 uppercase tracking-tighter leading-none italic animate-bounce">
                                Switch to your Windows PC to download this file.
                            </p>
                        )}
                    </div>
                </div>

                {/* Special Edition Card */}
                {latestVersion.special && (
                    <div className={`bg-white rounded-[2.5rem] shadow-xl border-2 p-8 flex flex-col items-center text-center space-y-6 transition-all hover:scale-[1.05] relative overflow-hidden group ${os === 'windows' ? 'border-amber-400 ring-4 ring-amber-50' : 'border-amber-200'}`}>
                        <div className="absolute top-0 right-0 bg-amber-400 text-white px-4 py-1 rounded-bl-2xl font-black text-[10px] uppercase tracking-widest shadow-md">
                            PREMIUM
                        </div>
                        <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center shadow-inner group-hover:rotate-12 transition-transform relative">
                            <FaShieldAlt className="text-4xl" />
                            {os === 'windows' && <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-white animate-pulse" />}
                        </div>
                        <div className="space-y-2">
                            {os === 'windows' && <span className="bg-amber-600 text-white px-3 py-1 rounded-full text-[8px] font-black tracking-widest uppercase">Recommended for you</span>}
                            <h3 className="text-xl font-black text-slate-900 leading-tight">SPECIAL EDITION</h3>
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">OFFLINE / STANDALONE</p>
                        </div>
                        <div className="w-full space-y-4">
                            <a 
                                href={os === 'mobile' ? '#' : SPECIAL_DOWNLOAD_URL} 
                                onClick={(e) => os === 'mobile' && e.preventDefault()}
                                download={latestVersion.special.filename}
                                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all ${os === 'mobile' ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none' : 'bg-slate-900 text-white hover:bg-black'}`}
                            >
                                <FaDownload size={14} />
                                {os === 'mobile' ? 'WINDOWS PC ONLY' : 'GET SPECIAL BUILD'}
                            </a>
                            {os === 'mobile' && (
                                <p className="text-[9px] font-bold text-red-500 uppercase tracking-tighter leading-none italic animate-bounce">
                                    Switch to your Windows PC to download this file.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Mobile Card */}
                <div className={`bg-white rounded-[2.5rem] shadow-xl border p-8 flex flex-col items-center text-center space-y-6 transition-all hover:scale-[1.02] active:scale-[0.98] ${os === 'mobile' ? 'border-emerald-500 scale-[1.05] ring-4 ring-emerald-50' : 'border-slate-100'}`}>
                    <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center shadow-inner relative">
                        <FaAndroid className="text-4xl" />
                        {os === 'mobile' && <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-white animate-pulse" />}
                    </div>
                    <div className="space-y-2">
                        {os === 'mobile' && <span className="bg-emerald-600 text-white px-3 py-1 rounded-full text-[8px] font-black tracking-widest uppercase">Recommended for you</span>}
                        <h3 className="text-xl font-black text-slate-900 leading-tight">PREBOT MOBILE</h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ANDROID APP</p>
                    </div>
                    <div className="w-full space-y-4">
                        <a 
                            href={os === 'windows' ? '#' : MOBILE_DOWNLOAD_URL} 
                            onClick={(e) => os === 'windows' && e.preventDefault()}
                            download="PreBot.apk"
                            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all ${os === 'windows' ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-200'}`}
                        >
                            <FaDownload size={14} />
                            {os === 'windows' ? 'ANDROID ONLY' : 'FOR ANDROID'}
                        </a>
                        {os === 'windows' && (
                            <p className="text-[9px] font-bold text-red-500 uppercase tracking-tighter leading-none italic animate-bounce">
                                Switch to your phone to download this file.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Warning Bypass Guide Section */}
            <div className="bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden shadow-2xl">
                {/* Decorative Background Icon */}
                <FaShieldAlt className="absolute -bottom-10 -right-10 text-slate-800 text-[20rem] opacity-20" />
                
                <div className="relative z-10 space-y-8">
                    <div className="flex items-center gap-4 border-b border-slate-700 pb-6">
                        <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                            <FaExclamationTriangle size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black leading-tight">INSTALLATION GUIDE</h3>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">How to handle Windows warnings</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-blue-400 text-sm border border-slate-700">01</span>
                                <h4 className="font-black text-sm uppercase tracking-wide">CLICK "MORE INFO"</h4>
                            </div>
                            <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                                When Windows SmartScreen appears, do not click 'Don't Run'. Look for the <span className="text-blue-400 underline">More Info</span> link in the popup.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-blue-400 text-sm border border-slate-700">02</span>
                                <h4 className="font-black text-sm uppercase tracking-wide">SELECT "RUN ANYWAY"</h4>
                            </div>
                            <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                                After clicking 'More Info', a second button will appear labeled <span className="text-emerald-400 underline">Run anyway</span>. Click it to start installation.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-blue-400 text-sm border border-slate-700">03</span>
                                <h4 className="font-black text-sm uppercase tracking-wide">SYSTEM AUTOMATION</h4>
                            </div>
                            <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                                PreBot is an agentic automation tool. It may request administrator access to manage system resources—this is normal.
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-800 border-l-4 border-blue-500 p-6 rounded-2xl mt-4">
                        <div className="flex items-center gap-3 mb-2">
                             <FaShieldAlt className="text-blue-400" />
                             <span className="font-black text-[10px] uppercase tracking-[0.2em] text-blue-400">Security Guarantee</span>
                        </div>
                        <p className="text-[11px] font-bold text-slate-300 leading-relaxed uppercase tracking-wider">
                            We are an indie development team. The Windows warning exists only because we do not have an expensive Enterprise Certificate yet. PreBot is 100% safe and secure for your hardware.
                        </p>
                    </div>
                </div>
            </div>
            
            <div className="pt-12 border-t border-slate-100 mt-12 flex flex-col items-center space-y-4">
                <div className="flex items-center gap-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                    <img 
                      src="assets/icon-extracted.png" 
                      alt="Ello India Logo" 
                      className="w-12 h-12 object-contain filter drop-shadow-sm" 
                      onError={(e) => {
                          e.target.style.display = 'none';
                      }}
                    />
                    <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Ello India</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Unified Agentic Systems</span>
                    </div>
                </div>
                
                <div className="text-center text-slate-400 text-[10px] flex flex-col items-center gap-1 font-black uppercase tracking-widest">
                    <p>© 2026 Ello India. All Rights Reserved.</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="w-1.5 h-1.5 bg-slate-200 rounded-full"></span>
                        <span>Release Channel 2.0.13</span>
                        <span className="w-1.5 h-1.5 bg-slate-200 rounded-full"></span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DownloadPortal;
