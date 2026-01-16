import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api.service';

const SuperAdminDashboard = () => {
    const { logout, user } = useAuth();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeLicenses: 0,
        systemStatus: 'Online'
    });

    useEffect(() => {
        fetchClients();
    }, []);

    // New State for Create Client
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    
    // Edit/Delete State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [editError, setEditError] = useState(null);

    const [formData, setFormData] = useState({
        companyName: '',
        email: '',
        password: '',
        subscriptionData: {
            type: 'rental',
            durationDays: 365,
            models: ['predefined'],
            aiModel: 'gemma2:2b' // Default to fast model
        }
    });

    // Populate form for editing
    const handleEditClient = (client) => {
        setEditingClient(client);
        setFormData({
            companyName: client.companyName,
            email: client.email,
            password: '', // Don't pre-fill password
            subscriptionData: {
                type: client.subscription?.type || 'rental',
                durationDays: 365, // Default, or calculate remaining?
                models: client.subscription?.models || ['predefined'],
                status: client.subscription?.status || 'active',
                aiModel: client.subscription?.aiModel || 'gemma2:2b'
            }
        });
        setShowEditModal(true);
    };

    const handleUpdateClient = async (e) => {
        e.preventDefault();
        setUpdating(true);
        setEditError(null);

        try {
            const payload = {
                ...formData,
                password: formData.password || undefined // Only send if changed
            };
            
            const response = await api.put(`/admin/clients/${editingClient._id}`, payload);
            if (response.data && response.data.success) {
                setShowEditModal(false);
                fetchClients();
                setEditingClient(null);
                alert('Client updated successfully!');
            } else {
                setEditError(response.data.error || 'Failed to update client');
            }
        } catch (err) {
            console.error('Error updating client:', err);
            setEditError(err.response?.data?.error || 'Error connecting to server');
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteClient = async (clientId) => {
        if (!window.confirm('Are you sure you want to delete this client? This action cannot be undone and will delete all their data.')) {
            return;
        }

        try {
            const response = await api.delete(`/admin/clients/${clientId}`);
            if (response.data && response.data.success) {
                fetchClients(); // Refresh list
                alert('Client deleted successfully');
            } else {
                alert('Failed to delete client: ' + (response.data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error deleting client:', err);
            alert('Error deleting client');
        }
    };

    const handleResetDeviceLock = async (clientId, email) => {
        if (!window.confirm(`Are you sure you want to reset the DEVICE LOCK for ${email}? They will be able to login on a new computer immediately.`)) {
            return;
        }

        try {
            const response = await api.put(`/admin/clients/${clientId}/reset-lock`);
            if (response.data && response.data.success) {
                alert('Device lock reset successfully!');
                fetchClients(); 
            } else {
                alert('Failed to reset lock: ' + (response.data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error resetting lock:', err);
            alert('Error resetting device lock');
        }
    };

    const handleCreateClient = async (e) => {
        e.preventDefault();
        setCreating(true);
        setCreateError(null);

        try {
            const response = await api.post('/admin/clients', formData);
            if (response.data && response.data.success) {
                setShowCreateModal(false);
                fetchClients(); // Refresh list
                // Reset form
                setFormData({
                    companyName: '',
                    email: '',
                    password: '',
                    subscriptionData: {
                        type: 'rental',
                        durationDays: 365,
                        models: ['predefined'],
                        aiModel: 'gemma2:2b'
                    }
                });
                alert('Client created successfully!');
            } else {
                setCreateError(response.data.error || 'Failed to create client');
            }
        } catch (err) {
            console.error('Error creating client:', err);
            setCreateError(err.response?.data?.error || 'Error connecting to server');
        } finally {
            setCreating(false);
        }
    };

    const fetchClients = async () => {
        try {
            setLoading(true);
            const response = await api.get('/admin/clients');
            
            if (response.data && response.data.success) {
                const clientList = response.data.data;
                setClients(clientList);
                
                // Calculate stats
                const total = clientList.length;
                const active = clientList.filter(c => 
                    c.subscription && c.subscription.status === 'active'
                ).length;

                setStats({
                    totalUsers: total,
                    activeLicenses: active,
                    systemStatus: 'Online'
                });
            } else {
                setError('Failed to fetch client data');
            }
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
            setError('Error connecting to server');
            setStats(prev => ({ ...prev, systemStatus: 'Error' }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <header className="bg-white shadow rounded-lg p-6 mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Super Admin Dashboard</h1>
                    <p className="text-gray-600">Welcome, {user?.name || 'Admin'} | Company: {user?.companyName}</p>
                </div>
                <button 
                    onClick={logout}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition"
                >
                    Logout
                </button>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Users</h3>
                    <p className="text-3xl font-bold text-blue-600">
                        {loading ? '...' : stats.totalUsers}
                    </p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Active Licenses</h3>
                    <p className="text-3xl font-bold text-green-600">
                        {loading ? '...' : stats.activeLicenses}
                    </p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">System Status</h3>
                    <p className={`text-3xl font-bold ${stats.systemStatus === 'Online' ? 'text-purple-600' : 'text-red-600'}`}>
                        {stats.systemStatus}
                    </p>
                </div>
            </div>

            {/* Recent Activity / Client List */}
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Client Overview</h2>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setShowCreateModal(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition"
                        >
                            + New Client
                        </button>
                        <button 
                            onClick={fetchClients} 
                            className="text-blue-500 hover:text-blue-700 text-sm"
                        >
                            Refresh Data
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading data...</div>
                ) : error ? (
                    <div className="text-center py-8 text-red-500">{error}</div>
                ) : clients.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No clients found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">License Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {clients.map((client) => (
                                    <tr key={client._id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client.companyName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.email}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {client.subscription?.type || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                client.subscription?.status === 'active' 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-red-100 text-red-800'
                                            }`}>
                                                {client.subscription?.status || 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {client.subscription?.expiryDate 
                                                ? new Date(client.subscription.expiryDate).toLocaleDateString() 
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button 
                                                onClick={() => handleEditClient(client)}
                                                className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteClient(client._id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                            <button 
                                                onClick={() => handleResetDeviceLock(client._id, client.email)}
                                                className="text-orange-600 hover:text-orange-900 ml-4"
                                                title="Reset Device Lock"
                                            >
                                                Unlock Device
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Client Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Create New Client</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        {/* Reuse the same form structure, extracted components would be better but keeping inline for simplicity */}
                        <ClientForm 
                            formData={formData} 
                            setFormData={setFormData} 
                            onSubmit={handleCreateClient} 
                            loading={creating} 
                            error={createError} 
                            onCancel={() => setShowCreateModal(false)}
                            submitLabel="Create Client"
                        />
                    </div>
                </div>
            )}

            {/* Edit Client Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Edit Client</h2>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        <ClientForm 
                            formData={formData} 
                            setFormData={setFormData} 
                            onSubmit={handleUpdateClient} 
                            loading={updating} 
                            error={editError} 
                            onCancel={() => setShowEditModal(false)}
                            submitLabel="Update Client"
                            isEdit
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// Extracted reusable form component
const ClientForm = ({ formData, setFormData, onSubmit, loading, error, onCancel, submitLabel, isEdit }) => (
    <form onSubmit={onSubmit} className="space-y-4">
        {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
                {error}
            </div>
        )}
        <div>
            <label className="block text-sm font-medium text-gray-700">Company Name</label>
            <input
                type="text"
                required
                className="mt-1 block w-full rounded border-gray-300 shadow-sm p-2 border"
                value={formData.companyName}
                onChange={e => setFormData({...formData, companyName: e.target.value})}
            />
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
                type="email"
                required
                className="mt-1 block w-full rounded border-gray-300 shadow-sm p-2 border"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
            />
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700">Password {isEdit && '(Leave blank to keep current)'}</label>
            <input
                type="password"
                required={!isEdit}
                minLength={6}
                className="mt-1 block w-full rounded border-gray-300 shadow-sm p-2 border"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
            />
        </div>

        <div className="border-t pt-4 mt-4">
            <h3 className="font-semibold mb-3">Subscription Details</h3>
            
            <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                    className="mt-1 block w-full rounded border-gray-300 shadow-sm p-2 border"
                    value={formData.subscriptionData.type}
                    onChange={e => setFormData({
                        ...formData,
                        subscriptionData: { ...formData.subscriptionData, type: e.target.value }
                    })}
                >
                    <option value="rental">Rental (Time Limited)</option>
                    <option value="permanent">Permanent (Lifetime)</option>
                </select>
            </div>

            {formData.subscriptionData.type === 'rental' && (
                <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700">Duration (Days)</label>
                    <input
                        type="number"
                        className="mt-1 block w-full rounded border-gray-300 shadow-sm p-2 border"
                        value={formData.subscriptionData.durationDays}
                        onChange={e => setFormData({
                            ...formData,
                            subscriptionData: { ...formData.subscriptionData, durationDays: parseInt(e.target.value) }
                        })}
                    />
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Included Models</label>
                <div className="space-y-2">
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={formData.subscriptionData.models.includes('predefined')}
                            onChange={e => {
                                const models = e.target.checked
                                    ? [...formData.subscriptionData.models, 'predefined']
                                    : formData.subscriptionData.models.filter(m => m !== 'predefined');
                                setFormData({
                                    ...formData,
                                    subscriptionData: { ...formData.subscriptionData, models }
                                });
                            }}
                        />
                        <span className="ml-2">Predefined Q&A</span>
                    </label>
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={formData.subscriptionData.models.includes('gemini')}
                            onChange={e => {
                                const models = e.target.checked
                                    ? [...formData.subscriptionData.models, 'gemini']
                                    : formData.subscriptionData.models.filter(m => m !== 'gemini');
                                setFormData({
                                    ...formData,
                                    subscriptionData: { ...formData.subscriptionData, models }
                                });
                            }}
                        />
                        <span className="ml-2">AI Brain (Gemma/Gemini)</span>
                    </label>
                </div>


            {/* AI Model Selection (Only if AI Brain is selected) */}
            {formData.subscriptionData.models.includes('gemini') && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="block text-sm font-medium text-blue-900 mb-3">AI Brain Configuration</label>
                    <div className="space-y-3">
                        <label className="flex items-start p-3 bg-white border border-gray-200 rounded cursor-pointer hover:border-blue-400">
                            <input
                                type="radio"
                                name="aiModel"
                                className="mt-1 text-blue-600 focus:ring-blue-500"
                                checked={formData.subscriptionData.aiModel === 'gemma2:2b'}
                                onChange={() => setFormData({
                                    ...formData,
                                    subscriptionData: { ...formData.subscriptionData, aiModel: 'gemma2:2b' }
                                })}
                            />
                            <div className="ml-3">
                                <span className="block text-sm font-medium text-gray-900">Gemma 2B (Fast Mode) ⚡</span>
                                <span className="block text-xs text-gray-500 mt-1">
                                    Best for speed. Instant responses. Good for general chat. Lightweight (~1.5GB).
                                </span>
                            </div>
                        </label>

                        <label className="flex items-start p-3 bg-white border border-gray-200 rounded cursor-pointer hover:border-blue-400">
                            <input
                                type="radio"
                                name="aiModel"
                                className="mt-1 text-blue-600 focus:ring-blue-500"
                                checked={formData.subscriptionData.aiModel === 'gemma2:9b'}
                                onChange={() => setFormData({
                                    ...formData,
                                    subscriptionData: { ...formData.subscriptionData, aiModel: 'gemma2:9b' }
                                })}
                            />
                            <div className="ml-3">
                                <span className="block text-sm font-medium text-gray-900">Gemma 9B (Smart Mode) 🧠</span>
                                <span className="block text-xs text-gray-500 mt-1">
                                    Best for complex reasoning. High intelligence. Slower responses. Heavy (~5GB).
                                </span>
                            </div>
                        </label>
                    </div>
                </div>
            )}
        </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
            <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
                Cancel
            </button>
            <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
                {loading ? 'Processing...' : submitLabel}
            </button>
        </div>
    </form>
);


export default SuperAdminDashboard;

