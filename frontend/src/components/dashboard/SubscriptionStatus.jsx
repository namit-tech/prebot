import React, { useState, useEffect } from 'react';
import authService from '../../services/auth.service';
import { FaExclamationTriangle } from 'react-icons/fa';

const SubscriptionStatus = () => {
  // ... existing code ...
  const [expiryDate, setExpiryDate] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [models, setModels] = useState([]);

  useEffect(() => {
    // ... useEffect code ...
    const expiry = localStorage.getItem('expiry_date');
    const storedModels = authService.getStoredModels();
    
    setExpiryDate(expiry);
    setModels(storedModels);

    // Calculate time remaining
    const updateTimeRemaining = () => {
      if (expiry) {
        const now = new Date();
        const expiryTime = new Date(expiry);
        const diff = expiryTime - now;

        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          
          setTimeRemaining({ days, hours, minutes, seconds });
        } else {
          setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        }
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000); // Real-time Second Updates

    return () => clearInterval(interval);
  }, []);

  if (!expiryDate) {
    return null;
  }

  const isExpiringSoon = timeRemaining && timeRemaining.days < 7;

  return (
    <div className="card">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Subscription Status</h2>
      
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600">Expiry Date</p>
          <p className="text-lg font-semibold text-gray-900">
            {new Date(expiryDate).toLocaleDateString()}
          </p>
        </div>

        {timeRemaining && (
          <div>
            <p className="text-sm text-gray-600">Time Remaining</p>
            <p className={`text-xl font-mono font-bold ${isExpiringSoon ? 'text-red-600' : 'text-green-600'}`}>
              {timeRemaining.days}d {timeRemaining.hours}h {timeRemaining.minutes}m {timeRemaining.seconds}s
            </p>
            {isExpiringSoon && (
              <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                <FaExclamationTriangle /> Subscription expiring soon
              </p>
            )}
          </div>
        )}

        <div>
          <p className="text-sm text-gray-600 mb-2">Active Models</p>
          <div className="flex flex-wrap gap-2">
            {models.map((model) => (
              <span
                key={model}
                className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-medium"
              >
                {model === 'predefined' ? 'Predefined Q&A' : model === 'gemma' ? 'Gemma 2 9B AI' : 'Gemini AI'}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};



export default SubscriptionStatus;

