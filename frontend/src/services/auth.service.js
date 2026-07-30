import { authApi } from './api.service';
import CryptoJS from 'crypto-js';

// NOTE: this only obfuscates values at rest in localStorage — the key ships in
// the bundle, so it is not a security boundary. On desktop the authority is the
// signed session held by the main process (see restoreSession below).
const SECRET_KEY = 'prebot-secret-key-change-in-production';

const isDesktop = () => typeof window !== 'undefined' && !!window.electronAPI?.authLogin;

class AuthService {
  encrypt(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
  }

  decrypt(encryptedData) {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (e) {
      return encryptedData; // Return as-is if decryption fails
    }
  }

  /**
   * On desktop, main performs the login and mints the session; the renderer only
   * caches the result for rendering. On the web, we talk to the licence server here.
   */
  async login(email, password, hardwareId) {
    if (isDesktop()) {
      const result = await window.electronAPI.authLogin(email, password);
      if (!result.success) throw new Error(result.error || 'Login failed');
      return this.cacheSession(result.session, result.token);
    }

    const response = await authApi.post('/auth/login', { email, password, hardwareId });

    const { token, licenseToken, expiryDate, models, user } = response.data.data;

    // Store encrypted tokens
    localStorage.setItem('auth_token', this.encrypt(token));
    if (licenseToken) {
      localStorage.setItem('license_token', this.encrypt(licenseToken));
    }
    // Store expiryDate even if null (for superadmin, it will be null)
    // This ensures consistency in checking
    if (expiryDate) {
      localStorage.setItem('expiry_date', expiryDate);
    } else {
      // For superadmin, remove expiry_date if it exists from previous session
      localStorage.removeItem('expiry_date');
    }
    if (models) {
      localStorage.setItem('models', JSON.stringify(models));
    }
    if (user) {
      localStorage.setItem('user_role', user.role || 'user');
      localStorage.setItem('user_data', JSON.stringify(user));
      // Store AI Preference
      if (user.subscription && user.subscription.aiModel) {
        localStorage.setItem('ai_model', user.subscription.aiModel);
      } else {
        localStorage.setItem('ai_model', 'gemma3:1b'); // Default
      }
    }
    
    return response.data.data;
  }

  /**
   * Mirror a main-process session into localStorage so the UI can render without
   * an IPC round-trip. This is a cache, never the source of truth.
   */
  cacheSession(session, signedToken) {
    localStorage.setItem('auth_token', this.encrypt(signedToken || session.serverToken || ''));
    if (session.serverToken) {
      localStorage.setItem('server_token', this.encrypt(session.serverToken));
    }
    if (session.licenseToken) {
      localStorage.setItem('license_token', this.encrypt(session.licenseToken));
    }
    localStorage.setItem('expiry_date', session.expiryDate);
    localStorage.setItem('models', JSON.stringify(session.models || []));
    localStorage.setItem('user_role', session.role || 'user');
    localStorage.setItem('user_data', JSON.stringify(session.user || { email: session.email, role: session.role }));
    localStorage.setItem('ai_model', session.aiModel || 'gemma3:1b');

    return { user: session.user, models: session.models, expiryDate: session.expiryDate };
  }

  /**
   * Ask the main process whether a valid session exists. This is the real check:
   * main verifies the HMAC, the machine binding and the expiry against a file the
   * renderer cannot forge. Returns the session, or null.
   */
  async restoreSession() {
    if (!window.electronAPI?.authGetSession) return null;

    try {
      const result = await window.electronAPI.authGetSession();
      if (!result?.success) return null;

      this.cacheSession(result.session, result.token);
      return result.session;
    } catch (e) {
      return null;
    }
  }

  getStoredToken() {
    const encryptedToken = localStorage.getItem('auth_token');
    if (!encryptedToken) return null;
    
    try {
      return this.decrypt(encryptedToken);
    } catch (e) {
      return encryptedToken; // Fallback
    }
  }

