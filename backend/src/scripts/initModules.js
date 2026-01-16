const mongoose = require('mongoose');
const Module = require('../models/Module');
require('dotenv').config();

const modules = [
  {
    id: 'predefined',
    name: 'Predefined Q&A',
    description: 'AI assistant with predefined questions and answers',
    version: '1.0.0',
    requiresNetwork: false,
    isActive: true,
    config: {}
  },
  {
    id: 'gemma',
    name: 'Gemma 2 9B AI Brain',
    description: 'Advanced AI powered by Gemma 2 9B (offline via Ollama)',
    version: '1.0.0',
    requiresNetwork: false,
    isActive: true,
    config: {
      ollamaRequired: true,
      modelName: 'gemma2:9b'
    }
  }
];

const initModules = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    for (const moduleData of modules) {
      const existingModule = await Module.findOne({ id: moduleData.id });
      
      if (existingModule) {
        console.log(`⚠️  Module ${moduleData.id} already exists, skipping...`);
      } else {
        const module = new Module(moduleData);
        await module.save();
        console.log(`✅ Created module: ${moduleData.name}`);
      }
    }

    console.log('✅ Module initialization complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing modules:', error);
    process.exit(1);
  }
};

initModules();

