const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

class SecurityManager {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.licensePath = path.join(userDataPath, 'sys-config.dat');
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

    // --- Session tokens -----------------------------------------------------
    //
    // The renderer cannot be trusted with session state (DevTools can rewrite
    // localStorage at will), so a session is only ever real if it carries an
    // HMAC this process produced. The key is derived from the machine ID, so a
    // token lifted off one PC is meaningless on another.

    signPayload(payloadB64) {
        return crypto.createHmac('sha256', this.getEncryptionKey()).update(payloadB64).digest('hex');
    }

    createSessionToken(session) {
        const payloadB64 = Buffer.from(JSON.stringify(session)).toString('base64url');
        return `${payloadB64}.${this.signPayload(payloadB64)}`;
    }

    /**
     * Returns the session payload, or null if the token is forged, tampered
     * with, bound to another machine, or past its expiry.
     */
    verifySessionToken(token) {
        if (typeof token !== 'string') return null;

        const [payloadB64, signature] = token.split('.');
        if (!payloadB64 || !signature) return null;

        const provided = Buffer.from(signature, 'utf8');
        const expected = Buffer.from(this.signPayload(payloadB64), 'utf8');
        // Length check first: timingSafeEqual throws on a length mismatch.
        if (provided.length !== expected.length) return null;
        if (!crypto.timingSafeEqual(provided, expected)) return null;

        let session;
        try {
            session = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        } catch (e) {
            return null;
        }

        if (session.machineId !== this.getMachineID()) return null;
        if (!session.expiryDate || new Date() >= new Date(session.expiryDate)) return null;

        return session;
    }

    /**
     * Persist a session that this process has already authenticated.
     * Encrypted at rest with the machine key, and signed so tampering is detectable.
     */
    saveSession(session) {
        const bound = { ...session, machineId: this.getMachineID(), issuedAt: new Date().toISOString() };
        const token = this.createSessionToken(bound);
        fs.writeFileSync(this.licensePath, this.encrypt(JSON.stringify({ token })));
        console.log('[Security] Session stored for machine:', this.getMachineID());
        return token;
    }

    /**
     * Returns { session, token } for a valid stored session, otherwise null.
     */
    getSession() {
        if (!fs.existsSync(this.licensePath)) return null;

        try {
            const decrypted = this.decrypt(fs.readFileSync(this.licensePath, 'utf8'));
            if (!decrypted) return null; // wrong machine — key won't decrypt

            const { token } = JSON.parse(decrypted);
            const session = this.verifySessionToken(token);
            return session ? { session, token } : null;
        } catch (e) {
            return null;
        }
    }

    clearSession() {
        try {
            if (fs.existsSync(this.licensePath)) fs.unlinkSync(this.licensePath);
        } catch (e) {
            console.warn('[Security] Could not clear session:', e.message);
        }
    }
}

module.exports = SecurityManager;