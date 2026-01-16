// AI Face Animation Module
class AIFaceAnimation {
    constructor() {
        this.faceElement = document.getElementById('ai-face');
        this.videoElement = document.getElementById('animation-video');
        this.fallbackFace = this.faceElement?.querySelector('.fallback-face');
        this.mouthElement = this.faceElement?.querySelector('.mouth-shape');
        this.leftEye = this.faceElement?.querySelector('.left-eye .pupil');
        this.rightEye = this.faceElement?.querySelector('.right-eye .pupil');
        
        // Initialize hologram sync (optional, for PC2 support)
        try {
            // Only in Node.js environment
            if (typeof require !== 'undefined') {
                const HologramSync = require('./hologram-sync');
                this.hologramSync = new HologramSync();
            }
        } catch (error) {
            console.log('Hologram sync not available (browser environment)');
            this.hologramSync = null;
        }
        
        this.isAnimating = false;
        this.animationId = null;
        this.speakAnimationId = null;
        
        this.setupInitialState();
        this.setupVideo();
    }
    
    setupInitialState() {
        if (!this.faceElement) return;
        
        // Set initial neutral state
        this.faceElement.classList.remove('speaking');
        this.setMouthShape('neutral');
        this.setEyePosition('center');
    }
    
    setupVideo() {
        if (this.videoElement) {
            this.videoElement.loop = true;
            this.videoElement.muted = true;
            this.videoElement.preload = 'auto';
            
            // Try to load primary video on setup
            this.loadPrimaryVideoOnInit();
            
            // Handle video load errors
            this.videoElement.addEventListener('error', () => {
                console.log('Video failed to load, using fallback animation');
                this.useVideo = false;
            });
            
            // Handle video load success
            this.videoElement.addEventListener('loadeddata', () => {
                console.log('Custom animation video loaded successfully');
                this.useVideo = true;
            });
        }
    }
    
    loadPrimaryVideoOnInit() {
        try {
            const saved = localStorage.getItem('videoLibrary');
            if (saved && this.videoElement) {
                const videos = JSON.parse(saved);
                const primaryVideo = videos.find(v => v.isPrimary);
                
                if (primaryVideo) {
                    console.log(`🎬 Setting up primary video on init: ${primaryVideo.name}`);
                    
                    // Clear existing sources
                    this.videoElement.innerHTML = '';
                    
                    // Add primary video source
                    if (primaryVideo.data) {
                        const source = document.createElement('source');
                        source.src = primaryVideo.data;
                        if (primaryVideo.type) {
                            source.type = primaryVideo.type;
                        }
                        this.videoElement.appendChild(source);
                    } else if (primaryVideo.path) {
                        const source = document.createElement('source');
                        source.src = primaryVideo.path;
                        if (primaryVideo.type) {
                            source.type = primaryVideo.type;
                        }
                        this.videoElement.appendChild(source);
                    }
                    
                    // Preload the video
                    this.videoElement.load();
                }
            }
        } catch (error) {
            console.error('Error loading primary video on init:', error);
        }
    }
    
