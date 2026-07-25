import api from './api.service';
import CryptoJS from 'crypto-js';

const SECRET_KEY = 'prebot-secret-key-change-in-production';

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

  async login(email, password, hardwareId) {
    const response = await api.post('/auth/login', { email, password, hardwareId });
    
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

  async specialLogin(email, password) {
    if (!window.electronAPI?.specialLogin) throw new Error('Platform not supported');
    
    const result = await window.electronAPI.specialLogin(email, password);
    if (!result.success) throw new Error(result.error || 'Activation failed');

    const { user } = result;
    
    // Store localized "Special License" state
    localStorage.setItem('auth_token', this.encrypt('SPECIAL-OFFLINE-TOKEN'));
    localStorage.setItem('expiry_date', user.expiryDate);
    localStorage.setItem('models', JSON.stringify(user.models));
    localStorage.setItem('user_role', user.role);
    localStorage.setItem('user_data', JSON.stringify(user));
    localStorage.setItem('ai_model', 'gemma3:1b');

    return result;
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

  getLicenseToken() {
    const encryptedToken = localStorage.getItem('license_token');
    if (!encryptedToken) return null;
    
    try {
      return this.decrypt(encryptedToken);
    } catch (e) {
      return encryptedToken; // Fallback
    }
  }

  isTokenValid() {
    const encryptedToken = localStorage.getItem('auth_token');
    if (!encryptedToken) return false;

    const role = this.getUserRole();
    
    // Special Edition or Superadmin doesn't need external server check
    if (role === 'superadmin' || role === 'special-edition') {
      const expiryDate = localStorage.getItem('expiry_date');
      if (!expiryDate) return role === 'superadmin'; // Superadmin might not have expiry
      return new Date() < new Date(expiryDate);
    }

    const expiryDate = localStorage.getItem('expiry_date');
    if (!expiryDate) return false;

    // Check if expired
    return new Date() < new Date(expiryDate);
  }

  logout() {
    localStorage.removeItem('auth_token');
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
      const response = await api.get('/auth/validate');
      
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
      // OFFLINE HANDLING: If network error (no response), fall back to local token validation
      if (!error.response) {
         console.warn('⚠️ [AuthService] Network Error (Offline) - Falling back to local token validation');
         // If we have a valid format token locally, assume it's good (Offline Mode)
         return this.isTokenValid();
      }
      
      // If server responded (e.g. 401 Unauthorized), return false
      return false;
    }
  }

  async checkLocalLicense() {
    if (!window.electronAPI?.checkLocalLicense) return false;
    const result = await window.electronAPI.checkLocalLicense();
    if (result.success) {
      const { license } = result;
      localStorage.setItem('auth_token', this.encrypt('SPECIAL-OFFLINE-TOKEN'));
      localStorage.setItem('expiry_date', license.expiryDate);
      localStorage.setItem('models', JSON.stringify(license.models));
      localStorage.setItem('user_role', license.role);
      localStorage.setItem('user_data', JSON.stringify(license));
      return true;
    }
    return false;
  }
}

export default new AuthService();

