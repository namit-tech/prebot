import CryptoJS from 'crypto-js';
import authService from './auth.service';

const SECRET_KEY = 'prebot-license-key-change-in-production';

class LicenseService {
  validateLicenseOffline() {
    try {
      const licenseToken = authService.getLicenseToken();
      const expiryDate = localStorage.getItem('expiry_date');

      if (!licenseToken || !expiryDate) {
        return {
          valid: false,
          error: 'No license found'
        };
      }

      // Check expiry date
      const now = new Date();
      const expiry = new Date(expiryDate);

      if (now > expiry) {
        return {
          valid: false,
          error: 'License expired',
          expired: true
        };
      }

      // Decrypt and validate license token
      try {
        const decrypted = this.decrypt(licenseToken);
        if (decrypted && decrypted.expiryDate) {
          const tokenExpiry = new Date(decrypted.expiryDate);
          if (now > tokenExpiry) {
            return {
              valid: false,
              error: 'License token expired',
              expired: true
            };
          }
        }
      } catch (e) {
        // If decryption fails, still check expiry date
        console.warn('License token decryption failed:', e);
      }

      return {
        valid: true,
        expiryDate: expiryDate,
        daysRemaining: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message || 'License validation failed'
      };
    }
  }

  encrypt(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
  }

  decrypt(encryptedData) {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (e) {
      throw new Error('Failed to decrypt license');
    }
  }

  getDaysRemaining() {
    const expiryDate = localStorage.getItem('expiry_date');
    if (!expiryDate) return 0;

    const now = new Date();
    const expiry = new Date(expiryDate);
    const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }

  isExpired() {
    const expiryDate = localStorage.getItem('expiry_date');
    if (!expiryDate) return true;

    return new Date() > new Date(expiryDate);
  }
}

export default new LicenseService();






