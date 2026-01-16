import React from 'react';
import { useAuth } from '../../context/AuthContext';

const ContactSales = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Subscription Expired</h1>
          <p className="text-gray-600">
            Your subscription has expired. Please contact sales to renew your subscription.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Contact Sales</h2>
          <div className="space-y-2 text-left">
            <p className="text-sm text-gray-700">
              <strong>Email:</strong> sales@prebot.com
            </p>
            <p className="text-sm text-gray-700">
              <strong>Phone:</strong> +1 (555) 123-4567
            </p>
            <p className="text-sm text-gray-700">
              <strong>Website:</strong> www.prebot.com
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default ContactSales;






