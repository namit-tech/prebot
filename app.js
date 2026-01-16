// Main Application Module

const API_URL = 'http://localhost:5000/api'; // Adjust port if needed

class LoginService {
    constructor(app) {
        this.app = app;
        this.overlay = document.getElementById('login-overlay');
        this.loginBtn = document.getElementById('login-btn');
        this.emailInput = document.getElementById('login-email');
        this.passwordInput = document.getElementById('login-password');
        this.errorMsg = document.getElementById('login-error');
        this.appContainer = document.getElementById('app-container');
        
        this.setupEventListeners();
        this.checkLicense();
    }

    setupEventListeners() {
        if (this.loginBtn) {
            this.loginBtn.addEventListener('click', () => this.handleLogin());
        }
        
        // Toggle password visibility
        const toggleBtn = document.getElementById('login-password-toggle');
        if (toggleBtn && this.passwordInput) {
            toggleBtn.addEventListener('click', () => {
                const type = this.passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                this.passwordInput.setAttribute('type', type);
                toggleBtn.textContent = type === 'password' ? '👁️' : '🔒';
            });
        }
    }

    async checkLicense() {
        console.log('🔐 Checking license status...');
        const licenseData = localStorage.getItem('license_data');
        
        if (licenseData) {
            try {
                const license = JSON.parse(licenseData);
                const expiryDate = new Date(license.expiryDate);
                const now = new Date();

                // 🔒 Hardware Check
                let currentMachineId = null;
                if (window.electronAPI && window.electronAPI.getMachineId) {
                    currentMachineId = await window.electronAPI.getMachineId();
                    console.log('🖥️ Current Machine ID:', currentMachineId);
                    
                    if (license.machineId && currentMachineId && license.machineId !== currentMachineId) {
                        console.error('⛔ HARDWARE ID MISMATCH! Saved:', license.machineId, 'Current:', currentMachineId);
                        this.showError('Security Alert: This license belongs to another device. Access Denied.');
                        return;
                    }
                }

                if (now < expiryDate) {
                    console.log('✅ Valid license found. Expiry:', expiryDate);
                    this.unlockApp(license);
                    return;
                } else {
                    console.warn('⚠️ License expired on:', expiryDate);
                    this.showError('Your license has expired. Please contact support or login to renew.');
                }
            } catch (e) {
                console.error('❌ Error parsing license data:', e);
            }
        }
        
        // If no valid license, keep app locked
        console.log('🔒 No valid license. App locked.');
    }

