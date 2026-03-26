import { FaShieldAlt, FaLock, FaUserShield, FaExclamationCircle, FaArrowLeft } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => {
    const lastUpdated = "March 26, 2026";
    
    return (
        <div className="max-w-4xl mx-auto px-4 py-12 font-sans text-slate-800 leading-relaxed overflow-y-auto max-h-[80vh] custom-scrollbar">
            <div className="mb-8">
                <Link 
                    to="/" 
                    className="inline-flex items-center gap-2 text-primary-600 font-bold hover:text-primary-700 transition-all uppercase tracking-widest text-xs group"
                >
                    <FaArrowLeft className="group-hover:-translate-x-1 transition-transform" />
                    Back to Secure Login
                </Link>
            </div>
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
                {/* Header Section */}
                <div className="bg-slate-900 text-white p-8 md:p-12 relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest mb-4">
                            <FaShieldAlt className="animate-pulse" />
                            Official Privacy Standard
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2 uppercase">Privacy Policy</h1>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
                            Last Updated: {lastUpdated}
                        </p>
                    </div>
                    <FaShieldAlt className="absolute -bottom-10 -right-10 text-white/5 text-[15rem] pointer-events-none" />
                </div>

                {/* Content Section */}
                <div className="p-8 md:p-12 space-y-10">
                    
                    {/* Introduction */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">01</div>
                            <h2 className="text-xl font-black uppercase tracking-wide">Introduction</h2>
                        </div>
                        <p className="text-slate-600 font-medium">
                            Welcome to <span className="font-bold text-slate-900">PreBot</span> (the "Application"), developed by <span className="font-bold text-slate-900">Ello India</span>. 
                            We respect your privacy and are committed to protecting it through our compliance with this policy. 
                            This policy describes the types of information we may collect from you or that you may provide when you use PreBot and our practices for collecting, using, maintaining, protecting, and disclosing that information.
                        </p>
                    </section>

                    {/* Data Ownership */}
                    <section className="bg-emerald-50 border-l-4 border-emerald-500 p-6 rounded-2xl space-y-3">
                        <div className="flex items-center gap-3">
                            <FaLock className="text-emerald-600" />
                            <h2 className="text-lg font-black text-emerald-900 uppercase">Our Core Philosophy: Data Ownership</h2>
                        </div>
                        <p className="text-emerald-800/80 font-bold text-sm leading-relaxed">
                            PreBot is designed as an <span className="underline">OFFLINE-FIRST</span> AI Assistant. 
                            The vast majority of your interactions, processing, and data never leave your local hardware. 
                            We do not sell, trade, or rent your personal identification information to others.
                        </p>
                    </section>

                    {/* Information We Collect */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-black">02</div>
                            <h2 className="text-xl font-black uppercase tracking-wide">Information Collection</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50">
                                <h3 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-3">Identity Data</h3>
                                <p className="text-sm font-medium text-slate-600">
                                    When you register for a PreBot account, we collect your <span className="font-bold text-slate-900">Email Address</span> and <span className="font-bold text-slate-900">Company Name</span> to manage your license and subscription.
                                </p>
                            </div>
                            <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50">
                                <h3 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-3">Hardware Fingerprint</h3>
                                <p className="text-sm font-medium text-slate-600">
                                    To prevent license misuse and ensure account security, we generate a unique <span className="font-bold text-slate-900">Hardware ID</span> from your device. This is used solely for license verification.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* How We Use Your Information */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">03</div>
                            <h2 className="text-xl font-black uppercase tracking-wide">Usage of Data</h2>
                        </div>
                        <ul className="grid grid-cols-1 gap-3">
                            {[
                                "To provide and maintain the Application services.",
                                "To manage your account and subscription validation.",
                                "To provide support and respond to your inquiries.",
                                "To notify you about updates or changes to the Application."
                            ].map((item, i) => (
                                <li key={i} className="flex gap-4 items-start p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 shrink-0" />
                                    <p className="text-sm font-bold text-slate-700 uppercase tracking-tight">{item}</p>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Offline Processing */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">04</div>
                            <h2 className="text-xl font-black uppercase tracking-wide">Offline Intelligence</h2>
                        </div>
                        <div className="p-6 border-2 border-dashed border-amber-200 rounded-3xl bg-amber-50/30">
                            <p className="text-sm font-bold text-amber-900/70 leading-relaxed uppercase">
                                PreBot uses local engines (like Ollama and Whispers) for voice and text processing. 
                                <span className="text-amber-600 font-black"> NONE OF YOUR VOICE DATA OR CHAT LOGS ARE SENT TO OUR SERVERS.</span> 
                                Everything stays on your machine, ensuring maximum privacy for sensitive business data.
                            </p>
                        </div>
                    </section>

                    {/* Security */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-black">05</div>
                            <h2 className="text-xl font-black uppercase tracking-wide">Data Security</h2>
                        </div>
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1 flex gap-4 p-4">
                                <FaUserShield className="text-red-500 text-3xl shrink-0" />
                                <div>
                                    <h4 className="font-black text-sm uppercase mb-1">Protection Layer</h4>
                                    <p className="text-xs text-slate-500 font-medium">We implement a variety of security measures to maintain the safety of your personal information when you access your account.</p>
                                </div>
                            </div>
                            <div className="flex-1 flex gap-4 p-4">
                                <FaExclamationCircle className="text-red-500 text-3xl shrink-0" />
                                <div>
                                    <h4 className="font-black text-sm uppercase mb-1">No Third-Party Access</h4>
                                    <p className="text-xs text-slate-500 font-medium">We do not share your billing or identity data with any third-party marketing companies, ever.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Contact */}
                    <section className="mt-12 pt-12 border-t border-slate-100 flex flex-col items-center text-center space-y-4">
                        <h3 className="text-xl font-black uppercase tracking-widest">Questions?</h3>
                        <p className="text-slate-500 font-medium text-sm max-w-md">
                            If you have any questions about this Privacy Policy, please contact our data protection team.
                        </p>
                        <a 
                            href="mailto:support@elloindia.in" 
                            className="inline-block px-10 py-4 bg-slate-900 text-white rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all hover:scale-105"
                        >
                            Email Support
                        </a>
                        <div className="pt-6">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">© 2026 Ello India • All Rights Reserved</p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
