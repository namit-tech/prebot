// Text-to-Speech Module
class TextToSpeech {
    constructor() {
        this.synthesis = window.speechSynthesis;
        this.currentUtterance = null;
        this.isSpeaking = false;
        this.isMuted = false;
        this.voices = [];
        this.selectedVoice = null;
        
        // Load saved TTS settings or use defaults
        this.loadSettings();
        
        this.initializeVoices();
        this.setupEventListeners();
    }
    
    // Load TTS settings from localStorage
    loadSettings() {
        try {
            const saved = localStorage.getItem('ttsSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.rate = settings.rate !== undefined ? settings.rate : 0.9;
                this.pitch = settings.pitch !== undefined ? settings.pitch : 1.0;
                this.volume = settings.volume !== undefined ? settings.volume : 0.8;
                this.voiceName = settings.voiceName || null;
                this.language = settings.language || 'en';
            } else {
                // Default settings
                this.rate = 0.9;      // Speech rate (0.1 to 10, default 1.0)
                this.pitch = 1.0;     // Pitch (0 to 2, default 1.0)
                this.volume = 0.8;    // Volume (0 to 1, default 1.0)
                this.voiceName = null; // Will be auto-selected
                this.language = 'en';  // Language code
            }
        } catch (error) {
            console.error('Error loading TTS settings:', error);
            // Use defaults
            this.rate = 0.9;
            this.pitch = 1.0;
            this.volume = 0.8;
            this.voiceName = null;
            this.language = 'en';
        }
    }
    
    // Save TTS settings to localStorage
    saveSettings() {
        try {
            const settings = {
                rate: this.rate,
                pitch: this.pitch,
                volume: this.volume,
                voiceName: this.voiceName,
                language: this.language
            };
            localStorage.setItem('ttsSettings', JSON.stringify(settings));
            console.log('✅ TTS settings saved:', settings);
        } catch (error) {
            console.error('Error saving TTS settings:', error);
        }
    }
    
    // Set speech rate (speed)
    setRate(rate) {
        this.rate = Math.max(0.1, Math.min(10, rate)); // Clamp between 0.1 and 10
        this.saveSettings();
        console.log('📊 Speech rate set to:', this.rate);
    }
    
    // Set pitch
    setPitch(pitch) {
        this.pitch = Math.max(0, Math.min(2, pitch)); // Clamp between 0 and 2
        this.saveSettings();
        console.log('🎵 Pitch set to:', this.pitch);
    }
    