    async handleLogin() {
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value.trim();

        if (!email || !password) {
            this.showError('Please enter both email and password.');
            return;
        }

        this.setLoading(true);
        this.hideError();

        try {
            // Get Machine ID if available
            let machineId = null;
            if (window.electronAPI && window.electronAPI.getMachineId) {
                machineId = await window.electronAPI.getMachineId();
                console.log('🔒 Sending Machine ID:', machineId);
            }

            // 1. Login to get token
            const loginResponse = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, hardwareId: machineId })
            });

            const responseJson = await loginResponse.json();
            console.log('🔹 Login API Response:', responseJson);

            if (!loginResponse.ok) {
                throw new Error(responseJson.message || 'Login failed');
            }

            // Extract data from wrapper if present (Backend returns { success: true, data: { ... } })
            const loginData = responseJson.data || responseJson;

            // Allow user, admin, and superadmin to login
            if (!loginData || !loginData.user || !['user', 'admin', 'superadmin'].includes(loginData.user.role)) {
                console.error('❌ Role Check Failed:', loginData?.user?.role);
                throw new Error('Access denied. Invalid credentials or insufficient privileges.');
            }

            const token = loginData.token;

            // 2. Fetch Subscription/License Status
            const subResponse = await fetch(`${API_URL}/subscription/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const subResponseJson = await subResponse.json();
            console.log('🔹 Subscription API Response:', subResponseJson);

            if (!subResponse.ok) {
                throw new Error(subResponseJson.message || 'Failed to fetch subscription');
            }

            const subscription = subResponseJson.data || subResponseJson;

            // 3. Save License Data locally for offline use
            const licenseInfo = {
                token: token,
                expiryDate: subscription.expiryDate, 
                user: loginData.user,
                machineId: machineId, // Save Machine ID locally
                lastValidated: new Date().toISOString()
            };

            localStorage.setItem('license_data', JSON.stringify(licenseInfo));
            localStorage.setItem('auth_token', token);

            this.showSuccess('Login successful! Downloading license...');
            
            setTimeout(() => {
                this.unlockApp(licenseInfo);
            }, 1000);

        } catch (error) {
            console.error('Login error:', error);
            this.showError(error.message || 'Connection failed. Check your internet.');
        } finally {
            this.setLoading(false);
        }
    }

    unlockApp(license) {
        this.overlay.classList.add('hidden');
        this.appContainer.classList.remove('hidden');
        
        // Update Admin Panel with user info if needed
        console.log('🔓 App unlocked for:', license.user ? license.user.email : 'Local User');
        
        // Start periodic expiry check
        this.startExpiryCheck(license.expiryDate);
    }

    startExpiryCheck(expiryDateStr) {
        const checkInterval = 60000; // Check every minute
        
        setInterval(() => {
            const expiry = new Date(expiryDateStr);
            const now = new Date();
            
            if (now >= expiry) {
                alert('Your session/license has expired. The application will now lock.');
                localStorage.removeItem('license_data');
                location.reload(); // Reload to show login screen
            }
        }, checkInterval);
    }

    setLoading(isLoading) {
        const btnText = document.getElementById('login-btn-text');
        const loader = document.getElementById('login-loader');
        
        if (isLoading) {
            this.loginBtn.disabled = true;
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');
        } else {
            this.loginBtn.disabled = false;
            btnText.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }

    showError(msg) {
        this.errorMsg.textContent = msg;
        this.errorMsg.classList.remove('hidden');
        this.errorMsg.style.borderColor = '#f56565';
        this.errorMsg.style.background = '#fff5f5';
        this.errorMsg.style.color = '#c53030';
    }

    showSuccess(msg) {
        this.errorMsg.textContent = msg;
        this.errorMsg.classList.remove('hidden');
        this.errorMsg.style.borderColor = '#48bb78';
        this.errorMsg.style.background = '#f0fff4';
        this.errorMsg.style.color = '#2f855a';
    }
    
    hideError() {
        this.errorMsg.classList.add('hidden');
    }
}

class OfflineAIAssistant {
    constructor() {
        try {
            this.defaultQuestionsData = questionsData || [];
            this.questionsData = questionsData || [];
            this.tts = new TextToSpeech();
            this.aiFace = new AIFaceAnimation();
            this.adminPanel = null;
            this.currentQuestion = null;
            this.isProcessing = false;
            this.isElectron = typeof window !== 'undefined' && window.electronAPI;
            this.desktopServer = null;
            
            // Initialize Login Service (License Check)
            this.loginService = new LoginService(this);
            
            this.initializeApp();
        } catch (error) {
            console.error('Error in constructor:', error);
            // Error handling is now managed by LoginService for license issues
            // this.showError('Failed to initialize application'); 
            // We'll leave the original error handling as fallback but LoginService might have its own overlay
        }
    }
    
    initializeApp() {
        this.loadCustomQuestions();
        this.loadQuestions();
        this.setupEventListeners();
        this.startIdleAnimations();
        this.setupDesktopFeatures();
        this.initializeAdminPanel();
        this.startDesktopServer();
        this.loadPrimaryVideo();
        this.saveExistingVideosToDisk();
        
        console.log('Offline AI Assistant initialized successfully!');
        console.log('Running as:', this.isElectron ? 'Desktop App' : 'Web App');
    }
    
    saveExistingVideosToDisk() {
        // Save existing videos from localStorage to disk (for PC2 access)
        if (this.isElectron && window.electronAPI && window.electronAPI.saveVideosToFile) {
            try {
                const saved = localStorage.getItem('videoLibrary');
                if (saved) {
                    const videos = JSON.parse(saved);
                    if (videos.length > 0) {
                        // Check which videos have base64 data
                        const videosWithData = videos.filter(v => v.data && v.data.startsWith('data:video/'));
                        if (videosWithData.length > 0) {
                            console.log(`💾 Saving ${videosWithData.length} videos with data to disk...`);
                            window.electronAPI.saveVideosToFile(videos).then(() => {
                                console.log(`✅ Saved ${videos.length} existing videos to disk`);
                            }).catch(err => {
                                console.error('Error saving existing videos to disk:', err);
                            });
                        } else {
                            console.log(`ℹ️ No videos with base64 data to save (${videos.length} videos in library)`);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading videos for disk save:', error);
            }
        }
    }
    
    loadPrimaryVideo() {
        try {
            const saved = localStorage.getItem('videoLibrary');
            if (saved) {
                const videos = JSON.parse(saved);
                const primaryVideo = videos.find(v => v.isPrimary);
                if (primaryVideo && this.aiFace) {
                    const videoElement = document.getElementById('animation-video');
                    if (videoElement) {
                        console.log(`🎬 Preloading primary video on startup: ${primaryVideo.name}`);
                        
                        // Clear existing sources
                        videoElement.innerHTML = '';
                        
                        // Prefer base64 data for browser compatibility
                        if (primaryVideo.data) {
                            const source = document.createElement('source');
                            source.src = primaryVideo.data;
                            if (primaryVideo.type) {
                                source.type = primaryVideo.type;
                            }
                            videoElement.appendChild(source);
                            console.log(`✅ Preloaded primary video from base64: ${primaryVideo.name}`);
                        } else if (primaryVideo.path) {
                            const source = document.createElement('source');
                            source.src = primaryVideo.path;
                            if (primaryVideo.type) {
                                source.type = primaryVideo.type;
                            }
                            videoElement.appendChild(source);
                            console.log(`✅ Preloaded primary video from path: ${primaryVideo.path}`);
                        }
                        
                        // Preload the video
                        videoElement.load();
                        videoElement.preload = 'auto';
                        
                        // Update aiFace to know about the video
                        if (this.aiFace.videoElement) {
                            this.aiFace.useVideo = true;
                        }
                        
                        // Handle errors gracefully
                        videoElement.addEventListener('error', () => {
                            console.warn(`⚠️ Primary video failed to preload: ${primaryVideo.name}`);
                            // Fallback to default
                            videoElement.innerHTML = '<source src="assets/videos/your-animation.mp4" type="video/mp4">';
                            videoElement.load();
                        }, { once: true });
                        
                        // Log when video is ready
                        videoElement.addEventListener('loadeddata', () => {
                            console.log(`✅ Primary video preloaded and ready: ${primaryVideo.name}`);
                        }, { once: true });
                    }
                } else {
                    console.log('ℹ️ No primary video set on startup');
                }
            }
        } catch (error) {
            console.error('Error loading primary video:', error);
        }
    }
    
    setupDesktopFeatures() {
        if (!this.isElectron) return;
        
        // Desktop-specific features
        const minimizeBtn = document.getElementById('minimize-btn');
        const closeBtn = document.getElementById('close-btn');
        
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                // Minimize window (this would need IPC communication)
                console.log('Minimize requested');
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                // Close window (this would need IPC communication)
                console.log('Close requested');
            });
        }
        
        // Add desktop-specific styling
        document.body.classList.add('desktop-app');
        
        // Show desktop version info
        this.showDesktopInfo();
    }
    
    showDesktopInfo() {
        const header = document.querySelector('header p');
        if (header) {
            header.innerHTML = 'Desktop App - Click on any question to get an answer with AI animation<br><small>Version 1.0.0 | Completely Offline | Click Admin to customize questions</small>';
        }
    }
    
    initializeAdminPanel() {
        try {
            this.adminPanel = new AdminPanel(this);
            window.adminPanel = this.adminPanel; // Make it globally accessible
        } catch (error) {
            console.error('Error initializing admin panel:', error);
            this.adminPanel = null;
        }
    }
    
    loadCustomQuestions() {
        try {
            const saved = localStorage.getItem('customQuestions');
            if (saved) {
                const customQuestions = JSON.parse(saved);
                if (Array.isArray(customQuestions) && customQuestions.length > 0) {
                    this.questionsData = customQuestions;
                    console.log('✅ Loaded admin questions:', customQuestions.length);
                    return;
                }
            }
        } catch (error) {
            console.error('Error loading custom questions:', error);
        }
        
        // No default questions - only admin-added questions
        this.questionsData = [];
        console.log('📝 No questions yet - add questions via Admin panel');
    }
    
    loadQuestions() {
        const questionsList = document.getElementById('questions-list');
        if (!questionsList) return;
        
        questionsList.innerHTML = '';
        
        if (this.questionsData.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.style.cssText = 'text-align: center; padding: 40px; background: #f8f9fa; border-radius: 10px; border: 2px dashed #667eea;';
            emptyMessage.innerHTML = `
                <div style="color: #333;">
                    <h2 style="color: #667eea; margin-bottom: 15px;">📝 No Questions Yet</h2>
                    <p style="font-size: 18px; margin-bottom: 20px;">Click the <strong style="color: #ff6b35;">⚙️ Admin</strong> button below to add your first question!</p>
                    <p style="color: #666;">💡 You can add unlimited questions and answers</p>
                    <p style="color: #666; margin-top: 10px;">✨ This AI assistant will use only your custom questions</p>
                </div>
            `;
            questionsList.appendChild(emptyMessage);
            return;
        }
        
        this.questionsData.forEach(question => {
            const questionBtn = document.createElement('button');
            questionBtn.className = 'question-btn';
            questionBtn.textContent = question.question;
            questionBtn.dataset.questionId = question.id;
            
            questionBtn.addEventListener('click', () => {
                this.handleQuestionClick(question);
            });
            
            questionsList.appendChild(questionBtn);
        });
        
        // Update questions for mobile access
        this.updateQuestionsForMobile();
    }
    
    setupEventListeners() {
        // Handle window focus/blur for better performance
        window.addEventListener('focus', () => {
            this.resumeAnimations();
        });
        
        window.addEventListener('blur', () => {
            this.pauseAnimations();
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseAnimations();
            } else {
                this.resumeAnimations();
            }
        });
        
        // Handle mobile question requests
        if (this.isElectron && window.electronAPI) {
            // Listen for mobile questions from main process via IPC
            const self = this;
            
            if (window.electronAPI.onMobileQuestion) {
                console.log('📱 Setting up mobile-question IPC listener');
                window.electronAPI.onMobileQuestion((data) => {
                    console.log('📱 app.js: IPC mobile-question received:', data);
                    self.handleMobileQuestion(data);
                });
            }
            
            // Listen for hologram triggers
            window.addEventListener('trigger-hologram', (event) => {
                this.handleHologramTrigger(event.detail);
            });
        }
    }
    
    handleQuestionClick(question) {
        console.log('🎯 handleQuestionClick called with:', question);
        
        if (this.isProcessing) {
            console.log('⚠️  Already processing, skipping');
            return;
        }
        
        this.isProcessing = true;
        this.currentQuestion = question;
        
        // Disable all question buttons
        this.setQuestionButtonsState(false);
        
        // Show loading state
        this.showLoadingState();
        
        // Display the answer
        this.displayAnswer(question.answer);
        
        // Start speaking with animation
        this.speakAnswer(question.answer);
    }
    
    displayAnswer(answer) {
        console.log('📝 Displaying answer:', answer);
        const responseText = document.getElementById('response-text');
        if (responseText) {
            responseText.textContent = answer;
            responseText.style.opacity = '0';
            
            // Animate text appearance
            setTimeout(() => {
                responseText.style.transition = 'opacity 0.5s ease-in';
                responseText.style.opacity = '1';
                console.log('✅ Answer displayed on screen');
            }, 100);
        } else {
            console.error('❌ response-text element not found!');
        }
    }
    
    speakAnswer(answer) {
        console.log('🎤 speakAnswer called with:', answer);
        console.log('🎤 TTS instance:', this.tts);
        console.log('🎤 TTS.isMuted:', this.tts ? this.tts.isMuted : 'N/A');
        
        if (!answer || answer.trim() === '') {
            console.error('❌ Empty answer, cannot speak');
            return;
        }
        
        // Start AI face animation
        this.aiFace.startSpeakingAnimation();
        
        // Express thinking emotion briefly
        this.aiFace.expressEmotion('thinking');
        
        // Start video animation immediately when question is triggered
        this.startPC2Animation();
        
        // Start speaking immediately
        console.log('🎤 Calling TTS.speak...');
        this.tts.speak(
            answer,
            () => {
                // On speech start - video should already be playing
                console.log('✅ Started speaking answer');
            },
            () => {
                // On speech end - stop video IMMEDIATELY
                console.log('✅ Speech completed - stopping video now');
                // Stop video immediately (synchronously if possible)
                this.stopPC2AnimationImmediate();
                // Then call completion handler
                this.onSpeechComplete();
            }
        );
    }
    
    onSpeechComplete() {
        // Stop AI face animation
        this.aiFace.stopSpeakingAnimation();
        
        // Show completion emotion
        this.aiFace.expressEmotion('happy');
        
        // Re-enable question buttons
        this.setQuestionButtonsState(true);
        
        // Note: PC2 animation is already stopped in speakAnswer's onEnd callback
        // This ensures perfect synchronization with TTS end
        
        // Reset processing state
        this.isProcessing = false;
        this.currentQuestion = null;
        
        console.log('✅ Speech completed, all animations stopped');
    }
    
    setQuestionButtonsState(enabled) {
        const questionButtons = document.querySelectorAll('.question-btn');
        questionButtons.forEach(btn => {
            btn.disabled = !enabled;
        });
    }
    
    showLoadingState() {
        const responseText = document.getElementById('response-text');
        if (responseText) {
            responseText.innerHTML = '<div class="loading"></div> Processing...';
        }
    }
    
    startIdleAnimations() {
        // Start random blinking
        this.aiFace.startBlinking();
        
        // Occasional idle expressions
        setInterval(() => {
            if (!this.isProcessing && !this.tts.isCurrentlySpeaking()) {
                const emotions = ['happy', 'surprised'];
                const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
                this.aiFace.expressEmotion(randomEmotion);
            }
        }, 10000 + Math.random() * 20000); // Every 10-30 seconds
    }
    
    pauseAnimations() {
        // Pause non-essential animations when page is not visible
        if (this.aiFace && this.aiFace.faceElement) {
            this.aiFace.faceElement.style.animationPlayState = 'paused';
        }
    }
    
    resumeAnimations() {
        // Resume animations when page becomes visible
        if (this.aiFace && this.aiFace.faceElement) {
            this.aiFace.faceElement.style.animationPlayState = 'running';
        }
    }
    
    // Public methods for external control
    stopCurrentResponse() {
        if (this.isProcessing) {
            this.tts.stop();
            this.aiFace.stopSpeakingAnimation();
            this.setQuestionButtonsState(true);
            this.isProcessing = false;
            this.currentQuestion = null;
        }
    }
    
    getCurrentStatus() {
        return {
            isProcessing: this.isProcessing,
            isSpeaking: this.tts.isCurrentlySpeaking(),
            currentQuestion: this.currentQuestion,
            isMuted: this.tts.isMuted
        };
    }
    
    startDesktopServer() {
        if (this.isElectron) {
            // Send message to main process to start server
            if (window.electronAPI && window.electronAPI.startServer) {
                window.electronAPI.startServer();
                console.log('🌐 Requested desktop server start from main process');
            } else {
                console.log('🌐 Desktop server will be started by main process');
            }
        }
    }
    
    askQuestion(questionIndex) {
        if (questionIndex >= 0 && questionIndex < this.questionsData.length) {
            const question = this.questionsData[questionIndex];
            this.handleQuestionClick(question);
        }
    }
    
    // Method to update questions for mobile access
    updateQuestionsForMobile() {
        if (this.isElectron && window.electronAPI && window.electronAPI.updateQuestions) {
            window.electronAPI.updateQuestions(this.questionsData);
        }
    }
    
    // Handle mobile question requests
    handleMobileQuestion(data) {
        console.log('📱 ========== handleMobileQuestion START ==========');
        console.log('📱 Raw data received:', data);
        
        const { questionIndex, question } = data || {};
        console.log(`📱 Question: ${question}, Index: ${questionIndex}`);
        console.log(`📱 Total questions in app: ${this.questionsData.length}`);
        console.log(`📱 Questions array:`, this.questionsData);
        
        if (!data || questionIndex === undefined) {
            console.error('❌ Invalid question data:', data);
            return;
        }
        
        if (questionIndex < 0 || questionIndex >= this.questionsData.length) {
            console.error(`❌ Question index out of bounds: ${questionIndex} >= ${this.questionsData.length}`);
            // Show error on screen
            const responseText = document.getElementById('response-text');
            if (responseText) {
                responseText.innerHTML = `<div style="color: #ff6b6b; padding: 20px;">
                    ❌ Question not found (Index: ${questionIndex}, Total: ${this.questionsData.length})
                </div>`;
            }
            console.log('📱 ========== handleMobileQuestion END (Error) ==========');
            return;
        }
        
        const selectedQuestion = this.questionsData[questionIndex];
        console.log(`✅ Selected question:`, selectedQuestion);
        
        if (!selectedQuestion || !selectedQuestion.answer) {
            console.error('❌ Selected question is missing answer');
            return;
        }
        
        console.log('🎯 Calling handleQuestionClick...');
        console.log('📱 ========== handleMobileQuestion END ==========');
        
        // Process the question immediately
        this.handleQuestionClick(selectedQuestion);
    }
    
    // Handle hologram triggers
    handleHologramTrigger(data) {
        const { action } = data;
        
        if (action === 'start') {
            console.log('🎬 Hologram trigger received - starting video');
            // Start hologram video immediately
            if (this.aiFace && this.aiFace.hologramSync) {
                this.aiFace.hologramSync.startVideo();
            }
        } else if (action === 'stop') {
            console.log('🎬 Hologram trigger received - stopping video');
            // Stop hologram video
            if (this.aiFace && this.aiFace.hologramSync) {
                this.aiFace.hologramSync.stopVideo();
            }
        }
    }
    
    // Start PC2 animation when question is triggered
    startPC2Animation() {
        console.log('🎬 Starting PC2 animation from app.js');
        
        // Send request to start PC2 animation immediately
        fetch('http://localhost:3000/api/trigger-hologram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' })
        }).catch(err => console.error('Failed to start PC2:', err));
    }
    
    // Stop PC2 animation immediately when speech ends (synchronized)
    stopPC2AnimationImmediate() {
        console.log('⏹️  Stopping PC2 animation IMMEDIATELY (synchronized with TTS end)');
        
        // Use Promise to ensure immediate execution
        const stopPromise = fetch('http://localhost:3000/api/trigger-hologram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        }).catch(err => {
            console.error('Failed to stop PC2:', err);
            // Try alternative method if fetch fails
            this.stopPC2AnimationFallback();
        });
        
        // Also try direct server call for faster response
        this.stopPC2AnimationFallback();
        
        return stopPromise;
    }
    
    // Fallback method to stop PC2 animation (direct server call)
    stopPC2AnimationFallback() {
        // Also try PC2 server directly for faster response
        fetch('http://localhost:3001/api/animation-trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        }).catch(err => {
            // Silently fail - server might not be available
        });
    }
    
    // Legacy method (kept for compatibility)
    stopPC2Animation() {
        this.stopPC2AnimationImmediate();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('🚀 Initializing Offline AI Assistant...');
        window.aiAssistant = new OfflineAIAssistant();
        
        // Add some helpful console messages
        console.log('🤖 Offline AI Assistant is ready!');
        console.log('📱 This app works completely offline');
        console.log('🎤 Click any question to hear the AI response');
        console.log('🔊 Use the mute button to toggle audio');
        console.log('✅ Questions loaded:', window.aiAssistant.questionsData.length);
    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
        const responseText = document.getElementById('response-text');
        if (responseText) {
            responseText.innerHTML = `
                <div style="padding: 20px; color: #ff6b6b;">
                    <h3>Initialization Error</h3>
                    <p>Please refresh the page (F5) or restart the app.</p>
                    <p style="font-size: 12px;">Error: ${error.message}</p>
                </div>
            `;
        }
    }
});

// Handle errors gracefully
window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
    
    // Show user-friendly error message only if not already showing an error
    const responseText = document.getElementById('response-text');
    if (responseText && !responseText.textContent.includes('Error')) {
        responseText.textContent = 'Sorry, something went wrong. Please try again.';
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});