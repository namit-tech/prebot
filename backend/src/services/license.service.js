const crypto = require('crypto');
const Subscription = require('../models/Subscription');

class LicenseService {
  async generateLicenseToken(subscription) {
    const payload = {
      subscriptionId: subscription._id.toString(),
      expiryDate: subscription.expiryDate.toISOString(),
      models: subscription.models,
      type: subscription.type,
      timestamp: Date.now()
    };

    // Get encryption key and IV from environment
    const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(process.env.ENCRYPTION_IV, 'hex');

    // Encrypt payload
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Combine encrypted data with auth tag
    const licenseToken = `${encrypted}:${authTag.toString('hex')}`;

    // Save to subscription
    subscription.licenseToken = licenseToken;
    await subscription.save();

    return licenseToken;
  }

  async validateLicenseToken(licenseToken) {
    try {
      const [encrypted, authTagHex] = licenseToken.split(':');
      
      if (!encrypted || !authTagHex) {
        return { valid: false, error: 'Invalid license token format' };
      }

      const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
      const iv = Buffer.from(process.env.ENCRYPTION_IV, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const payload = JSON.parse(decrypted);

      // Check expiry
      if (new Date() > new Date(payload.expiryDate)) {
        return { valid: false, error: 'License expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: 'Invalid license token' };
    }
  }
}

module.exports = new LicenseService();

