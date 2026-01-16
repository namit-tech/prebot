import React, { useState } from 'react';
import { useModule } from '../../context/ModuleContext';
import { FaClipboardList } from 'react-icons/fa';

const PredefinedInterface = () => {
    const { processQuestion } = useModule();
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!question.trim()) return;

        setLoading(true);
        setError('');
        setAnswer('');

        try {
            const result = await processQuestion(question);
            
            if (result.success) {
                setAnswer(result.answer);
            } else {
                setError(result.error || 'No answer found');
                if (result.suggestions && result.suggestions.length > 0) {
                    setAnswer(`Did you mean:\n${result.suggestions.join('\n')}`);
                }
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FaClipboardList className="text-blue-600 text-xl" /> Standard Q&A Interface
                </h2>
                <p className="text-sm text-gray-500 mt-1">Ask questions from the predefined database.</p>
            </div>

            <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Your Question</label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
                                placeholder="e.g., What are the operating hours?"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                disabled={loading}
                            />
                            <button 
                                type="submit"
                                disabled={loading || !question.trim()}
                                className="absolute right-2 top-2 px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </div>
                </form>

                {error && (
                    <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {answer && (
                    <div className="mt-6">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-5">
                            <h3 className="text-sm font-medium text-blue-900 mb-2 uppercase tracking-wide">Answer</h3>
                            <div className="prose prose-blue max-w-none text-gray-800 whitespace-pre-wrap leading-relaxed">
                                {answer}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
                <span>Database Status: Active</span>
                <span>Type: Exact Match / Keyword</span>
            </div>
        </div>
    );
};

export default PredefinedInterface;
