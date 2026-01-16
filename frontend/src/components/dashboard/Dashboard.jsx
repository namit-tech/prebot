import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import SubscriptionStatus from './SubscriptionStatus';
import ModuleSelector from './ModuleSelector';
import MobileQuestionInterface from '../mobile/MobileQuestionInterface';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [view, setView] = useState('questions'); // 'questions' or 'settings'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🤖 PreBot</h1>
              <p className="text-sm text-gray-600">
                Welcome, {user?.companyName || user?.email}
                <span className="ml-2 text-xs text-gray-400">(Mobile App)</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView(view === 'questions' ? 'settings' : 'questions')}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                {view === 'questions' ? 'Settings' : 'Questions'}
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {view === 'questions' ? (
          <MobileQuestionInterface />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Subscription Status */}
              <div className="lg:col-span-1">
                <SubscriptionStatus />
              </div>

              {/* Module Selector */}
              <div className="lg:col-span-2">
                <ModuleSelector />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
