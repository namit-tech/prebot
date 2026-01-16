// Admin Panel Module
class AdminPanel {
    constructor(appInstance) {
        this.app = appInstance;
        this.isOpen = false;
        this.editingQuestionId = null;
        
        this.initializeAdminPanel();
    }
    
    initializeAdminPanel() {
        this.setupEventListeners();
        this.loadCustomQuestions();
        this.updateQuestionsList();
        this.setupInputEnhancements();
    }
    
    setupInputEnhancements() {
        // Ensure input fields are properly initialized
        const questionInput = document.getElementById('new-question');
        const answerInput = document.getElementById('new-answer');
        const categoryInput = document.getElementById('new-category');
        
        if (questionInput) {
            questionInput.addEventListener('input', () => {
                this.validateForm();
            });
        }
        
        if (answerInput) {
            answerInput.addEventListener('input', () => {
                this.validateForm();
            });
        }
        
        if (categoryInput) {
            categoryInput.addEventListener('input', () => {
                this.validateForm();
            });
        }
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.isOpen && e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (this.editingQuestionId) {
                    this.updateQuestion(this.editingQuestionId);
                } else {
                    this.addNewQuestion();
                }
            }
        });
        
        // Setup password toggle eye icon
        this.setupPasswordToggle();
        
        // Add test function to global scope for debugging
        window.testAddQuestion = () => {
            console.log('Test function called');
            this.addNewQuestion();
        };
    }
    
    validateForm() {
        const questionInput = document.getElementById('new-question');
        const answerInput = document.getElementById('new-answer');
        const addBtn = document.getElementById('add-question-btn');
        
        if (questionInput && answerInput && addBtn) {
            const hasQuestion = questionInput.value.trim().length > 0;
            const hasAnswer = answerInput.value.trim().length > 0;
            
            // Always enable the button - let the addNewQuestion function handle validation
            addBtn.disabled = false;
            addBtn.style.opacity = '1';
            
            // Visual feedback
            if (hasQuestion && hasAnswer) {
                addBtn.style.backgroundColor = 'linear-gradient(45deg, #51cf66, #40c057)';
            } else {
                addBtn.style.backgroundColor = 'linear-gradient(45deg, #667eea, #764ba2)';
            }
        }
    }
    
    setupEventListeners() {
        // Admin toggle button
        const adminToggleBtn = document.getElementById('admin-toggle-btn');
        const closeAdminBtn = document.getElementById('close-admin-btn');
        const adminPanel = document.getElementById('admin-panel');
        
        if (adminToggleBtn) {
            adminToggleBtn.addEventListener('click', () => {
                this.toggleAdminPanel();
            });
        }
        
        if (closeAdminBtn) {
            closeAdminBtn.addEventListener('click', () => {
                this.closeAdminPanel();
            });
        }
        
        // Close admin panel when clicking outside
        if (adminPanel) {
            adminPanel.addEventListener('click', (e) => {
                if (e.target === adminPanel) {
                    this.closeAdminPanel();
                }
            });
        }
        
        // Add question button
        const addQuestionBtn = document.getElementById('add-question-btn');
        if (addQuestionBtn) {
            addQuestionBtn.addEventListener('click', () => {
                this.addNewQuestion();
            });
        }
        
        // Debug test button
        const debugTestBtn = document.getElementById('debug-test-btn');
        if (debugTestBtn) {
            debugTestBtn.addEventListener('click', () => {
                this.debugTest();
            });
        }
        
        // Clear all questions button
        const clearAllBtn = document.getElementById('clear-all-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                this.clearAllQuestions();
            });
        }
        
        // Clear storage button (clears localStorage completely)
        const clearStorageBtn = document.getElementById('clear-storage-btn');
        if (clearStorageBtn) {
            clearStorageBtn.addEventListener('click', () => {
                this.clearLocalStorage();
            });
        }
        
        // Reset to default button
        const resetBtn = document.getElementById('reset-to-default-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetToDefault();
            });
        }
        
        // Export questions button (default JSON)
        const exportBtn = document.getElementById('export-questions-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportQuestions('json');
            });
        }
        
        // Import questions button
        const importBtn = document.getElementById('import-questions-btn');
        const importFileInput = document.getElementById('import-file-input');
        if (importBtn && importFileInput) {
            importBtn.addEventListener('click', () => {
                importFileInput.click();
            });
            
            importFileInput.addEventListener('change', (e) => {
                this.importQuestions(e.target.files[0]);
            });
        }
        
        // Save heading button
        const saveHeadingBtn = document.getElementById('save-heading-btn');
        if (saveHeadingBtn) {
            saveHeadingBtn.addEventListener('click', () => {
                this.saveMobileHeading();
            });
        }
        
        // Save password button
        const savePasswordBtn = document.getElementById('save-password-btn');
        if (savePasswordBtn) {
            savePasswordBtn.addEventListener('click', () => {
                this.saveUnlockPassword();
            });
        }
        
        // Load heading and password when admin panel opens
        this.loadMobileHeading();
        this.loadUnlockPassword();
        
        // Export format buttons
        const exportJsonBtn = document.getElementById('export-json-btn');
        const exportCsvBtn = document.getElementById('export-csv-btn');
        const exportTxtBtn = document.getElementById('export-txt-btn');
        const exportXlsxBtn = document.getElementById('export-xlsx-btn');
        
        if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => this.exportQuestions('json'));
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportQuestions('csv'));
        if (exportTxtBtn) exportTxtBtn.addEventListener('click', () => this.exportQuestions('txt'));
        if (exportXlsxBtn) exportXlsxBtn.addEventListener('click', () => this.exportQuestions('xlsx'));
        
        // Import modal buttons
        const closeImportModal = document.getElementById('close-import-modal');
        const cancelImportBtn = document.getElementById('cancel-import-btn');
        const confirmImportBtn = document.getElementById('confirm-import-btn');
        
        if (closeImportModal) closeImportModal.addEventListener('click', () => this.closeImportModal());
        if (cancelImportBtn) cancelImportBtn.addEventListener('click', () => this.closeImportModal());
        if (confirmImportBtn) confirmImportBtn.addEventListener('click', () => this.confirmImport());
        
        // Store pending import data
        this.pendingImportData = null;
        
        // Video management
        const uploadVideosBtn = document.getElementById('upload-videos-btn');
        const videoUploadInput = document.getElementById('video-upload-input');
        
        if (uploadVideosBtn && videoUploadInput) {
            uploadVideosBtn.addEventListener('click', () => {
                videoUploadInput.click();
            });
            
            videoUploadInput.addEventListener('change', (e) => {
                this.handleVideoUpload(e.target.files);
            });
        }
        
        // Load videos on panel open
        this.loadVideos();
        
        // TTS Settings
        this.setupTTSSettings();
    }
    
    setupTTSSettings() {
        // Wait for TTS to be initialized
        setTimeout(() => {
            if (this.app && this.app.tts) {
                this.loadTTSSettings();
                this.setupTTSEventListeners();
            }
        }, 500);
    }
    
    loadTTSSettings() {
        if (!this.app || !this.app.tts) return;
        
        const tts = this.app.tts;
        const settings = tts.getSettings();
        
        // Populate voice dropdown
        const voiceSelect = document.getElementById('tts-voice-select');
        if (voiceSelect) {
            voiceSelect.innerHTML = '<option value="">Select a voice...</option>';
            const voices = tts.getAvailableVoices();
            
            // Group voices by language
            const voicesByLang = {};
            voices.forEach(voice => {
                const lang = voice.lang.split('-')[0];
                if (!voicesByLang[lang]) voicesByLang[lang] = [];
                voicesByLang[lang].push(voice);
            });
            
            // Add voices grouped by language
            Object.keys(voicesByLang).sort().forEach(lang => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = lang.toUpperCase() + ' Voices';
                voicesByLang[lang].forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    if (voice.name === settings.voiceName) {
                        option.selected = true;
                    }
                    optgroup.appendChild(option);
                });
                voiceSelect.appendChild(optgroup);
            });
        }
        
        // Set slider values
        const pitchSlider = document.getElementById('tts-pitch-slider');
        const rateSlider = document.getElementById('tts-rate-slider');
        const volumeSlider = document.getElementById('tts-volume-slider');
        
        if (pitchSlider) {
            pitchSlider.value = settings.pitch || 1.0;
            this.updateTTSSliderValue('tts-pitch-value', pitchSlider.value);
        }
        if (rateSlider) {
            rateSlider.value = settings.rate || 0.9;
            this.updateTTSSliderValue('tts-rate-value', rateSlider.value);
        }
        if (volumeSlider) {
            volumeSlider.value = settings.volume || 0.8;
            this.updateTTSSliderValue('tts-volume-value', volumeSlider.value, true);
        }
    }
    
    updateTTSSliderValue(id, value, isPercent = false) {
        const element = document.getElementById(id);
        if (element) {
            if (isPercent) {
                element.textContent = Math.round(value * 100) + '%';
            } else {
                element.textContent = parseFloat(value).toFixed(1);
            }
        }
    }
    
    setupTTSEventListeners() {
        if (!this.app || !this.app.tts) return;
        
        const tts = this.app.tts;
        
        // Voice selection
        const voiceSelect = document.getElementById('tts-voice-select');
        if (voiceSelect) {
            voiceSelect.addEventListener('change', (e) => {
                tts.setVoice(e.target.value);
            });
        }
        
        // Pitch slider
        const pitchSlider = document.getElementById('tts-pitch-slider');
        if (pitchSlider) {
            pitchSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.updateTTSSliderValue('tts-pitch-value', value);
                tts.setPitch(value);
            });
        }
        
        // Rate slider
        const rateSlider = document.getElementById('tts-rate-slider');
        if (rateSlider) {
            rateSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.updateTTSSliderValue('tts-rate-value', value);
                tts.setRate(value);
            });
        }
        
        // Volume slider
        const volumeSlider = document.getElementById('tts-volume-slider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.updateTTSSliderValue('tts-volume-value', value, true);
                tts.setVolume(value);
            });
        }
        
        // Test voice button
        const testVoiceBtn = document.getElementById('test-voice-btn');
        if (testVoiceBtn) {
            testVoiceBtn.addEventListener('click', () => {
                this.testTTSVoice();
            });
        }
        
        // Save settings button
        const saveTTSSettingsBtn = document.getElementById('save-tts-settings-btn');
        if (saveTTSSettingsBtn) {
            saveTTSSettingsBtn.addEventListener('click', () => {
                this.saveTTSSettings();
            });
        }
    }
    
    testTTSVoice() {
        if (!this.app || !this.app.tts) {
            alert('TTS not available');
            return;
        }
        
        const testText = 'This is a test of the voice settings. How does this sound?';
        this.app.tts.speak(testText, 
            () => console.log('Test voice started'),
            () => console.log('Test voice completed')
        );
    }
    
    saveTTSSettings() {
        if (!this.app || !this.app.tts) {
            alert('TTS not available');
            return;
        }
        
        this.app.tts.saveSettings();
        alert('✅ Voice settings saved! They will be used for all future speech.');
    }
    
    toggleAdminPanel() {
        this.isOpen = !this.isOpen;
        const adminPanel = document.getElementById('admin-panel');
        
        if (adminPanel) {
            if (this.isOpen) {
                adminPanel.classList.remove('hidden');
                this.updateQuestionsList();
                this.updateStorageStatus();
                this.loadVideos(); // Reload videos when panel opens
                this.loadTTSSettings(); // Load TTS settings when panel opens
            } else {
                adminPanel.classList.add('hidden');
            }
        }
    }
    
    closeAdminPanel() {
        this.isOpen = false;
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) {
            adminPanel.classList.add('hidden');
        }
        this.clearForm();
    }
    
    // Enhanced Storage Functions with Multiple Backup Options
    saveCustomQuestions(questions) {
        try {
            // Primary storage: localStorage
            localStorage.setItem('customQuestions', JSON.stringify(questions));
            
            // Backup storage: sessionStorage (for current session)
            sessionStorage.setItem('customQuestions', JSON.stringify(questions));
            
            // Additional backup: Store in a file-like format in localStorage
            localStorage.setItem('aiAssistantBackup', JSON.stringify({
                questions: questions,
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            }));
            
            // Save to file for server access (Electron IPC)
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.saveQuestions) {
                try {
                    window.electronAPI.saveQuestions(questions);
                    console.log('Questions saved to file via IPC');
                } catch (error) {
                    console.error('Error saving via IPC:', error);
                }
            }
            
            console.log('Questions saved successfully with multiple backups');
            return true;
        } catch (error) {
            console.error('Error saving questions:', error);
            return false;
        }
    }
    
    loadCustomQuestions() {
        try {
            // Try localStorage first
            let saved = localStorage.getItem('customQuestions');
            if (saved) {
                const questions = JSON.parse(saved);
                if (Array.isArray(questions) && questions.length > 0) {
                    console.log('Loaded questions from localStorage');
                    return questions;
                }
            }
            
            // Try sessionStorage as backup
            saved = sessionStorage.getItem('customQuestions');
            if (saved) {
                const questions = JSON.parse(saved);
                if (Array.isArray(questions) && questions.length > 0) {
                    console.log('Loaded questions from sessionStorage');
                    return questions;
                }
            }
            
            // Try backup storage
            saved = localStorage.getItem('aiAssistantBackup');
            if (saved) {
                const backup = JSON.parse(saved);
                if (backup.questions && Array.isArray(backup.questions) && backup.questions.length > 0) {
                    console.log('Loaded questions from backup storage');
                    return backup.questions;
                }
            }
            
        } catch (error) {
            console.error('Error loading questions:', error);
        }
        
        console.log('No custom questions found, using defaults');
        return null;
    }
    
    getCurrentQuestions() {
        const customQuestions = this.loadCustomQuestions();
        return customQuestions || []; // Return empty array instead of default questions
    }
    
    // Question Management Functions
    addNewQuestion() {
        console.log('=== ADD NEW QUESTION CALLED ===');
        
        const questionInput = document.getElementById('new-question');
        const answerInput = document.getElementById('new-answer');
        const categoryInput = document.getElementById('new-category');
        
        console.log('Input elements found:', {
            questionInput: !!questionInput,
            answerInput: !!answerInput,
            categoryInput: !!categoryInput
        });
        
        if (!questionInput || !answerInput) {
            console.error('Required input elements not found');
            alert('Error: Question or Answer fields not found. Please refresh the page.');
            return;
        }
        
        const question = questionInput.value.trim();
        const answer = answerInput.value.trim();
        // Category is optional
        const category = categoryInput ? (categoryInput.value.trim() || 'General') : 'General';
        
        console.log('Input values:', {
            question: question,
            answer: answer,
            category: category
        });
        
        if (!question || !answer) {
            console.log('Validation failed - missing question or answer');
            alert('Please fill in both question and answer fields.');
            return;
        }
        
        console.log('Validation passed, proceeding...');
        
        const currentQuestions = this.getCurrentQuestions();
        console.log('Current questions count:', currentQuestions.length);
        
        const newId = currentQuestions.length > 0 ? Math.max(...currentQuestions.map(q => q.id), 0) + 1 : 1;
        
        const newQuestion = {
            id: newId,
            question: question,
            answer: answer,
            category: category
        };
        
        console.log('New question object:', newQuestion);
        
        currentQuestions.push(newQuestion);
        console.log('Updated questions count:', currentQuestions.length);
        
        console.log('Attempting to save questions...');
        if (this.saveCustomQuestions(currentQuestions)) {
            console.log('Questions saved successfully');
            this.updateQuestionsList();
            this.clearForm();
            
            // Force reload of main app questions in real-time
            this.app.questionsData = currentQuestions;
            this.app.loadQuestions(); // Reload main app questions
            
            // Update storage status
            this.updateStorageStatus();
            
            // Show success message with backup reminder
            this.showMessage('Question added successfully! ✅ Auto-refreshed', 'success');
            
            // Show backup reminder every 5 questions
            if (currentQuestions.length % 5 === 0) {
                setTimeout(() => {
                    this.showMessage('💡 Tip: Export your questions regularly as backup!', 'info');
                }, 2000);
            }
        } else {
            console.error('Failed to save questions');
            alert('Error saving question. Please try again.');
        }
        
        console.log('=== ADD NEW QUESTION COMPLETED ===');
    }
    
    debugTest() {
        console.log('=== DEBUG TEST STARTED ===');
        
        // Test if elements exist
        const questionInput = document.getElementById('new-question');
        const answerInput = document.getElementById('new-answer');
        const categoryInput = document.getElementById('new-category');
        
        console.log('Element check:', {
            questionInput: !!questionInput,
            answerInput: !!answerInput,
            categoryInput: !!categoryInput
        });
        
        // Test if admin panel is open
        console.log('Admin panel open:', this.isOpen);
        
        // Test if app instance exists
        console.log('App instance:', !!this.app);
        
        // Test current questions
        const currentQuestions = this.getCurrentQuestions();
        console.log('Current questions:', currentQuestions);
        
        // Test localStorage
        const saved = localStorage.getItem('customQuestions');
        console.log('LocalStorage data:', saved);
        
        // Fill test data
        if (questionInput && answerInput && categoryInput) {
            questionInput.value = 'Test Question';
            answerInput.value = 'Test Answer';
            categoryInput.value = 'Test Category';
            
            console.log('Test data filled');
            
            // Try to add the question
            setTimeout(() => {
                this.addNewQuestion();
            }, 1000);
        }
        
        console.log('=== DEBUG TEST COMPLETED ===');
    }
    
    editQuestion(questionId) {
        const currentQuestions = this.getCurrentQuestions();
        const question = currentQuestions.find(q => q.id === questionId);
        
        if (!question) return;
        
        // Fill form with existing data
        const questionInput = document.getElementById('new-question');
        const answerInput = document.getElementById('new-answer');
        const categoryInput = document.getElementById('new-category');
        
        if (questionInput && answerInput && categoryInput) {
            questionInput.value = question.question;
            answerInput.value = question.answer;
            categoryInput.value = question.category;
            
            this.editingQuestionId = questionId;
            
            // Change button text and behavior
            const addBtn = document.getElementById('add-question-btn');
            if (addBtn) {
                addBtn.textContent = '💾 Update Question';
                addBtn.onclick = () => this.updateQuestion(questionId);
            }
            
            // Scroll to form and highlight it
            const formSection = document.querySelector('.admin-section');
            if (formSection) {
                formSection.scrollIntoView({ behavior: 'smooth' });
                formSection.style.border = '2px solid #51cf66';
                setTimeout(() => {
                    formSection.style.border = 'none';
                }, 3000);
            }
            
            // Focus on answer field
            answerInput.focus();
            answerInput.scrollIntoView({ behavior: 'smooth' });
            
            this.showMessage(`Editing: "${question.question}"`, 'info');
        }
    }
    
    updateQuestion(questionId) {
        const questionInput = document.getElementById('new-question');
        const answerInput = document.getElementById('new-answer');
        const categoryInput = document.getElementById('new-category');
        
        if (!questionInput || !answerInput || !categoryInput) return;
        
        const question = questionInput.value.trim();
        const answer = answerInput.value.trim();
        const category = categoryInput.value.trim() || 'General';
        
        if (!question || !answer) {
            alert('Please fill in both question and answer fields.');
            return;
        }
        
        const currentQuestions = this.getCurrentQuestions();
        const questionIndex = currentQuestions.findIndex(q => q.id === questionId);
        
        if (questionIndex !== -1) {
            currentQuestions[questionIndex] = {
                id: questionId,
                question: question,
                answer: answer,
                category: category
            };
            
            if (this.saveCustomQuestions(currentQuestions)) {
                this.app.questionsData = currentQuestions;
                this.updateQuestionsList();
                this.clearForm();
                this.app.loadQuestions(); // Reload main app questions
                this.updateStorageStatus();
                
                this.showMessage('Question updated successfully! ✅ Auto-refreshed', 'success');
            } else {
                alert('Error updating question. Please try again.');
            }
        }
    }
    
    deleteQuestion(questionId) {
        console.log('Delete question called with ID:', questionId);
        
        if (!confirm('Are you sure you want to delete this question?')) {
            console.log('Delete cancelled by user');
            return;
        }
        
        const currentQuestions = this.getCurrentQuestions();
        console.log('Current questions before delete:', currentQuestions.length);
        
        const filteredQuestions = currentQuestions.filter(q => q.id !== questionId);
        console.log('Questions after filter:', filteredQuestions.length);
        
        if (filteredQuestions.length === currentQuestions.length) {
            console.error('Question not found for deletion');
            alert('Question not found. Please refresh and try again.');
            return;
        }
        
        if (this.saveCustomQuestions(filteredQuestions)) {
            this.app.questionsData = filteredQuestions;
            this.updateQuestionsList();
            this.app.loadQuestions(); // Reload main app questions
            this.updateStorageStatus();
            
            this.showMessage('Question deleted successfully! ✅ Auto-refreshed', 'success');
            console.log('Question deleted successfully');
        } else {
            console.error('Failed to save after deletion');
            alert('Error deleting question. Please try again.');
        }
    }
    
    clearAllQuestions() {
        if (!confirm('⚠️ DANGER: This will delete ALL questions. Are you absolutely sure?')) {
            return;
        }
        
        if (!confirm('This action cannot be undone. You will have to add questions manually. Continue?')) {
            return;
        }
        
        console.log('Clearing all questions...');
        
        // Clear all storage
        localStorage.removeItem('customQuestions');
        sessionStorage.removeItem('customQuestions');
        localStorage.removeItem('aiAssistantBackup');
        
        // Set empty questions array
        this.app.questionsData = [];
        this.saveCustomQuestions([]);
        this.updateQuestionsList();
        this.app.loadQuestions(); // Reload main app questions
        this.updateStorageStatus();
        
        console.log('All questions cleared successfully');
        this.showMessage('All questions cleared! ✅ Auto-refreshed', 'success');
    }
    
    clearLocalStorage() {
        if (!confirm('⚠️ DANGER: This will clear ALL localStorage data including:\n\n- All questions\n- All videos\n- All settings\n- Mobile lock password\n\nThis action cannot be undone!')) {
            return;
        }
        
        if (!confirm('Are you absolutely sure you want to clear ALL localStorage data?\n\nYou will need to:\n- Re-upload all videos\n- Re-add all questions\n- Re-set the mobile lock password')) {
            return;
        }
        
        console.log('🗑️ Clearing all localStorage data...');
        
        // Clear all localStorage items
        const keysToRemove = [
            'customQuestions',
            'aiAssistantBackup',
            'videoLibrary',
            'unlockPassword',
            'mobileHeading',
            'pc2PrimaryVideo'
        ];
        
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`   Removed: ${key}`);
        });
        
        // Clear all other localStorage items (in case there are more)
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(key => {
            if (key.startsWith('ai-') || key.startsWith('video') || key.startsWith('question')) {
                localStorage.removeItem(key);
                console.log(`   Removed: ${key}`);
            }
        });
        
        // Clear sessionStorage too
        sessionStorage.clear();
        
        // Reset app data
        this.app.questionsData = [];
        this.saveCustomQuestions([]);
        
        // Reload UI
        this.updateQuestionsList();
        this.loadVideos();
        this.app.loadQuestions();
        this.updateStorageStatus();
        
        // Clear password field
        const passwordInput = document.getElementById('unlock-password');
        if (passwordInput) {
            passwordInput.value = '';
        }
        
        console.log('✅ All localStorage data cleared successfully');
        this.showMessage('All localStorage data cleared! Please refresh the page.', 'success');
        
        // Optionally reload the page after a delay
        setTimeout(() => {
            if (confirm('Reload the page now to complete the reset?')) {
                window.location.reload();
            }
        }, 2000);
    }
    
    resetToDefault() {
        if (!confirm('⚠️ WARNING: This will clear all your custom questions and start fresh. Continue?')) {
            return;
        }
        
        console.log('Resetting to empty state...');
        
        // Clear all storage
        localStorage.removeItem('customQuestions');
        sessionStorage.removeItem('customQuestions');
        localStorage.removeItem('aiAssistantBackup');
        
        // Set empty questions array
        this.saveCustomQuestions([]);
        this.updateQuestionsList();
        this.app.loadQuestions(); // Reload main app questions
        
        console.log('Reset to empty state successful');
        this.showMessage('Reset complete! Start adding your own questions.', 'success');
    }
    
    exportQuestions(format = 'json') {
        const questions = this.getCurrentQuestions();
        const dateStr = new Date().toISOString().split('T')[0];
        let dataBlob;
        let filename;
        let mimeType;
        
        switch(format) {
            case 'json':
                const exportData = {
                    questions: questions,
                    exportDate: new Date().toISOString(),
                    version: '1.0.0',
                    totalQuestions: questions.length,
                    categories: [...new Set(questions.map(q => q.category))]
                };
                dataBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                filename = `ai-assistant-questions-${dateStr}.json`;
                break;
                
            case 'csv':
                const csvHeader = 'Question,Answer,Category\n';
                const csvRows = questions.map(q => {
                    const question = `"${q.question.replace(/"/g, '""')}"`;
                    const answer = `"${q.answer.replace(/"/g, '""')}"`;
                    const category = `"${(q.category || 'General').replace(/"/g, '""')}"`;
                    return `${question},${answer},${category}`;
                }).join('\n');
                dataBlob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
                filename = `ai-assistant-questions-${dateStr}.csv`;
                break;
                
            case 'txt':
                const txtContent = questions.map((q, i) => {
                    return `Question ${i + 1}:\n${q.question}\n\nAnswer:\n${q.answer}\n\nCategory: ${q.category || 'General'}\n${'='.repeat(50)}\n\n`;
                }).join('');
                dataBlob = new Blob([txtContent], { type: 'text/plain' });
                filename = `ai-assistant-questions-${dateStr}.txt`;
                break;
                
            case 'xlsx':
                if (typeof XLSX === 'undefined') {
                    alert('XLSX library not loaded. Please refresh the page.');
                    return;
                }
                const wsData = [
                    ['Question', 'Answer', 'Category'],
                    ...questions.map(q => [q.question, q.answer, q.category || 'General'])
                ];
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(wsData);
                XLSX.utils.book_append_sheet(wb, ws, 'Questions');
                const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                dataBlob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                filename = `ai-assistant-questions-${dateStr}.xlsx`;
                break;
                
            default:
                this.showMessage('Invalid export format', 'error');
                return;
        }
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
        
        this.showMessage(`Exported ${questions.length} questions as ${format.toUpperCase()} successfully!`, 'success');
    }
    
    importQuestions(file) {
        if (!file) return;
        
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                let parsedData = null;
                
                // Parse based on file type
                switch(fileExtension) {
                    case 'json':
                        parsedData = this.parseJSON(e.target.result);
                        break;
                    case 'csv':
                        parsedData = this.parseCSV(e.target.result);
                        break;
                    case 'txt':
                        parsedData = this.parseTXT(e.target.result);
                        break;
                    case 'xlsx':
                    case 'xls':
                        parsedData = this.parseXLSX(e.target.result);
                        break;
                    default:
                        throw new Error(`Unsupported file format: ${fileExtension}`);
                }
                
                // Show validation modal
                this.showImportValidation(fileExtension, parsedData);
                
            } catch (error) {
                alert(`Error reading file: ${error.message}`);
                console.error('Import error:', error);
            }
        };
        
        // Read file based on type
        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    }
    
    parseJSON(content) {
        const importedData = JSON.parse(content);
        let questions = [];
        
        if (importedData.questions && Array.isArray(importedData.questions)) {
            questions = importedData.questions;
        } else if (Array.isArray(importedData)) {
            questions = importedData;
        } else {
            throw new Error('Invalid JSON format');
        }
        
        return this.validateQuestions(questions);
    }
    
    parseCSV(content) {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) throw new Error('CSV file must have at least a header and one data row');
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const questions = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length < 2) continue; // Skip empty rows
            
            const question = values[0] || '';
            const answer = values[1] || '';
            const category = values[2] || 'General';
            
            if (question && answer) {
                questions.push({ question, answer, category });
            }
        }
        
        return this.validateQuestions(questions);
    }
    
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        
        return values;
    }
    
    parseTXT(content) {
        const questions = [];
        const blocks = content.split(/\n={2,}\n/).filter(block => block.trim());
        
        for (const block of blocks) {
            const questionMatch = block.match(/Question\s+\d+:\s*(.+?)(?:\n\n|$)/is);
            const answerMatch = block.match(/Answer:\s*(.+?)(?:\n\n|$)/is);
            const categoryMatch = block.match(/Category:\s*(.+?)(?:\n|$)/i);
            
            if (questionMatch && answerMatch) {
                questions.push({
                    question: questionMatch[1].trim(),
                    answer: answerMatch[1].trim(),
                    category: categoryMatch ? categoryMatch[1].trim() : 'General'
                });
            }
        }
        
        // If no structured format found, try line-by-line (Q: ... A: ...)
        if (questions.length === 0) {
            const lines = content.split('\n');
            let currentQuestion = null;
            let currentAnswer = null;
            
            for (const line of lines) {
                if (line.match(/^Q[:\-]?\s*(.+)/i)) {
                    if (currentQuestion && currentAnswer) {
                        questions.push({
                            question: currentQuestion,
                            answer: currentAnswer,
                            category: 'General'
                        });
                    }
                    currentQuestion = line.replace(/^Q[:\-]?\s*/i, '').trim();
                    currentAnswer = null;
                } else if (line.match(/^A[:\-]?\s*(.+)/i)) {
                    currentAnswer = line.replace(/^A[:\-]?\s*/i, '').trim();
                } else if (currentQuestion && !currentAnswer) {
                    currentQuestion += ' ' + line.trim();
                } else if (currentAnswer) {
                    currentAnswer += ' ' + line.trim();
                }
            }
            
            if (currentQuestion && currentAnswer) {
                questions.push({
                    question: currentQuestion,
                    answer: currentAnswer,
                    category: 'General'
                });
            }
        }
        
        return this.validateQuestions(questions);
    }
    
    parseXLSX(arrayBuffer) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded. Please refresh the page.');
        }
        
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (data.length < 2) throw new Error('Excel file must have at least a header and one data row');
        
        const headers = data[0].map(h => String(h).toLowerCase().trim());
        const questionCol = headers.findIndex(h => h.includes('question'));
        const answerCol = headers.findIndex(h => h.includes('answer'));
        const categoryCol = headers.findIndex(h => h.includes('category'));
        
        if (questionCol === -1 || answerCol === -1) {
            throw new Error('Excel file must have "Question" and "Answer" columns');
        }
        
        const questions = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const question = String(row[questionCol] || '').trim();
            const answer = String(row[answerCol] || '').trim();
            const category = categoryCol !== -1 ? String(row[categoryCol] || 'General').trim() : 'General';
            
            if (question && answer) {
                questions.push({ question, answer, category });
            }
        }
        
        return this.validateQuestions(questions);
    }
    
    validateQuestions(questions) {
        const validated = [];
        const invalid = [];
        
        questions.forEach((q, index) => {
            const question = String(q.question || '').trim();
            const answer = String(q.answer || '').trim();
            const category = String(q.category || 'General').trim();
            
            if (question && answer) {
                validated.push({
                    question,
                    answer,
                    category: category || 'General'
                });
            } else {
                invalid.push({
                    index: index + 1,
                    question: question || '(empty)',
                    answer: answer || '(empty)',
                    error: !question ? 'Missing question' : 'Missing answer'
                });
            }
        });
        
        return {
            valid: validated,
            invalid: invalid,
            total: questions.length
        };
    }
    
    showImportValidation(format, parsedData) {
        const modal = document.getElementById('import-validation-modal');
        const formatEl = document.getElementById('import-format');
        const totalRowsEl = document.getElementById('import-total-rows');
        const validCountEl = document.getElementById('import-valid-count');
        const invalidCountEl = document.getElementById('import-invalid-count');
        const previewListEl = document.getElementById('import-preview-list');
        
        // Update summary
        formatEl.textContent = format.toUpperCase();
        totalRowsEl.textContent = parsedData.total;
        validCountEl.textContent = parsedData.valid.length;
        invalidCountEl.textContent = parsedData.invalid.length;
        
        // Show preview
        previewListEl.innerHTML = '';
        const previewItems = [...parsedData.valid.slice(0, 10), ...parsedData.invalid.slice(0, 5)];
        
        previewItems.forEach((item, index) => {
            const isInvalid = item.error;
            const div = document.createElement('div');
            div.className = `import-preview-item ${isInvalid ? 'invalid' : ''}`;
            div.innerHTML = `
                <div class="preview-question">${isInvalid ? '❌ Row ' + item.index : '✅ Question ' + (index + 1)}: ${item.question}</div>
                <div class="preview-answer">Answer: ${item.answer}</div>
                ${item.category ? `<div class="preview-category">Category: ${item.category}</div>` : ''}
                ${isInvalid ? `<div class="preview-error">Error: ${item.error}</div>` : ''}
            `;
            previewListEl.appendChild(div);
        });
        
        if (previewItems.length === 0) {
            previewListEl.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No data to preview</p>';
        }
        
        // Store pending import
        this.pendingImportData = parsedData.valid;
        
        // Show modal
        modal.classList.remove('hidden');
    }
    
    closeImportModal() {
        const modal = document.getElementById('import-validation-modal');
        modal.classList.add('hidden');
        this.pendingImportData = null;
    }
    
    confirmImport() {
        if (!this.pendingImportData || this.pendingImportData.length === 0) {
            alert('No valid questions to import');
            return;
        }
        
        if (confirm(`Import ${this.pendingImportData.length} questions? This will replace your current questions.`)) {
            this.saveCustomQuestions(this.pendingImportData);
            this.updateQuestionsList();
            this.app.loadQuestions();
            this.updateStorageStatus();
            this.closeImportModal();
            this.showMessage(`Imported ${this.pendingImportData.length} questions successfully!`, 'success');
        }
    }
    
    // Video Management Functions
    handleVideoUpload(files) {
        if (!files || files.length === 0) return;
        
        const videos = this.getVideos();
        const uploadPromises = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Accept all video types and common video file extensions
            const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp', '.ogv'];
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            const isVideoType = file.type.startsWith('video/');
            const hasVideoExtension = videoExtensions.includes(fileExtension);
            
            if (!isVideoType && !hasVideoExtension) {
                alert(`${file.name} is not a recognized video file. Skipping.\n\nSupported formats: MP4, AVI, MOV, WMV, FLV, WebM, MKV, M4V, 3GP, OGV`);
                continue;
            }
            
            uploadPromises.push(this.saveVideoFile(file));
        }
        
        Promise.all(uploadPromises).then((savedVideos) => {
            const newVideos = savedVideos.filter(v => v !== null);
            if (newVideos.length > 0) {
                // If no primary video exists, set the first uploaded video as primary
                const hasPrimary = videos.some(v => v.isPrimary);
                if (!hasPrimary && newVideos.length > 0) {
                    newVideos[0].isPrimary = true;
                    console.log(`✅ Set first uploaded video as primary: ${newVideos[0].name}`);
                }
                
                videos.push(...newVideos);
                // Save videos (this will also save files to disk via IPC)
                this.saveVideos(videos).then(() => {
                    this.loadVideos();
                    this.showMessage(`Uploaded ${newVideos.length} video(s) successfully! Files saved to disk.`, 'success');
                });
            }
        }).catch(error => {
            console.error('Error uploading videos:', error);
            alert('Error uploading videos. Please try again.');
        });
    }
    
    saveVideoFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const videoData = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: e.target.result, // Base64 encoded video
                    path: `assets/videos/${file.name}`,
                    uploadedAt: new Date().toISOString(),
                    isPrimary: false
                };
                
                // If Electron, save file to disk via IPC immediately
                if (this.app.isElectron && window.electronAPI && window.electronAPI.saveVideoFile) {
                    window.electronAPI.saveVideoFile(videoData).then((result) => {
                        if (result && result.success) {
                            console.log(`✅ Video file saved to disk: ${videoData.name} (${(videoData.size / 1024).toFixed(2)} KB)`);
                        } else {
                            console.warn(`⚠️ Video file save returned:`, result);
                        }
                        resolve(videoData);
                    }).catch(err => {
                        console.error('❌ Error saving video file to disk:', err);
                        console.error('   Video will be stored in localStorage only');
                        // Still resolve with videoData even if file save fails
                        resolve(videoData);
                    });
                } else {
                    // Browser: store base64 data in localStorage for playback
                    // Note: localStorage has ~5-10MB limit, but we'll store it anyway
                    // For very large videos, user should use Electron app
                    console.log(`ℹ️ Browser mode: Video stored in localStorage only (${(videoData.size / 1024).toFixed(2)} KB)`);
                    resolve(videoData); // Store full data including base64
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    getVideos() {
        try {
            const saved = localStorage.getItem('videoLibrary');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Error loading videos:', error);
            return [];
        }
    }
    
    saveVideos(videos) {
        return new Promise((resolve) => {
            try {
                localStorage.setItem('videoLibrary', JSON.stringify(videos));
                
                // Also save to file for PC2 server access (if Electron)
                if (this.app.isElectron && window.electronAPI && window.electronAPI.saveVideosToFile) {
                    window.electronAPI.saveVideosToFile(videos).then(() => {
                        console.log('✅ Videos saved to file for PC2 access');
                        // Update primary video in main UI after saving
                        const primaryVideo = videos.find(v => v.isPrimary);
                        if (primaryVideo && this.app.aiFace) {
                            this.updatePrimaryVideo(primaryVideo);
                        }
                        resolve();
                    }).catch(err => {
                        console.error('Error saving videos to file:', err);
                        // Still update UI even if file save fails
                        const primaryVideo = videos.find(v => v.isPrimary);
                        if (primaryVideo && this.app.aiFace) {
                            this.updatePrimaryVideo(primaryVideo);
                        }
                        resolve();
                    });
                } else {
                    // For browser, try to save to file via a different method
                    this.saveVideosToFileForPC2(videos);
                    // Update primary video in main UI
                    const primaryVideo = videos.find(v => v.isPrimary);
                    if (primaryVideo && this.app.aiFace) {
                        this.updatePrimaryVideo(primaryVideo);
                    }
                    resolve();
                }
            } catch (error) {
                console.error('Error saving videos:', error);
                resolve();
            }
        });
    }
    
    saveVideosToFileForPC2(videos) {
        // Store video info in a way PC2 server can access
        // Since we can't directly write files from browser,
        // we'll use a workaround: store minimal info that PC2 can read
        // For full functionality, Electron IPC should be used
        try {
            // Store just the primary video path in a simple format
            const primaryVideo = videos.find(v => v.isPrimary);
            if (primaryVideo) {
                // This will be read by PC2 server if it can access localStorage
                // For now, we'll rely on the file-based approach in Electron
                console.log('Primary video info saved (PC2 will read from file in Electron mode)');
            }
        } catch (error) {
            console.error('Error saving videos for PC2:', error);
        }
    }
    
    loadVideos() {
        const videos = this.getVideos();
        const libraryList = document.getElementById('video-library-list');
        if (!libraryList) return;
        
        libraryList.innerHTML = '';
        
        if (videos.length === 0) {
            libraryList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No videos uploaded yet. Click "Upload Videos" to add videos.</p>';
            return;
        }
        
        // Ensure only one video is primary (fix any data inconsistencies)
        const primaryVideos = videos.filter(v => v.isPrimary);
        if (primaryVideos.length > 1) {
            // Multiple primary videos found - keep only the first one
            console.warn(`⚠️ Found ${primaryVideos.length} primary videos. Fixing...`);
            for (let i = 1; i < primaryVideos.length; i++) {
                primaryVideos[i].isPrimary = false;
            }
            // Save the corrected videos (async, don't wait)
            this.saveVideos(videos).then(() => {
                console.log('✅ Fixed multiple primary videos issue');
            });
        } else if (primaryVideos.length === 0 && videos.length > 0) {
            // No primary video - set the first one as primary
            console.log('ℹ️ No primary video found. Setting first video as primary.');
            videos[0].isPrimary = true;
            // Save the corrected videos (async, don't wait)
            this.saveVideos(videos).then(() => {
                console.log(`✅ Set "${videos[0].name}" as primary video`);
            });
        }
        
        videos.forEach(video => {
            const item = document.createElement('div');
            item.className = `video-library-item ${video.isPrimary ? 'primary' : ''}`;
            item.setAttribute('data-video-id', video.id);
            
            const videoName = this.escapeHtml(video.name);
            const videoId = String(video.id); // Ensure ID is string for comparison
            
            item.innerHTML = `
                <div class="video-library-item-header">
                    <div class="video-library-item-name">${videoName}</div>
                    <div class="video-library-item-actions">
                        ${!video.isPrimary ? `<button class="video-library-item-btn primary-btn" data-action="set-primary" data-video-id="${videoId}">⭐ Set Primary</button>` : '<span style="color: #51cf66; font-size: 12px;">⭐ Primary</span>'}
                        <button class="video-library-item-btn delete-btn" data-action="delete" data-video-id="${videoId}">🗑️ Delete</button>
                    </div>
                </div>
                <div class="video-library-item-info">
                    Size: ${this.formatFileSize(video.size)} | Type: ${video.type || 'video/mp4'}
                </div>
                <div class="video-library-item-path">${video.path}</div>
            `;
            
            // Add event listeners instead of inline onclick
            const setPrimaryBtn = item.querySelector('[data-action="set-primary"]');
            const deleteBtn = item.querySelector('[data-action="delete"]');
            
            if (setPrimaryBtn) {
                setPrimaryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setPrimaryVideo(videoId);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteVideo(videoId);
                });
            }
            
            libraryList.appendChild(item);
        });
    }
    
    setPrimaryVideo(videoId) {
        const videos = this.getVideos();
        // Convert both to string for comparison to handle number/string mismatch
        const video = videos.find(v => String(v.id) === String(videoId));
        
        if (!video) {
            console.error('Video not found. ID:', videoId, 'Available IDs:', videos.map(v => v.id));
            alert(`Video not found. Please refresh the page and try again.`);
            this.loadVideos(); // Reload to sync
            return;
        }
        
        // If already primary, do nothing
        if (video.isPrimary) {
            console.log(`Video "${video.name}" is already primary.`);
            return;
        }
        
        // Remove primary from ALL videos first (ensure only one is primary)
        videos.forEach(v => {
            v.isPrimary = false;
        });
        
        // Set new primary
        video.isPrimary = true;
        
        // Save and update
        this.saveVideos(videos).then(() => {
            this.loadVideos(); // Reload to refresh UI
            this.updatePrimaryVideo(video);
            this.showMessage(`"${video.name}" set as primary video!`, 'success');
        });
    }
    
    deleteVideo(videoId) {
        const videos = this.getVideos();
        // Convert both to string for comparison to handle number/string mismatch
        const video = videos.find(v => String(v.id) === String(videoId));
        
        if (!video) {
            console.error('Video not found. ID:', videoId, 'Available IDs:', videos.map(v => v.id));
            alert(`Video not found. Please refresh the page and try again.`);
            this.loadVideos(); // Reload to sync
            return;
        }
        
        if (!confirm(`Delete "${video.name}"? This action cannot be undone.`)) {
            return;
        }
        
        // If it's primary, we need to set another one as primary
        if (video.isPrimary && videos.length > 1) {
            const otherVideo = videos.find(v => v.id !== videoId);
            if (otherVideo) {
                otherVideo.isPrimary = true;
            }
        }
        
        const filteredVideos = videos.filter(v => v.id !== videoId);
        this.saveVideos(filteredVideos);
        this.loadVideos();
        
        // If deleted video was primary, update UI
        if (video.isPrimary && filteredVideos.length > 0) {
            const newPrimary = filteredVideos.find(v => v.isPrimary);
            if (newPrimary) {
                this.updatePrimaryVideo(newPrimary);
            }
        } else if (filteredVideos.length === 0) {
            // No videos left, reset to default
            this.updatePrimaryVideo(null);
        }
        
        this.showMessage(`Video "${video.name}" deleted successfully!`, 'success');
    }
    
    updatePrimaryVideo(video) {
        if (!this.app.aiFace) return;
        
        const videoElement = document.getElementById('animation-video');
        if (!videoElement) return;
        
        // Remove existing error handlers
        const oldErrorHandler = videoElement.onerror;
        videoElement.onerror = null;
        
        // Add new error handler
        const handleVideoError = (e) => {
            console.error('Video load error:', e);
            console.error('Video source:', videoElement.src);
            console.error('Video data:', video);
            
            // Try to use base64 data if path failed
            if (video && video.data && videoElement.src !== video.data) {
                console.log('Retrying with base64 data...');
                videoElement.src = video.data;
                videoElement.load();
            } else {
                alert(`Video not found: ${video ? video.name : 'Unknown'}\n\nPlease make sure the video file exists or re-upload it.`);
            }
        };
        
        videoElement.addEventListener('error', handleVideoError, { once: true });
        
        if (video) {
            // Update video source - prefer base64 data for browser compatibility
            // Clear existing sources first
            videoElement.innerHTML = '';
            
            if (video.data) {
                // Use base64 data if available (works in browser)
                const source = document.createElement('source');
                source.src = video.data;
                if (video.type) {
                    source.type = video.type;
                }
                videoElement.appendChild(source);
                console.log(`✅ Using base64 data for: ${video.name}`);
            } else if (video.path) {
                // Use path (works in Electron or if file exists)
                const source = document.createElement('source');
                source.src = video.path;
                if (video.type) {
                    source.type = video.type;
                }
                videoElement.appendChild(source);
                console.log(`✅ Using file path for: ${video.name}`);
            } else {
                alert(`Video data not available for: ${video.name}\n\nPlease re-upload the video.`);
                return;
            }
            
            // Reload video
            videoElement.load();
            
            // Verify video loads successfully
            videoElement.addEventListener('loadeddata', () => {
                console.log(`✅ Primary video loaded successfully: ${video.name}`);
                this.showMessage(`Primary video set: ${video.name}`, 'success');
            }, { once: true });
            
        } else {
            // Reset to default
            videoElement.src = 'assets/videos/your-animation.mp4';
            videoElement.load();
        }
        
        // Also update PC2 display if available
        this.updatePC2Video(video);
    }
    
    updatePC2Video(video) {
        // This will be called when PC2 server is running
        // For now, we'll store the primary video path for PC2 to use
        if (video) {
            localStorage.setItem('pc2PrimaryVideo', video.path);
        } else {
            localStorage.removeItem('pc2PrimaryVideo');
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    updateQuestionsList() {
        const questionsListAdmin = document.getElementById('questions-list-admin');
        if (!questionsListAdmin) return;
        
        const questions = this.getCurrentQuestions();
        questionsListAdmin.innerHTML = '';
        
        questions.forEach(question => {
            const questionItem = document.createElement('div');
            questionItem.className = 'question-item-admin';
            questionItem.innerHTML = `
                <h4>${question.question}</h4>
                <p>${question.answer.substring(0, 100)}${question.answer.length > 100 ? '...' : ''}</p>
                <span class="category">${question.category}</span>
                <div class="actions">
                    <button class="edit-btn" data-question-id="${question.id}">✏️ Edit</button>
                    <button class="delete-btn" data-question-id="${question.id}">🗑️ Delete</button>
                </div>
            `;
            
            questionsListAdmin.appendChild(questionItem);
        });
        
        // Add event listeners to the buttons
        this.addQuestionItemEventListeners();
        
        // Update storage status
        this.updateStorageStatus();
    }
    
    addQuestionItemEventListeners() {
        const questionsListAdmin = document.getElementById('questions-list-admin');
        if (!questionsListAdmin) return;
        
        // Add edit button listeners
        const editButtons = questionsListAdmin.querySelectorAll('.edit-btn');
        editButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const questionId = parseInt(e.target.getAttribute('data-question-id'));
                this.editQuestion(questionId);
            });
        });
        
        // Add delete button listeners
        const deleteButtons = questionsListAdmin.querySelectorAll('.delete-btn');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const questionId = parseInt(e.target.getAttribute('data-question-id'));
                this.deleteQuestion(questionId);
            });
        });
    }
    
    updateStorageStatus() {
        const questionsCount = document.getElementById('questions-count');
        const lastSaved = document.getElementById('last-saved');
        const storageType = document.getElementById('storage-type');
        
        if (questionsCount) {
            const questions = this.getCurrentQuestions();
            questionsCount.textContent = questions.length;
        }
        
        if (lastSaved) {
            try {
                const backup = localStorage.getItem('aiAssistantBackup');
                if (backup) {
                    const data = JSON.parse(backup);
                    const savedDate = new Date(data.timestamp);
                    lastSaved.textContent = savedDate.toLocaleString();
                } else {
                    lastSaved.textContent = 'Never';
                }
            } catch (error) {
                lastSaved.textContent = 'Unknown';
            }
        }
        
        if (storageType) {
            const hasLocalStorage = localStorage.getItem('customQuestions');
            const hasSessionStorage = sessionStorage.getItem('customQuestions');
            
            if (hasLocalStorage) {
                storageType.textContent = 'LocalStorage + Backup';
            } else if (hasSessionStorage) {
                storageType.textContent = 'SessionStorage';
            } else {
                storageType.textContent = 'Default Questions';
            }
        }
    }
    
    clearForm() {
        const questionInput = document.getElementById('new-question');
        const answerInput = document.getElementById('new-answer');
        const categoryInput = document.getElementById('new-category');
        const addBtn = document.getElementById('add-question-btn');
        
        if (questionInput) questionInput.value = '';
        if (answerInput) answerInput.value = '';
        if (categoryInput) categoryInput.value = '';
        if (addBtn) {
            addBtn.textContent = '➕ Add Question';
            addBtn.onclick = () => this.addNewQuestion();
        }
        
        this.editingQuestionId = null;
    }
    
    async saveUnlockPassword() {
        const passwordInput = document.getElementById('unlock-password');
        if (!passwordInput) return;
        
        const password = passwordInput.value.trim();
        
        if (!password) {
            alert('Please enter a password');
            return;
        }
        
        try {
            // Save password to localStorage
            localStorage.setItem('unlockPassword', password);
            
            // Save password along with questions to file via IPC
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.savePassword) {
                await window.electronAPI.savePassword(password);
                console.log('Password saved to file via IPC');
            }
            
            // Trigger real-time sync with mobile devices
            await this.syncPasswordToMobile(password);
            
            this.showMessage('Password saved successfully! Mobile devices will update automatically.', 'success');
            console.log('✅ Unlock password saved and synced');
        } catch (error) {
            console.error('Error saving password:', error);
            this.showMessage('Error saving password', 'error');
        }
    }
    
    setupPasswordToggle() {
        const passwordInput = document.getElementById('unlock-password');
        const toggleIcon = document.getElementById('password-toggle-icon');
        
        if (!passwordInput || !toggleIcon) return;
        
        toggleIcon.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            toggleIcon.textContent = isPassword ? '🙈' : '👁️';
            toggleIcon.classList.toggle('active', !isPassword);
        });
    }
    
    async syncPasswordToMobile(password) {
        try {
            // Notify server about password update for real-time sync
            const response = await fetch('http://localhost:3000/api/password-updated', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    password: password,
                    timestamp: Date.now()
                })
            });
            
            if (response.ok) {
                console.log('✅ Password sync notification sent to server');
            }
        } catch (error) {
            // Server might not be running, that's okay
            console.log('ℹ️ Could not notify server (may not be running):', error.message);
        }
    }
    
    async saveMobileHeading() {
        const headingInput = document.getElementById('mobile-heading');
        if (!headingInput) return;
        
        const heading = headingInput.value.trim();
        
        try {
            // Save heading to localStorage
            if (heading) {
                localStorage.setItem('mobileHeading', heading);
            } else {
                localStorage.removeItem('mobileHeading');
            }
            
            // Save heading to file via IPC (if Electron)
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.saveHeading) {
                await window.electronAPI.saveHeading(heading);
                console.log('Heading saved to file via IPC');
            }
            
            this.showMessage('Heading saved successfully!', 'success');
            console.log('✅ Mobile heading saved:', heading || '(empty - questions will use full space)');
        } catch (error) {
            console.error('Error saving heading:', error);
            this.showMessage('Error saving heading', 'error');
        }
    }
    
    loadMobileHeading() {
        try {
            const headingInput = document.getElementById('mobile-heading');
            if (!headingInput) return;
            
            // Load from localStorage
            const savedHeading = localStorage.getItem('mobileHeading');
            if (savedHeading) {
                headingInput.value = savedHeading;
                console.log('✅ Mobile heading loaded from localStorage');
            }
        } catch (error) {
            console.error('Error loading heading:', error);
        }
    }
    
    loadUnlockPassword() {
        try {
            const passwordInput = document.getElementById('unlock-password');
            if (!passwordInput) return;
            
            // Load from localStorage
            const savedPassword = localStorage.getItem('unlockPassword');
            if (savedPassword) {
                passwordInput.value = savedPassword;
                console.log('✅ Unlock password loaded from localStorage');
            }
        } catch (error) {
            console.error('Error loading password:', error);
        }
    }
    
    showMessage(message, type = 'info') {
        // Create a temporary message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `admin-message ${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#667eea'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1001;
            font-weight: 600;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminPanel;
}
