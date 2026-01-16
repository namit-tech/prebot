const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class HotspotManager {
  constructor() {
    this.isActive = false;
  }

  async isAdmin() {
    try {
      await execAsync('net session');
      return true;
    } catch (e) {
      return false;
    }
  }

  async checkSupport() {
    try {
      const { stdout } = await execAsync('netsh wlan show drivers');
      const supported = stdout.includes('Hosted network supported  : Yes');
      return {
        supported,
        details: stdout
      };
    } catch (e) {
      return { supported: false, error: e.message };
    }
  }

  async startHotspot(ssid, password) {
    // 1. Check Admin
    const isAdmin = await this.isAdmin();
    if (!isAdmin) {
      throw new Error('Administrator privileges required. Please run the app as Administrator.');
    }

    try {
      // 2. Stop any existing
      await this.stopHotspot().catch(() => {});

      // 3. Configure
      // Using legacy hostednetwork (works on older cards/drivers)
      const setCmd = `netsh wlan set hostednetwork mode=allow ssid="${ssid}" key="${password}"`;
      await execAsync(setCmd);

      // 4. Start
      const startCmd = 'netsh wlan start hostednetwork';
      await execAsync(startCmd);

      this.isActive = true;
      return { success: true, message: 'Hotspot started successfully' };
    } catch (error) {
      console.error('Hotspot start error:', error);
      
      // Analyze error
      let userMessage = error.message;
      if (error.stderr && error.stderr.includes('group or resource is not in the correct state')) {
        userMessage = 'Your WiFi adapter does not support Hosted Networks (common in Windows 10/11). Please use Windows Mobile Hotspot settings instead.';
      }

      throw new Error(userMessage);
    }
  }

  async stopHotspot() {
    try {
      await execAsync('netsh wlan stop hostednetwork');
      this.isActive = false;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new HotspotManager();