    startSpeakingAnimation() {
        if (!this.faceElement || this.isAnimating) return;
        
        this.isAnimating = true;
        this.faceElement.classList.add('speaking');
        
        // Start hologram video FIRST (if available)
        if (this.hologramSync) {
            this.hologramSync.startVideo();
        }
        
        // Load primary video before starting animation, then play
        this.loadPrimaryVideo().then(() => {
            // Try to start video animation first
            if (this.videoElement && this.useVideo !== false) {
                // Ensure video is visible
                this.videoElement.style.display = 'block';
                
                // Reset and play
                this.videoElement.currentTime = 0;
                
                const playPromise = this.videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('✅ Custom animation video started playing');
                        console.log(`📹 Playing video: ${this.videoElement.currentSrc || this.videoElement.src}`);
                    }).catch(e => {
                        console.log('⚠️ Video autoplay prevented, using fallback animation:', e);
                        this.startFallbackAnimation();
                    });
                }
            } else {
                console.log('ℹ️ Video not available, using fallback animation');
                this.startFallbackAnimation();
            }
        });
    }
    
    loadPrimaryVideo() {
        return new Promise((resolve) => {
            try {
                const saved = localStorage.getItem('videoLibrary');
                if (saved && this.videoElement) {
                    const videos = JSON.parse(saved);
                    const primaryVideo = videos.find(v => v.isPrimary);
                    
                    if (primaryVideo) {
                        console.log(`🎬 Loading primary video: ${primaryVideo.name}`);
                        
                        // Clear existing sources
                        this.videoElement.innerHTML = '';
                        
                        // Add new source with primary video (prefer base64 for browser)
                        if (primaryVideo.data) {
                            const source = document.createElement('source');
                            source.src = primaryVideo.data;
                            if (primaryVideo.type) {
                                source.type = primaryVideo.type;
                            }
                            this.videoElement.appendChild(source);
                            console.log(`✅ Added base64 source for: ${primaryVideo.name}`);
                        } else if (primaryVideo.path) {
                            // Use file path (works if file exists on disk)
                            const source = document.createElement('source');
                            // Ensure path is correct (relative to HTML file location)
                            let videoPath = primaryVideo.path;
                            // Make path relative to current HTML file
                            if (!videoPath.startsWith('http') && !videoPath.startsWith('data:') && !videoPath.startsWith('./')) {
                                videoPath = './' + videoPath;
                            }
                            source.src = videoPath;
                            if (primaryVideo.type) {
                                source.type = primaryVideo.type;
                            } else {
                                source.type = 'video/mp4'; // Default
                            }
                            this.videoElement.appendChild(source);
                            console.log(`✅ Added file path source: ${videoPath}`);
                        } else {
                            console.warn(`⚠️ Primary video has no data or path: ${primaryVideo.name}`);
                        }
                        
                        // Ensure video is visible and ready
                        this.videoElement.style.display = 'block';
                        
                        // Reload video element and wait for it to load
                        this.videoElement.load();
                        
                        // Wait for video to be ready to play
                        const onCanPlay = () => {
                            this.videoElement.removeEventListener('canplay', onCanPlay);
                            this.videoElement.removeEventListener('loadeddata', onLoaded);
                            this.videoElement.removeEventListener('error', onError);
                            this.useVideo = true;
                            console.log(`✅ Primary video ready to play: ${primaryVideo.name}`);
                            console.log(`📹 Video element src: ${this.videoElement.currentSrc || this.videoElement.src}`);
                            resolve();
                        };
                        
                        const onLoaded = () => {
                            // Also accept loadeddata as ready
                            this.videoElement.removeEventListener('canplay', onCanPlay);
                            this.videoElement.removeEventListener('loadeddata', onLoaded);
                            this.videoElement.removeEventListener('error', onError);
                            this.useVideo = true;
                            console.log(`✅ Primary video loaded: ${primaryVideo.name}`);
                            resolve();
                        };
                        
                        const onError = (e) => {
                            this.videoElement.removeEventListener('canplay', onCanPlay);
                            this.videoElement.removeEventListener('loadeddata', onLoaded);
                            this.videoElement.removeEventListener('error', onError);
                            console.warn(`⚠️ Primary video failed to load: ${primaryVideo.name}`);
                            console.warn(`Error details:`, e, this.videoElement.error);
                            this.useVideo = false;
                            resolve();
                        };
                        
                        // Listen for multiple events to ensure we catch when video is ready
                        this.videoElement.addEventListener('canplay', onCanPlay, { once: true });
                        this.videoElement.addEventListener('loadeddata', onLoaded, { once: true });
                        this.videoElement.addEventListener('error', onError, { once: true });
                        
                        // Timeout fallback
                        setTimeout(() => {
                            if (this.videoElement.readyState >= 2) { // HAVE_CURRENT_DATA
                                this.videoElement.removeEventListener('canplay', onCanPlay);
                                this.videoElement.removeEventListener('loadeddata', onLoaded);
                                this.videoElement.removeEventListener('error', onError);
                                this.useVideo = true;
                                console.log(`✅ Primary video ready (timeout fallback): ${primaryVideo.name}`);
                                resolve();
                            }
                        }, 2000);
                    } else {
                        console.log('ℹ️ No primary video set, using default');
                        resolve();
                    }
                } else {
                    console.log('ℹ️ No video library found, using default');
                    resolve();
                }
            } catch (error) {
                console.error('Error loading primary video for animation:', error);
                resolve();
            }
        });
    }
    
    stopSpeakingAnimation() {
        if (!this.faceElement || !this.isAnimating) return;
        
        this.isAnimating = false;
        this.faceElement.classList.remove('speaking');
        
        // Stop hologram video FIRST (if available)
        if (this.hologramSync) {
            this.hologramSync.stopVideo();
        }
        
        // Stop video
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.currentTime = 0;
        }
        
        // Stop all animations
        if (this.speakAnimationId) {
            cancelAnimationFrame(this.speakAnimationId);
            this.speakAnimationId = null;
        }
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Return to neutral state
        this.setMouthShape('neutral');
        this.setEyePosition('center');
        this.resetHeadPosition();
    }
    
    startLipSync() {
        if (!this.mouthElement) return;
        
        const lipSync = () => {
            if (!this.isAnimating) return;
            
            // Create random mouth movements to simulate speech
            const shapes = ['neutral', 'open', 'wide', 'smile', 'pucker'];
            const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
            this.setMouthShape(randomShape);
            
            // Schedule next animation frame
            this.speakAnimationId = requestAnimationFrame(() => {
                setTimeout(lipSync, 100 + Math.random() * 200); // Random timing
            });
        };
        
        lipSync();
    }
    
    startEyeMovement() {
        if (!this.leftEye || !this.rightEye) return;
        
        const moveEyes = () => {
            if (!this.isAnimating) return;
            
            // Random eye movements
            const positions = ['center', 'left', 'right', 'up', 'down'];
            const randomPosition = positions[Math.floor(Math.random() * positions.length)];
            this.setEyePosition(randomPosition);
            
            // Schedule next eye movement
            this.animationId = requestAnimationFrame(() => {
                setTimeout(moveEyes, 2000 + Math.random() * 3000); // Slower than mouth
            });
        };
        
        moveEyes();
    }
    
    startHeadMovement() {
        if (!this.faceElement) return;
        
        const moveHead = () => {
            if (!this.isAnimating) return;
            
            // Subtle head movements
            const rotations = [
                'rotate(0deg)',
                'rotate(2deg)',
                'rotate(-2deg)',
                'rotate(1deg)',
                'rotate(-1deg)'
            ];
            
            const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];
            this.faceElement.style.transform = randomRotation;
            
            // Schedule next head movement
            setTimeout(() => {
                if (this.isAnimating) {
                    this.faceElement.style.transform = 'rotate(0deg)';
                    setTimeout(moveHead, 3000 + Math.random() * 2000);
                }
            }, 500);
        };
        
        moveHead();
    }
    
    setMouthShape(shape) {
        if (!this.mouthElement) return;
        
        // Remove existing shape classes
        this.mouthElement.className = 'mouth-shape';
        
        switch (shape) {
            case 'neutral':
                this.mouthElement.style.height = '10px';
                this.mouthElement.style.borderRadius = '0 0 20px 20px';
                break;
            case 'open':
                this.mouthElement.style.height = '15px';
                this.mouthElement.style.borderRadius = '50%';
                break;
            case 'wide':
                this.mouthElement.style.height = '8px';
                this.mouthElement.style.width = '50px';
                this.mouthElement.style.borderRadius = '0 0 25px 25px';
                break;
            case 'smile':
                this.mouthElement.style.height = '12px';
                this.mouthElement.style.borderRadius = '0 0 30px 30px';
                break;
            case 'pucker':
                this.mouthElement.style.height = '8px';
                this.mouthElement.style.width = '25px';
                this.mouthElement.style.borderRadius = '50%';
                break;
        }
    }
    
    setEyePosition(position) {
        if (!this.leftEye || !this.rightEye) return;
        
        const eyes = [this.leftEye, this.rightEye];
        
        eyes.forEach(eye => {
            eye.style.transform = 'translate(-50%, -50%)';
            
            switch (position) {
                case 'center':
                    eye.style.left = '50%';
                    eye.style.top = '50%';
                    break;
                case 'left':
                    eye.style.left = '30%';
                    eye.style.top = '50%';
                    break;
                case 'right':
                    eye.style.left = '70%';
                    eye.style.top = '50%';
                    break;
                case 'up':
                    eye.style.left = '50%';
                    eye.style.top = '30%';
                    break;
                case 'down':
                    eye.style.left = '50%';
                    eye.style.top = '70%';
                    break;
            }
        });
    }
    
    resetHeadPosition() {
        if (this.faceElement) {
            this.faceElement.style.transform = 'rotate(0deg)';
        }
    }
    
    // Blink animation
    blink() {
        if (!this.leftEye || !this.rightEye) return;
        
        const blinkDuration = 150;
        
        // Scale down pupils to simulate blink
        this.leftEye.style.transform = 'translate(-50%, -50%) scaleY(0.1)';
        this.rightEye.style.transform = 'translate(-50%, -50%) scaleY(0.1)';
        
        setTimeout(() => {
            this.leftEye.style.transform = 'translate(-50%, -50%) scaleY(1)';
            this.rightEye.style.transform = 'translate(-50%, -50%) scaleY(1)';
        }, blinkDuration);
    }
    
    // Start random blinking
    startBlinking() {
        const blink = () => {
            this.blink();
            // Random blink interval between 2-5 seconds
            setTimeout(blink, 2000 + Math.random() * 3000);
        };
        
        blink();
    }
    
    // Express emotions
    expressEmotion(emotion) {
        if (!this.faceElement) return;
        
        // Remove existing emotion classes
        this.faceElement.className = this.faceElement.className.replace(/emotion-\w+/g, '');
        
        switch (emotion) {
            case 'happy':
                this.faceElement.classList.add('emotion-happy');
                this.setMouthShape('smile');
                break;
            case 'surprised':
                this.faceElement.classList.add('emotion-surprised');
                this.setEyePosition('up');
                this.setMouthShape('open');
                break;
            case 'thinking':
                this.faceElement.classList.add('emotion-thinking');
                this.setEyePosition('left');
                this.setMouthShape('neutral');
                break;
        }
        
        // Reset after 2 seconds
        setTimeout(() => {
            this.faceElement.className = this.faceElement.className.replace(/emotion-\w+/g, '');
            this.setMouthShape('neutral');
            this.setEyePosition('center');
        }, 2000);
    }
    
    startFallbackAnimation() {
        // Start lip-sync animation
        this.startLipSync();
        
        // Add random eye movements
        this.startEyeMovement();
        
        // Add subtle head movements
        this.startHeadMovement();
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIFaceAnimation;
}
