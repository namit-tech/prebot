// hologram-sync.js - Simple Hologram Sync Controller
class HologramSync {
    constructor() {
        this.hologramPC = null;
        this.isConnected = false;
        this.setupConnection();
    }
    
    setupConnection() {
        // Try to find hologram PC on network
        this.findHologramPC();
    }
    
    async findHologramPC() {
        const commonIPs = [
            '192.168.1.100',
            '192.168.0.100',
            '192.168.1.101',
            '192.168.0.101',
            '192.168.1.102',
            '192.168.0.102'
        ];
        
        for (const ip of commonIPs) {
            try {
                const response = await fetch(`http://${ip}:8080/api/status`, {
                    method: 'GET',
                    timeout: 2000
                });
                
                if (response.ok) {
                    this.hologramPC = ip;
                    this.isConnected = true;
                    console.log(`🎬 Hologram PC connected: ${ip}`);
                    return;
                }
            } catch (e) {
                // Continue to next IP
            }
        }
        
        console.log('🎬 Hologram PC not found, using local video only');
    }
    
    async startVideo() {
        if (!this.isConnected || !this.hologramPC) {
            console.log('🎬 Hologram not connected, skipping');
            return;
        }
        
        try {
            console.log('🎬 Starting hologram video...');
            const response = await fetch(`http://${this.hologramPC}:8080/api/play`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    video: 'speaking-animation.mp4',
                    loop: true
                })
            });
            
            if (response.ok) {
                console.log('✅ Hologram video started successfully');
            } else {
                console.error('❌ Failed to start hologram video');
            }
        } catch (error) {
            console.error('❌ Hologram control failed:', error);
        }
    }
    
    async stopVideo() {
        if (!this.isConnected || !this.hologramPC) {
            return;
        }
        
        try {
            console.log('🛑 Stopping hologram video...');
            const response = await fetch(`http://${this.hologramPC}:8080/api/stop`, {
                method: 'POST'
            });
            
            if (response.ok) {
                console.log('✅ Hologram video stopped successfully');
            } else {
                console.error('❌ Failed to stop hologram video');
            }
        } catch (error) {
            console.error('❌ Hologram stop failed:', error);
        }
    }
}

module.exports = HologramSync;
