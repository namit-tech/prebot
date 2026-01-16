import axios from 'axios';
import authService from './auth.service';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

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
        // This is a real auth error - logout
        authService.logout();
        // Only redirect if not already on login page
        setTimeout(() => {
          if (!window.location.pathname.includes('login') && window.location.pathname !== '/') {
            window.location.href = '/';
          }
        }, 100);
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

