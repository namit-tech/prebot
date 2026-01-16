import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FaRobot, FaExclamationTriangle } from 'react-icons/fa';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Fetch Hardware ID (Soft Lock)
      let hardwareId = 'browser-dev-id';
      if (window.electronAPI) {
         hardwareId = await window.electronAPI.getMachineId();
         console.log('🔒 Device Fingerprint:', hardwareId);
      }

      const result = await login(email, password, hardwareId);
      
      if (!result.success) {
        setError(result.error || 'Login failed');
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to identity device');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4">
      <div className="max-w-md w-full">
        <div className="card">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
              <FaRobot className="text-primary-600" />
              PreBot
            </h1>
            <p className="text-gray-600">
              Offline AI Assistant
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <FaExclamationTriangle className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>

            <p className="text-sm text-gray-500 text-center mt-4 flex items-center justify-center gap-1">
              <FaExclamationTriangle className="text-yellow-500" />
              Internet connection required for first login
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

