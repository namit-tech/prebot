import axios from 'axios';
import authService from './auth.service';

const API_URL = import.meta.env.VITE_API_URL || 'https://adminapi.elloindia.in/api';
const LOCAL_BACKEND_URL = 'http://localhost:5000/api';

// For Special Edition, we force port 5000 immediately to stay offline
// and prevent race conditions with async IPC calls
// detect if we are running in Electron even if preload hasn't finished
const isProbablyElectron = typeof window !== 'undefined' && 
  (window.electronAPI || navigator.userAgent.toLowerCase().includes(' electron/'));

const api = axios.create({
  baseURL: isProbablyElectron ? LOCAL_BACKEND_URL : API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Hard-force local API if Special Edition
if (window.electronAPI?.isSpecialEdition) {
  window.electronAPI.isSpecialEdition().then(isSpecial => {
    if (isSpecial) {
      console.log('🛡️ [API] Special Edition Hardening: Forcing local API (localhost:5000)');
      api.defaults.baseURL = LOCAL_BACKEND_URL;
    }
  });
}

// Request interceptor (add token)
api.interceptors.request.use((config) => {
  const token = authService.getStoredToken();
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor (handle errors)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data;
    
    // Only handle 401 (Unauthorized) - and only if it's an actual auth error
    if (status === 401) {
      const errorMessage = (errorData?.error || '').toLowerCase();
      
      // Only logout on actual authentication/authorization errors
      if (
        errorMessage.includes('authorized') || 
        errorMessage.includes('token') || 
        errorMessage.includes('not authorized') ||
        errorMessage.includes('invalid token') ||
        errorMessage.includes('token expired')
      ) {
        // Only logout on actual authentication/authorization errors
        authService.logout();
        
        // In Electron with file:// protocol, we must NEVER redirect to '/' 
        // as it resolves to 'file:///C:/' which causes a crash.
        // AuthContext will handle state change to show Login component automatically.
        console.warn('Authentication lost. Manual login required.');
      }
      // For other 401 errors, just reject without logout
    }
    
    // Log rate limit errors but don't logout
    if (status === 429) {
      console.error('Rate limit exceeded. Please wait before making more requests.');
    }
    
    // For all other errors (400, 403, 404, 500, etc.), just reject without logout
    // These are business logic errors, not auth errors
    return Promise.reject(error);
  }
);

export default api;

