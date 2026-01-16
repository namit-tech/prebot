import React, { useState, useEffect } from 'react';
import { useModule } from '../../context/ModuleContext';

const MobileQuestionInterface = () => {
  const { activeModule, processQuestion } = useModule();
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pcIP, setPcIP] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    loadQuestions();
    // Try to auto-connect to PC
    autoConnect();
  }, []);

  const loadQuestions = () => {
    const stored = localStorage.getItem('predefined_questions') || localStorage.getItem('customQuestions');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setQuestions(parsed);
      } catch (e) {
        console.error('Failed to load questions:', e);
      }
    }
  };

  const autoConnect = async () => {
    // Try common IP addresses
    const commonIPs = ['192.168.137.1', '192.168.1.1', '192.168.0.1'];
    for (const ip of commonIPs) {
      if (await testConnection(ip)) {
        setPcIP(ip);
        setConnected(true);
        return;
      }
    }
  };

  const testConnection = async (ip) => {
    try {
      const response = await fetch(`http://${ip}:3000/api/health`, {
        method: 'GET',
        timeout: 2000
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  };

  const connectToPC = async () => {
    if (!pcIP) {
      alert('Please enter PC IP address');
      return;
    }

    const isConnected = await testConnection(pcIP);
    if (isConnected) {
      setConnected(true);
      alert('Connected to PC!');
    } else {
      alert('Failed to connect. Please check IP address and ensure PC app is running.');
    }
  };

  const handleQuestionClick = async (question) => {
    setSelectedQuestion(question);
    setAnswer(null);
    setLoading(true);

    try {
      // Process question locally
      const result = await processQuestion(question.question || question);
      
      if (result.success) {
        setAnswer(result.answer);
        
        // Send to PC to trigger video
        if (connected && pcIP) {
          try {
            await fetch(`http://${pcIP}:3000/api/trigger-video`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                questionId: question.id,
                question: question.question || question,
                answer: result.answer
              })
            });
          } catch (e) {
            console.error('Failed to trigger PC video:', e);
          }
        }
      } else {
        setAnswer('Sorry, I could not find an answer to that question.');
      }
    } catch (error) {
      setAnswer('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Connection Status */}
      <div className={`p-4 ${connected ? 'bg-green-100' : 'bg-yellow-100'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">
              {connected ? '✅ Connected to PC' : '⚠️ Not Connected'}
            </p>
            <p className="text-sm text-gray-600">
              {connected ? `PC IP: ${pcIP}` : 'Enter PC IP address to connect'}
            </p>
          </div>
          {!connected && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="192.168.137.1"
                value={pcIP}
                onChange={(e) => setPcIP(e.target.value)}
                className="px-3 py-1 border rounded text-sm"
              />
              <button
                onClick={connectToPC}
                className="px-4 py-1 bg-blue-600 text-white rounded text-sm"
              >
                Connect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Questions Grid */}
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Select a Question</h2>
        {questions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No questions available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {questions.map((q) => (
              <button
                key={q.id || q}
                onClick={() => handleQuestionClick(q)}
                disabled={loading}
                className={`p-6 bg-white rounded-lg shadow text-left hover:shadow-lg transition ${
                  loading ? 'opacity-50' : ''
                }`}
              >
                <p className="font-semibold text-lg">
                  {q.question || q}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Answer Display */}
      {answer && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
          <div className="max-w-4xl mx-auto">
            <h3 className="font-semibold mb-2">Answer:</h3>
            <p className="text-gray-700">{answer}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6">
            <p>Processing question...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileQuestionInterface;