  getServerToken() {
    const stored = localStorage.getItem('server_token');
    if (!stored) return this.getStoredToken();

    try {
      return this.decrypt(stored);
    } catch (e) {
      return stored;
    }
  }

  getLicenseToken() {
    const encryptedToken = localStorage.getItem('license_token');
    if (!encryptedToken) return null;
    
    try {
      return this.decrypt(encryptedToken);
    } catch (e) {
      return encryptedToken; // Fallback
    }
  }

  /**
   * Cheap local hint used to render before the async check resolves.
   * NOT an authority — on desktop, restoreSession() is what actually decides.
   */
  isTokenValid() {
    const encryptedToken = localStorage.getItem('auth_token');
    if (!encryptedToken) return false;

    const expiryDate = localStorage.getItem('expiry_date');
    if (!expiryDate) return this.getUserRole() === 'superadmin'; // superadmin may have no expiry

    return new Date() < new Date(expiryDate);
  }

  logout() {
    if (window.electronAPI?.authLogout) {
      // Drop the signed session too, otherwise the next launch restores it
      try { window.electronAPI.authLogout(); } catch (e) { /* best effort */ }
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('server_token');
    localStorage.removeItem('license_token');
    localStorage.removeItem('expiry_date');
    localStorage.removeItem('models');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_data');
  }

  getUserRole() {
    return localStorage.getItem('user_role') || 'user';
  }

  getUserData() {
    const userData = localStorage.getItem('user_data');
    if (!userData) return null;
    
    const user = JSON.parse(userData);
    const models = this.getStoredModels();
    
    // Merge models into user object so it's available globally
    return { ...user, models: models };
  }

  getStoredModels() {
    const models = localStorage.getItem('models');
    return models ? JSON.parse(models) : [];
  }

  async validateSession() {
    try {
      const response = await authApi.get('/auth/validate');

      if (response.data.success) {
        const { user, subscription } = response.data.data;
        
        // Update stored user data if available
        if (user) {
          // Normalize user data to match login structure
          const userData = {
            id: user._id || user.id,
            email: user.email,
            companyName: user.companyName,
            role: user.role
          };
          
          localStorage.setItem('user_role', user.role || 'user');
          localStorage.setItem('user_data', JSON.stringify(userData));
        }
        
        // Update subscription data if available
        if (subscription) {
          console.log('🔄 [AuthService] Validating Session - Subscription:', subscription);
          
          if (subscription.models) {
            localStorage.setItem('models', JSON.stringify(subscription.models));
          }
          
          // Update expiry date
          if (subscription.expiryDate) {
            localStorage.setItem('expiry_date', subscription.expiryDate);
          }
          
          // Update license token if present (it might be sparse)
          if (subscription.licenseToken) {
            localStorage.setItem('license_token', this.encrypt(subscription.licenseToken));
          }

          // Update AI Preference
          if (subscription.aiModel) {
             console.log(`💾 [AuthService] Saving AI Model Preference: ${subscription.aiModel}`);
             localStorage.setItem('ai_model', subscription.aiModel);
          } else if (!localStorage.getItem('ai_model')) {
             console.warn('⚠️ [AuthService] No AI Model in subscription - Defaulting to gemma3:1b');
             localStorage.setItem('ai_model', 'gemma3:1b');
          }
        }
        
        return true;
      }
      return false;
    } catch (error) {
      // OFFLINE HANDLING: the licence server is unreachable. Fall back to the
      // signed session in the main process — not to localStorage, which the user
      // can edit. On the web there is no main process, so the local hint is all
      // we have and the next online check will settle it.
      if (!error.response) {
        console.warn('⚠️ [AuthService] Licence server unreachable — verifying local signed session');
        if (isDesktop()) {
          return !!(await this.restoreSession());
        }
        return this.isTokenValid();
      }

      // If server responded (e.g. 401 Unauthorized), return false
      return false;
    }
  }
}

export default new AuthService();

