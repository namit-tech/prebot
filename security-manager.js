const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

class SecurityManager {
    constructor(userDataPath, config = {}) {
        this.userDataPath = userDataPath;
        this.licensePath = path.join(userDataPath, 'sys-config.dat');
        
        // Master credentials (can be overridden by config)
        this.masterEmail = config.defaultAuth?.email || 'standalone@prebot.ai';
        this.masterPassword = config.defaultAuth?.password || 'PREBOT-2026-X-SPECIAL';
    }

    getMachineID() {
        return machineIdSync();
    }

    getEncryptionKey() {
        const id = this.getMachineID();
        return crypto.createHash('sha256').update(id + 'prebot-secret-salt').digest();
    }

    encrypt(text) {
        const key = this.getEncryptionKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(text) {
        try {
            const key = this.getEncryptionKey();
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            return null;
        }
    }

    isSpecialUser(email, password) {
        return email === this.masterEmail && password === this.masterPassword;
    }

    saveSpecialLicense(expiryDate) {
        const data = JSON.stringify({
            activated: true,
            expiryDate: expiryDate,
            machineId: this.getMachineID(),
            role: 'special-edition'
        });
        const encrypted = this.encrypt(data);
        fs.writeFileSync(this.licensePath, encrypted);
        console.log('[Security] Special license saved for machine:', this.getMachineID());
    }

    getSpecialLicense() {
        if (!fs.existsSync(this.licensePath)) return null;
        
        try {
            const encrypted = fs.readFileSync(this.licensePath, 'utf8');
            const decrypted = this.decrypt(encrypted);
            if (!decrypted) return { error: 'INVALID_MACHINE_BINDING' };
            
            const data = JSON.parse(decrypted);
            
            // Anti-tamper: Check machine ID
            if (data.machineId !== this.getMachineID()) {
                return { error: 'MACHINE_MISMATCH' };
            }
            
            return data;
        } catch (e) {
            return { error: 'CORRUPT_LICENSE' };
        }
    }
}

module.exports = SecurityManager;