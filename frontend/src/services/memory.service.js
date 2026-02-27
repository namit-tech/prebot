/**
 * Memory Service
 * Handles long-term persistence of user facts and conversation context
 * 100% OFFLINE (Stores data in local JSON)
 */
class MemoryService {
    constructor() {
        this.memoryFile = 'ai_longterm_memory.json';
        this.memories = this.loadMemories();
    }

    loadMemories() {
        try {
            const stored = localStorage.getItem(this.memoryFile);
            return stored ? JSON.parse(stored) : { facts: [], summaries: [] };
        } catch (e) {
            return { facts: [], summaries: [] };
        }
    }

    saveMemories() {
        localStorage.setItem(this.memoryFile, JSON.stringify(this.memories));
    }

    /**
     * Store a specific fact about the user or conversation
     * Example: "User location is London"
     */
    async storeFact(fact) {
        if (!fact) return;
        
        const timestamp = Date.now();
        this.memories.facts.push({ 
            content: fact, 
            timestamp,
            importance: 1 
        });

        // Keep only top 50 facts to prevent bloat
        if (this.memories.facts.length > 50) {
            this.memories.facts.shift();
        }
        
        this.saveMemories();
        console.log('[MemoryService] New fact stored:', fact);
    }

    /**
     * Get relevant context for a question
     * Uses simple keyword matching (Offline alternative to Vector Search)
     */
    getRelevantContext(question) {
        const words = question.toLowerCase().split(' ');
        const relevant = this.memories.facts.filter(fact => {
            return words.some(word => word.length > 3 && fact.content.toLowerCase().includes(word));
        });

        return relevant.map(f => f.content).join('\n');
    }

    /**
     * Store a conversation summary
     */
    storeSummary(summary) {
        this.memories.summaries.push({ content: summary, timestamp: Date.now() });
        if (this.memories.summaries.length > 5) this.memories.summaries.shift();
        this.saveMemories();
    }

    getLastSummary() {
        if (this.memories.summaries.length === 0) return null;
        return this.memories.summaries[this.memories.summaries.length - 1].content;
    }
}

export default new MemoryService();
