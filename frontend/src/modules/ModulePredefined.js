import BaseModule from './BaseModule';

/**
 * Module 1: Predefined Q&A
 * Works completely offline with predefined questions and answers
 */
class ModulePredefined extends BaseModule {
  constructor() {
    super({
      id: 'predefined',
      name: 'Predefined Q&A',
      version: '1.0.0',
      requiresNetwork: false
    });
    this.questions = [];
  }

  async initialize() {
    try {
      // Load questions from localStorage or API
      await this.loadQuestions();
      this.isInitialized = true;
      this.isActive = true;
      return { success: true };
    } catch (error) {
      console.error('Failed to initialize Predefined module:', error);
      return { success: false, error: error.message };
    }
  }

  async loadQuestions() {
    // Load from localStorage using existing structure
    // Check for 'customQuestions' (existing system) or 'predefined_questions' (new system)
    let stored = localStorage.getItem('customQuestions');
    
    if (!stored) {
      stored = localStorage.getItem('predefined_questions');
    }

    if (stored) {
      try {
        this.questions = JSON.parse(stored);
        // Ensure questions have required fields
        this.questions = this.questions.map(q => ({
          id: q.id || Date.now() + Math.random(),
          question: q.question || '',
          answer: q.answer || '',
          category: q.category || 'General',
          createdAt: q.createdAt || new Date().toISOString()
        })).filter(q => q.question && q.answer);
        return;
      } catch (e) {
        console.warn('Failed to parse stored questions:', e);
      }
    }

    // If no stored questions, initialize with empty array
    this.questions = [];
  }

  async processQuestion(question) {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    // Search for matching question (case-insensitive, partial match)
    const searchTerm = question.toLowerCase().trim();
    const matchedQuestion = this.questions.find(q => 
      q.question.toLowerCase().includes(searchTerm) ||
      searchTerm.includes(q.question.toLowerCase())
    );

    if (matchedQuestion) {
      return {
        success: true,
        answer: matchedQuestion.answer,
        question: matchedQuestion.question,
        source: 'predefined'
      };
    }

    // No match found
    return {
      success: false,
      error: 'No matching question found',
      suggestions: this.getSuggestions(searchTerm)
    };
  }

  getSuggestions(searchTerm) {
    // Return top 3 similar questions
    if (!searchTerm || this.questions.length === 0) {
      return this.questions.slice(0, 3).map(q => q.question);
    }

    const scored = this.questions.map(q => ({
      question: q.question,
      score: this.calculateSimilarity(searchTerm, q.question.toLowerCase())
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.question);
  }

  calculateSimilarity(str1, str2) {
    // Simple similarity calculation
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    const commonWords = words1.filter(w => words2.includes(w));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  async addQuestion(question, answer, category = 'General') {
    const newQuestion = {
      id: Date.now(),
      question: question.trim(),
      answer: answer.trim(),
      category: category.trim(),
      createdAt: new Date().toISOString()
    };

    this.questions.push(newQuestion);
    await this.saveQuestions();
    return { success: true, question: newQuestion };
  }

  async updateQuestion(id, question, answer, category) {
    const index = this.questions.findIndex(q => q.id === id);
    if (index === -1) {
      throw new Error('Question not found');
    }

    this.questions[index] = {
      ...this.questions[index],
      question: question.trim(),
      answer: answer.trim(),
      category: category?.trim() || this.questions[index].category,
      updatedAt: new Date().toISOString()
    };

    await this.saveQuestions();
    return { success: true, question: this.questions[index] };
  }

  async deleteQuestion(id) {
    const index = this.questions.findIndex(q => q.id === id);
    if (index === -1) {
      throw new Error('Question not found');
    }

    this.questions.splice(index, 1);
    await this.saveQuestions();
    return { success: true };
  }

  async saveQuestions() {
    // Save to both locations for compatibility
    localStorage.setItem('customQuestions', JSON.stringify(this.questions));
    localStorage.setItem('predefined_questions', JSON.stringify(this.questions));
    
    // Also save via Electron API if available (for file sync)
    if (window.electronAPI && window.electronAPI.saveQuestions) {
      try {
        await window.electronAPI.saveQuestions(this.questions);
      } catch (e) {
        console.warn('Failed to save via Electron API:', e);
      }
    }
  }

  getQuestions() {
    return this.questions;
  }

  getQuestionCount() {
    return this.questions.length;
  }
}

export default ModulePredefined;

