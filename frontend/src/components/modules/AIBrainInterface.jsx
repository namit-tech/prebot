import React, { useState, useEffect, useRef } from 'react';
import { useModule } from '../../context/ModuleContext';
import KnowledgeBasePanel from './KnowledgeBasePanel';
import { FaBrain, FaBook, FaRobot } from 'react-icons/fa';
import api from '../../services/api.service';

const AIBrainInterface = ({ activeTabId }) => {
    const { activeModule, getModuleInstance, processQuestion } = useModule();
    
    // Use activeTabId for configuration context, fallback to activeModule
    const effectiveModuleId = activeTabId || activeModule;
    const activeModuleInstance = getModuleInstance(effectiveModuleId);

    const [question, setQuestion] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [history, setHistory] = useState([]);
    const [showKnowledge, setShowKnowledge] = useState(false);
    const chatEndRef = useRef(null);

    // Mobile listener removed - handled globally in ClientDashboard.jsx
    // to ensure background processing when module is not active.

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [history]);

    // Update: Fetch history on mount and setup listeners
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await api.get('/chat-history');
                if (response.data) {
                    setHistory(response.data.data || response.data);
                }
            } catch (err) {
                console.error('Failed to fetch chat history:', err);
            }
        };

        fetchHistory();

        // Listen for new messages from Mobile (via DesktopServer -> Main -> Renderer)
        if (window.electronAPI && window.electronAPI.onNewChatMessage) {
            const removeListener = window.electronAPI.onNewChatMessage((message) => {
                // Check if message is already in local state (to avoid duplicates from own sent messages)
                setHistory(prev => {
                    // Simple check based on timestamp to avoid immediate duplicates
                    const isDuplicate = prev.some(m => m.timestamp === message.timestamp && m.content === message.content);
                    if (isDuplicate) return prev;
                    return [...prev, message];
                });
            });
            return () => removeListener();
        }

        // Note: External responses are handled in ClientDashboard.jsx for video triggering.
        // We no longer add them to the UI history here to respect privacy/separation.
    }, []);

    const handleContextUpdate = (contextText) => {
        if (activeModuleInstance && activeModuleInstance.setSystemContext) {
            activeModuleInstance.setSystemContext(contextText);
            
            if (contextText) {
                setHistory(prev => [...prev, { 
                    type: 'system', 
                    content: 'Knowledge Base loaded. AI will now prioritize this context.' 
                }]);
            } else {
                setHistory(prev => [...prev, { 
                    type: 'system', 
                    content: 'Knowledge Base removed. Reverting to general knowledge.' 
                }]);
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!question.trim()) return;

        const userQuestion = question;
        setQuestion('');
        setLoading(true);
        setError('');

        // Step 1: Update UI immediately for better responsiveness
        const userMsg = { type: 'user', content: userQuestion, sender: 'pc', timestamp: Date.now() };
        setHistory(prev => [...prev, userMsg]);

        try {
            const result = await processQuestion(userQuestion);
            
            if (result.success) {
                const aiAnswer = result.answer;

                // Sync BOTH messages to server for history persistence & broadcast
                // 1. User Message
                await api.post('/chat-history', userMsg);

                // 2. AI Message
                const aiMsg = { type: 'ai', content: aiAnswer, sender: 'system', timestamp: Date.now() };
                setHistory(prev => [...prev, aiMsg]);

                await api.post('/chat-history', aiMsg);

                // Step 3: Sync local history with the Module's sliding window if available
                // This ensures UI matches the true brain state
                if (result.history) {
                    // Convert Ollama history format to UI history format
                    const syncedHistory = result.history.map(msg => ({
                        type: msg.role === 'user' ? 'user' : 'ai',
                        content: msg.content,
                        timestamp: Date.now() // Approximated
                    }));
                    setHistory(syncedHistory);
                }

            } else {
                setError(result.error);
                // Errors remain local only as they are transient environment issues
                setHistory(prev => [...prev, { type: 'error', content: result.error || 'Failed to generate response' }]);
            }
        } catch (err) {
            setError(err.message);
            
            let errorMessage = err.message;
            if (errorMessage.includes('Ollama') || errorMessage.includes('AI Engine')) {
                errorMessage = 'Please check AI Engine connection.';
            }
            setHistory(prev => [...prev, { type: 'error', content: errorMessage }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-700 flex flex-col h-[600px]">
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-900 to-indigo-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {effectiveModuleId === 'gemini' ? <FaRobot className="text-2xl" /> : <FaBrain className="text-2xl" />} 
                        {effectiveModuleId === 'gemini' ? 'Cloud AI Chat' : 'Offline AI Chat'}
                    </h2>
                    <p className="text-indigo-200 text-xs mt-1">
                        {effectiveModuleId === 'gemini' ? 'Online Intelligence' : 'Local LLM Module'}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setShowKnowledge(!showKnowledge)}
                        className={`p-2 rounded-lg transition-colors ${showKnowledge ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-indigo-300 hover:bg-slate-700'}`}
                        title="Knowledge Base"
                    >
                        <FaBook />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
                        <span className="text-green-400 text-xs font-mono">SYSTEM READY</span>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900 custom-scrollbar">
                
                {showKnowledge && (
                    <KnowledgeBasePanel 
                        onContextUpdate={handleContextUpdate} 
                        onClose={() => setShowKnowledge(false)} 
                    />
                )}

                {history.length === 0 && !showKnowledge && (
                    <div className="text-center py-20 opacity-50">
                        <div className="text-6xl mb-4 flex justify-center text-slate-700">
                            <FaRobot />
                        </div>
                        <p className="text-slate-400">I am ready to assist you.</p>
                        <p className="text-slate-500 text-sm mt-2">Powered by local LLM architecture</p>
                    </div>
                )}
                
                {history.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : msg.type === 'system' ? 'justify-center' : 'justify-start'}`}>
                        {msg.type === 'system' ? (
                            <div className="bg-slate-800 text-slate-400 text-xs px-3 py-1 rounded-full border border-slate-700">
                                {msg.content}
                            </div>
                        ) : (
                            <div className={`max-w-[80%] rounded-2xl px-5 py-4 ${
                                msg.type === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-br-none' 
                                    : msg.type === 'error'
                                    ? 'bg-red-900/50 text-red-200 border border-red-800'
                                    : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-none'
                            }`}>
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                        )}
                    </div>
                ))}
                
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-800 rounded-2xl rounded-bl-none px-6 py-4 border border-slate-700 flex items-center gap-3">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-slate-400 text-sm animate-pulse">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-800 border-t border-white/10">
                <form onSubmit={handleSubmit} className="flex gap-4">
                    <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder="Ask anything..."
                        className="flex-1 bg-slate-900 text-white border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none h-[60px] custom-scrollbar"
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !question.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 font-medium transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
                    >
                        {loading ? '...' : 'Send'}
                    </button>
                </form>
                <p className="text-center text-slate-600 text-xs mt-3">
                    AI generated content may be inaccurate.
                </p>
            </div>
        </div>
    );
};

export default AIBrainInterface;