    // Set volume
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
        this.saveSettings();
        console.log('🔊 Volume set to:', this.volume);
    }
    
    // Set voice by name
    setVoice(voiceName) {
        this.voiceName = voiceName;
        this.selectedVoice = this.voices.find(v => v.name === voiceName) || null;
        this.saveSettings();
        console.log('🎤 Voice set to:', voiceName);
    }
    
    // Set language
    setLanguage(language) {
        this.language = language;
        this.saveSettings();
        // Re-select voice based on language
        this.loadVoices();
        console.log('🌐 Language set to:', language);
    }
    
    // Get all available voices
    getAvailableVoices() {
        return this.voices;
    }
    
    // Get current settings
    getSettings() {
        return {
            rate: this.rate,
            pitch: this.pitch,
            volume: this.volume,
            voiceName: this.voiceName,
            language: this.language,
            selectedVoice: this.selectedVoice ? this.selectedVoice.name : null
        };
    }
    
    initializeVoices() {
        // Load voices when they become available
        if (this.synthesis.getVoices().length > 0) {
            this.loadVoices();
        } else {
            this.synthesis.addEventListener('voiceschanged', () => {
                this.loadVoices();
            });
        }
    }
    
    loadVoices() {
        this.voices = this.synthesis.getVoices();
        
        // If a specific voice was saved, try to use it
        if (this.voiceName) {
            const savedVoice = this.voices.find(v => v.name === this.voiceName);
            if (savedVoice) {
                this.selectedVoice = savedVoice;
                console.log('✅ Restored saved voice:', this.voiceName);
                return;
            }
        }
        
        // Filter voices by language
        const languageVoices = this.voices.filter(voice => 
            voice.lang.startsWith(this.language)
        );
        
        if (languageVoices.length === 0) {
            // Fallback to any voice
            this.selectedVoice = this.voices[0] || null;
            return;
        }
        
        // Prefer female voices for better AI assistant experience (if English)
        if (this.language === 'en') {
            const femaleVoices = languageVoices.filter(voice => 
                voice.name.includes('Female') || voice.name.includes('female') || 
                voice.name.includes('Samantha') || voice.name.includes('Karen') ||
                voice.name.includes('Susan') || voice.name.includes('Victoria') ||
                voice.name.includes('Zira') || voice.name.includes('Hazel')
            );
            
            if (femaleVoices.length > 0) {
                this.selectedVoice = femaleVoices[0];
            } else {
                this.selectedVoice = languageVoices[0];
            }
        } else {
            // For other languages, just use the first available voice
            this.selectedVoice = languageVoices[0];
        }
        
        // Update voiceName to match selected voice
        if (this.selectedVoice) {
            this.voiceName = this.selectedVoice.name;
        }
    }
    
    setupEventListeners() {
        // Handle mute button
        const muteBtn = document.getElementById('mute-btn');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.toggleMute();
            });
        }
        
        // Handle stop button
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stop();
            });
        }
    }
    
    speak(text, onStart, onEnd) {
        if (this.isMuted) {
            if (onEnd) onEnd();
            return;
        }
        
        // Stop any current speech
        this.stop();
        
        this.currentUtterance = new SpeechSynthesisUtterance(text);
        
        // Configure voice settings (use saved preferences)
        if (this.selectedVoice) {
            this.currentUtterance.voice = this.selectedVoice;
        }
        
        // Use saved settings or defaults
        this.currentUtterance.rate = this.rate || 0.9;
        this.currentUtterance.pitch = this.pitch || 1.0;
        this.currentUtterance.volume = this.volume || 0.8;
        
        console.log('🎤 TTS Settings:', {
            voice: this.selectedVoice ? this.selectedVoice.name : 'default',
            rate: this.currentUtterance.rate,
            pitch: this.currentUtterance.pitch,
            volume: this.currentUtterance.volume
        });
        
        // Event handlers
        this.currentUtterance.onstart = () => {
            this.isSpeaking = true;
            this.updateUI();
            if (onStart) onStart();
        };
        
        this.currentUtterance.onend = () => {
            this.isSpeaking = false;
            this.currentUtterance = null;
            this.updateUI();
            if (onEnd) onEnd();
        };
        
        this.currentUtterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            this.isSpeaking = false;
            this.currentUtterance = null;
            this.updateUI();
            if (onEnd) onEnd();
        };
        
        // Start speaking
        this.synthesis.speak(this.currentUtterance);
    }
    
    stop() {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.updateUI();
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        const muteBtn = document.getElementById('mute-btn');
        
        if (muteBtn) {
            muteBtn.textContent = this.isMuted ? '🔇 Unmute' : '🔊 Mute';
            muteBtn.style.backgroundColor = this.isMuted ? '#ff6b6b' : '';
            muteBtn.style.color = this.isMuted ? 'white' : '';
        }
        
        // If currently speaking and we're muting, stop speech
        if (this.isMuted && this.isSpeaking) {
            this.stop();
        }
    }
    
    updateUI() {
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) {
            stopBtn.disabled = !this.isSpeaking;
        }
    }
    
    // Get speaking status for animation sync
    isCurrentlySpeaking() {
        return this.isSpeaking;
    }
    
    // Get estimated duration for animation planning
    getEstimatedDuration(text) {
        // Rough estimation: average reading speed is about 200 words per minute
        const wordsPerMinute = 200;
        const wordCount = text.split(' ').length;
        return (wordCount / wordsPerMinute) * 60 * 1000; // Convert to milliseconds
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TextToSpeech;
}
